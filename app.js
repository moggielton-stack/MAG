/* MAG — main application logic */

const STORAGE_KEY = "mag.v1.state";
const PAGE_SIZE = 50;

const DEFAULT_STATE = {
  transactions: [],         // {id, date, amount, description, raw, bank, profile, category, taxClaimable, recurring, note, accountId}
  rules: [],                // user-added: {keyword, category, taxClaimable}
  accountMap: {},           // {accountId: profile}
  settings: {
    nameSelf: "Self",
    nameWife: "Wife",
    rateSelf: 0.30,
    rateWife: 0.30,
    wfhHoursSelf: 20,
    wfhHoursWife: 0,
    wfhWeeks: 46,
    remindersOn: true,
  },
  lastUpload: null,
  uploadHistory: [],
};

let STATE = loadState();
let currentPage = 1;
let sortKey = "date";
let sortDir = "desc";
let charts = {};

// ───────────────────────────────────────── STORAGE
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
    }
  } catch (e) { console.warn("State load failed", e); }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  } catch (e) {
    toast("Storage full — export a backup and erase old data.", "error");
  }
}

// ───────────────────────────────────────── UTILS
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmt = n => "$" + (n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = n => {
  const abs = Math.abs(n || 0);
  if (abs >= 1e6) return "$" + (n/1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n/1e3).toFixed(1) + "k";
  return "$" + (n || 0).toFixed(0);
};
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const parseDate = s => {
  if (!s) return null;
  // Try DD/MM/YYYY, YYYY-MM-DD, etc.
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return new Date(+y, +mo - 1, +d);
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
};
const txnId = (date, amount, desc, bank) =>
  btoa(unescape(encodeURIComponent(`${date}|${amount}|${desc}|${bank}`))).replace(/=/g,"").slice(0, 24);

function toast(msg, type = "success") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + type;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3500);
}

// ───────────────────────────────────────── CSV PARSERS

// Commonwealth Bank: no header row; columns are: Date, Amount, Description, Balance
function parseCommonwealth(rows, profile) {
  const out = [];
  for (const row of rows) {
    if (!row || row.length < 3) continue;
    const dateStr = row[0];
    const amount = parseFloat(String(row[1]).replace(/[, ]/g, ""));
    const description = (row[2] || "").trim();
    const balance = row[3] !== undefined ? parseFloat(String(row[3]).replace(/[, ]/g, "")) : null;
    const date = parseDate(dateStr);
    if (!date || isNaN(amount)) continue;
    out.push({
      id: txnId(date.toISOString().slice(0,10), amount, description, "commonwealth"),
      date: date.toISOString().slice(0, 10),
      amount,
      description,
      raw: row.join(" | "),
      bank: "commonwealth",
      profile,
      balance,
      accountId: "cba-default",
    });
  }
  return out;
}

// Wise: has header row. Columns typically include: TransferWise ID, Date, Amount, Currency, Description...
function parseWise(rows, headers, profile) {
  const idx = name => headers.findIndex(h => (h || "").toLowerCase().trim() === name.toLowerCase());
  const idxAny = names => {
    for (const n of names) { const i = idx(n); if (i >= 0) return i; }
    return -1;
  };
  const cDate = idxAny(["Date", "Created on"]);
  const cAmount = idxAny(["Amount", "Source amount (after fees)", "Target amount (after fees)"]);
  const cDesc = idxAny(["Description", "Reference", "Payment Reference"]);
  const cMerchant = idxAny(["Merchant", "Target name"]);
  const cId = idxAny(["TransferWise ID", "ID"]);
  const cCurrency = idxAny(["Currency"]);
  const out = [];
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const dateStr = row[cDate];
    const date = parseDate(dateStr);
    if (!date) continue;
    const amount = parseFloat(String(row[cAmount]).replace(/[, ]/g, ""));
    if (isNaN(amount)) continue;
    let description = (row[cDesc] || "").trim();
    const merchant = (cMerchant >= 0 ? row[cMerchant] : "").trim();
    if (merchant && !description.toLowerCase().includes(merchant.toLowerCase())) {
      description = merchant + " — " + description;
    }
    if (!description) description = "Wise transaction";
    out.push({
      id: txnId(date.toISOString().slice(0,10), amount, description, "wise"),
      date: date.toISOString().slice(0, 10),
      amount,
      description,
      raw: row.join(" | "),
      bank: "wise",
      profile,
      currency: cCurrency >= 0 ? row[cCurrency] : "AUD",
      accountId: "wise-default",
    });
  }
  return out;
}

function detectBank(filename, firstRow, headers) {
  const f = (filename || "").toLowerCase();
  if (f.includes("wise") || f.includes("statement_")) return "wise";
  if (f.includes("csvdata") || f.includes("commonwealth") || f.includes("cba")) return "commonwealth";
  // Heuristic on headers
  if (headers && headers.length > 0) {
    const hs = headers.map(h => (h || "").toLowerCase());
    if (hs.some(h => h.includes("transferwise") || h.includes("source amount") || h.includes("target amount"))) return "wise";
  }
  // Commonwealth CSVs typically lack headers and have 4 columns: date, amount, desc, balance
  if (firstRow && firstRow.length >= 3 && firstRow.length <= 5) {
    const dt = parseDate(firstRow[0]);
    const amt = parseFloat(String(firstRow[1]).replace(/[, ]/g, ""));
    if (dt && !isNaN(amt)) return "commonwealth";
  }
  return null;
}

async function processFile(file, declaredBank, declaredProfile) {
  return new Promise(resolve => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        if (!rows.length) return resolve({ file: file.name, ok: false, error: "empty file" });

        // Sniff for header
        const firstRow = rows[0];
        const looksLikeHeader = firstRow.some(c => isNaN(parseFloat(c)) && /[A-Za-z]/.test(String(c || "")) && !parseDate(c));

        let bank = declaredBank;
        if (!bank || bank === "auto") {
          bank = detectBank(file.name, looksLikeHeader ? rows[1] : firstRow, looksLikeHeader ? firstRow : null);
        }
        if (!bank) return resolve({ file: file.name, ok: false, error: "couldn't detect bank format" });

        let parsed = [];
        if (bank === "commonwealth") {
          const dataRows = looksLikeHeader ? rows.slice(1) : rows;
          parsed = parseCommonwealth(dataRows, declaredProfile);
        } else if (bank === "wise") {
          if (!looksLikeHeader) return resolve({ file: file.name, ok: false, error: "Wise CSV missing header row" });
          parsed = parseWise(rows.slice(1), firstRow, declaredProfile);
        }

        // categorise
        for (const t of parsed) {
          // user rule first
          const userMatch = STATE.rules.find(r => t.description.toLowerCase().includes(r.keyword.toLowerCase()));
          if (userMatch) {
            t.category = userMatch.category;
            t.taxClaimable = !!userMatch.taxClaimable;
          } else {
            const c = categoriseTransaction(t.description, t.amount);
            t.category = c.category;
            t.taxClaimable = c.taxClaimable;
          }
          // account map override for profile
          if (STATE.accountMap[t.accountId]) t.profile = STATE.accountMap[t.accountId];
        }

        // dedupe vs existing
        const existing = new Set(STATE.transactions.map(t => t.id));
        const fresh = parsed.filter(t => !existing.has(t.id));
        const dupes = parsed.length - fresh.length;

        STATE.transactions.push(...fresh);
        resolve({ file: file.name, ok: true, bank, added: fresh.length, duplicates: dupes, total: parsed.length });
      },
      error: (err) => resolve({ file: file.name, ok: false, error: err.message }),
    });
  });
}

