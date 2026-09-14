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
    startDate: $("startDate"),
    startTime: $("startTime"),
    endDate: $("endDate"),
    endTime: $("endTime"),
  };

  const DEFAULT_TITLE = "Make this year count";
  const DAY_MS = 86400000;
  const MIN_GAP_MS = 60000; // smallest selectable range: one minute
  const DEFAULT_START_TIME = "00:00";
  const DEFAULT_END_TIME = "23:59";

  const fmtDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  /* Date/time helpers — local time, "YYYY-MM-DD" + "HH:MM" */
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const dateTimeMs = (key, time) =>
    new Date(`${key}T${time.length === 5 ? `${time}:00` : time}`).getTime();
  const todayKey = () => fmtKey(new Date());

  function monthsFromNow(n) {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d;
  }

  // Months remaining in the current year, clamped to 1–4 — default end date.
  function defaultEndKey() {
    const m = new Date().getMonth() + 1; // 1–12
    return fmtKey(monthsFromNow(Math.min(4, Math.max(1, 12 - m))));
  }

  function defaultRange() {
    return {
      startKey: todayKey(),
      startTime: DEFAULT_START_TIME,
      endKey: defaultEndKey(),
      endTime: DEFAULT_END_TIME,
    };
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
      ...defaultRange(),
      start: 0,
      target: 0,
    };

    if (saved && saved.startKey && saved.endKey) {
      // Saved range; times default for state written before time support existed.
      state.startKey = saved.startKey;
      state.startTime = saved.startTime || DEFAULT_START_TIME;
      state.endKey = saved.endKey;
      state.endTime = saved.endTime || DEFAULT_END_TIME;
    } else if (saved && saved.target && saved.target > Date.now()) {
      // Migrate pre-range saved state (months mode), preserving the exact instant.
      const s = new Date(saved.start || Date.now());
      const t = new Date(saved.target);
      state.startKey = fmtKey(s);
      state.startTime = fmtTime(s);
      state.endKey = fmtKey(t);
      state.endTime = fmtTime(t);
    }

    state.start = dateTimeMs(state.startKey, state.startTime);
    state.target = dateTimeMs(state.endKey, state.endTime);

    // Elapsed or inverted saved range → start fresh on the default range.
    if (state.target <= Date.now() || state.start >= state.target) {
      Object.assign(state, defaultRange());
      state.start = dateTimeMs(state.startKey, state.startTime);
      state.target = dateTimeMs(state.endKey, state.endTime);
    }
    return state;
  }

  let state = loadState();

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        title: state.title,
        theme: state.theme,
        startKey: state.startKey,
        startTime: state.startTime,
        endKey: state.endKey,
        endTime: state.endTime,
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

  /* Date + time range */
  function setBoundary(prefix, ms) {
    const d = new Date(ms);
    state[`${prefix}Key`] = fmtKey(d);
    state[`${prefix}Time`] = fmtTime(d);
  }

  function applyRange() {
    state.start = dateTimeMs(state.startKey, state.startTime);
    state.target = dateTimeMs(state.endKey, state.endTime);
    persist();
    syncUI();
    tick();
  }

  function onStartChange() {
    const d = els.startDate.value;
    const t = els.startTime.value;
    if (!d || !t) return;
    state.startKey = d;
    state.startTime = t;
    // Keep the range valid: nudge the end forward if it no longer follows the start.
    if (dateTimeMs(d, t) >= state.target) setBoundary("end", dateTimeMs(d, t) + MIN_GAP_MS);
    applyRange();
  }

  function onEndChange() {
    const d = els.endDate.value;
    const t = els.endTime.value;
    if (!d || !t) return;
    state.endKey = d;
    state.endTime = t;
    if (dateTimeMs(d, t) <= state.start) setBoundary("start", dateTimeMs(d, t) - MIN_GAP_MS);
    applyRange();
  }

  els.startDate.addEventListener("change", onStartChange);
  els.startTime.addEventListener("change", onStartChange);
  els.endDate.addEventListener("change", onEndChange);
  els.endTime.addEventListener("change", onEndChange);

  /* UI sync: input values and bounds */
  function syncUI() {
    els.startDate.value = state.startKey;
    els.startTime.value = state.startTime;
    els.endDate.value = state.endKey;
    els.endTime.value = state.endTime;
    els.startDate.max = state.endKey;
    els.endDate.min = state.startKey;
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
  syncUI();
  tick();
  setInterval(tick, 1000);
})();
