// Looks up the label of every topic in data/roadmap-map.json exactly as roadmap.sh shows it,
// and writes data/roadmap-topics.json for the schedule and lesson pages.
// Usage (from the plan folder): node tools/fetch-roadmap-titles.mjs
// Needs internet access. On a corporate network, set NODE_OPTIONS=--use-system-ca first.
// Labels come from https://roadmap.sh/<roadmap>.json (the data behind each roadmap page);
// topic ids are the part after "@" in github.com/nilbuild/developer-roadmap content file names.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(fs.readFileSync(path.join(root, "data", "roadmap-map.json"), "utf8"));
const REPO = "nilbuild/developer-roadmap";
const NAMES = JSON.parse(fs.readFileSync(path.join(root, "data", "plan-config.json"), "utf8")).roadmaps;

// 1. Topic file names give each slug its node id: "<slug>@<node id>.md".
const treeRes = await fetch(`https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`, { headers: { "User-Agent": "ai-plan" } });
if (!treeRes.ok) throw new Error(`GitHub tree request failed: HTTP ${treeRes.status}`);
const files = (await treeRes.json()).tree.map((x) => x.path).filter((p) => /^roadmaps\/[^/]+\/content\/[^/]+\.md$/.test(p));

// 2. Each roadmap's JSON gives node id -> label.
const labels = {};
async function labelsFor(r) {
  if (labels[r]) return labels[r];
  const res = await fetch(`https://roadmap.sh/${r}.json`, { headers: { "User-Agent": "Mozilla/5.0 ai-plan" } });
  if (!res.ok) throw new Error(`roadmap.sh/${r}.json: HTTP ${res.status}`);
  const data = await res.json();
  const m = new Map();
  for (const n of data.nodes || []) if (n.id && n.data && typeof n.data.label === "string") m.set(n.id, n.data.label.trim());
  labels[r] = m;
  return m;
}

const problems = [];
const resolved = new Map();
for (const [week, pairs] of Object.entries(map)) {
  if (week === "_about") continue;
  for (const [r, slug] of pairs) {
    const key = `${r}|${slug}`;
    if (resolved.has(key)) continue;
    if (!NAMES[r]) { problems.push(`Week ${week}: unknown roadmap ${r}`); continue; }
    const file = files.find((p) => p.startsWith(`roadmaps/${r}/content/${slug}@`));
    if (!file) { problems.push(`Week ${week}: no topic "${slug}" in the ${r} roadmap`); continue; }
    const nodeId = file.slice(file.lastIndexOf("@") + 1, -3);
    const label = (await labelsFor(r)).get(nodeId);
    if (!label) { problems.push(`Week ${week}: ${r}/${slug} (node ${nodeId}) isn't on the roadmap page`); continue; }
    resolved.set(key, label);
  }
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

const out = {
  checkedAt: new Date().toISOString().slice(0, 10),
  roadmaps: Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [k, { name: v, url: `https://roadmap.sh/${k}` }])),
  weeks: {}
};
for (const [week, pairs] of Object.entries(map)) {
  if (week === "_about") continue;
  out.weeks[week] = pairs.map(([r, slug]) => ({ id: `${r}/${slug}`, roadmap: r, title: resolved.get(`${r}|${slug}`) }));
}
fs.writeFileSync(path.join(root, "data", "roadmap-topics.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote data/roadmap-topics.json: ${resolved.size} topics across ${Object.keys(out.weeks).length} weeks, using labels from roadmap.sh.`);
