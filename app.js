(() => {
  "use strict";

  const LS_KEY = "alltimer.v1";
  const $ = (id) => document.getElementById(id);

  const els = {
    title: $("title"),
    titleInput: $("titleInput"),
    days: $("days"),
    hours: $("hours"),
    minutes: $("minutes"),
    seconds: $("seconds"),
    caption: $("caption"),
    progressFill: $("progressFill"),
    themeToggle: $("themeToggle"),
    fullscreenToggle: $("fullscreenToggle"),
    pills: Array.from(document.querySelectorAll(".pill")),
    monthsPills: Array.from(document.querySelectorAll(".pill[data-months]")),
    customPill: document.querySelector(".pill[data-custom]"),
    customRange: $("customRange"),
    startDate: $("startDate"),
    endDate: $("endDate"),
  };

  const DEFAULT_TITLE = "Make this year count";
  const DAY_MS = 86400000;

  const fmtDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  /* Date-key helpers: "YYYY-MM-DD" in local time */
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const keyToTime = (key, hour) => new Date(`${key}T${hour}`).getTime();
  const startOfDay = (key) => keyToTime(key, "00:00:00");
  const endOfDay = (key) => keyToTime(key, "23:59:59.999");
  const addDaysKey = (key, n) => {
    const d = new Date(startOfDay(key));
    d.setDate(d.getDate() + n);
    return fmtKey(d);
  };
  const todayKey = () => fmtKey(new Date());

  function monthsFromNow(n) {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d;
  }

  // Months remaining in the current year, clamped to the 1–4 range.
  function defaultMonths() {
    const m = new Date().getMonth() + 1; // 1–12
    return Math.min(4, Math.max(1, 12 - m));
  }

  function loadState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(LS_KEY));
    } catch (_) { /* corrupt storage → fresh state */ }

    const theme = saved && saved.theme
      ? saved.theme
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    const state = {
      title: (saved && saved.title) || DEFAULT_TITLE,
      theme,
      mode: saved && saved.mode === "custom" ? "custom" : "months",
      months: defaultMonths(),
      startKey: null,
      endKey: null,
      start: 0,
      target: 0,
    };

    const customValid = state.mode === "custom"
      && saved.startKey && saved.endKey
      && saved.startKey < saved.endKey
      && endOfDay(saved.endKey) > Date.now();

    if (customValid) {
      state.startKey = saved.startKey;
      state.endKey = saved.endKey;
      state.start = startOfDay(state.startKey);
      state.target = endOfDay(state.endKey);
    } else if (saved && saved.target && saved.target > Date.now()) {
      state.mode = "months";
      state.months = saved.months || state.months;
      state.start = saved.start || Date.now();
      state.target = saved.target;
    } else {
      state.start = Date.now();
      state.target = monthsFromNow(state.months).getTime();
    }
    return state;
  }

  let state = loadState();

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        title: state.title,
        theme: state.theme,
        mode: state.mode,
        months: state.months,
        startKey: state.startKey,
        endKey: state.endKey,
        start: state.start,
        target: state.target,
      }));
    } catch (_) { /* storage unavailable (private mode) → in-memory only */ }
  }

  /* Theme */
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#181715" : "#faf9f5");
    persist();
  }
  els.themeToggle.addEventListener("click", () =>
    applyTheme(state.theme === "dark" ? "light" : "dark"));

  /* Fullscreen */
  function syncFullscreen() {
    document.documentElement.classList.toggle("is-fullscreen", !!document.fullscreenElement);
  }
  els.fullscreenToggle.addEventListener("click", async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      try {
        await document.documentElement.requestFullscreen();
      } catch (_) {
        // API unsupported (e.g. sandboxed iframe): CSS-only fallback toggle.
        document.documentElement.classList.toggle("is-fullscreen");
      }
    }
    syncFullscreen();
  });
  document.addEventListener("fullscreenchange", syncFullscreen);

  /* Title */
  function applyTitle(t) {
    state.title = t || DEFAULT_TITLE;
    els.title.textContent = state.title;
    persist();
  }
  els.titleInput.value = state.title;
  els.titleInput.addEventListener("input", () => applyTitle(els.titleInput.value.trim()));

  /* Cross-tab sync: adopt changes written by other open tabs */
  window.addEventListener("storage", (e) => {
    if (e.key && e.key !== LS_KEY) return; // null key = storage cleared
    state = loadState();
    document.documentElement.dataset.theme = state.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", state.theme === "dark" ? "#181715" : "#faf9f5");
    els.titleInput.value = state.title;
    syncUI();
    tick();
  });

  /* Duration: month pills */
  function setMonths(n) {
    state.mode = "months";
    state.months = n;
    state.start = Date.now();
    state.target = monthsFromNow(n).getTime();
    persist();
    syncUI();
    tick();
  }
  els.monthsPills.forEach((p) => p.addEventListener("click", () => setMonths(+p.dataset.months)));

  /* Duration: custom range */
  function applyCustom() {
    state.mode = "custom";
    state.start = startOfDay(state.startKey);
    state.target = endOfDay(state.endKey);
    persist();
    syncUI();
    tick();
  }

  function ensureCustomKeys() {
    if (!state.startKey || !state.endKey) {
      state.startKey = todayKey();
      state.endKey = fmtKey(monthsFromNow(defaultMonths()));
    }
  }

  els.customPill.addEventListener("click", () => {
    ensureCustomKeys();
    applyCustom();
  });

  els.startDate.addEventListener("change", () => {
    ensureCustomKeys();
    const v = els.startDate.value;
    if (!v) return;
    if (v >= state.endKey) state.endKey = addDaysKey(v, 1); // keep range valid
    state.startKey = v;
    applyCustom();
  });

  els.endDate.addEventListener("change", () => {
    ensureCustomKeys();
    const v = els.endDate.value;
    if (!v) return;
    if (v <= state.startKey) state.startKey = addDaysKey(v, -1); // keep range valid
    state.endKey = v;
    applyCustom();
  });

  /* UI sync: pills, range panel, input bounds */
  function syncUI() {
    const custom = state.mode === "custom";
    els.monthsPills.forEach((p) =>
      p.setAttribute("aria-pressed", String(!custom && +p.dataset.months === state.months)));
    els.customPill.setAttribute("aria-pressed", String(custom));
    els.customRange.hidden = !custom;
    if (custom) {
      els.startDate.value = state.startKey;
      els.endDate.value = state.endKey;
      els.startDate.max = state.endKey;
      els.endDate.min = state.startKey;
    }
  }

  /* Countdown */
  const pad = (n) => String(n).padStart(2, "0");

  function tick() {
    const now = Date.now();
    const diff = Math.max(0, state.target - now);
    const total = Math.max(1, state.target - state.start);

    els.days.textContent = pad(Math.floor(diff / DAY_MS));
    els.hours.textContent = pad(Math.floor(diff / 3600000) % 24);
    els.minutes.textContent = pad(Math.floor(diff / 60000) % 60);
    els.seconds.textContent = pad(Math.floor(diff / 1000) % 60);
    // Elapsed share of the range; clamped for future starts.
    const pct = Math.min(100, Math.max(0, 100 * (1 - diff / total)));
    els.progressFill.style.width = `${pct.toFixed(3)}%`;

    const totalDays = Math.max(1, Math.round(total / DAY_MS));
    const dayNum = Math.min(totalDays, Math.max(1, Math.floor((now - state.start) / DAY_MS) + 1));
    const when = fmtDate.format(new Date(state.target));
    els.caption.textContent = diff > 0
      ? `Day ${dayNum} of ${totalDays} · ${when}`
      : "Time is up — set a fresh goal.";
  }

  /* Init */
  applyTheme(state.theme);
  applyTitle(state.title);
  ensureCustomKeys();
  syncUI();
  tick();
  setInterval(tick, 1000);
})();
