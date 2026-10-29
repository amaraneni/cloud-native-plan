// Builds the dated, checkable schedule from the plan files.
// Usage (from the plan folder):  node tools/build-schedule.mjs [start-date YYYY-MM-DD]
// Default start date: 2026-10-28. Re-run it after editing the plan. Your ticks, notes, and
// roadmap.sh topics are kept in the browser, keyed by week and day, so they survive a rebuild.
// Outputs:
//   assets/plan-data.js  the days and roadmap.sh topics, shared by every HTML page
//   schedule.html        the interactive dashboard and checklist
//   schedule.md          the same checklist as Markdown (printable, tickable on GitHub)
// The lesson pages come from tools/build-html.mjs; roadmap.sh topics from data/roadmap-topics.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(fs.readFileSync(path.join(root, "data", "plan-config.json"), "utf8"));
const WEEKS = CFG.weeks;
const DAYS = WEEKS * 7;
const startArg = process.argv[2] ?? CFG.defaultStart;
if (!/^\d{4}-\d{2}-\d{2}$/.test(startArg)) throw new Error("Start date must be YYYY-MM-DD");
const start = new Date(`${startArg}T00:00:00Z`);

// GitHub-style heading anchors, numbered when a heading repeats within a file.
function makeSlugger() {
  const seen = new Map();
  return (heading) => {
    const base = heading.toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

const sectionFiles = ["plan.md", ...fs.readdirSync(path.join(root, "weeks")).filter((f) => f.endsWith(".md")).sort().map((f) => `weeks/${f}`)];
const weeks = new Map(); // week -> { title, file, days: [] }

for (const rel of sectionFiles) {
  const lines = fs.readFileSync(path.join(root, rel), "utf8").split(/\r?\n/);
  const slug = makeSlugger();
  let week = null;
  let day = null;
  let inCode = false;
  for (const line of lines) {
    // Lines inside ``` blocks are code; a "# comment" there isn't a heading.
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const headingSlug = heading ? slug(heading[2]) : null;

    const w = line.match(/^## Week (\d+)(?: in full)?: (.*)$/);
    if (w) {
      week = { number: Number(w[1]), title: w[2].trim(), file: rel, days: [] };
      weeks.set(week.number, week);
      day = null;
      continue;
    }
    const d = line.match(/^### Day (\d+): (.*)$/);
    if (d && week) {
      day = { number: Number(d[1]), title: d[2].trim(), anchor: headingSlug, doneWhen: "" };
      week.days.push(day);
      continue;
    }
    if (heading && heading[1].length <= 2) day = null;
    const done = line.match(/^\*\*Done when:\*\*\s*(.*)$/);
    if (done && day && !day.doneWhen) day.doneWhen = done[1].trim();
  }
}

const SECTIONS = CFG.sections;
const sectionOf = (n) => SECTIONS.find(([a, b]) => n >= a && n <= b)[2];

// Plain text: drop Markdown links and emphasis.
const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*|`/g, "");

const entries = [];
for (let n = 1; n <= WEEKS; n++) {
  const w = weeks.get(n);
  if (!w) throw new Error(`Week ${n} not found`);
  for (const d of w.days) {
    if (d.number < 1 || d.number > 7) continue;
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + (n - 1) * 7 + (d.number - 1));
    entries.push({
      id: `W${String(n).padStart(2, "0")}D${d.number}`,
      week: n,
      weekTitle: plain(w.title),
      section: sectionOf(n),
      day: d.number,
      title: plain(d.title),
      doneWhen: plain(d.doneWhen) || (d.number === 7 ? "Your week's work is pushed, and anything you skipped is caught up." : ""),
      light: d.number === 7,
      date: date.toISOString().slice(0, 10),
      link: `${w.file}#${d.anchor}`,
      htmlLink: `${w.file.replace(/\.md$/, ".html")}#${d.anchor}`
    });
  }
}
if (entries.length !== DAYS) throw new Error(`Expected ${DAYS} days, found ${entries.length}`);

// roadmap.sh topics for each week (from tools/fetch-roadmap-titles.mjs).
const roadmapFile = path.join(root, "data", "roadmap-topics.json");
if (!fs.existsSync(roadmapFile)) throw new Error("data/roadmap-topics.json is missing. Run: node tools/fetch-roadmap-titles.mjs");
const roadmap = JSON.parse(fs.readFileSync(roadmapFile, "utf8"));
for (let n = 1; n <= WEEKS; n++) if (!roadmap.weeks[String(n)]?.length) throw new Error(`No roadmap.sh topics for Week ${n}`);

