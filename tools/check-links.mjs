// Checks every https link in the plan's Markdown files.
// Usage: node tools/check-links.mjs            (from C:\Learn\ai-engineering-plan)
// Writes tools/link-report.json and prints anything that is not OK.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "tools") walk(full);
    else if (entry.name.endsWith(".md")) files.push(full);
  }
})(root);

const links = new Map(); // url -> [file:line]
for (const file of files) {
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/\((https?:\/\/[^)\s]+)\)/g)) {
      const url = m[1];
      if (!links.has(url)) links.set(url, []);
      links.get(url).push(`${path.relative(root, file)}:${i + 1}`);
    }
  });
}

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

async function check(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
      const body = res.ok ? await res.text() : "";
      const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim().replace(/\s+/g, " ") || "";
      // Some sites return 200 with a "not found" page.
      const softMissing = /page not found|404 - |doesn't exist|could not be found|^moved\b|has moved|no longer maintained/i.test(title);
      return { status: res.status, finalUrl: res.url, title, softMissing };
    } catch (error) {
      if (attempt === 2) return { status: null, error: error.message };
    }
  }
}

const results = [];
const queue = [...links.keys()];
async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const r = await check(url);
    const ok = r.status >= 200 && r.status < 400 && !r.softMissing;
    const blocked = [401, 403, 429].includes(r.status);
    results.push({ url, verdict: ok ? "ok" : blocked ? "blocked-by-site" : "broken", ...r, usedIn: links.get(url) });
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

results.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.url.localeCompare(b.url));
fs.writeFileSync(path.join(root, "tools", "link-report.json"), JSON.stringify(results, null, 2));
const counts = results.reduce((c, r) => ({ ...c, [r.verdict]: (c[r.verdict] || 0) + 1 }), {});
console.log(`Checked ${results.length} unique links in ${files.length} files:`, counts);
for (const r of results.filter((x) => x.verdict !== "ok"))
  console.log(`${r.verdict.toUpperCase()} ${r.status ?? r.error} ${r.url}  (${r.usedIn[0]})`);
for (const r of results.filter((x) => x.verdict === "ok" && x.finalUrl && x.finalUrl.replace(/\/$/, "") !== x.url.replace(/\/$/, "")))
  console.log(`REDIRECT ${r.url} -> ${r.finalUrl}`);