// ───────────────────────────────────────── FILTERING

function getFiltered() {
  const f = {
    profile: $("#filterProfile").value,
    bank: $("#filterBank").value,
    fy: $("#filterFY").value,
    month: $("#filterMonth").value,
    category: $("#filterCategory").value,
    type: $("#filterType").value,
    search: ($("#filterSearch").value || "").toLowerCase().trim(),
  };
  return STATE.transactions.filter(t => {
    if (f.profile !== "all" && t.profile !== f.profile) return false;
    if (f.bank !== "all" && t.bank !== f.bank) return false;
    if (f.category !== "all" && t.category !== f.category) return false;
    if (f.type === "expense" && t.amount >= 0) return false;
    if (f.type === "income" && t.amount < 0) return false;
    if (f.fy !== "all") {
      const fy = fyOfDate(new Date(t.date));
      if (fy.label !== f.fy) return false;
    }
    if (f.month !== "all") {
      if (monthKey(new Date(t.date)) !== f.month) return false;
    }
    if (f.search && !(t.description || "").toLowerCase().includes(f.search)) return false;
    return true;
  });
}

// ───────────────────────────────────────── RENDER: KPIs

function renderKpis() {
  const txns = getFiltered();
  const income = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - expenses;
  const sr = income > 0 ? (net / income) * 100 : 0;

  const last12 = lastNMonths(12);
  const monthly = monthlyAggregate(STATE.transactions);
  const last12Spend = last12.reduce((s, m) => s + (monthly[m]?.expenses || 0), 0);
  const avgSpend = last12.length ? last12Spend / last12.filter(m => monthly[m]).length || 0 : 0;

  // tax refund preview
  const fy = currentFY();
  const fyTxns = STATE.transactions.filter(t => {
    const d = new Date(t.date); return d >= fy.start && d <= fy.end;
  });
  const tax = estimateAtoDeductions(fyTxns, STATE.settings);
  const refund = (tax.totalClaimable) * STATE.settings.rateSelf;

  $("#kpiIncome").textContent = fmt(income);
  $("#kpiExpenses").textContent = fmt(expenses);
  $("#kpiNet").textContent = fmt(net);
  $("#kpiNet").className = "kpi-value " + (net >= 0 ? "income" : "expense");
  $("#kpiSavings").textContent = sr.toFixed(1) + "%";
  $("#kpiAvgSpend").textContent = fmt(avgSpend);
  $("#kpiRefund").textContent = fmt(refund);
  $("#kpiRefundSub").textContent = `${fy.label} @ ${(STATE.settings.rateSelf*100).toFixed(0)}% marginal`;
  $("#kpiIncomeSub").textContent = txns.length + " transactions";
  $("#kpiExpensesSub").textContent = expenses > 0 ? "across " + new Set(txns.filter(t=>t.amount<0).map(t=>t.category)).size + " categories" : "";
  $("#kpiNetSub").textContent = net >= 0 ? "surplus" : "deficit";
  $("#kpiSavingsSub").textContent = sr >= 20 ? "excellent" : sr >= 10 ? "good" : sr >= 0 ? "tight" : "spending more than earning";
}

// ───────────────────────────────────────── AGGREGATES

function monthlyAggregate(txns) {
  const out = {};
  for (const t of txns) {
    const k = monthKey(new Date(t.date));
    if (!out[k]) out[k] = { income: 0, expenses: 0, net: 0, byCat: {} };
    if (t.amount > 0) out[k].income += t.amount; else out[k].expenses += Math.abs(t.amount);
    out[k].net = out[k].income - out[k].expenses;
    out[k].byCat[t.category] = (out[k].byCat[t.category] || 0) + Math.abs(t.amount);
  }
  return out;
}

function lastNMonths(n, end = new Date()) {
  const months = [];
  const d = new Date(end.getFullYear(), end.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(monthKey(dt));
  }
  return months;
}

function categoryAggregate(txns) {
  const out = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    out[t.category] = (out[t.category] || 0) + Math.abs(t.amount);
  }
  return out;
}

function bankAggregate(txns) {
  const out = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    out[t.bank] = (out[t.bank] || 0) + Math.abs(t.amount);
  }
  return out;
}

function merchantAggregate(txns) {
  const out = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    // collapse to first meaningful word
    const m = (t.description.split(/[-,/]/)[0] || t.description).trim().toUpperCase();
    if (!out[m]) out[m] = { name: m, count: 0, total: 0 };
    out[m].count++;
    out[m].total += Math.abs(t.amount);
  }
  return Object.values(out).sort((a,b) => b.total - a.total);
}

// ───────────────────────────────────────── CHARTS

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue("--text").trim(),
    muted: cs.getPropertyValue("--muted").trim(),
    border: cs.getPropertyValue("--border").trim(),
  };
}

