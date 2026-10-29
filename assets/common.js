// Shared state for schedule.html and the lesson pages.
// Progress lives in localStorage under the same key the original schedule used,
// so ticks made before this redesign are kept.
(function () {
  "use strict";
  var KEY = "cn-plan-checklist-v1";
  var NOTES_KEY = "cn-plan-notes-v1";
  var THEME_KEY = "cn-plan-theme";

  // Apply the saved theme before the page paints.
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (savedTheme === "light" || savedTheme === "dark") document.documentElement.setAttribute("data-theme", savedTheme);

  function load(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  var storageOk = true;
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      if (storageOk) { storageOk = false; toast("Your browser isn't saving progress. Use Export to keep a copy.", "warn"); }
      return false;
    }
  }

  var ROADMAP_KEY = "cn-plan-roadmap-v1";
  var done = load(KEY);
  var notes = load(NOTES_KEY);
  var topics = load(ROADMAP_KEY);
  var listeners = [];
  function emit() { listeners.forEach(function (fn) { fn(); }); }

  // Another tab (for example a lesson page) changed progress: reload and re-render.
  window.addEventListener("storage", function (ev) {
    if (ev.key === KEY) done = load(KEY);
    else if (ev.key === NOTES_KEY) notes = load(NOTES_KEY);
    else if (ev.key === ROADMAP_KEY) topics = load(ROADMAP_KEY);
    else return;
    emit();
  });

  function pad(n) { return String(n).padStart(2, "0"); }
  function dayId(week, day) { return "W" + pad(week) + "D" + day; }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function fmt(iso, opts) {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, opts));
  }
  // done, today, overdue (date passed, not done), or future
  function status(entry, today) {
    if (done[entry.id]) return "done";
    if (entry.date === today) return "today";
    return entry.date < today ? "overdue" : "future";
  }

  var toastBox = null;
  function toast(message, kind) {
    if (!document.body) return;
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "toasts";
      toastBox.setAttribute("role", "status");
      toastBox.setAttribute("aria-live", "polite");
      document.body.appendChild(toastBox);
    }
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = message;
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    setTimeout(function () { t.classList.add("out"); }, 2600);
    setTimeout(function () { t.remove(); }, 3100);
  }

  function currentTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function bindThemeButton(button) {
    if (!button) return;
    function paint() {
      var dark = currentTheme() === "dark";
      button.textContent = dark ? "☀" : "☾";
      button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      button.title = button.getAttribute("aria-label");
    }
    button.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      paint();
    });
    paint();
  }

  window.Plan = {
    isDone: function (id) { return !!done[id]; },
    setDone: function (id, value) {
      if (value) done[id] = new Date().toISOString(); else delete done[id];
      store(KEY, done);
      emit();
    },
    doneCount: function () { return Object.keys(done).length; },
    allDone: function () { return Object.assign({}, done); },
    replaceAll: function (newDone, newNotes, newTopics) {
      done = newDone; store(KEY, done);
      if (newNotes) { notes = newNotes; store(NOTES_KEY, notes); }
      if (newTopics) { topics = newTopics; store(ROADMAP_KEY, topics); }
      emit();
    },
    // roadmap.sh topics, keyed "roadmap/topic"
    isTopic: function (id) { return !!topics[id]; },
    setTopic: function (id, value) {
      if (value) topics[id] = new Date().toISOString(); else delete topics[id];
      store(ROADMAP_KEY, topics);
      emit();
    },
    allTopics: function () { return Object.assign({}, topics); },
    getNote: function (id) { return typeof notes[id] === "string" ? notes[id] : ""; },
    setNote: function (id, text) {
      if (text && text.trim()) notes[id] = text; else delete notes[id];
      store(NOTES_KEY, notes);
    },
    allNotes: function () { return Object.assign({}, notes); },
    onChange: function (fn) { listeners.push(fn); },
    dayId: dayId, todayIso: todayIso, fmt: fmt, status: status, toast: toast,
    bindThemeButton: bindThemeButton,
    KEY: KEY
  };
})();
