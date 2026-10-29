// Checks schedule.md: one unchecked item per day, dates one day apart starting on the given date,
// and every lesson link pointing to a heading that exists in its file.
// Usage: node tools/check-schedule.mjs 2026-10-28
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(fs.readFileSync(path.join(root, "data", "plan-config.json"), "utf8"));
const DAYS = CFG.weeks * 7;
const start = process.argv[2] ?? CFG.defaultStart;
const md = fs.readFileSync(path.join(root, "schedule.md"), "utf8");

function slugsFor(file) {
  const seen = new Map();
  const out = new Set();
  let inCode = false;
  for (const line of fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (!h) continue;
    const base = h[1].toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

const items = [...md.matchAll(/^- \[ \] \*\*(\w{3}, \w{3} \d{1,2})\*\* · Day (\d): \[[^\]]+\]\(([^#)]+)#([^)]+)\)/gm)];
const problems = [];
if (items.length !== DAYS) problems.push(`Expected ${DAYS} checklist items, found ${items.length}`);
const cache = new Map();
items.forEach((m, i) => {
  const expected = new Date(`${start}T00:00:00Z`);
  expected.setUTCDate(expected.getUTCDate() + i);
  const label = expected.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  if (label !== m[1]) problems.push(`Item ${i + 1}: date ${m[1]}, expected ${label}`);
  if (Number(m[2]) !== (i % 7) + 1) problems.push(`Item ${i + 1}: Day ${m[2]}, expected Day ${(i % 7) + 1}`);
  if (!cache.has(m[3])) cache.set(m[3], slugsFor(m[3]));
  if (!cache.get(m[3]).has(m[4])) problems.push(`Item ${i + 1}: link ${m[3]}#${m[4]} has no matching heading`);
});
console.log(problems.length ? problems.join("\n") : `schedule.md OK: ${items.length} items, consecutive dates from ${start}, every lesson link resolves.`);
process.exitCode = problems.length ? 1 : 0;