function renderCharts() {
  const txns = getFiltered();
  const theme = chartTheme();
  Chart.defaults.color = theme.muted;
  Chart.defaults.borderColor = theme.border;
  Chart.defaults.font.family = "-apple-system, system-ui, sans-serif";

  // Cashflow line chart
  destroyChart("cashflow");
  const months = lastNMonths(18);
  const monthly = monthlyAggregate(txns);
  const cumNet = [];
  let run = 0;
  for (const m of months) {
    const v = (monthly[m]?.net) || 0;
    run += v;
    cumNet.push(run);
  }
  charts.cashflow = new Chart($("#chartCashflow"), {
    type: "line",
    data: {
      labels: months,
      datasets: [
        { label: "Income", data: months.map(m => monthly[m]?.income || 0), borderColor: "#2dd4bf", backgroundColor: "rgba(45,212,191,0.1)", tension: 0.3, fill: true },
        { label: "Expenses", data: months.map(m => monthly[m]?.expenses || 0), borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.1)", tension: 0.3, fill: true },
        { label: "Cumulative Net", data: cumNet, borderColor: "#667eea", borderDash: [5,5], tension: 0.3, fill: false, yAxisID: "y1" },
      ],
    },
    options: chartBase("currency", { y1: true }),
  });

  // Category pie
  destroyChart("catPie");
  const cats = categoryAggregate(txns);
  const catLabels = Object.keys(cats).sort((a,b) => cats[b] - cats[a]).slice(0, 10);
  const catColors = catLabels.map(c => (CATEGORY_DEFS[c]?.color) || "#888");
  charts.catPie = new Chart($("#chartCategoryPie"), {
    type: "doughnut",
    data: { labels: catLabels, datasets: [{ data: catLabels.map(c => cats[c]), backgroundColor: catColors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, padding: 8, color: theme.text } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.parsed)}` } },
      },
    },
  });

  // Monthly bars
  destroyChart("monthBars");
  charts.monthBars = new Chart($("#chartMonthlyBars"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Income", data: months.map(m => monthly[m]?.income || 0), backgroundColor: "rgba(45,212,191,0.85)" },
        { label: "Expenses", data: months.map(m => monthly[m]?.expenses || 0), backgroundColor: "rgba(248,113,113,0.85)" },
      ],
    },
    options: chartBase("currency"),
  });

  // By bank
  destroyChart("byBank");
  const bk = bankAggregate(txns);
  charts.byBank = new Chart($("#chartByBank"), {
    type: "bar",
    data: {
      labels: Object.keys(bk).map(b => b === "commonwealth" ? "Commonwealth" : "Wise"),
      datasets: [{ label: "Spend", data: Object.values(bk), backgroundColor: ["#fbbf24", "#34d399"] }],
    },
    options: { ...chartBase("currency"), indexAxis: "y" },
  });

  // Top merchants
  const merch = merchantAggregate(txns).slice(0, 10);
  $("#topMerchants").innerHTML = merch.map(m =>
    `<div class="merchant-item"><div><div class="name">${escapeHtml(m.name)}</div><div class="meta">${m.count} transactions</div></div><div class="amt">${fmt(m.total)}</div></div>`
  ).join("") || `<div class="muted">No data yet.</div>`;
}

function chartBase(yType, opts = {}) {
  const theme = chartTheme();
  const base = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", labels: { color: theme.text, boxWidth: 12 } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
    },
    scales: {
      x: { grid: { color: theme.border }, ticks: { color: theme.muted } },
      y: { grid: { color: theme.border }, ticks: { color: theme.muted, callback: v => fmtShort(v) } },
    },
  };
  if (opts.y1) base.scales.y1 = { position: "right", grid: { display: false }, ticks: { color: theme.muted, callback: v => fmtShort(v) } };
  return base;
}

// ───────────────────────────────────────── TRANSACTIONS TABLE

function renderTxnTable() {
  const txns = getFiltered();
  txns.sort((a,b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === "amount") { va = +va; vb = +vb; }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const pages = Math.max(1, Math.ceil(txns.length / PAGE_SIZE));
  if (currentPage > pages) currentPage = pages;
  const slice = txns.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

  $("#txnCount").textContent = `${txns.length.toLocaleString()} total`;
  $("#txnBody").innerHTML = slice.map(t => {
    const cls = t.amount >= 0 ? "amt-pos" : "amt-neg";
    const sign = t.amount >= 0 ? "+" : "−";
    const taxTag = t.taxClaimable === true
      ? `<span class="tag tax-yes">✓ claim</span>`
      : t.taxClaimable === "wfh"
        ? `<span class="tag tax-yes">WFH</span>`
        : t.taxClaimable === "maybe"
          ? `<span class="tag" style="color:var(--warn)">maybe</span>`
          : "";
    return `<tr data-id="${t.id}">
      <td>${t.date}</td>
      <td><span class="tag bank-${t.bank === "commonwealth" ? "cba" : "wise"}">${t.bank === "commonwealth" ? "CBA" : "Wise"}</span></td>
      <td><span class="tag profile-${t.profile}">${t.profile}</span></td>
      <td title="${escapeHtml(t.raw || '')}">${escapeHtml(t.description)}</td>
      <td>${escapeHtml(t.category)}</td>
      <td class="ta-right ${cls}">${sign}${fmt(Math.abs(t.amount))}</td>
      <td>${taxTag}</td>
      <td><button class="icon-btn edit-btn" data-id="${t.id}">✎</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">No transactions match these filters.</td></tr>`;
  $("#pageInfo").textContent = `Page ${currentPage} of ${pages} (${txns.length.toLocaleString()})`;

  // Attach edit handlers
  $$(".edit-btn").forEach(b => b.addEventListener("click", () => openEditModal(b.dataset.id)));
}

// ───────────────────────────────────────── CATEGORIES VIEW

function renderCategoriesView() {
  const txns = getFiltered();
  const cats = categoryAggregate(txns);
  const total = Object.values(cats).reduce((s,v) => s+v, 0);
  const sorted = Object.entries(cats).sort((a,b) => b[1] - a[1]);
  $("#categoryBreakdown").innerHTML = sorted.map(([cat, v]) => {
    const pct = total ? (v/total)*100 : 0;
    const color = CATEGORY_DEFS[cat]?.color || "#888";
    return `<div class="cat-row">
      <div class="swatch" style="background:${color}"></div>
      <div><div>${escapeHtml(cat)}</div><div class="bar"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div></div>
      <div class="amt">${fmt(v)}</div>
      <div class="pct">${pct.toFixed(1)}%</div>
    </div>`;
  }).join("") || `<div class="muted">No expense data yet.</div>`;

  // Uncategorised
  const unc = txns.filter(t => t.category === "Uncategorised" && t.amount < 0);
  $("#uncategorisedList").innerHTML = unc.slice(0, 50).map(t =>
    `<div class="merchant-item" data-id="${t.id}" style="cursor:pointer">
      <div><div class="name">${escapeHtml(t.description)}</div><div class="meta">${t.date} · ${t.bank}</div></div>
      <div class="amt">${fmt(Math.abs(t.amount))}</div>
    </div>`
  ).join("") || `<div class="muted">All transactions categorised. </div>`;
  $$("#uncategorisedList .merchant-item").forEach(el => el.addEventListener("click", () => openEditModal(el.dataset.id)));

  // Rules
  $("#ruleCategory").innerHTML = Object.keys(CATEGORY_DEFS).map(c => `<option>${c}</option>`).join("");
  $("#ruleList").innerHTML = STATE.rules.map((r, i) =>
    `<div class="rule-item"><div><b>${escapeHtml(r.keyword)}</b> → ${escapeHtml(r.category)} ${r.taxClaimable ? "<span class='tag tax-yes'>tax</span>" : ""}</div>
    <button class="btn ghost small" onclick="removeRule(${i})">Delete</button></div>`
  ).join("") || `<div class="muted">No custom rules yet.</div>`;
}

function removeRule(i) {
  STATE.rules.splice(i, 1);
  saveState();
  renderAll();
}

// ───────────────────────────────────────── TAX VIEW

function renderTaxView() {
  const fy = currentFY();
  const fyTxns = STATE.transactions.filter(t => {
    const d = new Date(t.date); return d >= fy.start && d <= fy.end;
  });
  const tax = estimateAtoDeductions(fyTxns, STATE.settings);

  $("#taxClaimable").textContent = fmt(tax.totalClaimable);
  $("#taxClaimableSub").textContent = `${fy.label} (1 Jul ${fy.startYear} – 30 Jun ${fy.endYear})`;
  $("#taxWfh").textContent = fmt(tax.wfhClaimSelf + tax.wfhClaimWife);
  $("#taxWfhSub").textContent = `${(STATE.settings.wfhHoursSelf||0)+( STATE.settings.wfhHoursWife||0)} hr/wk × ${STATE.settings.wfhWeeks} wks × 70¢`;
  const refund = tax.totalClaimable * STATE.settings.rateSelf;
  $("#taxRefund").textContent = fmt(refund);

  const days = daysToEofy();
  $("#taxDays").textContent = days;
  $("#taxDaysSub").textContent = days < 60 ? "EOFY soon — finalise expenses" : days < 180 ? "plan ahead" : "early in FY";

  // EOFY Banner
  const banner = $("#eofyBanner");
  if (days < 14) {
    banner.className = "banner crit";
    banner.innerHTML = `<b>⚠ EOFY in ${days} days.</b> Finalise pre-paid claims (income protection, donations, super contributions). Lock in deductible purchases by 30 June.`;
  } else if (days < 60) {
    banner.className = "banner warn";
    banner.innerHTML = `<b>EOFY in ${days} days.</b> Review WFH hours log, gather receipts, consider pre-paying deductible expenses before 30 June.`;
  } else {
    banner.className = "banner";
    banner.innerHTML = `<b>${fy.label}</b> — ${days} days until 30 June ${fy.endYear}. Keep logging WFH hours; you currently project <b>${fmt(refund)}</b> in refund at your marginal rate.`;
  }

  // Breakdown table
  $("#taxBreakdownTable").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Deduction Type</th><th class="ta-right">Amount</th><th class="ta-right">Refund (your rate)</th></tr></thead>
      <tbody>
        ${Object.entries(tax.breakdown).sort((a,b) => b[1]-a[1]).map(([k,v]) =>
          `<tr><td>${escapeHtml(k)}</td><td class="ta-right">${fmt(v)}</td><td class="ta-right amt-pos">${fmt(v * STATE.settings.rateSelf)}</td></tr>`
        ).join("") || `<tr><td colspan="3" class="muted" style="text-align:center;padding:20px">No deductible expenses yet this FY.</td></tr>`}
        <tr style="font-weight:700;border-top:2px solid var(--border)">
          <td>TOTAL</td><td class="ta-right">${fmt(tax.totalClaimable)}</td><td class="ta-right amt-pos">${fmt(refund)}</td>
        </tr>
      </tbody>
    </table></div>
  `;

  // Suggested claims list
  const claims = fyTxns.filter(t => t.amount < 0 && (t.taxClaimable === true || t.taxClaimable === "wfh" || t.taxClaimable === "maybe"));
  $("#taxClaimList").innerHTML = claims.length
    ? claims.slice(0,50).map(t => `<div class="merchant-item"><div><div class="name">${escapeHtml(t.description)}</div><div class="meta">${t.date} · ${t.category}</div></div><div class="amt">${fmt(Math.abs(t.amount))}</div></div>`).join("")
    : `<div class="muted">No flagged deductible transactions yet.</div>`;

  // EOFY Checklist
  const checklistItems = [
    "Confirm WFH hours diary is complete and contemporaneous (not retrospective)",
    "Gather receipts/invoices for all work-related expenses over $300",
    "If using fixed-rate (70¢/hr) method, do NOT also claim phone/internet/electricity separately",
    `Review depreciation schedule for assets > $${ATO_RULES.immediateAssetDeduction} (laptops, monitors, office furniture)`,
    "Make charitable donations to DGR-listed organisations before 30 June for current FY claim",
    "Consider pre-paying income protection insurance premiums",
    "If eligible: make personal concessional super contribution and submit notice of intent",
    "Reconcile MAG transactions against bank statements before submitting",
    "Export tax claim PDF and share with your registered tax agent",
  ];
  $("#eofyChecklist").innerHTML = checklistItems.map(t => `<li><input type="checkbox" /><span>${t}</span></li>`).join("");
}

// ───────────────────────────────────────── FORECAST

function renderForecast() {
  const months = lastNMonths(12);
  const monthly = monthlyAggregate(STATE.transactions);
  const expSeries = months.map(m => monthly[m]?.expenses || 0);
  const incSeries = months.map(m => monthly[m]?.income || 0);

  // Seasonal monthly averages — for each calendar month, average across history
  const byCalMonth = {}; // {1..12: {exp: [], inc: []}}
  for (const k of Object.keys(monthly)) {
    const m = +k.split("-")[1];
    if (!byCalMonth[m]) byCalMonth[m] = { exp: [], inc: [] };
    byCalMonth[m].exp.push(monthly[k].expenses);
    byCalMonth[m].inc.push(monthly[k].income);
  }
  const seasonalExp = {}, seasonalInc = {};
  for (let m=1; m<=12; m++) {
    const arrE = (byCalMonth[m]?.exp || []);
    const arrI = (byCalMonth[m]?.inc || []);
    seasonalExp[m] = arrE.length ? arrE.reduce((a,b)=>a+b,0)/arrE.length : (expSeries.reduce((a,b)=>a+b,0)/Math.max(1,expSeries.length));
    seasonalInc[m] = arrI.length ? arrI.reduce((a,b)=>a+b,0)/arrI.length : (incSeries.reduce((a,b)=>a+b,0)/Math.max(1,incSeries.length));
  }
  // Linear trend on last 12 expenses
  const trendExp = linearTrend(expSeries);
  const trendInc = linearTrend(incSeries);

  const today = new Date();
  const forecasts = [];
  for (let i = 1; i <= 12; i++) {
    const dt = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const calMonth = dt.getMonth() + 1;
    const baseE = seasonalExp[calMonth] || 0;
    const baseI = seasonalInc[calMonth] || 0;
    const trendOffsetE = trendExp.slope * (expSeries.length + i);
    const trendOffsetI = trendInc.slope * (incSeries.length + i);
    const exp = Math.max(0, baseE + trendOffsetE * 0.5);
    const inc = Math.max(0, baseI + trendOffsetI * 0.5);
    const haveDataForMonth = (byCalMonth[calMonth]?.exp?.length || 0);
    const confidence = Math.min(100, haveDataForMonth * 40 + (expSeries.length * 4));
    forecasts.push({
      label: monthKey(dt),
      expenses: exp, income: inc, net: inc - exp, confidence,
    });
  }

  // Chart
  destroyChart("forecast");
  const labels = [...months, ...forecasts.map(f => f.label)];
  const histE = [...expSeries, ...Array(12).fill(null)];
  const histI = [...incSeries, ...Array(12).fill(null)];
  const futE = [...Array(12).fill(null), ...forecasts.map(f => f.expenses)];
  const futI = [...Array(12).fill(null), ...forecasts.map(f => f.income)];
  charts.forecast = new Chart($("#chartForecast"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Expenses (actual)", data: histE, borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.1)", tension: 0.3 },
        { label: "Expenses (forecast)", data: futE, borderColor: "#f87171", borderDash: [5,5], tension: 0.3 },
        { label: "Income (actual)", data: histI, borderColor: "#2dd4bf", backgroundColor: "rgba(45,212,191,0.1)", tension: 0.3 },
        { label: "Income (forecast)", data: futI, borderColor: "#2dd4bf", borderDash: [5,5], tension: 0.3 },
      ],
    },
    options: chartBase("currency"),
  });

  // Table
  $("#forecastBody").innerHTML = forecasts.map(f => {
    const netCls = f.net >= 0 ? "amt-pos" : "amt-neg";
    return `<tr>
      <td>${f.label}</td>
      <td class="ta-right">${fmt(f.expenses)}</td>
      <td class="ta-right">${fmt(f.income)}</td>
      <td class="ta-right ${netCls}">${fmt(f.net)}</td>
      <td class="ta-right">${f.confidence.toFixed(0)}%</td>
    </tr>`;
  }).join("");

  // Recurring detection
  const recurring = detectRecurring(STATE.transactions);
  $("#recurringList").innerHTML = recurring.length
    ? recurring.map(r => `<div class="merchant-item"><div><div class="name">${escapeHtml(r.merchant)}</div><div class="meta">${r.category} · every ~${r.avgDays} days · ${r.count} occurrences</div></div><div class="amt">${fmt(r.avgAmount)}/mo</div></div>`).join("")
    : `<div class="muted">No recurring patterns detected yet (need 3+ similar charges).</div>`;
}

function linearTrend(arr) {
  const n = arr.length;
  if (n < 2) return { slope: 0, intercept: arr[0] || 0 };
  const xs = arr.map((_,i) => i);
  const meanX = xs.reduce((a,b)=>a+b,0)/n;
  const meanY = arr.reduce((a,b)=>a+b,0)/n;
  let num = 0, den = 0;
  for (let i=0;i<n;i++) { num += (xs[i]-meanX)*(arr[i]-meanY); den += (xs[i]-meanX)**2; }
  const slope = den ? num/den : 0;
  return { slope, intercept: meanY - slope*meanX };
}

function detectRecurring(txns) {
  const groups = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const key = (t.description.split(/[-,/0-9]/)[0] || t.description).trim().toUpperCase().slice(0,30);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  const out = [];
  for (const [k, arr] of Object.entries(groups)) {
    if (arr.length < 3) continue;
    arr.sort((a,b) => new Date(a.date) - new Date(b.date));
    const gaps = [];
    for (let i=1;i<arr.length;i++) gaps.push((new Date(arr[i].date) - new Date(arr[i-1].date))/(1000*60*60*24));
    const avgDays = gaps.reduce((a,b)=>a+b,0)/gaps.length;
    if (avgDays > 45 || avgDays < 7) continue;
    const avgAmount = arr.reduce((s,t) => s+Math.abs(t.amount),0)/arr.length;
    out.push({ merchant: k, count: arr.length, avgDays: Math.round(avgDays), avgAmount, category: arr[0].category });
  }
  return out.sort((a,b) => b.avgAmount - a.avgAmount).slice(0, 15);
}

// ───────────────────────────────────────── ADVICE

function renderAdvice() {
  const months = lastNMonths(6);
  const monthly = monthlyAggregate(STATE.transactions);
  const recent = months.map(m => monthly[m]).filter(Boolean);
  const advice = [];

  if (recent.length === 0) {
    $("#adviceList").innerHTML = `<div class="muted">Upload a few months of data to get personalised advice.</div>`;
    $("#scoreNum").textContent = "--";
    $("#scoreBreakdown").innerHTML = "";
    return;
  }

  const avgInc = recent.reduce((s,m) => s+m.income, 0)/recent.length;
  const avgExp = recent.reduce((s,m) => s+m.expenses, 0)/recent.length;
  const savingsRate = avgInc > 0 ? ((avgInc - avgExp)/avgInc)*100 : 0;

  // Cat-level advice
  const lastMonth = monthly[lastNMonths(2)[0]] || { byCat: {} };
  const prevMonth = monthly[lastNMonths(3)[0]] || { byCat: {} };
  for (const [cat, val] of Object.entries(lastMonth.byCat || {})) {
    const prev = prevMonth.byCat?.[cat] || 0;
    if (prev > 0 && val > prev * 1.4 && val > 100) {
      advice.push({ title: `${cat} jumped ${Math.round(((val-prev)/prev)*100)}% last month`, body: `You spent ${fmt(val)} on ${cat}, up from ${fmt(prev)} prior month. Review whether this is a one-off.`, saving: val - prev });
    }
  }

  // Subscriptions
  const subTotal = (lastMonth.byCat?.["Subscriptions"]) || 0;
  if (subTotal > 80) {
    advice.push({ title: `Subscriptions cost ${fmt(subTotal)}/mo`, body: `That's ${fmt(subTotal*12)}/year. Audit your streaming/SaaS and cancel ones you don't actively use.`, saving: subTotal * 0.3 });
  }
  // Coffee
  const coffeeTotal = (lastMonth.byCat?.["Coffee"]) || 0;
  if (coffeeTotal > 100) advice.push({ title: `Coffee adds up`, body: `${fmt(coffeeTotal)} on coffee this month. Halving it = ${fmt(coffeeTotal*0.5*12)}/year saved.`, saving: coffeeTotal*0.5 });

  // Dining
  const dineTotal = (lastMonth.byCat?.["Dining Out"]) || 0;
  if (dineTotal > avgInc * 0.08) advice.push({ title: `Dining out is high relative to income`, body: `${fmt(dineTotal)} (${((dineTotal/avgInc)*100).toFixed(1)}% of income). Aim for ≤5%.`, saving: dineTotal * 0.3 });

  // Bank fees
  const feeTotal = (lastMonth.byCat?.["Bank Fees"]) || 0;
  if (feeTotal > 0) advice.push({ title: `You're paying bank fees`, body: `${fmt(feeTotal)} in fees this month. Most accounts can waive these — consider switching to a fee-free option.`, saving: feeTotal });

  // Savings rate
  if (savingsRate < 10) advice.push({ title: `Savings rate below 10%`, body: `Average ${savingsRate.toFixed(1)}% over last 6 months. Target 15–20% for healthy long-term position.`, saving: 0 });
  if (savingsRate > 25) advice.push({ title: `Excellent savings rate`, body: `Averaging ${savingsRate.toFixed(1)}%. Consider directing surplus to super (concessional cap = tax-effective) or ETF.`, saving: 0 });

  $("#adviceList").innerHTML = advice.length ? advice.map(a =>
    `<div class="advice-card"><div style="font-weight:700;margin-bottom:4px">${escapeHtml(a.title)}</div><div class="muted">${escapeHtml(a.body)}</div>${a.saving > 0 ? `<div class="savings" style="margin-top:6px">Potential annual savings: ${fmt(a.saving*12)}</div>` : ""}</div>`
  ).join("") : `<div class="muted">Your spending looks healthy this period.</div>`;

  // Score
  let score = 70;
  score += Math.min(20, savingsRate); // up to +20 for 20%+ savings rate
  score -= Math.min(20, advice.filter(a => a.saving > 0).length * 4);
  score = Math.max(0, Math.min(100, score));
  $("#scoreNum").textContent = Math.round(score);
  const circumference = 326;
  $("#scoreRing").setAttribute("stroke-dashoffset", circumference - (score/100)*circumference);
  // SVG gradient stroke
  ensureScoreGradient();

  $("#scoreBreakdown").innerHTML = `
    <div class="score-row"><span>Savings rate</span><b>${savingsRate.toFixed(1)}%</b></div>
    <div class="score-row"><span>Avg monthly income</span><b>${fmt(avgInc)}</b></div>
    <div class="score-row"><span>Avg monthly spend</span><b>${fmt(avgExp)}</b></div>
    <div class="score-row"><span>Issues flagged</span><b>${advice.filter(a => a.saving > 0).length}</b></div>
  `;
}

function ensureScoreGradient() {
  const svg = $("#scoreRing").ownerSVGElement;
  if (svg.querySelector("#scoreGrad")) return;
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  const grad = document.createElementNS(ns, "linearGradient");
  grad.id = "scoreGrad";
  grad.setAttribute("x1","0%"); grad.setAttribute("y1","0%");
  grad.setAttribute("x2","100%"); grad.setAttribute("y2","100%");
  const s1 = document.createElementNS(ns,"stop"); s1.setAttribute("offset","0%"); s1.setAttribute("stop-color","#667eea");
  const s2 = document.createElementNS(ns,"stop"); s2.setAttribute("offset","100%"); s2.setAttribute("stop-color","#2dd4bf");
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.appendChild(defs);
}

// ───────────────────────────────────────── SETTINGS

function renderSettings() {
  $("#setNameSelf").value = STATE.settings.nameSelf || "Self";
  $("#setNameWife").value = STATE.settings.nameWife || "Wife";
  $("#setRateSelf").value = STATE.settings.rateSelf;
  $("#setRateWife").value = STATE.settings.rateWife;
  $("#setWfhHoursSelf").value = STATE.settings.wfhHoursSelf;
  $("#setWfhHoursWife").value = STATE.settings.wfhHoursWife;
  $("#setWfhWeeks").value = STATE.settings.wfhWeeks;
  $("#setRemindersOn").checked = !!STATE.settings.remindersOn;

  // Account map
  const accounts = [...new Set(STATE.transactions.map(t => t.accountId))];
  $("#accountMap").innerHTML = accounts.length
    ? accounts.map(a => `
      <div class="rule-item">
        <div><b>${escapeHtml(a)}</b> · ${STATE.transactions.filter(t=>t.accountId===a).length} txns</div>
        <select onchange="STATE.accountMap['${a}']=this.value;saveState();renderAll();">
          <option value="self" ${STATE.accountMap[a]==='self'?'selected':''}>Self</option>
          <option value="wife" ${STATE.accountMap[a]==='wife'?'selected':''}>Wife</option>
          <option value="joint" ${STATE.accountMap[a]==='joint'?'selected':''}>Joint</option>
        </select>
      </div>`).join("")
    : `<div class="muted">No accounts mapped yet — upload your first CSV to see this.</div>`;
}

// ───────────────────────────────────────── FILTERS POPULATION

function populateFilters() {
  // FYs
  const fySet = new Set();
  const monthSet = new Set();
  const catSet = new Set();
  for (const t of STATE.transactions) {
    const d = new Date(t.date);
    fySet.add(fyOfDate(d).label);
    monthSet.add(monthKey(d));
    catSet.add(t.category);
  }
  fillSelect($("#filterFY"), [...fySet].sort().reverse(), "all", "All Time");
  fillSelect($("#filterMonth"), [...monthSet].sort().reverse(), "all", "All Months");
  fillSelect($("#filterCategory"), [...catSet].sort(), "all", "All Categories");
}

function fillSelect(sel, values, allValue, allLabel) {
  const current = sel.value;
  sel.innerHTML = `<option value="${allValue}">${allLabel}</option>` + values.map(v => `<option value="${v}">${v}</option>`).join("");
  if ([allValue, ...values].includes(current)) sel.value = current;
}

// ───────────────────────────────────────── EDIT MODAL

let editingId = null;
function openEditModal(id) {
  const t = STATE.transactions.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  $("#editDesc").value = t.description;
  $("#editCat").innerHTML = Object.keys(CATEGORY_DEFS).map(c => `<option ${c===t.category?'selected':''}>${c}</option>`).join("");
  $("#editProfile").value = t.profile;
  $("#editTax").checked = t.taxClaimable === true;
  $("#editRecurring").checked = !!t.recurring;
  $("#editNote").value = t.note || "";
  $("#editModal").hidden = false;
}
function closeEditModal() { $("#editModal").hidden = true; editingId = null; }

function saveEdit() {
  if (!editingId) return;
  const t = STATE.transactions.find(x => x.id === editingId);
  if (!t) return;
  t.description = $("#editDesc").value;
  t.category = $("#editCat").value;
  t.profile = $("#editProfile").value;
  t.taxClaimable = $("#editTax").checked;
  t.recurring = $("#editRecurring").checked;
  t.note = $("#editNote").value;
  saveState();
  closeEditModal();
  renderAll();
  toast("Transaction updated");
}
function deleteEdit() {
  if (!editingId) return;
  STATE.transactions = STATE.transactions.filter(x => x.id !== editingId);
  saveState();
  closeEditModal();
  renderAll();
  toast("Transaction deleted");
}

// ───────────────────────────────────────── PDF REPORTS

async function generatePDF(type) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // header
  doc.setFillColor(102, 126, 234);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("MAG", margin, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Personal Finance Report", margin, 60);
  doc.text(new Date().toLocaleString("en-AU"), pageW - margin - 130, 42);
  let y = 100;
  doc.setTextColor(20);

  if (type === "monthly") {
    const month = $("#filterMonth").value;
    const heading = month === "all" ? "All Months Summary" : `Monthly Report — ${month}`;
    doc.setFontSize(16); doc.setFont("helvetica","bold"); doc.text(heading, margin, y); y += 24;
    const txns = getFiltered();
    const inc = txns.filter(t => t.amount>0).reduce((s,t)=>s+t.amount,0);
    const exp = txns.filter(t => t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
    doc.setFontSize(11); doc.setFont("helvetica","normal");
    doc.text(`Income:   ${fmt(inc)}`, margin, y); y += 16;
    doc.text(`Expenses: ${fmt(exp)}`, margin, y); y += 16;
    doc.text(`Net:      ${fmt(inc - exp)}`, margin, y); y += 24;

    doc.setFont("helvetica","bold"); doc.text("Spending by Category", margin, y); y += 8;
    const cats = categoryAggregate(txns);
    doc.autoTable({
      startY: y,
      head: [["Category", "Amount", "% of Spend"]],
      body: Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,v]) => [c, fmt(v), exp ? ((v/exp)*100).toFixed(1)+"%" : "—"]),
      headStyles: { fillColor: [102,126,234] },
      styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 20;

    doc.setFont("helvetica","bold"); doc.text("Top Merchants", margin, y); y += 8;
    const merch = merchantAggregate(txns).slice(0, 15);
    doc.autoTable({
      startY: y,
      head: [["Merchant", "Transactions", "Total"]],
      body: merch.map(m => [m.name, m.count, fmt(m.total)]),
      headStyles: { fillColor: [102,126,234] },
      styles: { fontSize: 9 },
    });
  } else if (type === "fy") {
    const fy = currentFY();
    doc.setFontSize(16); doc.setFont("helvetica","bold");
    doc.text(`Financial Year Report — ${fy.label}`, margin, y); y += 24;
    const fyTxns = STATE.transactions.filter(t => { const d = new Date(t.date); return d>=fy.start && d<=fy.end; });
    const inc = fyTxns.filter(t => t.amount>0).reduce((s,t)=>s+t.amount,0);
    const exp = fyTxns.filter(t => t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
    const tax = estimateAtoDeductions(fyTxns, STATE.settings);
    const refund = tax.totalClaimable * STATE.settings.rateSelf;

    doc.setFontSize(11); doc.setFont("helvetica","normal");
    doc.text(`Period: 1 Jul ${fy.startYear} – 30 Jun ${fy.endYear}`, margin, y); y += 16;
    doc.text(`Income:                  ${fmt(inc)}`, margin, y); y += 16;
    doc.text(`Expenses:                ${fmt(exp)}`, margin, y); y += 16;
    doc.text(`Net:                     ${fmt(inc-exp)}`, margin, y); y += 16;
    doc.text(`Total ATO deductions:    ${fmt(tax.totalClaimable)}`, margin, y); y += 16;
    doc.text(`Estimated tax refund:    ${fmt(refund)}`, margin, y); y += 24;

    const monthly = monthlyAggregate(fyTxns);
    doc.setFont("helvetica","bold"); doc.text("Monthly Breakdown", margin, y); y += 8;
    doc.autoTable({
      startY: y,
      head: [["Month", "Income", "Expenses", "Net"]],
      body: Object.keys(monthly).sort().map(m => [m, fmt(monthly[m].income), fmt(monthly[m].expenses), fmt(monthly[m].net)]),
      headStyles: { fillColor: [102,126,234] },
      styles: { fontSize: 9 },
    });
  } else if (type === "tax") {
    const fy = currentFY();
    const fyTxns = STATE.transactions.filter(t => { const d = new Date(t.date); return d>=fy.start && d<=fy.end; });
    const tax = estimateAtoDeductions(fyTxns, STATE.settings);
    const refund = tax.totalClaimable * STATE.settings.rateSelf;

    doc.setFontSize(16); doc.setFont("helvetica","bold");
    doc.text(`Tax Claim Summary — ${fy.label}`, margin, y); y += 24;
    doc.setFontSize(10); doc.setFont("helvetica","normal");
    doc.text(`Prepared for: ${STATE.settings.nameSelf} (${(STATE.settings.rateSelf*100)}% marginal rate)`, margin, y); y += 14;
    doc.text(`WFH method: 70¢/hr fixed-rate. Self: ${STATE.settings.wfhHoursSelf}h × ${STATE.settings.wfhWeeks}wk = ${fmt(STATE.settings.wfhHoursSelf*STATE.settings.wfhWeeks*0.70)}`, margin, y); y += 14;
    doc.text(`Total claimable: ${fmt(tax.totalClaimable)} | Est refund: ${fmt(refund)}`, margin, y); y += 20;

    doc.setFont("helvetica","bold"); doc.text("Deduction Categories", margin, y); y += 8;
    doc.autoTable({
      startY: y,
      head: [["Category", "Amount", "Refund (your rate)"]],
      body: Object.entries(tax.breakdown).sort((a,b)=>b[1]-a[1]).map(([k,v]) => [k, fmt(v), fmt(v*STATE.settings.rateSelf)]),
      headStyles: { fillColor: [102,126,234] },
      styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 16;

    const claims = fyTxns.filter(t => t.amount<0 && (t.taxClaimable===true || t.taxClaimable==="wfh"));
    doc.setFont("helvetica","bold"); doc.text("Itemised Deductible Transactions", margin, y); y += 8;
    doc.autoTable({
      startY: y,
      head: [["Date","Description","Category","Amount"]],
      body: claims.map(t => [t.date, t.description.slice(0,42), t.category, fmt(Math.abs(t.amount))]),
      headStyles: { fillColor: [102,126,234] },
      styles: { fontSize: 8 },
    });
  }

  // Footer
  const pages = doc.internal.getNumberOfPages();
  for (let i=1;i<=pages;i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`MAG Personal Finance · Page ${i} of ${pages} · Generated ${new Date().toLocaleDateString("en-AU")}`,
      margin, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`MAG-${type}-${new Date().toISOString().slice(0,10)}.pdf`);
}

// ───────────────────────────────────────── UTIL: escapeHtml

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ───────────────────────────────────────── RENDER ALL

function renderAll() {
  populateFilters();
  renderKpis();
  renderCharts();
  renderTxnTable();
  renderCategoriesView();
  renderTaxView();
  renderForecast();
  renderAdvice();
  renderSettings();
  $("#emptyDashboard").hidden = STATE.transactions.length > 0;
}

// ───────────────────────────────────────── EVENT WIRING

function wireEvents() {
  // tabs
  $$(".tab").forEach(t => t.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const v = t.dataset.tab;
    $$(".view").forEach(x => x.classList.toggle("active", x.dataset.view === v));
  }));

  // upload modal
  $("#btnUpload").addEventListener("click", () => $("#uploadModal").hidden = false);
  $("#btnCloseUpload").addEventListener("click", () => $("#uploadModal").hidden = true);
  $("#dropzone").addEventListener("click", () => $("#csvFile").click());
  ["dragover","dragleave","drop"].forEach(ev => {
    $("#dropzone").addEventListener(ev, e => {
      e.preventDefault();
      $("#dropzone").classList.toggle("dragover", ev === "dragover");
      if (ev === "drop") handleFiles(e.dataTransfer.files);
    });
  });
  $("#csvFile").addEventListener("change", e => handleFiles(e.target.files));

  // filters
  ["filterProfile","filterBank","filterFY","filterMonth","filterCategory","filterType","filterSearch"]
    .forEach(id => $("#"+id).addEventListener("change", () => { currentPage = 1; renderAll(); }));
  $("#filterSearch").addEventListener("input", () => { currentPage = 1; renderAll(); });
  $("#btnClearFilters").addEventListener("click", () => {
    ["filterProfile","filterBank","filterFY","filterMonth","filterCategory","filterType"].forEach(id => $("#"+id).value = "all");
    $("#filterSearch").value = "";
    renderAll();
  });

  // pagination
  $("#prevPage").addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderTxnTable(); } });
  $("#nextPage").addEventListener("click", () => { currentPage++; renderTxnTable(); });

  // sortable headers
  $$("#txnTable th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.sort; if (!k) return;
    if (sortKey === k) sortDir = sortDir === "asc" ? "desc" : "asc"; else { sortKey = k; sortDir = "desc"; }
    renderTxnTable();
  }));

  // edit modal
  $("#btnCloseEdit").addEventListener("click", closeEditModal);
  $("#btnSaveTxn").addEventListener("click", saveEdit);
  $("#btnDeleteTxn").addEventListener("click", deleteEdit);

  // rules
  $("#btnAddRule").addEventListener("click", () => {
    const kw = $("#ruleKeyword").value.trim();
    const cat = $("#ruleCategory").value;
    const tx = $("#ruleTax").checked;
    if (!kw) return;
    STATE.rules.push({ keyword: kw, category: cat, taxClaimable: tx });
    saveState();
    // re-apply to existing transactions
    for (const t of STATE.transactions) {
      if (t.description.toLowerCase().includes(kw.toLowerCase())) {
        t.category = cat; t.taxClaimable = tx;
      }
    }
    saveState();
    $("#ruleKeyword").value = "";
    renderAll();
    toast("Rule added & applied to existing transactions");
  });

  // settings
  ["nameSelf","nameWife"].forEach(k => $("#set"+k[0].toUpperCase()+k.slice(1)).addEventListener("input", e => { STATE.settings[k]=e.target.value; saveState(); }));
  ["rateSelf","rateWife"].forEach(k => $("#set"+k[0].toUpperCase()+k.slice(1)).addEventListener("change", e => { STATE.settings[k]=+e.target.value; saveState(); renderAll(); }));
  ["wfhHoursSelf","wfhHoursWife","wfhWeeks"].forEach(k => $("#set"+k[0].toUpperCase()+k.slice(1)).addEventListener("input", e => { STATE.settings[k]=+e.target.value; saveState(); renderAll(); }));
  $("#setRemindersOn").addEventListener("change", e => { STATE.settings.remindersOn = e.target.checked; saveState(); });

  // export/import
  $("#btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `MAG-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  });
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    try {
      const data = JSON.parse(text);
      if (!data.transactions) throw new Error("not a MAG backup");
      if (!confirm(`Restore ${data.transactions.length} transactions? This overwrites current data.`)) return;
      STATE = { ...DEFAULT_STATE, ...data, settings: { ...DEFAULT_STATE.settings, ...(data.settings||{}) } };
      saveState(); renderAll(); toast("Backup restored");
    } catch (err) { toast("Invalid backup file: " + err.message, "error"); }
  });

  $("#btnExportCsv").addEventListener("click", exportCsv);
  $("#btnDeleteFiltered").addEventListener("click", () => {
    const f = getFiltered();
    if (!confirm(`Delete ${f.length} filtered transactions?`)) return;
    const ids = new Set(f.map(t => t.id));
    STATE.transactions = STATE.transactions.filter(t => !ids.has(t.id));
    saveState(); renderAll(); toast(`Deleted ${f.length} transactions`);
  });
  $("#btnBulkCategorise").addEventListener("click", () => {
    const f = getFiltered();
    let n = 0;
    for (const t of f) {
      const userMatch = STATE.rules.find(r => t.description.toLowerCase().includes(r.keyword.toLowerCase()));
      if (userMatch) { t.category = userMatch.category; t.taxClaimable = !!userMatch.taxClaimable; n++; continue; }
      const c = categoriseTransaction(t.description, t.amount);
      if (c.category !== t.category) { t.category = c.category; t.taxClaimable = c.taxClaimable; n++; }
    }
    saveState(); renderAll(); toast(`Re-categorised ${n} transactions`);
  });

  // PDF
  $("#btnPdfMonthly").addEventListener("click", () => generatePDF("monthly"));
  $("#btnPdfFY").addEventListener("click", () => generatePDF("fy"));
  $("#btnPdfTax").addEventListener("click", () => generatePDF("tax"));

  // Wipe
  $("#btnWipe").addEventListener("click", () => {
    if (!confirm("Erase ALL MAG data? This cannot be undone — export a backup first.")) return;
    localStorage.removeItem(STORAGE_KEY);
    STATE = JSON.parse(JSON.stringify(DEFAULT_STATE));
    renderAll(); toast("All data erased");
  });

  // close modals on backdrop click
  $$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.hidden = true; }));
}

