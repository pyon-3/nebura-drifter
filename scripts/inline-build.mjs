import { readFile, writeFile } from "node:fs/promises";
const htmlPath = new URL("../dist/index.html", import.meta.url);
let html = await readFile(htmlPath, "utf8");
const cssMatch = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
const jsMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
if (!cssMatch || !jsMatch) throw new Error("Build assets not found");
const assetPath = path => path.replace(/^\.?\//, "");
const css = await readFile(new URL(`../dist/${assetPath(cssMatch[1])}`, import.meta.url), "utf8");
let js = await readFile(new URL(`../dist/${assetPath(jsMatch[1])}`, import.meta.url), "utf8");

// Embed GLB as fetch(data:) Promise<ArrayBuffer> — browser-native decode, non-blocking on iOS.
const glbData = await readFile(new URL("../public/models/car_pack3.glb", import.meta.url));
const glbBase64 = glbData.toString("base64");
const glbExpr = `fetch("data:application/octet-stream;base64,${glbBase64}").then(r=>r.arrayBuffer())`;
js = js.replace(/"\.\/models\/car_pack3\.glb"/g, glbExpr);

html = html.replace(cssMatch[0], () => `<style>${css}</style>`);
html = html.replace(jsMatch[0], () => `<script type="module">${js}</script>`);
html = html.replace(/src="\/(Nebura_Drifter|midnight_run_Remix|Blue_Neon_Shift|kamikaze_rumble|evening_velocity|Nebura_Afterglow)\.mp3"/g, 'src="./$1.mp3"');
await writeFile(new URL("../dist/nebura-drifter.html", import.meta.url), html);
