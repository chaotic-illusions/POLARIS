//! POLARIS as a Windows app.
//!
//! The builder (../../builder, staged into ../web by stage.mjs) runs in a
//! WebView2 window. This side gives it what a web page can't have: native
//! Open, Save and Save As dialogs, export to a folder, a preview window that
//! shows exactly what Export writes, and a remembered font file.
//!
//! What the builder's pages can do here is kept narrow: they read and write
//! only project files the user chose (see `grant`), open only the folder they
//! just published, and the preview window can call nothing (build.rs and
//! capabilities/). POLARIS runs once, with a window per project, as VS Code
//! does: starting it again, or double-clicking a project, comes to it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::http::Response;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// The outline font is licensed for local use only: it is never bundled. The
/// app keeps the user's own copy in its data folder once they choose it.
const FONT_NAME: &str = "Helvetica Ultra Compressed.otf";

/// WebView2 switches for every window (they must match). Tauri's defaults,
/// plus sound without a click first, so a PADD beeps as soon as it types.
pub const BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// The exported site, served to the preview window from memory.
/// Each preview window's site, served from memory: preview window label -> (path -> bytes).
#[derive(Default)]
struct Preview(Mutex<HashMap<String, HashMap<String, Vec<u8>>>>);

/// The folder Publish last wrote to: the only folder show_folder opens.
#[derive(Default)]
struct Published(Mutex<Option<PathBuf>>);

/// settings.json is read, changed and written whole, so one change at a time.
static SETTINGS: Mutex<()> = Mutex::new(());

/// A file sent from the builder: text, or bytes as base64 (pictures).
#[derive(Deserialize)]
struct FileEntry {
    text: Option<String>,
    base64: Option<String>,
}

#[derive(Serialize)]
struct Opened {
    path: String,
    name: String,
    text: String,
    /// The project is already open in another window, which was brought forward instead (text is empty).
    elsewhere: bool,
}

#[derive(Serialize)]
struct Saved {
    path: String,
    name: String,
}

#[derive(Serialize)]
struct Exported {
    folder: String,
    count: usize,
}

fn decode(entry: &FileEntry) -> Result<Vec<u8>, String> {
    match (&entry.base64, &entry.text) {
        (Some(b64), _) => base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string()),
        (None, Some(text)) => Ok(text.clone().into_bytes()),
        (None, None) => Ok(Vec::new()),
    }
}

/// A path inside the export folder: relative, plain names only (no "..", no drive).
fn safe_relative(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path.replace('\\', "/"));
    let ok = !path.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)));
    if ok { Ok(p) } else { Err(format!("unsafe path in export: {path}")) }
}

fn file_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/* ---- remembered folders for the dialogs ---- */

fn settings_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> Map<String, Value> {
    settings_file(app)
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

/// The folder a dialog last used for `key`, or Documents.
fn folder(app: &AppHandle, key: &str) -> Option<PathBuf> {
    read_settings(app)
        .get(key)
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| app.path().document_dir().ok())
}

fn update_settings(app: &AppHandle, change: impl FnOnce(&mut Map<String, Value>)) {
    let Some(file) = settings_file(app) else { return };
    let _one_at_a_time = SETTINGS.lock().unwrap_or_else(|e| e.into_inner());
    let mut settings = read_settings(app);
    change(&mut settings);
    if let Some(parent) = file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(file, serde_json::to_string_pretty(&Value::Object(settings)).unwrap_or_default());
}

fn remember(app: &AppHandle, key: &str, dir: Option<&Path>) {
    let Some(dir) = dir else { return };
    let dir = dir.to_string_lossy().into_owned();
    update_settings(app, |s| {
        s.insert(key.into(), Value::String(dir));
    });
}

/* ---- project files the user has chosen ---- */

