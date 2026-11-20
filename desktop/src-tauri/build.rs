/// The app's own commands are declared here so Tauri checks them against
/// capabilities/: without this list, every window (the preview too) could call
/// every command. capabilities/default.json grants them to the builder window only.
const COMMANDS: &[&str] = &[
    "open_site", "open_path", "launch_file", "save_site", "save_site_as", "export_site", "show_folder", "preview",
    "read_font", "choose_font", "new_window", "window_file", "builder_windows", "designer", "start_screen_source",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("failed to prepare the POLARIS build");
}