const fmt = (iso, opts) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
const endDate = entries.at(-1).date;

// ---------- assets/plan-data.js ----------
const data = { start: startArg, name: CFG.name, weekCount: WEEKS, entries, roadmap: { roadmaps: roadmap.roadmaps, weeks: roadmap.weeks, checkedAt: roadmap.checkedAt } };
fs.mkdirSync(path.join(root, "assets"), { recursive: true });
fs.writeFileSync(path.join(root, "assets", "plan-data.js"),
  `// Generated by tools/build-schedule.mjs. Don't edit by hand.\nwindow.PLAN_DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};\n`, "utf8");

// ---------- schedule.md ----------
let md = `# Schedule and checklist\n\n`;
md += `Starts **${fmt(entries[0].date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}** and ends **${fmt(endDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}**: ${WEEKS} weeks, ${DAYS} days. Day 7 of each week is a light catch-up day.\n\n`;
md += `Tick a day when its "Done when" goal is met. Each title links to the full lesson. At the end of each week, mark the listed topics done on roadmap.sh. For a dashboard with saved ticks and notes, open [schedule.html](schedule.html) in your browser instead.\n\n`;
md += `Missed a day? Do it next, and use that week's Day 7 to catch up. The dates are a guide, not a deadline.\n\n`;
md += `Generated by \`node tools/build-schedule.mjs ${startArg}\`. To start on a different date, run it again with that date.\n`;
let lastSection = "";
for (let n = 1; n <= WEEKS; n++) {
  const days = entries.filter((e) => e.week === n);
  if (days[0].section !== lastSection) { md += `\n## ${days[0].section}\n`; lastSection = days[0].section; }
  md += `\n### Week ${n}: ${days[0].weekTitle} (${fmt(days[0].date, { month: "short", day: "numeric" })} – ${fmt(days.at(-1).date, { month: "short", day: "numeric", year: "numeric" })})\n\n`;
  for (const e of days) {
    md += `- [ ] **${fmt(e.date, { weekday: "short", month: "short", day: "numeric" })}** · Day ${e.day}: [${e.title}](${e.link})${e.light ? " *(light)*" : ""}\n`;
    if (e.doneWhen) md += `  - Done when: ${e.doneWhen}\n`;
  }
  md += `\n**After this week, mark these done on roadmap.sh:**\n\n`;
  for (const t of roadmap.weeks[String(n)]) md += `- [ ] [${roadmap.roadmaps[t.roadmap].name}](${roadmap.roadmaps[t.roadmap].url}): ${t.title}\n`;
}
fs.writeFileSync(path.join(root, "schedule.md"), md, "utf8");

// ---------- schedule.html ----------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${CFG.name}: schedule</title>
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="assets/site.css">
<script src="assets/common.js"></script>
</head>
<body>
<a class="skip" href="#weeks">Skip to the checklist</a>
<header class="topbar">
  <a class="brand" href="schedule.html"><span class="logo" aria-hidden="true">${CFG.logo}</span><span class="brand-text">${CFG.name}</span></a>
  <nav class="top-links" aria-label="Plan">
    <a href="schedule.html" aria-current="page">Schedule</a>
    <a href="plan.html">Plan</a>
    <a href="resources.html">Resources</a>
  </nav>
  <span class="grow"></span>
  <button type="button" class="btn sm" id="today-btn" title="Shortcut: T">Today <kbd>T</kbd></button>
  <button type="button" class="icon-btn" id="theme-btn"></button>
</header>