/// The builder reads and writes only project files the user has chosen: in an
/// Open or Save dialog, or by opening one from Explorer. Nothing on its pages
/// can name another file. The list is kept in settings.json, so recent
/// projects stay openable after a restart.
const CHOSEN: &str = "projects";
const CHOSEN_MAX: usize = 100;

/// A path as the list keeps it: on Windows, paths are the same whatever their case.
fn path_key(path: &Path) -> String {
    let s = path.to_string_lossy().into_owned();
    if cfg!(windows) { s.replace('/', "\\").to_lowercase() } else { s }
}

fn grant(app: &AppHandle, path: &Path) {
    let key = path_key(path);
    update_settings(app, |s| {
        let mut list = s.get(CHOSEN).and_then(|v| v.as_array()).cloned().unwrap_or_default();
        list.retain(|v| v.as_str() != Some(key.as_str()));
        list.insert(0, Value::String(key));
        list.truncate(CHOSEN_MAX);
        s.insert(CHOSEN.into(), Value::Array(list));
    });
}

fn chosen(app: &AppHandle, path: &Path) -> bool {
    let key = path_key(path);
    read_settings(app)
        .get(CHOSEN)
        .and_then(|v| v.as_array())
        .is_some_and(|list| list.iter().any(|v| v.as_str() == Some(key.as_str())))
}

fn is_project(path: &Path) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case("lcars") || e.eq_ignore_ascii_case("json"))
}

/// The project file among a program's arguments (double-clicking a .lcars file passes its path).
fn project_arg(args: impl IntoIterator<Item = OsString>, cwd: &Path) -> Option<PathBuf> {
    args.into_iter().skip(1).map(|a| cwd.join(a)).find(|p| p.is_file() && is_project(p))
}

/* ---- site files ---- */

/// Ask for a project (.lcars, or a .json site or page from before projects) and read it.
#[tauri::command]
async fn open_site(app: AppHandle, window: WebviewWindow) -> Result<Option<Opened>, String> {
    let mut dialog = app.dialog().file().add_filter("LCARS project", &["lcars", "json"]).set_parent(&window);
    if let Some(dir) = folder(&app, "sites") {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_pick_file() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    remember(&app, "sites", path.parent());
    grant(&app, &path);
    open_for(&app, &window, &path)
}

fn read_project(path: &Path) -> Result<Opened, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", file_name(path)))?;
    Ok(Opened { path: path.to_string_lossy().into_owned(), name: file_name(path), text, elsewhere: false })
}

/// Open `path` for `window`: unless another window has it open, which comes forward instead.
fn open_for(app: &AppHandle, window: &WebviewWindow, path: &Path) -> Result<Option<Opened>, String> {
    if let Some(other) = window_with(app, path, Some(window.label())) {
        focus(app, &other);
        let path = path.to_string_lossy().into_owned();
        return Ok(Some(Opened { name: file_name(Path::new(&path)), path, text: String::new(), elsewhere: true }));
    }
    read_project(path).map(Some)
}

/// Read a project the builder already knows the path of (a recent project, or
/// the one it was last working on). One the user hasn't chosen in POLARIS (a
/// recent project from before this check) is confirmed in the Open dialog
/// first; None if they cancel.
#[tauri::command]
async fn open_path(app: AppHandle, window: WebviewWindow, path: String) -> Result<Option<Opened>, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err(format!("{}: the file isn't there any more", file_name(&path)));
    }
    if chosen(&app, &path) {
        return open_for(&app, &window, &path);
    }
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Open this project?")
        .add_filter("LCARS project", &["lcars", "json"])
        .set_file_name(file_name(&path))
        .set_parent(&window);
    if let Some(dir) = path.parent() {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_pick_file() else { return Ok(None) };
    let picked = picked.into_path().map_err(|e| e.to_string())?;
    grant(&app, &picked);
    open_for(&app, &window, &picked)
}