async function handleFiles(files) {
  if (!files || !files.length) return;
  const profile = $("#uploadProfile").value;
  const bank = $("#uploadBank").value;
  const status = $("#uploadStatus");
  status.innerHTML = "";
  for (const f of files) {
    const line = document.createElement("div");
    line.className = "upload-line";
    line.textContent = `Processing ${f.name}…`;
    status.appendChild(line);
    const r = await processFile(f, bank, profile);
    if (r.ok) {
      line.className = "upload-line ok";
      line.textContent = `✓ ${r.file} (${r.bank}) — added ${r.added} new${r.duplicates ? `, skipped ${r.duplicates} duplicates` : ""}`;
      STATE.lastUpload = new Date().toISOString();
      STATE.uploadHistory.push({ file: r.file, bank: r.bank, added: r.added, when: STATE.lastUpload });
    } else {
      line.className = "upload-line err";
      line.textContent = `✗ ${r.file}: ${r.error}`;
    }
  }
  saveState();
  renderAll();
  toast("Upload complete — your dashboard is updated.");
}

function exportCsv() {
  const txns = getFiltered();
  const header = ["date","bank","profile","description","category","amount","tax_claimable","note"];
  const rows = [header.join(",")];
  for (const t of txns) {
    rows.push([t.date, t.bank, t.profile, `"${(t.description||"").replace(/"/g,'""')}"`, t.category, t.amount, t.taxClaimable, `"${(t.note||"").replace(/"/g,'""')}"`].join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `MAG-transactions-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

// ───────────────────────────────────────── BOOT
function boot() {
  $("#dateSub").textContent = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  wireEvents();
  renderAll();
}
document.addEventListener("DOMContentLoaded", boot);

// expose for inline handlers
window.removeRule = removeRule;
window.STATE = STATE;
window.saveState = saveState;
window.renderAll = renderAll;
