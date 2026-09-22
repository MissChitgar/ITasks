/**
 * iTask — ماتریس زمان و وظایف
 * Executive SaaS build: per-project reports, Chart.js, Excel/PDF export
 * Vanilla JS SPA with localStorage persistence
 */

(() => {
  "use strict";

  const STORAGE_KEY = "itask.v2";
  const AUTHOR_NAME = "نگار چیتگر";
  const AUTHOR_NAME_EN = "Negar Chitgar";
  const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  const JALALI_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
  ];
  const DEFAULT_COLORS = ["#2dd4bf", "#38bdf8", "#818cf8", "#f472b6", "#fbbf24", "#4ade80", "#a78bfa", "#fb7185"];

  const VIEW_META = {
    matrix: { title: "ماتریس زمانی", subtitle: "هر پروژه ماتریس جداگانه دارد" },
    projects: { title: "مدیریت پروژه‌ها", subtitle: "نام، مشتری، سهم هدف و رنگ اختصاصی" },
    analytics: { title: "گزارش پروژه", subtitle: "ماتریس + جدول + نمودار — فقط یک پروژه" },
    backup: { title: "پشتیبان‌گیری و بازیابی", subtitle: "خروجی JSON و بازنشانی داده‌ها" },
  };

  // ---------- State ----------
  let state = loadState();
  let currentView = "matrix";
  let projectFilter = "all";
  let matrixProjectId = state.settings?.matrixProjectId || "";
  let reportProjectId = ""; // selected project for report hub (never mix projects)
  let projectChart = null;

  // Drag selection (multi-hour matrix)
  let isDragging = false;
  let dragDay = null;
  let dragStartHour = null;
  let dragEndHour = null;
  let selectionMode = "create"; // create | edit
  let editingRange = null;
  let taskModalContext = { projectId: "", fromReport: false };

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
    matrixProjectSelect: $("#matrixProjectSelect"),
    matrixEmptyProject: $("#matrixEmptyProject"),
    matrixWrap: $("#matrixWrap"),
    reportMatrixWrap: $("#reportMatrixWrap"),
    projectsGrid: $("#projectsGrid"),
    kpiRow: $("#kpiRow"),
    reportProjectSelect: $("#reportProjectSelect"),
    reportEmpty: $("#reportEmpty"),
    reportHub: $("#reportHub"),
    reportDetailBody: $("#reportDetailBody"),
    reportDetailFoot: $("#reportDetailFoot"),
    chartSubtitle: $("#chartSubtitle"),
    projectChartCanvas: $("#projectChart"),
    chartPrintImage: $("#chartPrintImage"),
    printDocMeta: $("#printDocMeta"),
    printTimestamp: $("#printTimestamp"),
    taskModal: $("#taskModal"),
    projectModal: $("#projectModal"),
    startHour: $("#startHour"),
    endHour: $("#endHour"),
    durationBadge: $("#durationBadge"),
    taskDay: $("#taskDay"),
    taskProject: $("#taskProject"),
    taskTopic: $("#taskTopic"),
    taskComment: $("#taskComment"),
    taskDone: $("#taskDone"),
    taskExcludeHours: $("#taskExcludeHours"),
    taskDuration: $("#taskDuration"),
    taskLockedProject: $("#taskLockedProject"),
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hexToRgba(hex, alpha) {
    const h = String(hex || "").replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(99,102,241,${alpha})`;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
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

  function sameCellMeta(a, b) {
    if (!a || !b) return false;
    return (
      a.projectId === b.projectId &&
      (a.topic || "") === (b.topic || "") &&
      (a.comment || "") === (b.comment || "") &&
      !!a.done === !!b.done &&
      !!a.excludeHours === !!b.excludeHours &&
      Number(a.duration || 0) === Number(b.duration || 0)
    );
  }

  function formatDurationFa(hours) {
    const n = Number(hours) || 0;
    const text = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
    return `${toPersianDigits(text)} ساعت`;
  }

  function roundHalf(n) {
    return Math.round(n * 2) / 2;
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
      0, 31,
      (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
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
      const proj = getMatrixProject();
      const month = formatJalaliMonthLabel(monthKey());
      els.viewSubtitle.textContent = proj ? `${proj.name} · ${month}` : `ابتدا پروژه را انتخاب کنید · ${month}`;
    } else if (currentView === "analytics") {
      const proj = state.projects.find((p) => p.id === reportProjectId);
      els.viewSubtitle.textContent = proj
        ? `${proj.name} · ${formatJalaliMonthLabel(monthKey())}`
        : "یک پروژه را برای گزارش انتخاب کنید";
    }
  }

  function getMatrixProject() {
    return state.projects.find((p) => p.id === matrixProjectId) || null;
  }

  function syncMatrixProjectSelect() {
    if (!els.matrixProjectSelect) return;
    const opts = state.projects
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}${p.client ? ` — ${escapeHtml(p.client)}` : ""}</option>`)
      .join("");
    els.matrixProjectSelect.innerHTML = `<option value="">— ابتدا پروژه را انتخاب کنید —</option>${opts}`;
    if (matrixProjectId && state.projects.some((p) => p.id === matrixProjectId)) {
      els.matrixProjectSelect.value = matrixProjectId;
    } else {
      matrixProjectId = "";
      els.matrixProjectSelect.value = "";
    }
  }

  function setMatrixProject(id, { persist = true } = {}) {
    matrixProjectId = id || "";
    if (persist) {
      state.settings.matrixProjectId = matrixProjectId;
      saveState();
    }
    syncMatrixProjectSelect();
    if (currentView === "matrix") renderMatrix();
    updateViewSubtitle();
  }

  function projectReportTitle(project) {
    const name = (project?.name || "بدون‌نام").trim();
    return `پروژه ${name}`;
  }

  function formatDurationNumber(hours) {
    const n = Number(hours) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  }

  // ---------- Persistence ----------
  function defaultState() {
    const month = currentJalaliMonthKey();
    return {
      settings: { month, hourMode: "full", calendar: "jalali", matrixProjectId: "" },
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
      settings: {
        ...parsed.settings,
        hourMode: "full",
        calendar: "jalali",
        matrixProjectId: parsed.settings?.matrixProjectId || "",
      },
      projects: parsed.projects || [],
      months: {},
    };

    const oldMonths = parsed.months || {};
    Object.entries(oldMonths).forEach(([key, cells]) => {
      const jKey = isGregorianMonthKey(key) ? gregorianMonthKeyToJalali(key) : key;
      if (!next.months[jKey]) next.months[jKey] = {};
      Object.assign(next.months[jKey], cells || {});
    });

    // Ensure topic / excludeHours exist (do NOT invent duration:1 — that breaks multi-hour ranges)
    Object.values(next.months).forEach((month) => {
      Object.values(month).forEach((cell) => {
        if (!cell) return;
        if (cell.topic === undefined) cell.topic = "";
        if (cell.excludeHours === undefined) cell.excludeHours = false;
      });
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
    if (view === "analytics") {
      renderAnalytics();
      updateViewSubtitle();
    }
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
    syncMatrixProjectSelect();
    const project = getMatrixProject();

    if (!project) {
      if (els.matrixEmptyProject) els.matrixEmptyProject.hidden = false;
      if (els.matrixWrap) els.matrixWrap.hidden = true;
      if (els.legend) els.legend.innerHTML = "";
      els.matrixHead.innerHTML = "";
      els.matrixBody.innerHTML = "";
      updateViewSubtitle();
      return;
    }

    if (els.matrixEmptyProject) els.matrixEmptyProject.hidden = true;
    if (els.matrixWrap) els.matrixWrap.hidden = false;

    const hours = hourRange();
    const ym = monthKey();
    const days = daysInMonth(ym);
    const cells = getMonthCells();
    const projectMap = Object.fromEntries(state.projects.map((p) => [p.id, p]));

    els.matrixHead.innerHTML = "";
    const corner = document.createElement("th");
    corner.className = "corner";
    const { jm } = parseMonthKey(ym);
    corner.textContent = JALALI_MONTHS[jm - 1] || "روز";
    corner.title = `${project.name} · ${formatJalaliMonthLabel(ym)}`;
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

        if (data?.projectId === project.id) {
          td.classList.add("filled");
          if (data.done) td.classList.add("done");
          if (data.excludeHours) td.classList.add("is-excluded");
          const dur = Number(data.duration);
          if (Number.isFinite(dur) && dur < 1) td.classList.add("is-partial");
          td.style.setProperty("--cell-color", project.color);
          td.style.background = hexToRgba(project.color, data.excludeHours ? 0.12 : 0.28);
          td.title = [
            project.name,
            data.topic || "",
            data.comment || "",
            data.duration != null ? `مدت: ${data.duration} س` : "",
            data.excludeHours ? "جزو ساعت حساب نمی‌شود" : "",
            data.done ? "✓ انجام‌شده" : "",
          ]
            .filter(Boolean)
            .join(" — ");
        } else if (data?.projectId) {
          // Occupied by another project — not editable in this matrix
          const other = projectMap[data.projectId];
          td.classList.add("cell-busy");
          td.title = other
            ? `رزرو شده برای «${other.name}» — برای ویرایش ماتریس همان پروژه را باز کنید`
            : "رزرو شده برای پروژه دیگر";
        }
        tr.appendChild(td);
      });
      els.matrixBody.appendChild(tr);
    }

    renderLegend();
    bindMatrixEvents();
    updateViewSubtitle();
  }

  function renderLegend() {
    const project = getMatrixProject();
    if (!project) {
      els.legend.innerHTML = "";
      return;
    }
    els.legend.innerHTML = `
      <span class="legend-item">
        <span class="legend-swatch" style="background:${project.color}"></span>
        ماتریس: ${escapeHtml(project.name)}
      </span>
      <span class="legend-item legend-busy">
        <span class="legend-swatch legend-swatch-busy"></span>
        ساعات پروژه‌های دیگر (غیرقابل ویرایش)
      </span>`;
  }

  /**
   * Compact HTML matrix for one project (screen report + PDF).
   */
  function buildProjectMatrixHtml(projectId, { forPrint = false } = {}) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return "";

    const ym = monthKey();
    const days = daysInMonth(ym);
    const cells = getMonthCells();
    const hours = hourRange();
    const cls = forPrint ? "ps-matrix" : "report-matrix";

    let head = `<th class="${cls}-corner">روز</th>`;
    hours.forEach((h) => {
      head += `<th class="${cls}-hour">${forPrint ? formatHour(h) : formatHourFa(h)}</th>`;
    });

    let body = "";
    for (let day = 1; day <= days; day++) {
      const wd = weekdayName(ym, day);
      body += `<tr><th class="${cls}-day">${forPrint ? day : toPersianDigits(day)}<span>${wd}</span></th>`;
      hours.forEach((h) => {
        const data = cells[cellKey(day, h)];
        const mine = data?.projectId === projectId;
        const tip = mine
          ? [data.topic, data.comment, data.done ? "Done" : ""].filter(Boolean).join(" — ")
          : "";
        body += `<td class="${cls}-cell${mine ? " is-filled" : ""}${mine && data.done ? " is-done" : ""}" style="${mine ? `--c:${project.color};background:${hexToRgba(project.color, forPrint ? 0.55 : 0.35)}` : ""}" title="${escapeHtml(tip)}"></td>`;
      });
      body += "</tr>";
    }

    return `<table class="${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
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
      if (cell && !cell.classList.contains("cell-busy")) cell.classList.add("selecting");
    }
  }

  function bindMatrixEvents() {
    const table = $("#matrixTable");

    table.onmousedown = (e) => {
      if (!getMatrixProject()) {
        toast("ابتدا پروژه ماتریس را انتخاب کنید", "error");
        return;
      }
      const cell = e.target.closest(".cell");
      if (!cell || e.button !== 0) return;
      if (cell.classList.contains("cell-busy")) {
        toast("این ساعت متعلق به پروژه دیگری است", "error");
        return;
      }
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
      if (!cell || cell.classList.contains("cell-busy")) return;
      const day = Number(cell.dataset.day);
      if (day !== dragDay) return;
      dragEndHour = Number(cell.dataset.hour);
      paintSelection(dragDay, dragStartHour, dragEndHour);
    };

    table.ontouchstart = (e) => {
      if (!getMatrixProject()) return;
      const cell = e.target.closest(".cell");
      if (!cell || cell.classList.contains("cell-busy")) return;
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
      if (!cell || cell.classList.contains("cell-busy")) return;
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
    if (!getMatrixProject()) {
      clearSelecting();
      return;
    }
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

  function fillDurationOptions(maxSlots, preferred) {
    if (!els.taskDuration) return;
    const max = Math.max(0.5, roundHalf(maxSlots));
    const options = [];
    for (let v = 0.5; v <= max + 0.001; v = roundHalf(v + 0.5)) {
      options.push(v);
    }
    const preferredVal = preferred != null ? roundHalf(Number(preferred)) : max;
    const selected = options.includes(preferredVal) ? preferredVal : max;
    els.taskDuration.innerHTML = options
      .map((v) => {
        const label = Number.isInteger(v) ? `${toPersianDigits(v)} ساعت` : `${toPersianDigits(v.toFixed(1))} ساعت`;
        return `<option value="${v}" ${v === selected ? "selected" : ""}>${label}</option>`;
      })
      .join("");
  }

  function getSelectedDuration() {
    const slots = getSelectedHours().hours;
    const raw = Number(els.taskDuration?.value);
    if (!Number.isFinite(raw) || raw <= 0) return slots;
    return Math.min(slots, Math.max(0.5, roundHalf(raw)));
  }

  function renderTimeTrack() {
    if (!els.timeTrack) return;
    const { start, end } = getSelectedHours();
    els.timeTrack.innerHTML = hourRange()
      .map((h) => `<span class="time-track-seg ${h >= start && h <= end ? "active" : ""}" title="${formatHour(h)}"></span>`)
      .join("");
  }

  function updateDurationBadge({ keepDuration } = {}) {
    const { start, end, hours } = getSelectedHours();
    if (!keepDuration || !els.taskDuration?.value) {
      fillDurationOptions(hours, hours);
    } else {
      fillDurationOptions(hours, Number(els.taskDuration.value));
    }
    const duration = getSelectedDuration();
    els.durationBadge.textContent = formatDurationFa(duration);
    if (els.taskSummaryRange) {
      els.taskSummaryRange.textContent = formatTimeSlot(start, end);
    }
    renderTimeTrack();

    $$(".preset-chip", els.hourPresets || document).forEach((chip) => {
      chip.classList.toggle("active", Number(chip.dataset.span) === hours);
    });
  }

  function formatTimeSlot(start, end) {
    const endLabel = end === 23 ? toPersianDigits("24:00") : formatHourFa(end + 1);
    return `${formatHourFa(start)} الی ${endLabel}`;
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
      if (sameCellMeta(prev, data)) start--;
      else break;
    }
    while (end < 23) {
      const next = cells[cellKey(day, end + 1)];
      if (sameCellMeta(next, data)) end++;
      else break;
    }
    return { start, end, data };
  }

  function openTaskModal({ day, start, end, mode, projectId = null, fromReport = false }) {
    const project =
      (projectId && state.projects.find((p) => p.id === projectId)) ||
      getMatrixProject() ||
      (fromReport && reportProjectId && state.projects.find((p) => p.id === reportProjectId));

    if (!project) {
      toast("ابتدا پروژه را انتخاب کنید", "error");
      clearSelecting();
      return;
    }

    taskModalContext = { projectId: project.id, fromReport: !!fromReport };

    let seed = null;
    editingRange = { day, start, end };

    if (mode === "edit") {
      const range = findContiguousRange(day, start);
      if (!range.data || range.data.projectId !== project.id) {
        toast("این بازه متعلق به این پروژه نیست", "error");
        clearSelecting();
        return;
      }
      editingRange = { day, start: range.start, end: range.end };
      start = range.start;
      end = range.end;
      seed = range.data;
      els.btnDeleteRange.hidden = false;
      $("#taskModalTitle").textContent = fromReport ? "ویرایش از گزارش" : "ویرایش بازه زمانی";
    } else {
      const cells = getMonthCells();
      for (let h = start; h <= end; h++) {
        const c = cells[cellKey(day, h)];
        if (c?.projectId === project.id) {
          seed = c;
          break;
        }
      }
      els.btnDeleteRange.hidden = !seed;
      $("#taskModalTitle").textContent = "ثبت بازه زمانی";
    }

    els.taskDay.value = day;
    els.taskProject.value = project.id;
    fillHourSelects(els.startHour, start);
    fillHourSelects(els.endHour, end);
    updateTaskSummaryDate(day);

    const slotCount = end - start + 1;
    const seedDuration = seed?.duration != null ? Number(seed.duration) : slotCount;
    fillDurationOptions(slotCount, seedDuration);

    if (els.taskLockedProject) {
      els.taskLockedProject.innerHTML = `<span class="task-locked-swatch" style="background:${project.color}"></span><strong>${escapeHtml(project.name)}</strong>${project.client ? `<em>${escapeHtml(project.client)}</em>` : ""}`;
    }
    if (els.taskModalSub) {
      els.taskModalSub.textContent = fromReport
        ? `ویرایش گزارش · ${project.name}`
        : `ماتریس پروژه: ${project.name}`;
    }
    if (els.taskTopic) els.taskTopic.value = seed?.topic || "";
    els.taskComment.value = seed?.comment || "";
    els.taskDone.checked = !!seed?.done;
    if (els.taskExcludeHours) els.taskExcludeHours.checked = !!seed?.excludeHours;
    updateDurationBadge({ keepDuration: true });
    els.taskModal.showModal();
  }

  function closeTaskModal() {
    els.taskModal.close();
    clearSelecting();
    editingRange = null;
    taskModalContext = { projectId: "", fromReport: false };
  }

  function saveTaskRange(e) {
    e.preventDefault();
    const projectId =
      taskModalContext.projectId ||
      getMatrixProject()?.id ||
      els.taskProject.value;
    const project = state.projects.find((p) => p.id === projectId);
    const day = Number(els.taskDay.value);
    let start = Number(els.startHour.value);
    let end = Number(els.endHour.value);
    if (start > end) [start, end] = [end, start];

    if (!projectId || !project) {
      toast("پروژه مشخص نیست", "error");
      return;
    }

    const cells = getMonthCells();
    const duration = getSelectedDuration();
    const fromReport = taskModalContext.fromReport;

    for (let h = start; h <= end; h++) {
      const existing = cells[cellKey(day, h)];
      if (existing?.projectId && existing.projectId !== projectId) {
        const other = state.projects.find((p) => p.id === existing.projectId);
        toast(`ساعت ${formatHourFa(h)} متعلق به «${other?.name || "پروژه دیگر"}» است`, "error");
        return;
      }
    }

    if (editingRange) {
      for (let h = editingRange.start; h <= editingRange.end; h++) {
        const c = cells[cellKey(day, h)];
        if (c?.projectId === projectId) delete cells[cellKey(day, h)];
      }
    }

    const payload = {
      projectId,
      topic: (els.taskTopic?.value || "").trim(),
      comment: els.taskComment.value.trim(),
      done: els.taskDone.checked,
      excludeHours: !!els.taskExcludeHours?.checked,
      duration,
    };

    for (let h = start; h <= end; h++) {
      cells[cellKey(day, h)] = { ...payload };
    }

    saveState();
    closeTaskModal();
    if (currentView === "matrix" || matrixProjectId === projectId) renderMatrix();
    if (currentView === "analytics" || fromReport) renderAnalytics();
    toast("بازه زمانی ذخیره شد");
  }

  function deleteTaskRange() {
    if (!editingRange) return;
    const projectId = taskModalContext.projectId || getMatrixProject()?.id;
    if (!projectId) return;
    if (!confirm("کل بازه انتخاب‌شده حذف شود؟")) return;
    const cells = getMonthCells();
    const { day, start, end } = editingRange;
    let s = Number(els.startHour.value);
    let e = Number(els.endHour.value);
    if (s > e) [s, e] = [e, s];
    const fromReport = taskModalContext.fromReport;
    for (let h = start; h <= end; h++) {
      if (cells[cellKey(day, h)]?.projectId === projectId) delete cells[cellKey(day, h)];
    }
    for (let h = s; h <= e; h++) {
      if (cells[cellKey(day, h)]?.projectId === projectId) delete cells[cellKey(day, h)];
    }

    saveState();
    closeTaskModal();
    if (currentView === "matrix" || matrixProjectId === projectId) renderMatrix();
    if (currentView === "analytics" || fromReport) renderAnalytics();
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

    const hoursByProject = {};
    state.projects.forEach((p) => {
      hoursByProject[p.id] = countedProjectHours(p.id);
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
            <span>ساعات ماه: ${formatDurationFa(hours)}</span>
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
    syncMatrixProjectSelect();
    if (currentView === "matrix") renderMatrix();
    if (currentView === "analytics") renderAnalytics();
    toast("پروژه ذخیره شد");
  }

  function deleteProject() {
    const id = $("#projectId").value;
    if (!id) return;
    if (!confirm("این پروژه حذف شود؟ ساعات مرتبط خالی می‌مانند.")) return;
    state.projects = state.projects.filter((p) => p.id !== id);
    Object.values(state.months).forEach((month) => {
      Object.keys(month).forEach((k) => {
        if (month[k]?.projectId === id) delete month[k];
      });
    });
    if (reportProjectId === id) reportProjectId = "";
    if (matrixProjectId === id) {
      matrixProjectId = "";
      state.settings.matrixProjectId = "";
    }
    saveState();
    els.projectModal.close();
    renderProjects();
    if (currentView === "analytics") renderAnalytics();
    toast("پروژه حذف شد");
  }

  // ---------- Analytics helpers (single-project only) ----------
  function rangeDuration(data, start, end) {
    const slots = end - start + 1;
    if (data?.duration != null && Number.isFinite(Number(data.duration))) {
      return Math.max(0.5, roundHalf(Number(data.duration)));
    }
    return slots;
  }

  function computeStats() {
    const rangesByProject = {};
    state.projects.forEach((p) => {
      rangesByProject[p.id] = buildProjectRanges(p.id);
    });

    let totalLogged = 0;
    let doneCount = 0;
    const byProject = {};

    Object.entries(rangesByProject).forEach(([pid, ranges]) => {
      let sum = 0;
      ranges.forEach((r) => {
        if (r.excludeHours) return;
        sum += r.duration;
        if (r.done) doneCount += r.duration;
      });
      byProject[pid] = roundHalf(sum);
      totalLogged = roundHalf(totalLogged + sum);
    });

    const activeProjects = state.projects.filter((p) => p.status === "active").length;
    const totalShare = state.projects.reduce((s, p) => s + (Number(p.share) || 0), 0);

    return { totalLogged, doneCount: roundHalf(doneCount), byProject, activeProjects, totalShare };
  }

  /**
   * Build contiguous activity ranges for ONE project only.
   */
  function buildProjectRanges(projectId) {
    const cells = getMonthCells();
    const ranges = [];
    const days = daysInMonth(monthKey());

    for (let day = 1; day <= days; day++) {
      let h = 0;
      while (h < 24) {
        const data = cells[cellKey(day, h)];
        if (!data || data.projectId !== projectId) {
          h++;
          continue;
        }
        let end = h;
        while (end + 1 < 24) {
          const next = cells[cellKey(day, end + 1)];
          if (sameCellMeta(next, data) && next.projectId === projectId) end++;
          else break;
        }
        ranges.push({
          day,
          start: h,
          end,
          topic: data.topic || "",
          comment: data.comment || "",
          done: !!data.done,
          excludeHours: !!data.excludeHours,
          duration: rangeDuration(data, h, end),
          slots: end - h + 1,
        });
        h = end + 1;
      }
    }

    return ranges;
  }

  /** Day-by-day counted hours for chart / Excel */
  function buildDailyHours(projectId) {
    const days = daysInMonth(monthKey());
    const ranges = buildProjectRanges(projectId);
    const daily = [];
    for (let day = 1; day <= days; day++) {
      const hours = roundHalf(
        ranges
          .filter((r) => r.day === day && !r.excludeHours)
          .reduce((s, r) => s + r.duration, 0)
      );
      daily.push({ day, hours, weekday: weekdayName(monthKey(), day) });
    }
    return daily;
  }

  function getSelectedReportProject() {
    return state.projects.find((p) => p.id === reportProjectId) || null;
  }

  function countedProjectHours(projectId) {
    return roundHalf(
      buildProjectRanges(projectId)
        .filter((r) => !r.excludeHours)
        .reduce((s, r) => s + r.duration, 0)
    );
  }

  // ---------- Analytics render ----------
  function renderAnalytics() {
    // Populate project selector (always single-project mode)
    const prev = reportProjectId;
    const opts = state.projects
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}${p.client ? ` — ${escapeHtml(p.client)}` : ""}</option>`)
      .join("");
    els.reportProjectSelect.innerHTML = `<option value="">— انتخاب پروژه —</option>${opts}`;

    if (prev && state.projects.some((p) => p.id === prev)) {
      reportProjectId = prev;
      els.reportProjectSelect.value = prev;
    } else if (matrixProjectId && state.projects.some((p) => p.id === matrixProjectId)) {
      // Prefer currently open matrix project for report continuity
      reportProjectId = matrixProjectId;
      els.reportProjectSelect.value = matrixProjectId;
    } else {
      reportProjectId = els.reportProjectSelect.value || "";
    }

    const project = getSelectedReportProject();
    if (!project) {
      els.reportEmpty.hidden = false;
      els.reportHub.hidden = true;
      destroyChart();
      updateViewSubtitle();
      return;
    }

    els.reportEmpty.hidden = true;
    els.reportHub.hidden = false;

    const { totalLogged, byProject } = computeStats();
    const projectHours = byProject[project.id] || 0;
    const ranges = buildProjectRanges(project.id);
    const countedRanges = ranges.filter((r) => !r.excludeHours);
    const doneHours = roundHalf(countedRanges.filter((r) => r.done).reduce((s, r) => s + r.duration, 0));
    const progressHours = roundHalf(projectHours - doneHours);
    const excludedHours = roundHalf(ranges.filter((r) => r.excludeHours).reduce((s, r) => s + r.duration, 0));
    const actualShare = totalLogged ? (projectHours / totalLogged) * 100 : 0;
    const targetShare = Number(project.share) || 0;
    const completionRate = projectHours ? Math.round((doneHours / projectHours) * 100) : 0;

    // KPI badges — strictly for this project (counted hours only)
    els.kpiRow.innerHTML = `
      <div class="kpi-card" style="--kpi-accent:${project.color}">
        <span>مجموع ساعات این پروژه</span>
        <strong>${toPersianDigits(Number.isInteger(projectHours) ? projectHours : projectHours.toFixed(1))}</strong>
        <em>ساعت شمارش‌شده در ${formatJalaliMonthLabel(monthKey())}${excludedHours ? ` · ${formatDurationFa(excludedHours)} مستثنی` : ""}</em>
      </div>
      <div class="kpi-card" style="--kpi-accent:${project.color}">
        <span>سهم هدف در برابر سهم واقعی</span>
        <strong>${toPersianDigits(targetShare)}٪ / ${toPersianDigits(actualShare.toFixed(1))}٪</strong>
        <em>هدف: ${toPersianDigits(targetShare)}٪ · واقعی از ظرفیت ماه: ${toPersianDigits(actualShare.toFixed(1))}٪</em>
      </div>
      <div class="kpi-card" style="--kpi-accent:${project.color}">
        <span>نرخ تکمیل تسک‌ها</span>
        <strong>${toPersianDigits(completionRate)}٪</strong>
        <em>Done: ${formatDurationFa(doneHours)} · در حال انجام: ${formatDurationFa(progressHours)}</em>
      </div>
    `;

    // Print header meta
    const statusLabel = project.status === "active" ? "فعال" : "تکمیل‌شده";
    const today = todayJalali();
    const issueDate = `${toPersianDigits(today.jd)} ${JALALI_MONTHS[today.jm - 1]} ${toPersianDigits(today.jy)}`;
    const gNow = new Date();
    const gDate = `${gNow.getFullYear()}/${pad2(gNow.getMonth() + 1)}/${pad2(gNow.getDate())}`;
    els.printDocMeta.innerHTML = `
      <div><strong>${escapeHtml(project.name)}</strong></div>
      <div>مشتری: ${project.client ? escapeHtml(project.client) : "—"}</div>
      <div>وضعیت: ${statusLabel}</div>
      <div>ماه گزارش: ${formatJalaliMonthLabel(monthKey())}</div>
      <div>تاریخ صدور: ${issueDate} (${gDate})</div>
      <div>مجموع ساعات: ${toPersianDigits(projectHours)}</div>
    `;
    els.printTimestamp.textContent = `${issueDate} — ${toPersianDigits(pad2(gNow.getHours()))}:${toPersianDigits(pad2(gNow.getMinutes()))}`;

    if (els.chartSubtitle) {
      els.chartSubtitle.textContent = `ساعات کارکرد «${project.name}» در روزهای ${formatJalaliMonthLabel(monthKey())}`;
    }

    if (els.reportMatrixWrap) {
      els.reportMatrixWrap.innerHTML = buildProjectMatrixHtml(project.id, { forPrint: false });
    }

    renderProjectChart(project, buildDailyHours(project.id));
    renderReportTable(ranges, projectHours);
    updateViewSubtitle();
  }

  function renderReportTable(ranges, totalHours) {
    const ym = monthKey();
    const { jm } = parseMonthKey(ym);
    const project = getSelectedReportProject();

    if (!ranges.length) {
      els.reportDetailBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">
          برای این پروژه در ماه جاری بازهٔ زمانی ثبت نشده است.
        </td></tr>`;
      els.reportDetailFoot.innerHTML = `
        <tr><td colspan="7">مجموع ساعات شمارش‌شده این پروژه: ${formatDurationFa(0)}</td></tr>`;
      return;
    }

    els.reportDetailBody.innerHTML = ranges
      .map((r) => {
        const wd = weekdayName(ym, r.day);
        const dateLabel = `${wd} ${toPersianDigits(r.day)} ${JALALI_MONTHS[jm - 1]}`;
        const statusBits = [];
        if (r.done) statusBits.push(`<span class="status-pill done">Done</span>`);
        else statusBits.push(`<span class="status-pill progress">در حال انجام</span>`);
        if (r.excludeHours) statusBits.push(`<span class="status-pill excluded">جزو ساعت نیست</span>`);
        return `
        <tr class="${r.excludeHours ? "row-excluded" : ""}">
          <td>${dateLabel}</td>
          <td>${formatTimeSlot(r.start, r.end)}</td>
          <td>${r.topic ? escapeHtml(r.topic) : "—"}</td>
          <td>${formatDurationFa(r.duration)}${r.duration < r.slots ? ` <small class="dim">از ${toPersianDigits(r.slots)} اسلات</small>` : ""}</td>
          <td>${r.comment ? escapeHtml(r.comment) : "—"}</td>
          <td>${statusBits.join(" ")}</td>
          <td class="no-print">
            <button type="button" class="btn btn-ghost btn-xs" data-edit-range
              data-day="${r.day}" data-start="${r.start}" data-end="${r.end}" data-project="${project?.id || ""}">
              ویرایش
            </button>
          </td>
        </tr>`;
      })
      .join("");

    const excluded = roundHalf(ranges.filter((r) => r.excludeHours).reduce((s, r) => s + r.duration, 0));
    els.reportDetailFoot.innerHTML = `
      <tr>
        <td colspan="7">
          مجموع ساعات شمارش‌شده این پروژه: ${formatDurationFa(totalHours)}
          ${excluded ? ` · مستثنی از شمارش: ${formatDurationFa(excluded)}` : ""}
        </td>
      </tr>`;
  }

  function destroyChart() {
    if (projectChart) {
      projectChart.destroy();
      projectChart = null;
    }
  }

  function renderProjectChart(project, daily) {
    if (typeof Chart === "undefined" || !els.projectChartCanvas) return;

    destroyChart();

    const labels = daily.map((d) => toPersianDigits(d.day));
    const data = daily.map((d) => d.hours);
    const color = project.color || "#2dd4bf";

    const ctx = els.projectChartCanvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, hexToRgba(color, 0.55));
    gradient.addColorStop(1, hexToRgba(color, 0.05));

    projectChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "ساعات روزانه",
            data,
            backgroundColor: gradient,
            borderColor: hexToRgba(color, 0.85),
            borderWidth: 1,
            borderRadius: 4,
            order: 2,
          },
          {
            type: "line",
            label: "روند",
            data,
            borderColor: color,
            backgroundColor: hexToRgba(color, 0.15),
            borderWidth: 2,
            pointRadius: 2,
            pointBackgroundColor: color,
            tension: 0.35,
            fill: false,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: {
              color: "#94a3b8",
              font: { family: "'Arad', 'Vazirmatn', sans-serif", size: 11 },
            },
          },
          tooltip: {
            rtl: true,
            titleFont: { family: "'Arad', 'Vazirmatn', sans-serif" },
            bodyFont: { family: "'Arad', 'Vazirmatn', sans-serif" },
            callbacks: {
              title: (items) => {
                const i = items[0]?.dataIndex;
                if (i == null) return "";
                const d = daily[i];
                return `${d.weekday} ${toPersianDigits(d.day)}`;
              },
              label: (item) => `${toPersianDigits(item.raw)} ساعت`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(148,163,184,0.08)" },
            ticks: {
              color: "#94a3b8",
              font: { family: "'Arad', 'Vazirmatn', sans-serif", size: 10 },
              maxRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(148,163,184,0.1)" },
            ticks: {
              color: "#94a3b8",
              font: { family: "'Arad', 'Vazirmatn', sans-serif", size: 10 },
              stepSize: 0.5,
              callback: (v) => toPersianDigits(Number.isInteger(v) ? v : v.toFixed(1)),
            },
          },
        },
      },
    });
  }

  // ---------- Excel Export (SheetJS) — single project, 2 sheets ----------
  function exportProjectExcel() {
    if (typeof XLSX === "undefined") {
      toast("کتابخانه اکسل بارگذاری نشد", "error");
      return;
    }

    const project = getSelectedReportProject();
    if (!project) {
      toast("ابتدا یک پروژه انتخاب کنید", "error");
      return;
    }

    const ym = monthKey();
    const ranges = buildProjectRanges(project.id);
    const daily = buildDailyHours(project.id);
    const totalHours = countedProjectHours(project.id);
    const { jm, jy } = parseMonthKey(ym);
    const today = todayJalali();
    const reportDate = `${today.jy}/${pad2(today.jm)}/${pad2(today.jd)}`;

    // Sheet 1: ریز کارکرد و شرح اقدامات
    const detail = [
      ["نام پروژه", project.name],
      ["مشتری", project.client || "—"],
      ["ماه گزارش", formatJalaliMonthLabel(ym, false)],
      ["تاریخ صدور گزارش", reportDate],
      ["وضعیت پروژه", project.status === "active" ? "فعال" : "تکمیل‌شده"],
      [],
      ["روز ماه", "روز هفته", "بازه زمانی", "عنوان تسک / موضوع", "مدت (ساعت)", "شرح اقدامات", "وضعیت", "جزو ساعت؟"],
    ];

    ranges.forEach((r) => {
      const endH = r.end === 23 ? "24:00" : formatHour(r.end + 1);
      detail.push([
        r.day,
        weekdayName(ym, r.day),
        `${formatHour(r.start)} الی ${endH}`,
        r.topic || "",
        r.duration,
        r.comment || "",
        r.done ? "Done" : "در حال انجام",
        r.excludeHours ? "خیر (مستثنی)" : "بله",
      ]);
    });

    detail.push([]);
    detail.push([`مجموع ساعات شمارش‌شده این پروژه: ${totalHours} ساعت`]);

    // Sheet 2: آمار و خلاصه زمانی (chart metrics)
    const summary = [
      ["پروژه", project.name],
      ["ماه", formatJalaliMonthLabel(ym, false)],
      [],
      ["روز", "روز هفته", "ساعات کارکرد"],
    ];
    daily.forEach((d) => {
      summary.push([d.day, d.weekday, d.hours]);
    });
    summary.push([]);
    summary.push(["جمع کل ساعات", "", totalHours]);
    summary.push(["سهم هدف (%)", "", Number(project.share) || 0]);

    const { totalLogged, byProject } = computeStats();
    const actual = totalLogged ? (((byProject[project.id] || 0) / totalLogged) * 100).toFixed(1) : "0";
    summary.push(["سهم واقعی از ظرفیت ماه (%)", "", actual]);

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(detail);
    const ws2 = XLSX.utils.aoa_to_sheet(summary);

    // Column widths for readability
    ws1["!cols"] = [
      { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 40 }, { wch: 14 },
    ];
    ws2["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 14 }];

    XLSX.utils.book_append_sheet(wb, ws1, "ریز کارکرد");
    XLSX.utils.book_append_sheet(wb, ws2, "آمار و خلاصه");

    const safeName = project.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 40);
    XLSX.writeFile(wb, `itask-${safeName}-${jy}-${pad2(jm)}.xlsx`);
    toast(`فایل اکسل «${project.name}» آماده شد`);
  }

  // ---------- Formal PDF / Print ----------
  /**
   * Render a light-theme chart to PNG for print (dark UI chart is unreadable on paper).
   */
  function capturePrintChartImage(project, daily) {
    return new Promise((resolve) => {
      if (typeof Chart === "undefined") {
        resolve("");
        return;
      }

      const hold = document.createElement("div");
      hold.style.cssText = "position:fixed;left:-9999px;top:0;width:920px;height:280px;background:#fff;";
      const canvas = document.createElement("canvas");
      canvas.width = 920;
      canvas.height = 280;
      hold.appendChild(canvas);
      document.body.appendChild(hold);

      const color = project.color || "#0d9488";
      const labels = daily.map((d) => toPersianDigits(d.day));
      const data = daily.map((d) => d.hours);

      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              type: "bar",
              label: "ساعات روزانه",
              data,
              backgroundColor: hexToRgba(color, 0.45),
              borderColor: color,
              borderWidth: 1.25,
              borderRadius: 3,
              order: 2,
            },
            {
              type: "line",
              label: "روند",
              data,
              borderColor: color,
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 2.5,
              pointBackgroundColor: color,
              tension: 0.3,
              fill: false,
              order: 1,
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            legend: {
              labels: {
                color: "#334155",
                font: { family: "'Arad', 'Vazirmatn', Tahoma, sans-serif", size: 12 },
              },
            },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              grid: { color: "rgba(148,163,184,0.35)" },
              ticks: {
                color: "#334155",
                font: { family: "'Arad', 'Vazirmatn', Tahoma, sans-serif", size: 10 },
                maxRotation: 0,
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: "rgba(148,163,184,0.4)" },
              ticks: {
                color: "#334155",
                stepSize: 0.5,
                font: { family: "'Arad', 'Vazirmatn', Tahoma, sans-serif", size: 10 },
                callback: (v) => toPersianDigits(Number.isInteger(v) ? v : v.toFixed(1)),
              },
            },
          },
        },
      });

      // Wait one frame so Chart paints, then export
      requestAnimationFrame(() => {
        setTimeout(() => {
          let dataUrl = "";
          try {
            dataUrl = canvas.toDataURL("image/png", 1.0);
          } catch {
            dataUrl = "";
          }
          chart.destroy();
          hold.remove();
          resolve(dataUrl);
        }, 80);
      });
    });
  }

  function buildPrintSheetHtml(project, ranges, daily, chartDataUrl) {
    const ym = monthKey();
    const { jm } = parseMonthKey(ym);
    const countedHours = countedProjectHours(project.id);
    const excludedHours = roundHalf(
      ranges.filter((r) => r.excludeHours).reduce((s, r) => s + r.duration, 0)
    );
    const reportTitle = projectReportTitle(project);
    const monthLabel = formatJalaliMonthLabel(ym);

    const today = todayJalali();
    const dateFa = `${toPersianDigits(today.jd)} ${JALALI_MONTHS[today.jm - 1]} ${toPersianDigits(today.jy)}`;

    const tableRows = ranges.length
      ? ranges
          .map((r) => {
            const wd = weekdayName(ym, r.day);
            const dateLabel = `${wd} ${toPersianDigits(r.day)} ${JALALI_MONTHS[jm - 1]}`;
            const statusParts = [];
            statusParts.push(r.done ? "انجام‌شده" : "در حال انجام");
            if (r.excludeHours) statusParts.push("جزو ساعت نیست");
            return `<tr class="${r.excludeHours ? "ps-row-excluded" : ""}">
              <td>${dateLabel}</td>
              <td>${formatTimeSlot(r.start, r.end)}</td>
              <td>${r.topic ? escapeHtml(r.topic) : "—"}</td>
              <td class="ps-num">${formatDurationFa(r.duration)}</td>
              <td>${r.comment ? escapeHtml(r.comment) : "—"}</td>
              <td>${statusParts.join(" · ")}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td class="ps-empty" colspan="6">برای این پروژه در ماه جاری بازه‌ای ثبت نشده است.</td></tr>`;

    const chartBlock = chartDataUrl
      ? `<img class="ps-chart" src="${chartDataUrl}" alt="نمودار ساعات روزانه" />`
      : `<p class="ps-empty">نمودار در دسترس نیست.</p>`;

    const matrixHtml = buildProjectMatrixHtml(project.id, { forPrint: true });
    const countedLabel = toPersianDigits(formatDurationNumber(countedHours));

    return `
      <article class="ps-doc" dir="rtl" lang="fa">
        <header class="ps-head">
          <div class="ps-head-right">
            <div class="ps-name">${escapeHtml(AUTHOR_NAME)}</div>
            <div class="ps-name-en">${escapeHtml(AUTHOR_NAME_EN)}</div>
          </div>
          <div class="ps-head-center">
            <div class="ps-project">${escapeHtml(reportTitle)}</div>
            <div class="ps-month">ماه گزارش: ${monthLabel}</div>
          </div>
          <div class="ps-head-left">
            <div class="ps-date-label">تاریخ خروجی</div>
            <div class="ps-date">${dateFa}</div>
          </div>
        </header>

        <section class="ps-block ps-block-matrix">
          <h2 class="ps-h2">ماتریس ساعات ثبت‌شده</h2>
          <div class="ps-matrix-wrap">${matrixHtml}</div>
        </section>

        <section class="ps-block ps-block-chart">
          <h2 class="ps-h2">نمودار ساعات روزانه</h2>
          ${chartBlock}
        </section>

        <section class="ps-block ps-block-table">
          <h2 class="ps-h2">جدول ریز کارکرد</h2>
          <table class="ps-table">
            <thead>
              <tr>
                <th>تاریخ / روز ماه</th>
                <th>بازه زمانی</th>
                <th>عنوان / موضوع</th>
                <th>مدت</th>
                <th>شرح اقدامات</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
              <tr class="ps-total">
                <td colspan="3">مجموع ساعات شمارش‌شده</td>
                <td class="ps-num">${countedLabel} ساعت</td>
                <td colspan="2">${excludedHours ? `مستثنی از شمارش: ${formatDurationFa(excludedHours)}` : ""}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      </article>
    `;
  }

  async function exportFormalPdf() {
    const project = getSelectedReportProject();
    if (!project) {
      toast("ابتدا یک پروژه انتخاب کنید", "error");
      return;
    }

    const sheet = $("#printSheet");
    if (!sheet) {
      toast("بخش چاپ در دسترس نیست", "error");
      return;
    }

    const ranges = buildProjectRanges(project.id);
    const daily = buildDailyHours(project.id);

    toast("در حال آماده‌سازی نسخه چاپی…");

    let chartDataUrl = "";
    try {
      chartDataUrl = await capturePrintChartImage(project, daily);
    } catch {
      chartDataUrl = "";
    }

    sheet.innerHTML = buildPrintSheetHtml(project, ranges, daily, chartDataUrl);
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-printing");

    const cleanup = () => {
      document.body.classList.remove("is-printing");
      sheet.innerHTML = "";
      sheet.setAttribute("aria-hidden", "true");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    // Allow browser to paint the print sheet + decode chart image
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
        // Fallback cleanup if afterprint never fires (some browsers)
        setTimeout(() => {
          if (document.body.classList.contains("is-printing")) cleanup();
        }, 1500);
      }, 200);
    });
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
        reportProjectId = "";
        matrixProjectId = state.settings.matrixProjectId || "";
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
    const loggedText = Number.isInteger(totalLogged) ? String(totalLogged) : totalLogged.toFixed(1);
    els.statLogged.textContent = toPersianDigits(loggedText);
    els.statProjects.textContent = toPersianDigits(activeProjects);
  }

  function buildJalaliYearOptions() {
    const today = todayJalali();
    const years = new Set();
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
    matrixProjectId = state.settings.matrixProjectId || "";
    if (matrixProjectId && !state.projects.some((p) => p.id === matrixProjectId)) {
      matrixProjectId = "";
      state.settings.matrixProjectId = "";
    }
    syncJalaliSelectors();
    syncMatrixProjectSelect();
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

    els.prevMonthBtn.addEventListener("click", () => setActiveMonth(shiftJalaliMonth(monthKey(), -1)));
    els.nextMonthBtn.addEventListener("click", () => setActiveMonth(shiftJalaliMonth(monthKey(), 1)));
    els.btnTodayMonth.addEventListener("click", () => setActiveMonth(currentJalaliMonthKey()));

    els.savedMonthsList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-month]");
      if (!btn) return;
      setActiveMonth(btn.dataset.month);
    });

    // Task modal
    els.startHour.addEventListener("change", () => updateDurationBadge());
    els.endHour.addEventListener("change", () => updateDurationBadge());
    els.taskDuration?.addEventListener("change", () => updateDurationBadge({ keepDuration: true }));
    $("#taskForm").addEventListener("submit", saveTaskRange);
    $("#btnCancelTask").addEventListener("click", closeTaskModal);
    $("#taskModalClose").addEventListener("click", closeTaskModal);
    els.btnDeleteRange.addEventListener("click", deleteTaskRange);

    els.projectPicker?.addEventListener("click", (e) => {
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
      if (start + span - 1 > 23) {
        els.startHour.value = String(Math.max(0, 24 - span));
        els.endHour.value = "23";
      } else {
        els.endHour.value = String(start + span - 1);
      }
      updateDurationBadge();
    });

    // Edit from report table
    els.reportDetailBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-edit-range]");
      if (!btn) return;
      openTaskModal({
        day: Number(btn.dataset.day),
        start: Number(btn.dataset.start),
        end: Number(btn.dataset.end),
        mode: "edit",
        projectId: btn.dataset.project,
        fromReport: true,
      });
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

    // Report hub — project selector drives everything
    els.reportProjectSelect.addEventListener("change", () => {
      reportProjectId = els.reportProjectSelect.value;
      renderAnalytics();
    });

    // Matrix — one dedicated matrix per selected project
    els.matrixProjectSelect?.addEventListener("change", () => {
      setMatrixProject(els.matrixProjectSelect.value);
    });

    $("#btnExportProjectExcel").addEventListener("click", exportProjectExcel);
    $("#btnExportPdf").addEventListener("click", exportFormalPdf);

    // Ctrl/Cmd+P on report view → formal PDF sheet (not the dark app UI)
    window.addEventListener("keydown", (e) => {
      const isPrint = (e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P");
      if (!isPrint) return;
      if (currentView !== "analytics" || !getSelectedReportProject()) return;
      e.preventDefault();
      exportFormalPdf();
    });

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
      reportProjectId = "";
      matrixProjectId = "";
      saveState();
      initUIFromState();
      setView("matrix");
      toast("برنامه بازنشانی شد");
    });

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