/// The project file this window was opened for (double-clicking a .lcars file), if any. Asked once.
#[tauri::command]
async fn launch_file(window: WebviewWindow, windows: State<'_, Windows>) -> Result<Option<String>, String> {
    let mut state = windows.0.lock().map_err(|e| e.to_string())?;
    Ok(state.pending.remove(window.label()).map(|p| p.to_string_lossy().into_owned()))
}

/* ---- windows: one project each, as in VS Code ---- */

/// The builder's windows: the project each has open (as path_key), the file
/// each was opened for, and the one used last. Each window keeps its own
/// unsaved work in the builder (its storage keys carry the window's label).
#[derive(Default)]
struct Windows(Mutex<WindowsState>);

#[derive(Default)]
struct WindowsState {
    files: HashMap<String, String>,
    pending: HashMap<String, PathBuf>,
    last: String,
}

/// settings.json: the builder windows open when POLARIS last closed, opened again on the next start.
const WINDOW_LIST: &str = "windows";

fn is_builder(label: &str) -> bool {
    label == "main" || label.starts_with("builder-")
}

fn builder_labels(app: &AppHandle) -> Vec<String> {
    let mut labels: Vec<String> = app.webview_windows().into_keys().filter(|l| is_builder(l)).collect();
    labels.sort();
    labels
}

fn save_window_list(app: &AppHandle, labels: Vec<String>) {
    update_settings(app, |s| {
        s.insert(WINDOW_LIST.into(), Value::Array(labels.into_iter().map(Value::String).collect()));
    });
}

/// A free label for a new window: "main" if it's free (its unsaved work uses the original storage keys), else builder-2, -3 ...
fn next_label(app: &AppHandle) -> String {
    let open = builder_labels(app);
    if !open.iter().any(|l| l == "main") {
        return "main".into();
    }
    (2..).map(|n| format!("builder-{n}")).find(|l| !open.contains(l)).unwrap_or_default()
}

/// Open a builder window, from the window settings in tauri.conf.json; with `file`, it opens that project.
fn open_builder(app: &AppHandle, label: &str, file: Option<PathBuf>) -> Result<(), String> {
    if let Some(file) = file {
        app.state::<Windows>().0.lock().map_err(|e| e.to_string())?.pending.insert(label.into(), file);
    }
    let mut config = app.config().app.windows.iter().find(|w| w.label == "main").cloned().ok_or("no window settings")?;
    config.label = label.into();
    WebviewWindowBuilder::from_config(app, &config).and_then(|b| b.build()).map_err(|e| e.to_string())?;
    save_window_list(app, builder_labels(app));
    Ok(())
}

/// The window, other than `except`, that has `path` open.
fn window_with(app: &AppHandle, path: &Path, except: Option<&str>) -> Option<String> {
    let key = path_key(path);
    let state = app.state::<Windows>();
    let state = state.0.lock().ok()?;
    state.files.iter().find(|(label, file)| **file == key && Some(label.as_str()) != except).map(|(l, _)| l.clone())
}

