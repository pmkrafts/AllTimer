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
  };

  const DEFAULT_TITLE = "Make this year count";
  const DAY_MS = 86400000;

  const fmtDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

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
      months: defaultMonths(),
      start: 0,
      target: 0,
    };

    if (saved && saved.target && saved.target > Date.now()) {
      state.target = saved.target;
      state.start = saved.start || Date.now();
      state.months = saved.months || state.months;
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
        months: state.months,
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

  /* Duration */
  function setMonths(n) {
    state.months = n;
    state.start = Date.now();
    state.target = monthsFromNow(n).getTime();
    els.pills.forEach((p) => p.setAttribute("aria-pressed", String(+p.dataset.months === n)));
    persist();
    tick();
  }
  els.pills.forEach((p) => p.addEventListener("click", () => setMonths(+p.dataset.months)));

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
    els.progressFill.style.width = `${(100 * (1 - diff / total)).toFixed(3)}%`;

    const totalDays = Math.max(1, Math.round(total / DAY_MS));
    const dayNum = Math.min(totalDays, Math.floor((now - state.start) / DAY_MS) + 1);
    const when = fmtDate.format(new Date(state.target));
    els.caption.textContent = diff > 0
      ? `Day ${dayNum} of ${totalDays} · ${when}`
      : "Time is up — set a fresh goal.";
  }

  /* Init */
  applyTheme(state.theme);
  applyTitle(state.title);
  els.pills.forEach((p) => p.setAttribute("aria-pressed", String(+p.dataset.months === state.months)));
  tick();
  setInterval(tick, 1000);
})();
