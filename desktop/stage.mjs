// Copy the builder and the files it uses into web/, which Tauri builds into the app.
// The fonts folder is never copied: the font is licensed for local use only.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const web = join(here, "web");
const PARTS = ["builder", "lcars", "trek-padd.js", "palette-data.js", "site.css"];

rmSync(web, { recursive: true, force: true });
for (const part of PARTS) {
  const from = join(root, part);
  if (!existsSync(from)) throw new Error(`missing ${part}`);
  cpSync(from, join(web, part), { recursive: true });
}
if (existsSync(join(web, "fonts"))) throw new Error("fonts must never be packaged");
console.log(`staged ${PARTS.join(", ")} into web/`);