fn focus(app: &AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Starting POLARIS again (or double-clicking a project): the project's window comes forward if it's
/// open, a new window opens it if not, and with no project the window used last comes forward.
fn second_start(app: &AppHandle, args: Vec<String>, cwd: String) {
    let Some(path) = project_arg(args.into_iter().map(OsString::from), Path::new(&cwd)) else {
        let last = app.state::<Windows>().0.lock().map(|s| s.last.clone()).unwrap_or_default();
        let label = if app.get_webview_window(&last).is_some() { last } else { builder_labels(app).into_iter().next().unwrap_or_default() };
        return focus(app, &label);
    };
    grant(app, &path);
    if let Some(label) = window_with(app, &path, None) {
        return focus(app, &label);
    }
    // Windows are made off the main thread (making one on it, from an event, can stall on Windows).
    let app = app.clone();
    std::thread::spawn(move || {
        let label = next_label(&app);
        let _ = open_builder(&app, &label, Some(path));
    });
}

/// A new, empty builder window (Ctrl+Shift+N).
#[tauri::command]
async fn new_window(app: AppHandle) -> Result<(), String> {
    let label = next_label(&app);
    open_builder(&app, &label, None)
}

/// The project this window now has open (None: none, or one not saved to a file yet).
#[tauri::command]
async fn window_file(window: WebviewWindow, windows: State<'_, Windows>, path: Option<String>) -> Result<(), String> {
    let mut state = windows.0.lock().map_err(|e| e.to_string())?;
    match path.filter(|p| !p.is_empty()) {
        Some(p) => state.files.insert(window.label().into(), path_key(Path::new(&p))),
        None => state.files.remove(window.label()),
    };
    Ok(())
}

/// A debug build is the designer's (`npm run build:debug`): it may use the start
/// screen's own features, such as the power-up. A release build never offers them.
#[tauri::command]
fn designer() -> bool {
    cfg!(debug_assertions)
}

/// The start screen as last saved in the source folder (builder/start-screen.lcars),
/// so a debug build shows a change without being rebuilt. A release build has only
/// the copy built into it, and gets nothing here.
#[tauri::command]
async fn start_screen_source() -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../builder/start-screen.lcars")).ok()
}

/// How many builder windows are open (closing the last one keeps its work for next time).
#[tauri::command]
async fn builder_windows(app: AppHandle) -> usize {
    builder_labels(&app).len()
}

/// Save over the project's own file: one the user has opened or saved in POLARIS.
#[tauri::command]
async fn save_site(app: AppHandle, path: String, text: String) -> Result<Saved, String> {
    let target = PathBuf::from(path);
    let lcars = target.extension().is_some_and(|e| e.eq_ignore_ascii_case("lcars"));
    if !lcars || !chosen(&app, &target) {
        return Err(format!("{} isn't a project file opened or saved in POLARIS", file_name(&target)));
    }
    write_project(&target, &text)
}

/// Write through a temporary file, so a failed save never leaves half a file.
fn write_project(target: &Path, text: &str) -> Result<Saved, String> {
    let mut tmp = target.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, text.as_bytes()).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(&tmp, target) {
        let _ = fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(Saved { path: target.to_string_lossy().into_owned(), name: file_name(target) })
}

#[tauri::command]
async fn save_site_as(app: AppHandle, window: WebviewWindow, text: String, suggested: String) -> Result<Option<Saved>, String> {
    let mut dialog =
        app.dialog().file().add_filter("LCARS project", &["lcars"]).set_file_name(&suggested).set_parent(&window);
    if let Some(dir) = folder(&app, "sites") {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_save_file() else { return Ok(None) };
    let mut path = picked.into_path().map_err(|e| e.to_string())?;
    if path.extension().is_none() {
        path.set_extension("lcars");
    }
    remember(&app, "sites", path.parent());
    grant(&app, &path);
    write_project(&path, &text).map(Some)
}

/// Publish: ask where, and write the site into a folder named `name` there. If
/// the folder picked is a site published before (it has a site.json), write
/// into it directly, so publishing again updates it. A folder that already has
/// files is confirmed first: they're overwritten, and old ones stay.
#[tauri::command]
async fn export_site(
    app: AppHandle,
    window: WebviewWindow,
    published: State<'_, Published>,
    files: HashMap<String, FileEntry>,
    name: String,
) -> Result<Option<Exported>, String> {
    let name = safe_relative(&name)?;
    if name.components().count() != 1 {
        return Err(format!("not a folder name: {}", name.display()));
    }
    let mut dialog = app.dialog().file().set_title("Publish the site: choose where its folder goes").set_parent(&window);
    if let Some(dir) = folder(&app, "export") {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_pick_folder() else { return Ok(None) };
    let chosen = picked.into_path().map_err(|e| e.to_string())?;
    let dir = if chosen.join("site.json").is_file() { chosen.clone() } else { chosen.join(&name) };
    remember(&app, "export", if dir == chosen { chosen.parent() } else { Some(chosen.as_path()) });
    if fs::read_dir(&dir).is_ok_and(|mut entries| entries.next().is_some()) {
        let go = app
            .dialog()
            .message(format!(
                "The folder \"{}\" already has files in it.\n\nPublishing overwrites the site's files there. \
                 Any old files stay, such as pages you've since deleted or renamed. Publish anyway?",
                dir.display()
            ))
            .title("Publish over existing files?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Publish".into(), "Cancel".into()))
            .parent(&window)
            .blocking_show();
        if !go {
            return Ok(None);
        }
    }
    for (rel, entry) in &files {
        let target = dir.join(safe_relative(rel)?);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, decode(entry)?).map_err(|e| format!("{rel}: {e}"))?;
    }
    *published.0.lock().map_err(|e| e.to_string())? = Some(dir.clone());
    Ok(Some(Exported { folder: dir.to_string_lossy().into_owned(), count: files.len() }))
}

