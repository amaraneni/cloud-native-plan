// Interactive parts of the lesson pages (plan.html, weeks/*.html, resources.html).
// Needs assets/common.js (window.Plan) and assets/plan-data.js (window.PLAN_DATA).
(function () {
  "use strict";
  var P = window.Plan;
  var DATA = window.PLAN_DATA;
  var RM = DATA.roadmap;
  var page = document.body.getAttribute("data-page"); // e.g. "weeks/C-rag-weeks-09-14.html"
  var toRoot = document.body.getAttribute("data-root") || ""; // "" or "../"
  var today = P.todayIso();
  var content = document.getElementById("content");

  function el(tag, props, children) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") n.textContent = v;
      else if (k === "class") n.className = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    [].concat(children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  // Days that live on this page, matched to their headings by anchor.
  var days = DATA.entries.filter(function (e) { return e.htmlLink.split("#")[0] === page; });
  var bars = []; // { entry, heading, bar }

  function statusLabel(st) { return st === "done" ? "Done" : st === "today" ? "Today" : st === "overdue" ? "Behind" : ""; }

  function decorateDays() {
    days.forEach(function (e) {
      var h = document.getElementById(e.htmlLink.split("#")[1]);
      if (!h) return;
      h.classList.add("day-heading");
      var btn = el("button", { type: "button", class: "btn sm" });
      var badge = el("span", { class: "badge" });
      var noteBtn = el("button", { type: "button", class: "btn sm ghost", "aria-expanded": "false", "aria-controls": "notes-" + e.id });
      var panel = el("div", { class: "notes-panel", id: "notes-" + e.id, hidden: true });
      var bar = el("div", { class: "daybar" }, [
        btn,
        el("span", { class: "chip", text: P.fmt(e.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) }),
        badge,
        e.light ? el("span", { class: "badge light", text: "Light day" }) : null,
        el("span", { class: "spacer" }),
        noteBtn,
        el("a", { class: "btn sm ghost", href: toRoot + "schedule.html#" + e.id, text: "In schedule" })
      ]);
      btn.addEventListener("click", function () {
        var value = !P.isDone(e.id);
        P.setDone(e.id, value);
        P.toast(value ? "Week " + e.week + " Day " + e.day + " done." : "Week " + e.week + " Day " + e.day + " marked not done.", value ? "success" : "");
        if (value && e.day === 7) {
          var rb = document.getElementById("roadmap-week-" + e.week);
          if (rb) setTimeout(function () { rb.scrollIntoView({ block: "center", behavior: "smooth" }); }, 300);
        }
      });
      noteBtn.addEventListener("click", function () {
        var open = panel.hidden;
        panel.hidden = !open;
        noteBtn.setAttribute("aria-expanded", String(open));
        if (open) {
          if (!panel.firstChild) buildNotes(e, panel, noteBtn);
          panel.querySelector("textarea").focus();
        }
      });
      h.after(bar);
      bar.after(panel);
      bars.push({ entry: e, heading: h, bar: bar, btn: btn, badge: badge, noteBtn: noteBtn });
    });
  }

  function buildNotes(e, panel, btn) {
    var ta = el("textarea", { "aria-label": "Notes for Week " + e.week + " Day " + e.day, placeholder: "Your notes for this day. They're saved in this browser and show in the schedule too." });
    ta.value = P.getNote(e.id);
    var saved = el("span", { class: "saved", "aria-live": "polite" });
    var timer = null;
    ta.addEventListener("input", function () {
      clearTimeout(timer);
      saved.textContent = "";
      timer = setTimeout(function () { P.setNote(e.id, ta.value); paintNoteButton(btn, e); saved.textContent = "Saved"; }, 400);
    });
    panel.append(ta, saved);
  }
  function paintNoteButton(btn, e) { btn.textContent = P.getNote(e.id).trim() ? "✎ Notes •" : "✎ Notes"; }

  function paintDays() {
    bars.forEach(function (b) {
      var st = P.status(b.entry, today);
      var done = st === "done";
      b.btn.textContent = done ? "✓ Done" : "Mark done";
      b.btn.className = "btn sm" + (done ? " success" : " primary");
      b.btn.setAttribute("aria-pressed", String(done));
      b.btn.setAttribute("aria-label", (done ? "Done: " : "Mark done: ") + "Week " + b.entry.week + " Day " + b.entry.day);
      b.badge.textContent = statusLabel(st);
      b.badge.className = "badge" + (st === "today" ? " today" : st === "overdue" ? " overdue" : "");
      b.badge.hidden = !b.badge.textContent || done;
      b.heading.classList.toggle("is-done", done);
      b.bar.classList.toggle("is-done", done);
      paintNoteButton(b.noteBtn, b.entry);
    });
  }

  // roadmap.sh checklist after each week's Day 7.
  var roadmapBoxes = [];
  function addRoadmapBoxes() {
    var weeks = {};
    days.forEach(function (e) { weeks[e.week] = weeks[e.week] || []; weeks[e.week].push(e); });
    Object.keys(weeks).forEach(function (w) {
      var list = RM.weeks[w] || [];
      if (!list.length) return;
      var last = weeks[w].filter(function (e) { return e.day === 7; })[0] || weeks[w][weeks[w].length - 1];
      var anchor = document.getElementById("notes-" + last.id);
      if (!anchor) return;
      // Put it after Day 7's content: before the next heading or rule.
      var node = anchor.nextElementSibling;
      while (node && !/^(H1|H2|H3|HR)$/.test(node.tagName) && !node.classList.contains("pager")) { anchor = node; node = node.nextElementSibling; }
      var count = el("span", { class: "muted" });
      var box = el("section", { class: "roadmap-box", id: "roadmap-week-" + w, "aria-labelledby": "roadmap-week-" + w + "-title" }, [
        el("div", { class: "roadmap-head" }, [
          el("h4", { id: "roadmap-week-" + w + "-title" }, [el("span", { class: "rm-logo", text: "rs", "aria-hidden": "true" }), "Week " + w + ": mark these done on roadmap.sh"]),
          count
        ])
      ]);
      var items = [];
      var ul = el("ul", { class: "rm-list" });
      list.forEach(function (t) {
        var id = "rm-" + w + "-" + t.id.replace(/[^a-z0-9]/gi, "-");
        var cb = el("input", { type: "checkbox", class: "tick", id: id });
        var li = el("li", { class: "rm-item" }, [
          cb,
          el("label", { for: id }, [el("span", { class: "rm-title", text: t.title }), el("span", { class: "rm-road", text: RM.roadmaps[t.roadmap].name })]),
          el("a", { href: RM.roadmaps[t.roadmap].url, target: "_blank", rel: "noopener", text: "Open ↗", "aria-label": "Open the " + RM.roadmaps[t.roadmap].name + " roadmap" })
        ]);
        cb.addEventListener("change", function () {
          P.setTopic(t.id, cb.checked);
          if (cb.checked && list.every(function (x) { return P.isTopic(x.id); })) P.toast("Week " + w + "'s roadmap.sh topics are all marked.", "success");
        });
        items.push({ topic: t, li: li, cb: cb });
        ul.append(li);
      });
      box.append(ul, el("p", { class: "rm-tip", text: "On roadmap.sh, open the roadmap, click each topic, and set it to Done. Tick it here too, so your schedule shows it." }));
      anchor.after(box);
      roadmapBoxes.push({ list: list, items: items, count: count });
    });
  }
  function paintRoadmap() {
    roadmapBoxes.forEach(function (b) {
      var n = 0;
      b.items.forEach(function (x) {
        var on = P.isTopic(x.topic.id);
        if (on) n++;
        x.cb.checked = on;
        x.li.classList.toggle("is-done", on);
      });
      b.count.textContent = n + " of " + b.list.length + " marked";
    });
  }

  // Sidebar: this page's headings, with a status dot for each day.
  var tocLinks = [];
  function buildToc() {
    var toc = document.getElementById("toc");
    if (!toc) return;
    var heads = [].slice.call(content.querySelectorAll("h2[id], h3[id]"));
    if (heads.length < 3) { document.body.classList.add("no-toc"); toc.remove(); var tb = document.getElementById("toc-btn"); if (tb) tb.remove(); return; }
    var dayByAnchor = {};
    days.forEach(function (e) { dayByAnchor[e.htmlLink.split("#")[1]] = e; });
    var root = el("ol");
    var sub = null;
    heads.forEach(function (h) {
      var text = h.firstChild && h.firstChild.nodeType === 3 ? h.textContent.replace(/#$/, "").trim() : h.textContent.replace(/#$/, "").trim();
      var a = el("a", { href: "#" + h.id }, [el("span", { class: "toc-dot", "aria-hidden": "true" }), el("span", { text: text })]);
      var entry = dayByAnchor[h.id];
      tocLinks.push({ a: a, h: h, entry: entry });
      a.addEventListener("click", function () { document.body.classList.remove("toc-open"); });
      if (h.tagName === "H2") {
        var li = el("li", { class: "toc-h2" }, [a]);
        sub = el("ol", { class: "toc-sub" });
        li.append(sub);
        root.append(li);
      } else {
        (sub || root).append(el("li", { class: "toc-h3" }, [a]));
      }
    });
    root.querySelectorAll(".toc-sub").forEach(function (s) { if (!s.children.length) s.remove(); });
    toc.append(el("p", { class: "toc-title", text: "On this page" }), root);
    // Highlight the heading you're reading: the last one above a line near the top of the screen.
    var current = null, ticking = false;
    function spy() {
      ticking = false;
      var line = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"), 10) || 61) + 90;
      var found = heads[0];
      for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top <= line) found = heads[i]; else break; }
      if (found === current) return;
      current = found;
      tocLinks.forEach(function (t) {
        var on = t.h === current;
        t.a.classList.toggle("active", on);
        if (on) t.a.setAttribute("aria-current", "location"); else t.a.removeAttribute("aria-current");
      });
      var active = toc.querySelector("a.active");
      if (active && !document.body.classList.contains("toc-open")) {
        var r = active.getBoundingClientRect(), tr = toc.getBoundingClientRect();
        if (r.top < tr.top + 40 || r.bottom > tr.bottom - 40) toc.scrollTop += r.top - tr.top - tr.height / 3;
      }
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    window.addEventListener("resize", spy);
    setTimeout(spy, 50);
    var btn = document.getElementById("toc-btn");
    if (btn) btn.addEventListener("click", function () {
      var open = document.body.classList.toggle("toc-open");
      btn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") document.body.classList.remove("toc-open"); });
  }
  function paintToc() {
    tocLinks.forEach(function (t) {
      if (!t.entry) return;
      var st = P.status(t.entry, today);
      t.a.classList.remove("s-done", "s-today", "s-overdue", "s-future");
      t.a.classList.add("s-" + st);
    });
  }

  // Copy buttons on code blocks.
  function addCopyButtons() {
    content.querySelectorAll("pre").forEach(function (pre) {
      var b = el("button", { type: "button", class: "copy", text: "Copy", "aria-label": "Copy code" });
      b.addEventListener("click", function () {
        var code = pre.querySelector("code").innerText;
        var ok = function () { b.textContent = "Copied"; b.classList.add("ok"); setTimeout(function () { b.textContent = "Copy"; b.classList.remove("ok"); }, 1500); };
        if (navigator.clipboard && window.isSecureContext !== false) navigator.clipboard.writeText(code).then(ok, fallback);
        else fallback();
        function fallback() {
          var ta = el("textarea", { style: "position:fixed;opacity:0" });
          ta.value = code; document.body.append(ta); ta.select();
          try { document.execCommand("copy"); ok(); } catch (e) { P.toast("Couldn't copy. Select the code and press Ctrl+C.", "warn"); }
          ta.remove();
        }
      });
      pre.append(b);
    });
  }

  // Reading progress bar.
  function readingProgress() {
    var bar = document.querySelector(".read-progress span");
    if (!bar) return;
    var tick = false;
    function update() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? Math.min(100, h.scrollTop / max * 100) : 0) + "%";
      tick = false;
    }
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  function paint() { paintDays(); paintRoadmap(); paintToc(); }

  P.bindThemeButton(document.getElementById("theme-btn"));
  decorateDays();
  addRoadmapBoxes();
  buildToc();
  addCopyButtons();
  readingProgress();
  paint();
  P.onChange(paint);
  // Re-apply the hash target after adding bars, so the page lands on the right day.
  if (location.hash) { var t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) setTimeout(function () { t.scrollIntoView(); }, 0); }
})();
