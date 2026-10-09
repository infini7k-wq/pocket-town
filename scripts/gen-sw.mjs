// out/ を走査して、キャッシュするファイルの一覧と版（内容のハッシュ）を埋め込んだ out/sw.js を作る
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = "out";
const BASE = process.env.PAGES_BASE_PATH ?? "/pocket-town";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(OUT, p).split("\\").join("/")];
  });
}

const files = walk(OUT)
  .filter((f) => f !== "sw.js" && !f.startsWith("404") && !f.startsWith("_not-found") && !f.endsWith(".txt"))
  .sort();
const hash = createHash("sha256");
for (const f of files) hash.update(f).update(readFileSync(join(OUT, f)));
const version = hash.digest("hex").slice(0, 10);
const urls = [`${BASE}/`, ...files.filter((f) => f !== "index.html").map((f) => `${BASE}/${f}`)];
const template = readFileSync("scripts/sw.template.js", "utf8");
writeFileSync(
  join(OUT, "sw.js"),
  template.replace("__VERSION__", version).replace("__BASE__", BASE).replace("__PRECACHE__", JSON.stringify(urls, null, 0)),
);
console.log(`sw.js: version ${version}, ${urls.length} files`);