/// Open the folder just published to in Explorer (and no other).
#[tauri::command]
async fn show_folder(published: State<'_, Published>, folder: String) -> Result<(), String> {
    let last = published.0.lock().map_err(|e| e.to_string())?.clone();
    let Some(dir) = last.filter(|d| path_key(d) == path_key(Path::new(&folder)) && d.is_dir()) else {
        return Err(format!("not the folder just published: {folder}"));
    };
    std::process::Command::new("explorer").arg(&dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/* ---- preview ---- */

fn preview_url(path: &str) -> Result<Url, String> {
    // Custom protocols are http://<scheme>.localhost/ on Windows, <scheme>:// elsewhere.
    let base = if cfg!(windows) { "http://preview.localhost/" } else { "preview://localhost/" };
    Url::parse(base).and_then(|u| u.join(path)).map_err(|e| e.to_string())
}

/// Show the exported site in the preview window, starting at `start`.
#[tauri::command]
async fn preview(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Preview>,
    files: HashMap<String, FileEntry>,
    start: String,
    title: String,
) -> Result<(), String> {
    let mut served = HashMap::new();
    for (rel, entry) in &files {
        let rel = safe_relative(rel)?.to_string_lossy().replace('\\', "/");
        served.insert(rel, decode(entry)?);
    }
    // Each builder window has its own preview window.
    let label = format!("preview-{}", window.label());
    state.0.lock().map_err(|e| e.to_string())?.insert(label.clone(), served);
    let url = preview_url(&start)?;
    let title = format!("Preview: {title}");
    if let Some(win) = app.get_webview_window(&label) {
        win.navigate(url).map_err(|e| e.to_string())?;
        let _ = win.set_title(&title);
        let _ = win.unminimize();
        let _ = win.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::CustomProtocol(url))
        .title(title)
        .inner_size(1600.0, 900.0)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn content_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "otf" => "font/otf",
        "ttf" => "font/ttf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/* ---- the font ---- */

/// Folders the font is looked for in: the app's data folder, a "fonts" folder
/// beside the program, and (in development) the project's own fonts folder.
fn font_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(d) = app.path().app_data_dir() {
        dirs.push(d.join("fonts"));
    }
    if let Some(d) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("fonts"))) {
        dirs.push(d);
    }
    if cfg!(debug_assertions) {
        dirs.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fonts"));
    }
    dirs
}

/// The font file's bytes, for drawing text as shapes.
#[tauri::command]
async fn read_font(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    for dir in font_dirs(&app) {
        if let Ok(bytes) = fs::read(dir.join(FONT_NAME)) {
            return Ok(tauri::ipc::Response::new(bytes));
        }
    }
    Err("no font file yet".into())
}

