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
    settingsToggle: $("settingsToggle"),
    fullscreenToggle: $("fullscreenToggle"),
    startDate: $("startDate"),
    startTime: $("startTime"),
    endDate: $("endDate"),
    endTime: $("endTime"),
    savedList: $("savedList"),
    savedCount: $("savedCount"),
    savedEmpty: $("savedEmpty"),
    saveTimer: $("saveTimer"),
    saveHint: $("saveHint"),
  };

  const DEFAULT_TITLE = "Make this year count";
  const DAY_MS = 86400000;
  const MIN_GAP_MS = 60000; // smallest selectable range: one minute
  const DEFAULT_START_TIME = "00:00";
  const DEFAULT_END_TIME = "23:59";
  const MAX_PRESETS = 5;
  const fmtShort = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

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
      presets: saved && Array.isArray(saved.presets) ? saved.presets.slice(0, MAX_PRESETS) : [],
      settingsHidden: !!(saved && saved.settingsHidden),
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
        presets: state.presets,
        settingsHidden: state.settingsHidden,
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
  let fsFallback = false; // CSS-only mode when the API is unavailable

  function syncFullscreen() {
    const on = fsFallback || !!document.fullscreenElement;
    document.documentElement.classList.toggle("is-fullscreen", on);
    // Settings are force-hidden in fullscreen, so the toggle is inoperative there.
    els.settingsToggle.disabled = on;
  }
  els.fullscreenToggle.addEventListener("click", () => {
    if (document.fullscreenElement || fsFallback) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      fsFallback = false;
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        // API unavailable (e.g. sandboxed iframe): toggle the class instead.
        fsFallback = true;
        syncFullscreen();
      });
    }
    syncFullscreen();
    // Transitions settle asynchronously; re-sync in case the change event is delayed.
    setTimeout(syncFullscreen, 150);
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
    renderSaved();
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

  /* Saved timers — up to MAX_PRESETS named ranges */
  let hintTimer = null;

  function showHint(msg) {
    els.saveHint.textContent = msg;
    els.saveHint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintTimer = null;
      els.saveHint.hidden = true;
      renderSaved();
    }, 2500);
  }

  const rangeKey = (p) => [p.startKey, p.startTime, p.endKey, p.endTime].join("|");
  const currentKey = () => rangeKey(state);

  function saveCurrent() {
    if (state.presets.length >= MAX_PRESETS) return;
    if (state.presets.some((p) => rangeKey(p) === currentKey() && p.title === state.title)) {
      showHint("That timer is already saved.");
      return;
    }
    state.presets.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: state.title,
      startKey: state.startKey,
      startTime: state.startTime,
      endKey: state.endKey,
      endTime: state.endTime,
    });
    persist();
    renderSaved();
    showHint("Timer saved.");
  }

  function loadPreset(id) {
    const p = state.presets.find((x) => x.id === id);
    if (!p) return;
    state.title = p.title || DEFAULT_TITLE;
    els.titleInput.value = state.title;
    els.title.textContent = state.title;
    state.startKey = p.startKey;
    state.startTime = p.startTime;
    state.endKey = p.endKey;
    state.endTime = p.endTime;
    applyRange();
    renderSaved();
  }

  function deletePreset(id) {
    state.presets = state.presets.filter((p) => p.id !== id);
    persist();
    renderSaved();
  }

  function renderSaved() {
    els.savedList.textContent = "";
    state.presets.forEach((p) => {
      const li = document.createElement("li");
      li.className = "saved-item";
      const active = rangeKey(p) === currentKey() && p.title === state.title;
      if (active) li.classList.add("is-active");

      const load = document.createElement("button");
      load.type = "button";
      load.className = "saved-load";
      load.setAttribute("aria-label", `Load saved timer ${p.title}`);
      if (active) load.setAttribute("aria-current", "true");

      const title = document.createElement("span");
      title.className = "saved-title";
      title.textContent = p.title;

      const range = document.createElement("span");
      range.className = "saved-range";
      range.textContent = `${fmtShort.format(new Date(dateTimeMs(p.startKey, p.startTime)))} ${p.startTime}`
        + ` → ${fmtShort.format(new Date(dateTimeMs(p.endKey, p.endTime)))} ${p.endTime}`;

      load.append(title, range);
      load.addEventListener("click", () => loadPreset(p.id));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "saved-delete";
      del.setAttribute("aria-label", `Delete saved timer ${p.title}`);
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      del.addEventListener("click", () => deletePreset(p.id));

      li.append(load, del);
      els.savedList.append(li);
    });

    const full = state.presets.length >= MAX_PRESETS;
    els.savedCount.textContent = `${state.presets.length} / ${MAX_PRESETS}`;
    els.savedEmpty.hidden = state.presets.length > 0;
    els.saveTimer.disabled = full;
    if (full) {
      els.saveHint.textContent = `All ${MAX_PRESETS} slots are used — delete one to save another.`;
      els.saveHint.hidden = false;
    } else if (hintTimer === null) {
      els.saveHint.hidden = true;
    }
  }

  els.saveTimer.addEventListener("click", saveCurrent);

  /* Settings card visibility */
  function toggleSettings() {
    state.settingsHidden = !state.settingsHidden;
    persist();
    syncUI();
  }
  els.settingsToggle.addEventListener("click", toggleSettings);

  /* UI sync: input values and bounds */
  function syncUI() {
    els.startDate.value = state.startKey;
    els.startTime.value = state.startTime;
    els.endDate.value = state.endKey;
    els.endTime.value = state.endTime;
    els.startDate.max = state.endKey;
    els.endDate.min = state.startKey;
    document.documentElement.classList.toggle("settings-hidden", state.settingsHidden);
    els.settingsToggle.setAttribute("aria-expanded", String(!state.settingsHidden));
    els.settingsToggle.setAttribute("aria-label", state.settingsHidden ? "Show settings" : "Hide settings");
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
  syncFullscreen();
  renderSaved();
  tick();
  setInterval(tick, 1000);
})();
