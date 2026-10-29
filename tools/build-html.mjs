// Converts the plan's Markdown files to HTML pages you can open straight from disk.
// Usage (from the plan folder): node tools/build-html.mjs
// Output: plan.html, resources.html, and weeks/*.html next to their .md files. The pages use the
// shared assets/site.css, common.js, plan-data.js, and lessons.js; run build-schedule.mjs first.
// Links between .md files are rewritten to the .html versions, and heading IDs match the
// anchors used by schedule.html. No packages needed; it handles the Markdown this plan uses:
// headings, paragraphs, nested lists, fenced code, tables, links, bold, italics, inline code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Same slug rule as build-schedule.mjs, so schedule links land on the right heading.
export function makeSlugger() {
  const seen = new Map();
  return (heading) => {
    const base = heading.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function rewriteHref(href) {
  if (/^https?:/i.test(href) || href.startsWith("#") || href.startsWith("mailto:")) return href;
  return href.replace(/\.md(?=$|#)/, ".html");
}

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const h = rewriteHref(href.replace(/&amp;/g, "&"));
    const external = /^https?:/i.test(h);
    return `<a href="${esc(h)}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
  return s;
}

const indentOf = (line) => line.match(/^ */)[0].length;
const listMarker = (line) => line.match(/^( *)([-*]|\d+\.) +(.*)$/);
const isFence = (line) => /^ *```/.test(line);
const isTableStart = (lines, i) => /^\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]);

function parseBlocks(lines, slug) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (isFence(line)) {
      const pad = indentOf(line);
      const lang = line.trim().slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) {
        body.push(lines[i].slice(Math.min(pad, indentOf(lines[i]))));
        i++;
      }
      i++; // closing fence
      out.push(`<pre><code${lang ? ` class="lang-${esc(lang)}"` : ""}>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6}) +(.*)$/);
    if (h) {
      const level = h[1].length;
      const id = slug(h[2]);
      out.push(`<h${level} id="${esc(id)}">${inline(h[2])}<a class="anchor" href="#${esc(id)}" aria-label="Link to this heading">#</a></h${level}>`);
      i++;
      continue;
    }

    if (/^ *(-{3,}|\*{3,}) *$/.test(line)) { out.push("<hr>"); i++; continue; }

    if (isTableStart(lines, i)) {
      const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const head = cells(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }

    const m = listMarker(line);
    if (m) {
      const baseIndent = m[1].length;
      const ordered = /\d/.test(m[2]);
      const startNumber = ordered ? parseInt(m[2], 10) : 1;
      const items = [];
      while (i < lines.length) {
        const mm = listMarker(lines[i]);
        if (!mm || mm[1].length !== baseIndent || /\d/.test(mm[2]) !== ordered) break;
        const contentIndent = mm[1].length + mm[2].length + (lines[i].length - mm[1].length - mm[2].length - mm[3].length);
        const itemLines = [mm[3]];
        i++;
        while (i < lines.length) {
          const l = lines[i];
          if (!l.trim()) {
            // A blank line continues the item only if the next text line is indented into it.
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && indentOf(lines[j]) > baseIndent) { itemLines.push(""); i++; continue; }
            break;
          }
          if (indentOf(l) <= baseIndent) break;
          itemLines.push(l.slice(Math.min(contentIndent, indentOf(l))));
          i++;
        }
        items.push(itemLines);
      }
      const tag = ordered ? "ol" : "ul";
      const startAttr = ordered && startNumber !== 1 ? ` start="${startNumber}"` : "";
      const lis = items.map((itemLines) => {
        const inner = parseBlocks(itemLines, slug);
        // Tight item: a single paragraph, or a paragraph followed by a nested list.
        if (inner.length && inner[0].startsWith("<p>")) inner[0] = inner[0].slice(3, -4);
        return `<li>${inner.join("\n")}</li>`;
      });
      out.push(`<${tag}${startAttr}>\n${lis.join("\n")}\n</${tag}>`);
      continue;
    }

    // Paragraph: gather lines until a blank line or another block starts.
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isFence(lines[i]) && !/^#{1,6} /.test(lines[i]) && !listMarker(lines[i]) && !isTableStart(lines, i) && !/^ *-{3,} *$/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out;
}


const pages = JSON.parse(fs.readFileSync(path.join(root, "data", "plan-config.json"), "utf8")).pages;
const PLAN = JSON.parse(fs.readFileSync(path.join(root, "data", "plan-config.json"), "utf8"));
for (const [rel] of pages) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing ${rel}`);

const relLink = (fromRel, toRel) => {
  const r = path.relative(path.dirname(path.join(root, fromRel)), path.join(root, toRel)).split(path.sep).join("/");
  return r.replace(/\.md$/, ".html");
};

pages.forEach(([rel, label], index) => {
  const md = fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
  const body = parseBlocks(md.split("\n"), makeSlugger()).join("\n");
  const title = (md.match(/^# (.*)$/m) || [, label])[1].replace(/[`*]/g, "");
  const htmlRel = rel.replace(/\.md$/, ".html");
  const toRoot = rel.includes("/") ? "../" : "";
  const current = (target) => (htmlRel === target ? ' aria-current="page"' : "");
  const prev = pages[index - 1];
  const next = pages[index + 1];
  const pager = `<nav class="pager" aria-label="Sections">${prev ? `<a class="prev" href="${relLink(rel, prev[0])}"><small>Previous</small>← ${esc(prev[1])}</a>` : "<span></span>"}${next ? `<a class="next" href="${relLink(rel, next[0])}"><small>Next</small>${esc(next[1])} →</a>` : "<span></span>"}</nav>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(PLAN.name)}</title>
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="${toRoot}assets/site.css">
<script src="${toRoot}assets/common.js"></script>
</head>
<body data-page="${htmlRel}" data-root="${toRoot}">
<a class="skip" href="#content">Skip to the lesson</a>
<div class="read-progress" aria-hidden="true"><span></span></div>
<header class="topbar">
  <button type="button" class="icon-btn toc-toggle" id="toc-btn" aria-controls="toc" aria-expanded="false" aria-label="Show contents">☰</button>
  <a class="brand" href="${toRoot}schedule.html"><span class="logo" aria-hidden="true">${esc(PLAN.logo)}</span><span class="brand-text">${esc(PLAN.name)}</span></a>
  <nav class="top-links" aria-label="Plan">
    <a href="${toRoot}schedule.html">Schedule</a>
    <a href="${toRoot}plan.html"${current("plan.html")}>Plan</a>
    <a href="${toRoot}resources.html"${current("resources.html")}>Resources</a>
  </nav>
  <span class="grow"></span>
  <button type="button" class="icon-btn" id="theme-btn"></button>
</header>
<div class="layout">
  <nav class="toc" id="toc" aria-label="On this page"></nav>
  <main class="prose" id="content">
${body}
${pager}
  </main>
</div>
<script src="${toRoot}assets/plan-data.js"></script>
<script src="${toRoot}assets/lessons.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(root, htmlRel), html, "utf8");
});
console.log(`Wrote ${pages.length} HTML pages.`);