<main class="container">
  <div class="page-head">
    <h1>${CFG.heading}</h1>
    <p class="muted" id="plan-dates"></p>
  </div>

  <section id="dashboard" aria-label="Dashboard">
    <div class="dash-grid">
      <article class="card hero" id="hero" aria-live="polite"></article>
      <article class="card progress-card" aria-label="Overall progress">
        <div class="ring-wrap" id="ring" role="progressbar" aria-label="Days completed" aria-valuemin="0" aria-valuemax="${DAYS}" aria-valuenow="0">
          <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
            <defs><linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#9333ea"/></linearGradient></defs>
            <circle class="ring-bg" cx="60" cy="60" r="52"/>
            <circle class="ring-fg" id="ring-fg" cx="60" cy="60" r="52" stroke="url(#ring-grad)" style="stroke:url(#ring-grad)"/>
          </svg>
          <div class="ring-label"><strong id="ring-pct">0%</strong><span id="ring-count">0 of ${DAYS} days</span></div>
        </div>
        <p class="muted small" id="ring-week"></p>
      </article>
      <article class="card stats" id="stats" aria-label="Stats"></article>
    </div>

    <section class="card sections" aria-labelledby="sec-title">
      <div class="card-head"><h2 id="sec-title">Sections</h2><span class="muted small">Click one to show only its weeks.</span></div>
      <div class="sec-grid" id="sec-grid"></div>
    </section>

    <div class="dash-grid two">
      <section class="card heat-card" aria-labelledby="heat-title">
        <div class="card-head">
          <h2 id="heat-title">Your plan, day by day</h2>
          <div class="legend" aria-hidden="true">
            <span><i class="s-done"></i>Done</span><span><i class="s-today"></i>Today</span><span><i class="s-overdue"></i>Behind</span><span><i class="s-future"></i>Coming up</span>
          </div>
        </div>
        <div class="heat-scroll">
          <div class="heat-months" id="heat-months" aria-hidden="true"></div>
          <div class="heat-grid" id="heat-grid" aria-label="Every day of the plan. Each column is a week."></div>
        </div>
        <p class="muted small">Each column is a week and each square is a day. Click a square to jump to it.</p>
      </section>
      <section class="card roadmap-card heat-card" aria-labelledby="rm-title">
        <div class="card-head"><h2 id="rm-title">roadmap.sh progress</h2></div>
        <div class="rm-progress" id="rm-progress"></div>
        <p class="muted small" style="margin-top:12px">Topics you've ticked after each week. Click a roadmap to open it.</p>
      </section>
    </div>
  </section>

  <div class="toolbar" role="search">
    <div class="search">
      <label class="sr-only" for="search">Search lessons, notes, and roadmap topics</label>
      <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="search" type="search" placeholder="Search lessons, notes, and roadmap topics" autocomplete="off">
      <kbd class="search-kbd" aria-hidden="true">/</kbd>
    </div>
    <div class="chips" role="group" aria-label="Show">
      <button type="button" class="chip-btn" data-filter="all" aria-pressed="true">All</button>
      <button type="button" class="chip-btn" data-filter="week" aria-pressed="false">This week</button>
      <button type="button" class="chip-btn" data-filter="todo" aria-pressed="false">To do</button>
      <button type="button" class="chip-btn" data-filter="overdue" aria-pressed="false">Behind <span class="count" id="overdue-count" hidden>0</span></button>
      <button type="button" class="chip-btn" data-filter="done" aria-pressed="false">Done</button>
    </div>
    <label class="sr-only" for="section-select">Section</label>
    <select class="sel" id="section-select"><option value="">All sections</option></select>
    <button type="button" class="btn sm" id="expand-btn">Expand all</button>
  </div>
  <p class="muted small" id="result-count" role="status" aria-live="polite"></p>

  <div id="weeks"></div>

  <footer class="foot">
    <p>Your ticks, notes, and roadmap.sh topics are saved in this browser only.
      <button type="button" class="btn sm" id="export-btn">Export progress</button>
      <button type="button" class="btn sm" id="import-btn">Import progress</button>
      <input type="file" id="import-file" accept="application/json" hidden>
    </p>
    <p>Shortcuts: <kbd>/</kbd> search · <kbd>T</kbd> today · <kbd>Esc</kbd> clear search</p>
  </footer>
</main>
<script src="assets/plan-data.js"></script>
<script src="assets/schedule.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, "schedule.html"), html, "utf8");
console.log(`Wrote assets/plan-data.js, schedule.html, and schedule.md: ${entries.length} days, ${entries[0].date} to ${endDate}.`);
const missingDoneWhen = entries.filter((e) => !e.doneWhen).map((e) => e.id);
if (missingDoneWhen.length) console.log(`Days without a "Done when" line: ${missingDoneWhen.join(", ")}`);
