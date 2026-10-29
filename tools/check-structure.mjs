// Checks the plan's structure: every week appears exactly once, each with Days 1–7,
// and every relative Markdown link points to a file that exists.
// Usage: node tools/check-structure.mjs   (from the plan folder)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [path.join(root, "plan.md"), path.join(root, "resources.md"),
  ...fs.readdirSync(path.join(root, "weeks")).filter((f) => f.endsWith(".md")).map((f) => path.join(root, "weeks", f))];

const problems = [];
const weeks = new Map(); // week number -> { file, days: Set }
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let current = null;
  lines.forEach((line, i) => {
    const w = line.match(/^## Week (\d+)(?: in full)?:/) || line.match(/^## Week (\d+) in full/);
    if (w) {
      const n = Number(w[1]);
      if (weeks.has(n)) problems.push(`Week ${n} appears twice (${path.basename(file)}:${i + 1})`);
      current = { file: path.basename(file), days: new Set() };
      weeks.set(n, current);
    }
    const d = line.match(/^### Day (\d+):/);
    if (d && current) current.days.add(Number(d[1]));
    for (const m of line.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      const target = path.resolve(path.dirname(file), m[1].split("#")[0]);
      if (!fs.existsSync(target)) problems.push(`Broken relative link ${m[1]} (${path.basename(file)}:${i + 1})`);
    }
  });
}
const WEEKS = JSON.parse(fs.readFileSync(path.join(root, "data", "plan-config.json"), "utf8")).weeks;
for (let n = 1; n <= WEEKS; n++) {
  const w = weeks.get(n);
  if (!w) { problems.push(`Week ${n} is missing`); continue; }
  for (let d = 1; d <= 7; d++) if (!w.days.has(d)) problems.push(`Week ${n} (${w.file}) is missing Day ${d}`);
}
console.log(`Found ${weeks.size} weeks in ${files.length} files.`);
console.log(problems.length ? problems.join("\n") : `Structure OK: weeks 1–${WEEKS} each have Days 1–7, and all relative links resolve.`);
process.exitCode = problems.length ? 1 : 0;
