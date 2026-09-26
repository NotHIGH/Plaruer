import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const webDirectory = path.join(root, "www");

await rm(webDirectory, { recursive: true, force: true });
await mkdir(path.join(webDirectory, "assets"), { recursive: true });
await cp(path.join(root, "index.html"), path.join(webDirectory, "index.html"));
await cp(path.join(root, "game.js"), path.join(webDirectory, "game.js"));
await cp(path.join(root, "assets"), path.join(webDirectory, "assets"), { recursive: true });

console.log("Web game and character sprites copied to www/.");