/// Ask for the user's font file and keep a copy in the app's data folder.
#[tauri::command]
async fn choose_font(app: AppHandle, window: WebviewWindow) -> Result<bool, String> {
    let mut dialog = app.dialog().file().add_filter("Fonts", &["otf", "ttf", "woff"]).set_parent(&window);
    if let Some(dir) = folder(&app, "fonts") {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_pick_file() else { return Ok(false) };
    let source = picked.into_path().map_err(|e| e.to_string())?;
    remember(&app, "fonts", source.parent());
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("fonts");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::copy(&source, dir.join(FONT_NAME)).map_err(|e| e.to_string())?;
    Ok(true)
}

fn main() {
    tauri::Builder::default()
        // One POLARIS, with a window per project (as VS Code does): starting it again, or
        // double-clicking a project, comes to the running one (second_start).
        .plugin(tauri_plugin_single_instance::init(second_start))
        .plugin(tauri_plugin_dialog::init())
        .manage(Preview::default())
        .manage(Published::default())
        .manage(Windows::default())
        .setup(|app| {
            // The windows open when POLARIS last closed come back, each with its own kept work.
            let handle = app.handle();
            let mut labels: Vec<String> = read_settings(handle)
                .get(WINDOW_LIST)
                .and_then(|v| v.as_array())
                .map(|l| l.iter().filter_map(|v| v.as_str()).filter(|l| is_builder(l)).map(String::from).collect())
                .unwrap_or_default();
            labels.dedup();
            if labels.is_empty() {
                labels.push("main".into());
            }
            // A project double-clicked to start POLARIS opens in the first of them.
            let cwd = std::env::current_dir().unwrap_or_default();
            let mut launch = project_arg(std::env::args_os(), &cwd);
            if let Some(path) = &launch {
                grant(handle, path);
            }
            for label in labels {
                open_builder(handle, &label, launch.take())?;
            }
            Ok(())
        })
        .register_uri_scheme_protocol("preview", |ctx, request| {
            let raw = request.uri().path().trim_start_matches('/');
            let path = percent_decode_str(raw).decode_utf8_lossy().into_owned();
            let path = if path.is_empty() { "index.html".to_string() } else { path };
            let files = ctx.app_handle().state::<Preview>();
            let body = files.0.lock().ok().and_then(|f| f.get(ctx.webview_label())?.get(&path).cloned());
            match body {
                Some(bytes) => Response::builder()
                    .header("Content-Type", content_type(&path))
                    .header("Cache-Control", "no-store")
                    .body(bytes),
                None => Response::builder().status(404).body(b"Not in this preview".to_vec()),
            }
            .unwrap_or_else(|_| Response::new(Vec::new()))
        })
        .invoke_handler(tauri::generate_handler![
            open_site, open_path, launch_file, save_site, save_site_as, export_site, show_folder, preview, read_font,
            choose_font, new_window, window_file, builder_windows, designer,
            start_screen_source
        ])
        .on_window_event(|window, event| {
            let app = window.app_handle();
            let label = window.label().to_string();
            match event {
                tauri::WindowEvent::Focused(true) if is_builder(&label) => {
                    if let Ok(mut s) = app.state::<Windows>().0.lock() {
                        s.last = label;
                    }
                }
                tauri::WindowEvent::Destroyed if is_builder(&label) => {
                    // Its preview closes with it.
                    if let Some(preview) = app.get_webview_window(&format!("preview-{label}")) {
                        let _ = preview.destroy();
                    }
                    if let Ok(mut s) = app.state::<Windows>().0.lock() {
                        s.files.remove(&label);
                        s.pending.remove(&label);
                    }
                    let rest: Vec<String> = builder_labels(app).into_iter().filter(|l| *l != label).collect();
                    if rest.is_empty() {
                        // The last window: the list keeps it, so it opens again next time. POLARIS ends.
                        app.exit(0);
                    } else {
                        save_window_list(app, rest);
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    if let Ok(mut served) = app.state::<Preview>().0.lock() {
                        served.remove(&label);
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running POLARIS");
}
