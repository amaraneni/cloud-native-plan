// The interactive schedule (schedule.html).
// Needs assets/common.js (window.Plan) and assets/plan-data.js (window.PLAN_DATA).
(function () {
  "use strict";
  var P = window.Plan;
  var DATA = window.PLAN_DATA;
  var ENTRIES = DATA.entries;
  var TOTAL = ENTRIES.length;
  var WEEK_COUNT = DATA.weekCount;
  var RM = DATA.roadmap;
  var TOPIC_COUNT = Object.keys(RM.weeks).reduce(function (n, w) { return n + RM.weeks[w].length; }, 0);
  var byId = {};
  ENTRIES.forEach(function (e) { byId[e.id] = e; });
  var WEEKS = [];
  ENTRIES.forEach(function (e) { (WEEKS[e.week] = WEEKS[e.week] || []).push(e); });

  var state = { filter: "all", section: "", query: "" };
  var today = P.todayIso();

  // ---------- helpers ----------
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
  function $(id) { return document.getElementById(id); }
  function status(e) { return P.status(e, today); }
  function sectionLetter(name) { return name.charAt(0); }
  function shortDate(iso) { return P.fmt(iso, { month: "short", day: "numeric" }); }
  function longDate(iso) { return P.fmt(iso, { weekday: "long", month: "long", day: "numeric" }); }
  function weekRange(w) { var d = WEEKS[w]; return shortDate(d[0].date) + " – " + shortDate(d[d.length - 1].date); }
  function weekDone(w) { return WEEKS[w].filter(function (e) { return P.isDone(e.id); }).length; }
  function overdue() { return ENTRIES.filter(function (e) { return status(e) === "overdue"; }); }
  function topicsFor(w) { return RM.weeks[String(w)] || []; }
  function topicsDone(w) { return topicsFor(w).filter(function (t) { return P.isTopic(t.id); }).length; }

  // The day to focus on: today if it's in the plan, otherwise the first unfinished day.
  function focusEntry() {
    var t = ENTRIES.filter(function (e) { return e.date === today; })[0];
    if (t) return t;
    return ENTRIES.filter(function (e) { return !P.isDone(e.id); })[0] || null;
  }
  function currentWeek() {
    if (today < ENTRIES[0].date) return 1;
    if (today > ENTRIES[TOTAL - 1].date) return WEEK_COUNT;
    var t = ENTRIES.filter(function (e) { return e.date === today; })[0];
    return t ? t.week : WEEK_COUNT;
  }
  // Consecutive finished days, counting back from today (or yesterday if today isn't done yet).
  function streak() {
    var past = ENTRIES.filter(function (e) { return e.date <= today; });
    var i = past.length - 1;
    if (i >= 0 && past[i].date === today && !P.isDone(past[i].id)) i--;
    var n = 0;
    while (i >= 0 && P.isDone(past[i].id)) { n++; i--; }
    return n;
  }
  function bestStreak() {
    var best = 0, run = 0;
    ENTRIES.forEach(function (e) { if (P.isDone(e.id)) { run++; best = Math.max(best, run); } else run = 0; });
    return best;
  }

  // ---------- dashboard ----------
  function renderHero() {
    var box = $("hero");
    box.replaceChildren();
    var e = focusEntry();
    if (!e) {
      box.className = "card hero is-done";
      box.append(el("p", { class: "eyebrow", text: "All done" }), el("h2", { class: "hero-title", text: "You finished all " + TOTAL + " days." }), el("p", { class: "hero-done", text: "Well done. Look back at your notes and pick what to learn next." }));
      return;
    }
    var isToday = e.date === today;
    var done = P.isDone(e.id);
    box.className = "card hero" + (done ? " is-done" : "");
    var label = done ? "Done for today" : isToday ? "Today" : today < e.date ? "Starts " + longDate(e.date) : "Next up";
    box.append(
      el("p", { class: "eyebrow", text: label }),
      el("p", { class: "hero-meta", text: "Week " + e.week + " · Day " + e.day + " · " + longDate(e.date) + (e.light ? " · light day" : "") }),
      el("h2", { class: "hero-title", text: e.title }),
      e.doneWhen ? el("p", { class: "hero-done" }, [el("strong", { text: "Done when: " }), e.doneWhen]) : null,
      el("div", { class: "hero-actions" }, [
        el("a", { class: "btn primary", href: e.htmlLink, text: "Open lesson →" }),
        el("button", { type: "button", class: "btn" + (done ? " success" : ""), "aria-pressed": done ? "true" : "false", text: done ? "✓ Done" : "Mark done", onclick: function () { toggleDay(e.id); } }),
        el("button", { type: "button", class: "btn ghost", text: "Show in list", onclick: function () { reveal(e.id); } })
      ])
    );
    var late = overdue();
    if (late.length) {
      box.append(el("div", { class: "behind" }, [
        el("span", { text: late.length === 1 ? "1 earlier day isn't ticked yet." : late.length + " earlier days aren't ticked yet." }),
        el("button", { type: "button", class: "btn sm", text: "Show them", onclick: function () { setFilter("overdue"); $("weeks").scrollIntoView(); } })
      ]));
    }
  }

  function renderRing() {
    var n = P.doneCount ? ENTRIES.filter(function (e) { return P.isDone(e.id); }).length : 0;
    var pct = Math.round(n / TOTAL * 100);
    var c = 2 * Math.PI * 52;
    $("ring-fg").setAttribute("stroke-dasharray", c.toFixed(1));
    $("ring-fg").setAttribute("stroke-dashoffset", (c * (1 - n / TOTAL)).toFixed(1));
    $("ring-pct").textContent = pct + "%";
    $("ring-count").textContent = n + " of " + TOTAL + " days";
    $("ring").setAttribute("aria-valuenow", n);
    var w = currentWeek();
    $("ring-week").textContent = today < ENTRIES[0].date ? "Starts " + longDate(ENTRIES[0].date) : "You're in Week " + w + " of " + WEEK_COUNT;
  }

  function renderStats() {
    var s = streak();
    var late = overdue().length;
    var topics = Object.keys(P.allTopics()).length;
    var left = ENTRIES.filter(function (e) { return !P.isDone(e.id); }).length;
    var box = $("stats");
    box.replaceChildren(
      stat(s + (s === 1 ? " day" : " days"), "Current streak", s > 0 ? "good" : ""),
      stat(String(bestStreak()), "Best streak", ""),
      stat(String(late), late === 1 ? "Day behind" : "Days behind", late ? "warn" : "good"),
      stat(topics + " / " + TOPIC_COUNT, "roadmap.sh topics", ""),
      el("p", { class: "strip-label", text: "This week" }),
      weekStrip(currentWeek()),
      el("p", { class: "muted small", style: "grid-column:1/-1;margin:0", text: left + " days to go." })
    );
  }
  function stat(value, label, kind) { return el("div", { class: "stat" + (kind ? " " + kind : "") }, [el("strong", { text: value }), el("span", { text: label })]); }
  function weekStrip(w) {
    return el("div", { class: "week-strip" }, WEEKS[w].map(function (e) {
      var st = status(e);
      return el("button", {
        type: "button", class: "s-" + st, title: "Day " + e.day + ": " + e.title,
        "aria-label": P.fmt(e.date, { weekday: "long" }) + ", Day " + e.day + ", " + e.title + ", " + st,
        text: P.fmt(e.date, { weekday: "narrow" }), onclick: function () { reveal(e.id); }
      });
    }));
  }

  function renderSections() {
    var grid = $("sec-grid");
    grid.replaceChildren();
    var names = [];
    ENTRIES.forEach(function (e) { if (names.indexOf(e.section) < 0) names.push(e.section); });
    names.forEach(function (name) {
      var days = ENTRIES.filter(function (e) { return e.section === name; });
      var n = days.filter(function (e) { return P.isDone(e.id); }).length;
      var pct = Math.round(n / days.length * 100);
      var title = name.replace(/^[A-J]\.\s*/, "").replace(/\s*\(Weeks?\s.*\)$/, "");
      var range = (name.match(/\((Weeks?[^)]*)\)/) || [, ""])[1];
      grid.append(el("button", {
        type: "button", class: "sec" + (state.section === name ? " active" : "") + (n === days.length ? " complete" : ""),
        "aria-pressed": state.section === name ? "true" : "false",
        onclick: function () { state.section = state.section === name ? "" : name; $("section-select").value = state.section; renderSections(); renderWeeks(); }
      }, [
        el("span", { class: "sec-letter", text: n === days.length ? "✓" : sectionLetter(name), "aria-hidden": "true" }),
        el("span", { class: "sec-body" }, [
          el("span", { class: "sec-name", text: title }),
          el("span", { class: "sec-count", text: range + " · " + n + "/" + days.length }),
          el("span", { class: "sec-bar", "aria-hidden": "true" }, [el("span", { style: "width:" + pct + "%" })])
        ])
      ]));
    });
  }

  function renderRoadmapProgress() {
    var box = $("rm-progress");
    box.replaceChildren();
    var totals = {};
    Object.keys(RM.weeks).forEach(function (w) {
      RM.weeks[w].forEach(function (t) {
        var x = totals[t.roadmap] = totals[t.roadmap] || { all: 0, done: 0 };
        x.all++; if (P.isTopic(t.id)) x.done++;
      });
    });
    Object.keys(totals).sort(function (a, b) { return totals[b].all - totals[a].all; }).forEach(function (r) {
      var x = totals[r];
      box.append(el("div", { class: "rm-row" }, [
        el("a", { href: RM.roadmaps[r].url, target: "_blank", rel: "noopener", text: RM.roadmaps[r].name }),
        el("span", { class: "sec-bar", "aria-hidden": "true" }, [el("span", { style: "width:" + Math.round(x.done / x.all * 100) + "%" })]),
        el("span", { class: "num", text: x.done + "/" + x.all })
      ]));
    });
  }

  function renderHeat() {
    var months = $("heat-months");
    var grid = $("heat-grid");
    months.replaceChildren();
    grid.replaceChildren();
    months.style.setProperty("--weeks", WEEK_COUNT);
    grid.style.setProperty("--weeks", WEEK_COUNT);
    // Label the first week of each month, but skip a label too close to the previous one.
    var last = "", lastAt = -9;
    for (var w = 1; w <= WEEK_COUNT; w++) {
      var m = P.fmt(WEEKS[w][0].date, { month: "short" });
      var show = m !== last && w - lastAt >= 3;
      months.append(el("span", { text: show ? m : "" }));
      if (m !== last) { last = m; if (show) lastAt = w; }
    }
    ENTRIES.forEach(function (e) {
      var st = status(e);
      grid.append(el("button", {
        type: "button", class: "cell s-" + st,
        title: shortDate(e.date) + " · Week " + e.week + " Day " + e.day + ": " + e.title,
        "aria-label": longDate(e.date) + ", Week " + e.week + " Day " + e.day + ", " + e.title + ", " + st,
        onclick: function () { reveal(e.id); }
      }));
    });
  }

  function renderDashboard() { renderHero(); renderRing(); renderStats(); renderSections(); renderRoadmapProgress(); renderHeat(); renderChipCounts(); }

  // ---------- list of weeks ----------
  function matches(e) {
    var st = status(e);
    if (state.filter === "todo" && st === "done") return false;
    if (state.filter === "done" && st !== "done") return false;
    if (state.filter === "overdue" && st !== "overdue") return false;
    if (state.filter === "week" && e.week !== currentWeek()) return false;
    if (state.section && e.section !== state.section) return false;
    if (state.query) {
      var hay = (e.title + " " + e.doneWhen + " " + e.weekTitle + " " + e.section + " " + P.getNote(e.id) + " week " + e.week + " " +
        topicsFor(e.week).map(function (t) { return t.title; }).join(" ")).toLowerCase();
      var words = state.query.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    }
    return true;
  }

  function renderWeeks() {
    var root = $("weeks");
    var open = {};
    root.querySelectorAll("details.week[open]").forEach(function (d) { open[d.dataset.week] = true; });
    root.replaceChildren();
    var shown = 0, lastSection = "";
    var filtering = state.filter !== "all" || state.query || state.section;
    var cw = currentWeek();
    for (var w = 1; w <= WEEK_COUNT; w++) {
      var days = WEEKS[w].filter(matches);
      if (!days.length) continue;
      shown += days.length;
      if (WEEKS[w][0].section !== lastSection) { lastSection = WEEKS[w][0].section; root.append(el("h2", { class: "section-title", text: lastSection })); }
      var isOpen = filtering || open[w] || (!Object.keys(open).length && w === cw);
      root.append(weekBlock(w, days, isOpen));
    }
    if (!shown) root.append(el("div", { class: "card empty" }, [el("p", { text: "No days match." }), el("button", { type: "button", class: "btn", text: "Clear filters", onclick: clearFilters })]));
    var label = shown === TOTAL ? "Showing all " + TOTAL + " days." : "Showing " + shown + " of " + TOTAL + " days.";
    $("result-count").textContent = label;
  }

  function weekBlock(w, days, isOpen) {
    var all = WEEKS[w];
    var n = weekDone(w);
    var d = el("details", { class: "week", "data-week": w, id: "week-" + w, open: isOpen });
    var dots = el("span", { class: "wk-dots", "aria-hidden": "true" }, all.map(function (e) { return el("span", { class: "dot s-" + status(e) }); }));
    var tn = topicsFor(w).length;
    d.append(el("summary", {}, [
      el("span", { class: "wk-num" + (n === 7 ? " complete" : ""), text: n === 7 ? "✓" : String(w) }),
      el("span", { class: "wk-main" }, [
        el("span", { class: "wk-title", text: "Week " + w + ": " + all[0].weekTitle }),
        el("span", { class: "wk-dates" }, [
          el("span", { text: weekRange(w) }), dots,
          w === currentWeek() && today >= ENTRIES[0].date && today <= ENTRIES[TOTAL - 1].date ? el("span", { class: "badge today", text: "This week" }) : null,
          tn ? el("span", { class: "badge light", text: "roadmap.sh " + topicsDone(w) + "/" + tn }) : null
        ])
      ]),
      el("span", { class: "wk-count", text: n + "/7" }),
      el("span", { class: "chev", "aria-hidden": "true" })
    ]));
    d.append(el("ul", { class: "days" }, days.map(dayRow)));
    if (tn) d.append(roadmapBox(w));
    return d;
  }

  function dayRow(e) {
    var st = status(e);
    var li = el("li", { class: "day s-" + st, id: e.id });
    var cb = el("input", { type: "checkbox", class: "tick", id: "cb-" + e.id, "aria-describedby": "dw-" + e.id });
    cb.checked = P.isDone(e.id);
    cb.addEventListener("change", function () { setDay(e.id, cb.checked); });
    var note = P.getNote(e.id);
    var noteBtn = el("button", { type: "button", class: "icon-btn" + (note ? " has-note" : ""), "aria-expanded": "false", "aria-controls": "nt-" + e.id, "aria-label": (note ? "Edit" : "Add") + " notes for Week " + e.week + " Day " + e.day, title: "Notes", text: "✎" });
    var notes = el("div", { class: "d-notes", id: "nt-" + e.id, hidden: true });
    noteBtn.addEventListener("click", function () {
      var openNow = notes.hidden;
      notes.hidden = !openNow;
      noteBtn.setAttribute("aria-expanded", String(openNow));
      if (openNow) {
        if (!notes.firstChild) buildNotes(e, notes, noteBtn);
        notes.querySelector("textarea").focus();
      }
    });
    var badges = el("span", { class: "badges" }, [
      st === "today" ? el("span", { class: "badge today", text: "Today" }) : null,
      st === "overdue" ? el("span", { class: "badge overdue", text: "Behind" }) : null,
      e.light ? el("span", { class: "badge light", text: "Light day" }) : null
    ]);
    li.append(
      cb,
      el("label", { class: "d-date", for: "cb-" + e.id }, [el("span", { class: "dow", text: P.fmt(e.date, { weekday: "short" }) }), el("span", { class: "dm", text: shortDate(e.date) })]),
      el("div", { class: "d-main" }, [
        el("div", { class: "d-title" }, [el("span", { class: "d-num", text: "Day " + e.day }), el("label", { class: "d-text", for: "cb-" + e.id, text: e.title }), badges]),
        e.doneWhen ? el("p", { class: "d-done", id: "dw-" + e.id }, [el("span", { class: "lbl", text: "Done when: " }), e.doneWhen]) : null,
        notes
      ]),
      el("div", { class: "d-actions" }, [el("a", { class: "btn sm", href: e.htmlLink, text: "Open lesson" }), noteBtn])
    );
    return li;
  }

  function buildNotes(e, box, btn) {
    var ta = el("textarea", { "aria-label": "Notes for Week " + e.week + " Day " + e.day, placeholder: "What did you build? What tripped you up? Links you want to keep…" });
    ta.value = P.getNote(e.id);
    var saved = el("span", { class: "saved", "aria-live": "polite" });
    var timer = null;
    ta.addEventListener("input", function () {
      clearTimeout(timer);
      saved.textContent = "";
      timer = setTimeout(function () { P.setNote(e.id, ta.value); btn.classList.toggle("has-note", !!ta.value.trim()); saved.textContent = "Saved"; }, 400);
    });
    box.append(ta, saved);
  }

  function roadmapBox(w) {
    var list = topicsFor(w);
    var box = el("div", { class: "roadmap-box" });
    var count = el("span", { class: "muted", text: topicsDone(w) + " of " + list.length + " marked" });
    box.append(el("div", { class: "roadmap-head" }, [
      el("h4", {}, [el("span", { class: "rm-logo", text: "rs", "aria-hidden": "true" }), "After this week, mark these done on roadmap.sh"]),
      count
    ]));
    box.append(el("ul", { class: "rm-list" }, list.map(function (t) {
      var id = "rm-" + w + "-" + t.id.replace(/[^a-z0-9]/gi, "-");
      var on = P.isTopic(t.id);
      var item = el("li", { class: "rm-item" + (on ? " is-done" : "") });
      var cb = el("input", { type: "checkbox", class: "tick", id: id });
      cb.checked = on;
      cb.addEventListener("change", function () {
        P.setTopic(t.id, cb.checked);
        item.classList.toggle("is-done", cb.checked);
        count.textContent = topicsDone(w) + " of " + list.length + " marked";
        if (cb.checked && topicsDone(w) === list.length) P.toast("Week " + w + "'s roadmap.sh topics are all marked.", "success");
      });
      item.append(cb,
        el("label", { for: id }, [el("span", { class: "rm-title", text: t.title }), el("span", { class: "rm-road", text: RM.roadmaps[t.roadmap].name })]),
        el("a", { href: RM.roadmaps[t.roadmap].url, target: "_blank", rel: "noopener", text: "Open ↗", "aria-label": "Open the " + RM.roadmaps[t.roadmap].name + " roadmap" }));
      return item;
    })));
    box.append(el("p", { class: "rm-tip", text: "On the roadmap page, click the topic, then set it to Done. Tick it here too so you can see both in one place." }));
    return box;
  }

  // ---------- actions ----------
  function toggleDay(id) { setDay(id, !P.isDone(id)); }
  function setDay(id, value) {
    var e = byId[id];
    var before = weekDone(e.week);
    P.setDone(id, value); // triggers refresh via onChange
    if (value) {
      if (before === 6 && weekDone(e.week) === 7) {
        P.toast("Week " + e.week + " complete. Mark its roadmap.sh topics next.", "success");
        var wk = $("week-" + e.week);
        if (wk) { wk.classList.remove("celebrate"); void wk.offsetWidth; wk.classList.add("celebrate"); }
      } else {
        P.toast("Week " + e.week + " Day " + e.day + " done.", "success");
      }
    } else {
      P.toast("Week " + e.week + " Day " + e.day + " marked not done.");
    }
  }

  function refresh() {
    renderDashboard();
    // Update rows in place, so open notes and scroll position stay put.
    ENTRIES.forEach(function (e) {
      var li = $(e.id);
      if (!li) return;
      var st = status(e);
      li.className = "day s-" + st;
      var cb = $("cb-" + e.id);
      if (cb) cb.checked = P.isDone(e.id);
    });
    for (var w = 1; w <= WEEK_COUNT; w++) {
      var d = $("week-" + w);
      if (!d) continue;
      var n = weekDone(w);
      var num = d.querySelector(".wk-num");
      num.textContent = n === 7 ? "✓" : String(w);
      num.classList.toggle("complete", n === 7);
      d.querySelector(".wk-count").textContent = n + "/7";
      d.querySelectorAll(".dot").forEach(function (dot, i) { dot.className = "dot s-" + status(WEEKS[w][i]); });
      var rb = d.querySelector(".badge.light");
      if (rb) rb.textContent = "roadmap.sh " + topicsDone(w) + "/" + topicsFor(w).length;
      d.querySelectorAll(".rm-item").forEach(function (item, i) {
        var t = topicsFor(w)[i];
        var on = P.isTopic(t.id);
        item.classList.toggle("is-done", on);
        item.querySelector("input").checked = on;
      });
    }
    // A filter like "To do" should drop rows that no longer match.
    if (state.filter !== "all") renderWeeks();
  }

  function reveal(id) {
    if (!$(id)) { clearFilters(); }
    var e = byId[id];
    var wk = $("week-" + e.week);
    if (wk && !wk.open) wk.open = true;
    var li = $(id);
    if (!li) return;
    li.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    li.classList.remove("flash"); void li.offsetWidth; li.classList.add("flash");
    $("cb-" + id).focus({ preventScroll: true });
  }

  function setFilter(f) {
    state.filter = f;
    document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.filter === f)); });
    renderWeeks();
  }
  function clearFilters() {
    state.query = ""; state.section = "";
    $("search").value = ""; $("section-select").value = "";
    setFilter("all");
    renderSections();
  }
  function renderChipCounts() {
    var n = overdue().length;
    var c = $("overdue-count");
    c.textContent = String(n);
    c.hidden = n === 0;
  }

  // ---------- export / import ----------
  function exportProgress() {
    var payload = { format: P.KEY, version: 2, exportedAt: new Date().toISOString(), done: P.allDone(), notes: P.allNotes(), roadmap: P.allTopics() };
    var a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })), download: "cn-plan-progress-" + today + ".json" });
    document.body.append(a); a.click(); a.remove();
    P.toast("Progress exported.", "success");
  }
  function importProgress(file) {
    file.text().then(function (text) {
      var parsed = JSON.parse(text);
      if (parsed.format !== P.KEY || typeof parsed.done !== "object") throw new Error("this isn't a progress file from this page");
      var done = {}, notes = {}, topics = {};
      Object.keys(parsed.done).forEach(function (id) { if (byId[id] && typeof parsed.done[id] === "string") done[id] = parsed.done[id]; });
      Object.keys(parsed.notes || {}).forEach(function (id) { if (byId[id] && typeof parsed.notes[id] === "string") notes[id] = parsed.notes[id].slice(0, 20000); });
      var valid = {};
      Object.keys(RM.weeks).forEach(function (w) { RM.weeks[w].forEach(function (t) { valid[t.id] = true; }); });
      Object.keys(parsed.roadmap || {}).forEach(function (id) { if (valid[id] && typeof parsed.roadmap[id] === "string") topics[id] = parsed.roadmap[id]; });
      var msg = "Replace your current progress with this file?\n\n" + Object.keys(done).length + " days done, " + Object.keys(notes).length + " notes, " + Object.keys(topics).length + " roadmap.sh topics.";
      if (!confirm(msg)) { P.toast("Import cancelled."); return; }
      P.replaceAll(done, notes, topics);
      renderWeeks();
      P.toast("Progress imported.", "success");
    }).catch(function (err) { P.toast("Couldn't import that file: " + err.message + ".", "warn"); });
  }

  // ---------- wire up ----------
  function init() {
    P.bindThemeButton($("theme-btn"));
    $("plan-dates").textContent = longDate(ENTRIES[0].date) + ", " + ENTRIES[0].date.slice(0, 4) + " to " + longDate(ENTRIES[TOTAL - 1].date) + ", " + ENTRIES[TOTAL - 1].date.slice(0, 4) + " · " + WEEK_COUNT + " weeks · Day 7 of each week is a light catch-up day";
    var sel = $("section-select");
    var seen = [];
    ENTRIES.forEach(function (e) { if (seen.indexOf(e.section) < 0) { seen.push(e.section); sel.append(el("option", { value: e.section, text: e.section })); } });
    sel.addEventListener("change", function () { state.section = sel.value; renderSections(); renderWeeks(); });
    var timer = null;
    $("search").addEventListener("input", function (ev) { clearTimeout(timer); timer = setTimeout(function () { state.query = ev.target.value.trim(); renderWeeks(); }, 150); });
    document.querySelectorAll("[data-filter]").forEach(function (b) { b.addEventListener("click", function () { setFilter(b.dataset.filter); }); });
    $("expand-btn").addEventListener("click", function () {
      var all = document.querySelectorAll("details.week");
      var anyClosed = [].some.call(all, function (d) { return !d.open; });
      all.forEach(function (d) { d.open = anyClosed; });
      $("expand-btn").textContent = anyClosed ? "Collapse all" : "Expand all";
    });
    $("today-btn").addEventListener("click", function () { var e = focusEntry(); if (e) reveal(e.id); });
    $("export-btn").addEventListener("click", exportProgress);
    $("import-btn").addEventListener("click", function () { $("import-file").click(); });
    $("import-file").addEventListener("change", function (ev) { var f = ev.target.files[0]; ev.target.value = ""; if (f) importProgress(f); });
    document.addEventListener("keydown", function (ev) {
      var tag = (ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || ev.ctrlKey || ev.metaKey || ev.altKey) {
        if (ev.key === "Escape" && ev.target.id === "search") { ev.target.value = ""; state.query = ""; renderWeeks(); }
        return;
      }
      if (ev.key === "/") { ev.preventDefault(); $("search").focus(); }
      else if (ev.key === "t" || ev.key === "T") { var e = focusEntry(); if (e) reveal(e.id); }
    });
    P.onChange(refresh);
    // The date changes at midnight while the page is open.
    setInterval(function () { var t = P.todayIso(); if (t !== today) { today = t; renderDashboard(); renderWeeks(); } }, 60000);
    renderDashboard();
    renderWeeks();
    if (location.hash && byId[location.hash.slice(1)]) setTimeout(function () { reveal(location.hash.slice(1)); }, 50);
  }
  init();
})();
