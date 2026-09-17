/**
 * iTask — ماتریس زمان و وظایف
 * Vanilla JS SPA with localStorage persistence
 */

(() => {
  "use strict";

  const STORAGE_KEY = "itask.v2";
  const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  const JALALI_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
  ];
  const DEFAULT_COLORS = ["#2dd4bf", "#38bdf8", "#818cf8", "#f472b6", "#fbbf24", "#4ade80", "#a78bfa", "#fb7185"];

  const VIEW_META = {
    matrix: { title: "ماتریس زمانی", subtitle: "ماه شمسی" },
    projects: { title: "مدیریت پروژه‌ها", subtitle: "نام، مشتری، سهم هدف و رنگ اختصاصی" },
    analytics: { title: "گزارش و تحلیل", subtitle: "مقایسه سهم واقعی با هدف و جدول نظرات" },
    backup: { title: "پشتیبان‌گیری و بازیابی", subtitle: "خروجی JSON و بازنشانی داده‌ها" },
  };

  // ---------- State ----------
  let state = loadState();
  let currentView = "matrix";
  let projectFilter = "all";

  // Drag selection
  let isDragging = false;
  let dragDay = null;
  let dragStartHour = null;
  let dragEndHour = null;
  let selectionMode = "create"; // create | edit
  let editingRange = null;

  // ---------- DOM ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    sidebar: $("#sidebar"),
    overlay: $("#sidebarOverlay"),
    menuBtn: $("#menuBtn"),
    jalaliMonthSelect: $("#jalaliMonthSelect"),
    jalaliYearSelect: $("#jalaliYearSelect"),
    prevMonthBtn: $("#prevMonthBtn"),
    nextMonthBtn: $("#nextMonthBtn"),
    btnTodayMonth: $("#btnTodayMonth"),
    savedMonthsList: $("#savedMonthsList"),
    viewTitle: $("#viewTitle"),
    viewSubtitle: $("#viewSubtitle"),
    matrixHead: $("#matrixHeadRow"),
    matrixBody: $("#matrixBody"),
    matrixScroll: $("#matrixScroll"),
    legend: $("#projectLegend"),
    projectsGrid: $("#projectsGrid"),
    kpiRow: $("#kpiRow"),
    progressList: $("#progressList"),
    commentsTable: $("#commentsTable tbody"),
    commentFilter: $("#commentProjectFilter"),
    exportProjectSelect: $("#exportProjectSelect"),
    taskModal: $("#taskModal"),
    projectModal: $("#projectModal"),
    startHour: $("#startHour"),
    endHour: $("#endHour"),
    durationBadge: $("#durationBadge"),
    taskDay: $("#taskDay"),
    taskProject: $("#taskProject"),
    taskComment: $("#taskComment"),
    taskDone: $("#taskDone"),
    btnDeleteRange: $("#btnDeleteRange"),
    toastHost: $("#toastHost"),
    statLogged: $("#statLogged"),
    statProjects: $("#statProjects"),
    projectPicker: $("#projectPicker"),
    projectPickerEmpty: $("#projectPickerEmpty"),
    projectSearch: $("#projectSearch"),
    taskSummaryDate: $("#taskSummaryDate"),
    taskSummaryRange: $("#taskSummaryRange"),
    timeTrack: $("#timeTrack"),
    hourPresets: $("#hourPresets"),
    taskModalSub: $("#taskModalSub"),
  };

  // ---------- Utils ----------
  function uid() {
    return crypto.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function toPersianDigits(n) {
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function formatHour(h) {
    return `${String(h).padStart(2, "0")}:00`;
  }

  function formatHourFa(h) {
    return toPersianDigits(formatHour(h));
  }

  // ---------- Jalali calendar ----------
  function div(a, b) {
    return Math.floor(a / b);
  }

  function gregorianToJalali(gy, gm, gd) {
    const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy;
    if (gy > 1600) {
      jy = 979;
      gy -= 1600;
    } else {
      jy = 0;
      gy -= 621;
    }
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days =
      365 * gy +
      div(gy2 + 3, 4) -
      div(gy2 + 99, 100) +
      div(gy2 + 399, 400) -
      80 +
      gd +
      gdm[gm - 1];
    jy += 33 * div(days, 12053);
    days %= 12053;
    jy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) {
      jy += div(days - 1, 365);
      days = (days - 1) % 365;
    }
    const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return { jy, jm, jd };
  }

  function jalaliToGregorian(jy, jm, jd) {
    let gy;
    if (jy > 979) {
      gy = 1600;
      jy -= 979;
    } else {
      gy = 621;
    }
    const days =
      365 * jy +
      div(jy, 33) * 8 +
      div((jy % 33) + 3, 4) +
      78 +
      jd +
      (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    gy += 400 * div(days, 146097);
    let d = days % 146097;
    if (d > 36524) {
      gy += 100 * div(--d, 36524);
      d %= 36524;
      if (d >= 365) d++;
    }
    gy += 4 * div(d, 1461);
    d %= 1461;
    if (d > 365) {
      gy += div(d - 1, 365);
      d = (d - 1) % 365;
    }
    let gd = d + 1;
    const sal_a = [
      0,
      31,
      (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    let gm = 0;
    while (gm < 13 && gd > sal_a[gm]) {
      gd -= sal_a[gm];
      gm++;
    }
    return { gy, gm, gd };
  }

  function isJalaliLeap(jy) {
    const breaks = [
      -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
    ];
    const bl = breaks.length;
    let jp = breaks[0];
    let jump = 0;
    for (let i = 1; i < bl; i++) {
      const jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      jp = jm;
    }
    let n = jy - jp;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = (((n + 1) % 33) - 1) % 4;
    if (leap === -1) leap = 4;
    return leap === 0;
  }

  function jalaliDaysInMonth(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isJalaliLeap(jy) ? 30 : 29;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toMonthKey(jy, jm) {
    return `${jy}-${pad2(jm)}`;
  }

  function parseMonthKey(key) {
    const [y, m] = String(key).split("-").map(Number);
    return { jy: y, jm: m };
  }

  function todayJalali() {
    const now = new Date();
    return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function currentJalaliMonthKey() {
    const t = todayJalali();
    return toMonthKey(t.jy, t.jm);
  }

  function formatJalaliMonthLabel(key, withDigits = true) {
    const { jy, jm } = parseMonthKey(key);
    const name = JALALI_MONTHS[jm - 1] || "—";
    const year = withDigits ? toPersianDigits(jy) : String(jy);
    return `${name} ${year}`;
  }

  function shiftJalaliMonth(key, delta) {
    let { jy, jm } = parseMonthKey(key);
    jm += delta;
    while (jm > 12) {
      jm -= 12;
      jy++;
    }
    while (jm < 1) {
      jm += 12;
      jy--;
    }
    return toMonthKey(jy, jm);
  }

  function isGregorianMonthKey(key) {
    const y = Number(String(key).split("-")[0]);
    return Number.isFinite(y) && y >= 1700;
  }

  function gregorianMonthKeyToJalali(key) {
    const [gy, gm] = key.split("-").map(Number);
    // Map mid-month to avoid edge ambiguity
    const j = gregorianToJalali(gy, gm, 15);
    return toMonthKey(j.jy, j.jm);
  }

  function monthKey(ym) {
    return ym || state.settings.month;
  }

  function daysInMonth(ym) {
    const { jy, jm } = parseMonthKey(ym);
    return jalaliDaysInMonth(jy, jm);
  }

  function weekdayName(ym, day) {
    const { jy, jm } = parseMonthKey(ym);
    const g = jalaliToGregorian(jy, jm, day);
    const d = new Date(g.gy, g.gm - 1, g.gd);
    return WEEKDAYS[d.getDay()];
  }

  function hourRange() {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  function cellKey(day, hour) {
    return `${day}-${hour}`;
  }

  function getMonthCells() {
    const key = monthKey();
    if (!state.months[key]) state.months[key] = {};
    return state.months[key];
  }

  function ensureMonthBucket(key) {
    if (!state.months[key]) state.months[key] = {};
  }

  function setActiveMonth(key, { toastMsg = true } = {}) {
    ensureMonthBucket(key);
    state.settings.month = key;
    saveState();
    syncJalaliSelectors();
    renderSavedMonths();
    if (currentView === "matrix") renderMatrix();
    if (currentView === "analytics") renderAnalytics();
    if (currentView === "projects") renderProjects();
    updateViewSubtitle();
    if (toastMsg) toast(`نمایش ${formatJalaliMonthLabel(key)}`);
  }

  function updateViewSubtitle() {
    if (currentView === "matrix") {
      els.viewSubtitle.textContent = formatJalaliMonthLabel(monthKey());
    }
  }

  function toast(message, type = "success") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    els.toastHost.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .25s";
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Persistence ----------
  function defaultState() {
    const month = currentJalaliMonthKey();
    return {
      settings: { month, hourMode: "full", calendar: "jalali" },
      projects: [
        { id: uid(), name: "پروژه نمونه", client: "داخلی", share: 40, color: "#2dd4bf", status: "active" },
        { id: uid(), name: "جلسات و هماهنگی", client: "تیم", share: 20, color: "#38bdf8", status: "active" },
        { id: uid(), name: "یادگیری", client: "شخصی", share: 15, color: "#818cf8", status: "active" },
      ],
      months: { [month]: {} },
    };
  }

  function migrateState(parsed) {
    const next = {
      settings: { ...parsed.settings, hourMode: "full", calendar: "jalali" },
      projects: parsed.projects || [],
      months: {},
    };

    const oldMonths = parsed.months || {};
    Object.entries(oldMonths).forEach(([key, cells]) => {
      const jKey = isGregorianMonthKey(key) ? gregorianMonthKeyToJalali(key) : key;
      if (!next.months[jKey]) next.months[jKey] = {};
      // Merge if collision (rare)
      Object.assign(next.months[jKey], cells || {});
    });

    let month = parsed.settings?.month;
    if (!month || isGregorianMonthKey(month)) {
      month = month && isGregorianMonthKey(month) ? gregorianMonthKeyToJalali(month) : currentJalaliMonthKey();
    }
    if (!next.months[month]) next.months[month] = {};
    next.settings.month = month;
    return next;
  }

  function loadState() {
    try {
      // Prefer v2, fall back to v1 then migrate
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("itask.v1");
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.settings || !parsed.projects || !parsed.months) return defaultState();
      const migrated = migrateState(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSidebarStats();
    renderSavedMonths();
  }

  // ---------- Navigation / Layout ----------
  function setView(view) {
    currentView = view;
    $$(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
    const meta = VIEW_META[view];
    els.viewTitle.textContent = meta.title;
    els.viewSubtitle.textContent = meta.subtitle;
    closeSidebar();
    if (view === "matrix") {
      renderMatrix();
      updateViewSubtitle();
    }
    if (view === "projects") renderProjects();
    if (view === "analytics") renderAnalytics();
  }

  function openSidebar() {
    els.sidebar.classList.add("open");
    els.overlay.hidden = false;
  }

  function closeSidebar() {
    els.sidebar.classList.remove("open");
    els.overlay.hidden = true;
  }

  // ---------- Matrix ----------
  function renderMatrix() {
    const hours = hourRange();
    const ym = monthKey();
    const days = daysInMonth(ym);
    const cells = getMonthCells();
    const projectMap = Object.fromEntries(state.projects.map((p) => [p.id, p]));

    // Header
    els.matrixHead.innerHTML = "";
    const corner = document.createElement("th");
    corner.className = "corner";
    const { jm } = parseMonthKey(ym);
    corner.textContent = JALALI_MONTHS[jm - 1] || "روز";
    corner.title = formatJalaliMonthLabel(ym);
    els.matrixHead.appendChild(corner);

    hours.forEach((h) => {
      const th = document.createElement("th");
      th.className = "hour-head";
      if (h < 8 || h > 19) th.classList.add("is-night");
      else th.classList.add("is-work");
      th.textContent = formatHourFa(h);
      th.title = formatHour(h);
      els.matrixHead.appendChild(th);
    });

    // Body
    els.matrixBody.innerHTML = "";
    for (let day = 1; day <= days; day++) {
      const tr = document.createElement("tr");
      const label = document.createElement("th");
      label.className = "day-label";
      const wd = weekdayName(ym, day);
      if (wd === "جمعه" || wd === "شنبه") label.classList.add("is-weekend");
      label.innerHTML = `<span>${toPersianDigits(day)}</span><span class="weekday">${wd}</span>`;
      tr.appendChild(label);

      hours.forEach((h) => {
        const td = document.createElement("td");
        td.className = "cell";
        if (h < 8 || h > 19) td.classList.add("is-night");
        td.dataset.day = String(day);
        td.dataset.hour = String(h);
        const data = cells[cellKey(day, h)];
        if (data?.projectId) {
          const proj = projectMap[data.projectId];
          td.classList.add("filled");
          if (data.done) td.classList.add("done");
          if (proj) {
            td.style.setProperty("--cell-color", proj.color);
            td.style.background = hexToRgba(proj.color, 0.28);
          }
          td.title = [
            proj ? proj.name : "پروژه حذف‌شده",
            data.comment || "",
            data.done ? "✓ انجام‌شده" : "",
          ]
            .filter(Boolean)
            .join(" — ");
        }
        tr.appendChild(td);
      });
      els.matrixBody.appendChild(tr);
    }

    renderLegend();
    bindMatrixEvents();
  }

  function renderLegend() {
    const active = state.projects.filter((p) => p.status === "active");
    els.legend.innerHTML = active
      .map(
        (p) => `
      <span class="legend-item">
        <span class="legend-swatch" style="background:${p.color}"></span>
        ${escapeHtml(p.name)}
      </span>`
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(99,102,241,${alpha})`;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function clearSelecting() {
    $$(".matrix .cell.selecting").forEach((c) => c.classList.remove("selecting"));
  }

  function paintSelection(day, h1, h2) {
    clearSelecting();
    const lo = Math.min(h1, h2);
    const hi = Math.max(h1, h2);
    for (let h = lo; h <= hi; h++) {
      const cell = $(`.matrix .cell[data-day="${day}"][data-hour="${h}"]`);
      if (cell) cell.classList.add("selecting");
    }
  }

  function bindMatrixEvents() {
    const table = $("#matrixTable");

    table.onmousedown = (e) => {
      const cell = e.target.closest(".cell");
      if (!cell || e.button !== 0) return;
      e.preventDefault();
      isDragging = true;
      dragDay = Number(cell.dataset.day);
      dragStartHour = Number(cell.dataset.hour);
      dragEndHour = dragStartHour;
      selectionMode = cell.classList.contains("filled") ? "edit" : "create";
      paintSelection(dragDay, dragStartHour, dragEndHour);
    };

    table.onmouseover = (e) => {
      if (!isDragging) return;
      const cell = e.target.closest(".cell");
      if (!cell) return;
      const day = Number(cell.dataset.day);
      if (day !== dragDay) return; // only same day
      dragEndHour = Number(cell.dataset.hour);
      paintSelection(dragDay, dragStartHour, dragEndHour);
    };

    // Touch support (basic)
    table.ontouchstart = (e) => {
      const cell = e.target.closest(".cell");
      if (!cell) return;
      isDragging = true;
      dragDay = Number(cell.dataset.day);
      dragStartHour = Number(cell.dataset.hour);
      dragEndHour = dragStartHour;
      selectionMode = cell.classList.contains("filled") ? "edit" : "create";
      paintSelection(dragDay, dragStartHour, dragEndHour);
    };

    table.ontouchmove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el?.closest?.(".cell");
      if (!cell) return;
      const day = Number(cell.dataset.day);
      if (day !== dragDay) return;
      e.preventDefault();
      dragEndHour = Number(cell.dataset.hour);
      paintSelection(dragDay, dragStartHour, dragEndHour);
    };
  }

  function finishDrag() {
    if (!isDragging) return;
    isDragging = false;
    const lo = Math.min(dragStartHour, dragEndHour);
    const hi = Math.max(dragStartHour, dragEndHour);
    openTaskModal({
      day: dragDay,
      start: lo,
      end: hi,
      mode: selectionMode,
    });
  }

  document.addEventListener("mouseup", finishDrag);
  document.addEventListener("touchend", finishDrag);

  // ---------- Task Modal ----------
  function fillHourSelects(selectEl, selected) {
    const hours = hourRange();
    selectEl.innerHTML = hours
      .map((h) => `<option value="${h}" ${h === selected ? "selected" : ""}>${formatHourFa(h)}</option>`)
      .join("");
  }

  function getSelectedHours() {
    let s = Number(els.startHour.value);
    let e = Number(els.endHour.value);
    if (s > e) [s, e] = [e, s];
    return { start: s, end: e, hours: e - s + 1 };
  }

  function renderTimeTrack() {
    if (!els.timeTrack) return;
    const { start, end } = getSelectedHours();
    els.timeTrack.innerHTML = hourRange()
      .map((h) => `<span class="time-track-seg ${h >= start && h <= end ? "active" : ""}" title="${formatHour(h)}"></span>`)
      .join("");
  }

  function updateDurationBadge() {
    const { start, end, hours } = getSelectedHours();
    els.durationBadge.textContent = `${toPersianDigits(hours)} ساعت`;
    if (els.taskSummaryRange) {
      els.taskSummaryRange.textContent = `${formatHourFa(start)} – ${formatHourFa(end)}`;
    }
    renderTimeTrack();

    // highlight matching preset
    $$(".preset-chip", els.hourPresets || document).forEach((chip) => {
      chip.classList.toggle("active", Number(chip.dataset.span) === hours);
    });
  }

  function updateTaskSummaryDate(day) {
    const ym = monthKey();
    const { jm } = parseMonthKey(ym);
    const wd = weekdayName(ym, day);
    els.taskSummaryDate.textContent = `${wd} ${toPersianDigits(day)} ${JALALI_MONTHS[jm - 1]}`;
  }

  function renderProjectPicker(selectedId, query = "") {
    const q = query.trim().toLowerCase();
    const projects = state.projects.filter((p) => {
      if (p.status !== "active" && p.id !== selectedId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.client || "").toLowerCase().includes(q)
      );
    });

    if (!projects.length) {
      els.projectPicker.innerHTML = "";
      els.projectPickerEmpty.hidden = false;
      els.projectPickerEmpty.textContent = q
        ? "پروژه‌ای با این جستجو پیدا نشد."
        : "پروژه فعالی نیست. از منوی پروژه‌ها یکی بسازید.";
      return;
    }

    els.projectPickerEmpty.hidden = true;
    els.projectPicker.innerHTML = projects
      .map((p) => {
        const selected = p.id === selectedId;
        return `
        <button type="button" class="project-pick ${selected ? "selected" : ""}" data-project-id="${p.id}" style="--pick-color:${p.color}">
          <span class="project-pick-swatch" style="background:${p.color};color:${p.color}"></span>
          <span class="project-pick-meta">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${p.client ? escapeHtml(p.client) : "بدون مشتری"} · سهم ${toPersianDigits(p.share)}٪</span>
          </span>
          <span class="project-pick-check" aria-hidden="true"></span>
        </button>`;
      })
      .join("");
  }

  function selectProject(projectId) {
    els.taskProject.value = projectId || "";
    const q = els.projectSearch?.value || "";
    renderProjectPicker(projectId, q);
    const proj = state.projects.find((p) => p.id === projectId);
    if (els.taskModalSub) {
      els.taskModalSub.textContent = proj
        ? `پروژه: ${proj.name}${proj.client ? ` · ${proj.client}` : ""}`
        : "یک پروژه برای این بازه انتخاب کنید";
    }
  }

  function findContiguousRange(day, hour) {
    const cells = getMonthCells();
    const data = cells[cellKey(day, hour)];
    if (!data?.projectId) return { start: hour, end: hour, data: null };

    let start = hour;
    let end = hour;
    while (start > 0) {
      const prev = cells[cellKey(day, start - 1)];
      if (
        prev &&
        prev.projectId === data.projectId &&
        prev.comment === data.comment &&
        !!prev.done === !!data.done
      ) {
        start--;
      } else break;
    }
    while (end < 23) {
      const next = cells[cellKey(day, end + 1)];
      if (
        next &&
        next.projectId === data.projectId &&
        next.comment === data.comment &&
        !!next.done === !!data.done
      ) {
        end++;
      } else break;
    }
    return { start, end, data };
  }

  function openTaskModal({ day, start, end, mode }) {
    let seed = null;
    editingRange = { day, start, end };

    if (mode === "edit") {
      const range = findContiguousRange(day, start);
      editingRange = { day, start: range.start, end: range.end };
      start = range.start;
      end = range.end;
      seed = range.data;
      els.btnDeleteRange.hidden = false;
      $("#taskModalTitle").textContent = "ویرایش بازه زمانی";
    } else {
      const cells = getMonthCells();
      for (let h = start; h <= end; h++) {
        if (cells[cellKey(day, h)]) {
          seed = cells[cellKey(day, h)];
          break;
        }
      }
      els.btnDeleteRange.hidden = !seed;
      $("#taskModalTitle").textContent = "ثبت بازه زمانی";
    }

    els.taskDay.value = day;
    if (els.projectSearch) els.projectSearch.value = "";
    fillHourSelects(els.startHour, start);
    fillHourSelects(els.endHour, end);
    updateTaskSummaryDate(day);
    selectProject(seed?.projectId || state.projects.find((p) => p.status === "active")?.id || "");
    els.taskComment.value = seed?.comment || "";
    els.taskDone.checked = !!seed?.done;
    updateDurationBadge();
    els.taskModal.showModal();
  }

  function closeTaskModal() {
    els.taskModal.close();
    clearSelecting();
    editingRange = null;
  }

  function saveTaskRange(e) {
    e.preventDefault();
    const day = Number(els.taskDay.value);
    let start = Number(els.startHour.value);
    let end = Number(els.endHour.value);
    if (start > end) [start, end] = [end, start];

    const projectId = els.taskProject.value;
    if (!projectId) {
      toast("لطفاً یک پروژه انتخاب کنید", "error");
      return;
    }

    // Clear old contiguous block if editing different hours
    if (editingRange) {
      const cells = getMonthCells();
      for (let h = editingRange.start; h <= editingRange.end; h++) {
        // Only clear if still part of previous edit target hours that fall outside new range
        // Actually: clear entire previous range first when hours changed, then write new
      }
      // Simpler: clear previous editing range, then write new range
      for (let h = editingRange.start; h <= editingRange.end; h++) {
        delete cells[cellKey(day, h)];
      }
    }

    const cells = getMonthCells();
    const payload = {
      projectId,
      comment: els.taskComment.value.trim(),
      done: els.taskDone.checked,
    };

    for (let h = start; h <= end; h++) {
      cells[cellKey(day, h)] = { ...payload };
    }

    saveState();
    closeTaskModal();
    renderMatrix();
    toast("بازه زمانی ذخیره شد");
  }

  function deleteTaskRange() {
    if (!editingRange) return;
    if (!confirm("کل بازه انتخاب‌شده حذف شود؟")) return;
    const cells = getMonthCells();
    const { day, start, end } = editingRange;
    // Also respect current modal hour selectors if changed
    let s = Number(els.startHour.value);
    let e = Number(els.endHour.value);
    if (s > e) [s, e] = [e, s];
    // Delete union of original and current to be safe — prefer current selectors
    for (let h = Math.min(start, s); h <= Math.max(end, e); h++) {
      // Only delete hours that are in either original contiguous or selected
    }
    for (let h = start; h <= end; h++) delete cells[cellKey(day, h)];
    for (let h = s; h <= e; h++) delete cells[cellKey(day, h)];

    saveState();
    closeTaskModal();
    renderMatrix();
    toast("بازه حذف شد");
  }

  // ---------- Projects ----------
  function renderProjects() {
    let list = [...state.projects];
    if (projectFilter === "active") list = list.filter((p) => p.status === "active");
    if (projectFilter === "completed") list = list.filter((p) => p.status === "completed");

    if (!list.length) {
      els.projectsGrid.innerHTML = `<div class="empty-state">پروژه‌ای در این فیلتر نیست. یک پروژه جدید بسازید.</div>`;
      return;
    }

    const cells = getMonthCells();
    const hoursByProject = {};
    Object.values(cells).forEach((c) => {
      if (!c?.projectId) return;
      hoursByProject[c.projectId] = (hoursByProject[c.projectId] || 0) + 1;
    });

    els.projectsGrid.innerHTML = list
      .map((p) => {
        const hours = hoursByProject[p.id] || 0;
        return `
        <article class="project-card" style="--p-color:${p.color}">
          <div class="project-card-head">
            <div>
              <h3>${escapeHtml(p.name)}</h3>
              ${p.client ? `<span class="project-client">${escapeHtml(p.client)}</span>` : ""}
            </div>
            <span class="badge ${p.status === "active" ? "badge-active" : "badge-completed"}">
              ${p.status === "active" ? "فعال" : "تکمیل‌شده"}
            </span>
          </div>
          <div class="project-meta">
            <span>سهم هدف: ${toPersianDigits(p.share)}٪</span>
            <span>ساعات ماه: ${toPersianDigits(hours)}</span>
          </div>
          <div class="project-actions">
            <button type="button" class="btn btn-secondary" data-edit-project="${p.id}">ویرایش</button>
            <button type="button" class="btn btn-ghost" data-toggle-project="${p.id}">
              ${p.status === "active" ? "علامت تکمیل" : "بازگشت به فعال"}
            </button>
          </div>
        </article>`;
      })
      .join("");
  }

  function openProjectModal(project = null) {
    $("#projectModalTitle").textContent = project ? "ویرایش پروژه" : "پروژه جدید";
    $("#projectId").value = project?.id || "";
    $("#projectName").value = project?.name || "";
    $("#projectClient").value = project?.client || "";
    $("#projectShare").value = project?.share ?? 10;
    $("#projectColor").value = project?.color || DEFAULT_COLORS[state.projects.length % DEFAULT_COLORS.length];
    $("#projectStatus").value = project?.status || "active";
    $("#btnDeleteProject").hidden = !project;
    els.projectModal.showModal();
  }

  function saveProject(e) {
    e.preventDefault();
    const id = $("#projectId").value;
    const payload = {
      name: $("#projectName").value.trim(),
      client: $("#projectClient").value.trim(),
      share: Math.max(0, Math.min(100, Number($("#projectShare").value) || 0)),
      color: $("#projectColor").value,
      status: $("#projectStatus").value,
    };
    if (!payload.name) {
      toast("نام پروژه الزامی است", "error");
      return;
    }

    if (id) {
      const idx = state.projects.findIndex((p) => p.id === id);
      if (idx >= 0) state.projects[idx] = { ...state.projects[idx], ...payload };
    } else {
      state.projects.push({ id: uid(), ...payload });
    }

    saveState();
    els.projectModal.close();
    renderProjects();
    if (currentView === "matrix") renderMatrix();
    toast("پروژه ذخیره شد");
  }

  function deleteProject() {
    const id = $("#projectId").value;
    if (!id) return;
    if (!confirm("این پروژه حذف شود؟ ساعات مرتبط خالی می‌مانند.")) return;
    state.projects = state.projects.filter((p) => p.id !== id);
    // orphan cells keep projectId but render as missing — clear them
    Object.values(state.months).forEach((month) => {
      Object.keys(month).forEach((k) => {
        if (month[k]?.projectId === id) delete month[k];
      });
    });
    saveState();
    els.projectModal.close();
    renderProjects();
    toast("پروژه حذف شد");
  }

  // ---------- Analytics ----------
  function computeStats() {
    const cells = getMonthCells();
    const entries = Object.entries(cells);
    const totalLogged = entries.length;
    const doneCount = entries.filter(([, c]) => c.done).length;
    const byProject = {};

    entries.forEach(([, c]) => {
      if (!c?.projectId) return;
      byProject[c.projectId] = (byProject[c.projectId] || 0) + 1;
    });

    const activeProjects = state.projects.filter((p) => p.status === "active").length;
    const totalShare = state.projects.reduce((s, p) => s + (Number(p.share) || 0), 0);

    return { totalLogged, doneCount, byProject, activeProjects, totalShare, entries };
  }

  function renderAnalytics() {
    const { totalLogged, doneCount, byProject, activeProjects, totalShare, entries } = computeStats();
    const donePct = totalLogged ? Math.round((doneCount / totalLogged) * 100) : 0;

    els.kpiRow.innerHTML = `
      <div class="kpi-card"><span>ساعات ثبت‌شده</span><strong>${toPersianDigits(totalLogged)}</strong><em>در ماه جاری</em></div>
      <div class="kpi-card"><span>انجام‌شده</span><strong>${toPersianDigits(donePct)}٪</strong><em>${toPersianDigits(doneCount)} از ${toPersianDigits(totalLogged)} ساعت</em></div>
      <div class="kpi-card"><span>پروژه فعال</span><strong>${toPersianDigits(activeProjects)}</strong><em>از ${toPersianDigits(state.projects.length)} پروژه</em></div>
      <div class="kpi-card"><span>مجموع سهم هدف</span><strong>${toPersianDigits(totalShare)}٪</strong><em>${totalShare > 100 ? "بیش از ۱۰۰٪" : "مجموع وزن‌ها"}</em></div>
    `;

    // Progress bars: actual % of logged vs target share %
    const projects = [...state.projects];
    els.progressList.innerHTML = projects.length
      ? projects
          .map((p) => {
            const hours = byProject[p.id] || 0;
            const actualPct = totalLogged ? (hours / totalLogged) * 100 : 0;
            const target = Number(p.share) || 0;
            const width = Math.min(100, actualPct);
            return `
          <div class="progress-item">
            <div class="progress-top">
              <span>${escapeHtml(p.name)}</span>
              <span>${toPersianDigits(hours)} ساعت</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${width}%; --bar-color:${p.color}"></div>
              <div class="bar-target" style="inset-inline-start:${Math.min(100, target)}%"></div>
            </div>
            <div class="progress-caption">
              <span>واقعی: ${toPersianDigits(actualPct.toFixed(1))}٪</span>
              <span>هدف: ${toPersianDigits(target)}٪</span>
            </div>
          </div>`;
          })
          .join("")
      : `<div class="empty-state">پروژه‌ای تعریف نشده است.</div>`;

    // Filters
    const opts = state.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    const prevComment = els.commentFilter.value;
    const prevExport = els.exportProjectSelect.value;
    els.commentFilter.innerHTML = `<option value="">همه پروژه‌ها</option>${opts}`;
    els.exportProjectSelect.innerHTML = opts || `<option value="">—</option>`;
    if (prevComment) els.commentFilter.value = prevComment;
    if (prevExport) els.exportProjectSelect.value = prevExport;

    renderCommentsTable();
  }

  function renderCommentsTable() {
    const filter = els.commentFilter.value;
    const cells = getMonthCells();
    const projectMap = Object.fromEntries(state.projects.map((p) => [p.id, p]));
    const rows = [];

    Object.entries(cells).forEach(([key, c]) => {
      if (!c?.comment) return;
      if (filter && c.projectId !== filter) return;
      const [day, hour] = key.split("-").map(Number);
      const proj = projectMap[c.projectId];
      rows.push({ day, hour, proj, comment: c.comment, done: c.done });
    });

    rows.sort((a, b) => a.day - b.day || a.hour - b.hour);

    els.commentsTable.innerHTML = rows.length
      ? rows
          .map(
            (r) => `
        <tr>
          <td>${toPersianDigits(r.day)}</td>
          <td>${formatHourFa(r.hour)}</td>
          <td>${r.proj ? escapeHtml(r.proj.name) : "—"}</td>
          <td>${escapeHtml(r.comment)}</td>
          <td>${r.done ? "✓ Done" : "—"}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">نظری ثبت نشده است.</td></tr>`;
  }

  // ---------- Excel Export ----------
  function exportMonthExcel() {
    if (typeof XLSX === "undefined") {
      toast("کتابخانه اکسل بارگذاری نشد", "error");
      return;
    }
    const ym = monthKey();
    const hours = hourRange();
    const days = daysInMonth(ym);
    const cells = getMonthCells();
    const projectMap = Object.fromEntries(state.projects.map((p) => [p.id, p]));

    const aoa = [["روز", "ساعت", "پروژه", "مشتری", "نظر", "Done"]];
    for (let day = 1; day <= days; day++) {
      hours.forEach((h) => {
        const c = cells[cellKey(day, h)];
        if (!c) return;
        const p = projectMap[c.projectId];
        aoa.push([
          day,
          formatHour(h),
          p?.name || "",
          p?.client || "",
          c.comment || "",
          c.done ? "Yes" : "No",
        ]);
      });
    }

    // Summary sheet
    const { byProject, totalLogged } = computeStats();
    const summary = [["پروژه", "مشتری", "ساعات", "درصد واقعی", "سهم هدف %", "وضعیت"]];
    state.projects.forEach((p) => {
      const hrs = byProject[p.id] || 0;
      const pct = totalLogged ? ((hrs / totalLogged) * 100).toFixed(1) : "0";
      summary.push([p.name, p.client, hrs, pct, p.share, p.status]);
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Entries");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
    XLSX.writeFile(wb, `itask-${formatJalaliMonthLabel(ym, false).replace(/\s+/g, "-")}.xlsx`);
    toast(`فایل اکسل ${formatJalaliMonthLabel(ym)} دانلود شد`);
  }

  function exportProjectExcel() {
    if (typeof XLSX === "undefined") {
      toast("کتابخانه اکسل بارگذاری نشد", "error");
      return;
    }
    const projectId = els.exportProjectSelect.value;
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) {
      toast("پروژه‌ای انتخاب نشده", "error");
      return;
    }

    const ym = monthKey();
    const cells = getMonthCells();
    const aoa = [["روز", "ساعت", "نظر", "Done"]];
    Object.entries(cells).forEach(([key, c]) => {
      if (c?.projectId !== projectId) return;
      const [day, hour] = key.split("-").map(Number);
      aoa.push([day, formatHour(hour), c.comment || "", c.done ? "Yes" : "No"]);
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), project.name.slice(0, 28));
    XLSX.writeFile(wb, `itask-${project.name}-${ym}.xlsx`);
    toast(`خروجی اکسل «${project.name}» آماده شد`);
  }

  // ---------- Backup ----------
  function backupJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    downloadBlob(blob, `itask-backup-${formatJalaliMonthLabel(monthKey(), false).replace(/\s+/g, "-")}.json`);
    toast("فایل پشتیبان دانلود شد");
  }

  function restoreJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.settings || !data.projects || !data.months) throw new Error("invalid");
        if (!confirm("داده‌های فعلی با فایل پشتیبان جایگزین شوند؟")) return;
        state = migrateState(data);
        saveState();
        initUIFromState();
        setView(currentView);
        toast("بازیابی با موفقیت انجام شد");
      } catch {
        toast("فایل پشتیبان نامعتبر است", "error");
      }
    };
    reader.readAsText(file);
  }

  function updateSidebarStats() {
    const { totalLogged, activeProjects } = computeStats();
    els.statLogged.textContent = toPersianDigits(totalLogged);
    els.statProjects.textContent = toPersianDigits(activeProjects);
  }

  function buildJalaliYearOptions() {
    const today = todayJalali();
    const years = new Set();
    // Range around today + any years present in saved months
    for (let y = today.jy - 8; y <= today.jy + 3; y++) years.add(y);
    Object.keys(state.months).forEach((key) => {
      const { jy } = parseMonthKey(key);
      if (Number.isFinite(jy)) years.add(jy);
    });
    return [...years].sort((a, b) => b - a);
  }

  function syncJalaliSelectors() {
    const { jy, jm } = parseMonthKey(monthKey());
    const years = buildJalaliYearOptions();

    els.jalaliYearSelect.innerHTML = years
      .map((y) => `<option value="${y}" ${y === jy ? "selected" : ""}>${toPersianDigits(y)}</option>`)
      .join("");

    els.jalaliMonthSelect.innerHTML = JALALI_MONTHS.map(
      (name, i) =>
        `<option value="${i + 1}" ${i + 1 === jm ? "selected" : ""}>${name}</option>`
    ).join("");
  }

  function renderSavedMonths() {
    if (!els.savedMonthsList) return;
    const keys = Object.keys(state.months)
      .filter((k) => Object.keys(state.months[k] || {}).length > 0)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

    if (!keys.length) {
      els.savedMonthsList.innerHTML = `<span class="saved-months-empty">ماه‌های دارای ثبت اینجا ظاهر می‌شوند</span>`;
      return;
    }

    const active = monthKey();
    els.savedMonthsList.innerHTML = keys
      .map((key) => {
        const count = Object.keys(state.months[key]).length;
        return `<button type="button" class="saved-month-chip ${key === active ? "active" : ""}" data-month="${key}">
          ${formatJalaliMonthLabel(key)}
          <span class="count">(${toPersianDigits(count)})</span>
        </button>`;
      })
      .join("");
  }

  function initUIFromState() {
    ensureMonthBucket(state.settings.month);
    state.settings.hourMode = "full";
    state.settings.calendar = "jalali";
    syncJalaliSelectors();
    renderSavedMonths();
    updateSidebarStats();
  }

  // ---------- Events ----------
  function bindGlobalEvents() {
    $$(".nav-item").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

    els.menuBtn.addEventListener("click", openSidebar);
    els.overlay.addEventListener("click", closeSidebar);

    const onJalaliChange = () => {
      const jm = Number(els.jalaliMonthSelect.value);
      const jy = Number(els.jalaliYearSelect.value);
      setActiveMonth(toMonthKey(jy, jm));
    };
    els.jalaliMonthSelect.addEventListener("change", onJalaliChange);
    els.jalaliYearSelect.addEventListener("change", onJalaliChange);

    els.prevMonthBtn.addEventListener("click", () => {
      setActiveMonth(shiftJalaliMonth(monthKey(), -1));
    });
    els.nextMonthBtn.addEventListener("click", () => {
      setActiveMonth(shiftJalaliMonth(monthKey(), 1));
    });
    els.btnTodayMonth.addEventListener("click", () => {
      setActiveMonth(currentJalaliMonthKey());
    });

    els.savedMonthsList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-month]");
      if (!btn) return;
      setActiveMonth(btn.dataset.month);
    });

    // Task modal
    els.startHour.addEventListener("change", updateDurationBadge);
    els.endHour.addEventListener("change", updateDurationBadge);
    $("#taskForm").addEventListener("submit", saveTaskRange);
    $("#btnCancelTask").addEventListener("click", closeTaskModal);
    $("#taskModalClose").addEventListener("click", closeTaskModal);
    els.btnDeleteRange.addEventListener("click", deleteTaskRange);

    els.projectPicker.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-project-id]");
      if (!btn) return;
      selectProject(btn.dataset.projectId);
    });

    els.projectSearch?.addEventListener("input", () => {
      renderProjectPicker(els.taskProject.value, els.projectSearch.value);
    });

    els.hourPresets?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-span]");
      if (!chip) return;
      const span = Number(chip.dataset.span);
      const start = Number(els.startHour.value);
      const end = Math.min(23, start + span - 1);
      els.endHour.value = String(end);
      // if overflow, shift start back
      if (start + span - 1 > 23) {
        els.startHour.value = String(Math.max(0, 24 - span));
        els.endHour.value = "23";
      }
      updateDurationBadge();
    });

    // Projects
    $("#btnNewProject").addEventListener("click", () => openProjectModal());
    $("#projectForm").addEventListener("submit", saveProject);
    $("#btnCancelProject").addEventListener("click", () => els.projectModal.close());
    $("#projectModalClose").addEventListener("click", () => els.projectModal.close());
    $("#btnDeleteProject").addEventListener("click", deleteProject);

    els.projectsGrid.addEventListener("click", (e) => {
      const editId = e.target.closest("[data-edit-project]")?.dataset.editProject;
      const toggleId = e.target.closest("[data-toggle-project]")?.dataset.toggleProject;
      if (editId) {
        const p = state.projects.find((x) => x.id === editId);
        if (p) openProjectModal(p);
      }
      if (toggleId) {
        const p = state.projects.find((x) => x.id === toggleId);
        if (p) {
          p.status = p.status === "active" ? "completed" : "active";
          saveState();
          renderProjects();
          toast(p.status === "active" ? "پروژه فعال شد" : "پروژه تکمیل شد");
        }
      }
    });

    $$("#projectFilterTabs .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        projectFilter = chip.dataset.filter;
        $$("#projectFilterTabs .chip").forEach((c) => c.classList.toggle("active", c === chip));
        renderProjects();
      });
    });

    // Analytics
    els.commentFilter.addEventListener("change", renderCommentsTable);
    $("#btnExportMonth").addEventListener("click", exportMonthExcel);
    $("#btnExportProject").addEventListener("click", exportProjectExcel);

    // Backup
    $("#btnBackup").addEventListener("click", backupJson);
    $("#restoreFile").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) restoreJson(file);
      e.target.value = "";
    });
    $("#btnClearMonth").addEventListener("click", () => {
      if (!confirm(`ساعات «${formatJalaliMonthLabel(monthKey())}» پاک شوند؟ ماه‌های دیگر دست‌نخورده می‌مانند.`)) return;
      state.months[monthKey()] = {};
      saveState();
      if (currentView === "matrix") renderMatrix();
      if (currentView === "analytics") renderAnalytics();
      toast("ساعات این ماه پاک شد");
    });
    $("#btnResetAll").addEventListener("click", () => {
      if (!confirm("همه داده‌ها حذف و برنامه بازنشانی شود؟")) return;
      state = defaultState();
      saveState();
      initUIFromState();
      setView("matrix");
      toast("برنامه بازنشانی شد");
    });

    // Prevent text selection while dragging
    document.addEventListener("selectstart", (e) => {
      if (isDragging) e.preventDefault();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeSidebar();
    });
  }

  // ---------- Boot ----------
  function init() {
    bindGlobalEvents();
    initUIFromState();
    setView("matrix");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
