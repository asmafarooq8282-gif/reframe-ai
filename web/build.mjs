// Bundles the site into one self-contained HTML file (dist/reframe.html).
// Used for testing in a browser and for sharing as a single file.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const order = ["config", "pixels", "router", "classic", "ai", "app"];
const strip = (src) =>
  src
    .replace(/^import [^;]+;\s*$/gm, "")
    .replace(/^export (const|function|async function|let|class) /gm, "$1 ");
const js = order.map((name) => `// ── ${name}.js\n${strip(readFileSync(`js/${name}.js`, "utf8"))}`).join("\n");
const css = readFileSync("styles.css", "utf8");
const html = readFileSync("index.html", "utf8")
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script type="module">\n${js}</script>`);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/reframe.html", html);
console.log(`dist/reframe.html ${(html.length / 1024).toFixed(1)} KB`);
