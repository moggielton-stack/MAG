// MAG categories.js — Australian-focused merchant/transaction categorisation rules.
// Each rule: { match: keywords (case-insensitive, any-match), category, taxClaimable, color }

const CATEGORY_DEFS = {
  // INCOME
  "Salary":            { color: "#22c55e", type: "income",  taxClaimable: false },
  "Refund":            { color: "#10b981", type: "income",  taxClaimable: false },
  "Interest Income":   { color: "#0ea5e9", type: "income",  taxClaimable: false },
  "Investment Income": { color: "#06b6d4", type: "income",  taxClaimable: false },
  "Government":        { color: "#84cc16", type: "income",  taxClaimable: false },
  "Other Income":      { color: "#65a30d", type: "income",  taxClaimable: false },

  // ESSENTIALS
  "Groceries":         { color: "#f59e0b", type: "expense" },
  "Rent / Mortgage":   { color: "#dc2626", type: "expense" },
  "Utilities":         { color: "#f97316", type: "expense", taxClaimable: "wfh" }, // partial deductible if WFH
  "Internet & Mobile": { color: "#fb923c", type: "expense", taxClaimable: "wfh" },
  "Insurance":         { color: "#ef4444", type: "expense" },

  // TRANSPORT
  "Public Transport":  { color: "#3b82f6", type: "expense" },
  "Fuel":              { color: "#2563eb", type: "expense" },
  "Car Expenses":      { color: "#1d4ed8", type: "expense" },
  "Rideshare / Taxi":  { color: "#1e40af", type: "expense" },
  "Travel":            { color: "#6366f1", type: "expense" },

  // LIFESTYLE
  "Dining Out":        { color: "#ec4899", type: "expense" },
  "Coffee":            { color: "#a855f7", type: "expense" },
  "Entertainment":     { color: "#d946ef", type: "expense" },
  "Subscriptions":     { color: "#c026d3", type: "expense" },
  "Shopping":          { color: "#e11d48", type: "expense" },
  "Personal Care":     { color: "#f43f5e", type: "expense" },
  "Health & Medical":  { color: "#14b8a6", type: "expense" },
  "Fitness":           { color: "#06b6d4", type: "expense" },

  // FINANCE
  "Bank Fees":         { color: "#737373", type: "expense" },
  "Tax Payment":       { color: "#525252", type: "expense" },
  "Transfers":         { color: "#94a3b8", type: "transfer" },
  "ATM Withdrawal":    { color: "#a3a3a3", type: "expense" },
  "Forex / Conversion":{ color: "#64748b", type: "expense" },

  // WORK / DEDUCTIBLE
  "Work Equipment":    { color: "#0d9488", type: "expense", taxClaimable: true },
  "Professional Development": { color: "#0891b2", type: "expense", taxClaimable: true },
  "Home Office":       { color: "#0e7490", type: "expense", taxClaimable: true },
  "Software / Tools":  { color: "#155e75", type: "expense", taxClaimable: true },
  "Union / Memberships": { color: "#0f766e", type: "expense", taxClaimable: true },
  "Charity / Donations": { color: "#16a34a", type: "expense", taxClaimable: true },

  // OTHER
  "Gifts":             { color: "#d4a373", type: "expense" },
  "Education":         { color: "#9333ea", type: "expense", taxClaimable: "maybe" },
  "Pets":              { color: "#a16207", type: "expense" },
  "Kids":              { color: "#facc15", type: "expense" },
  "Uncategorised":     { color: "#78716c", type: "expense" },
};

// Rules are evaluated in order; first match wins.
const CATEGORY_RULES = [
  // INCOME
  { match: ["salary", "payroll", "wages", "pay-direct credit", "direct credit salary"], category: "Salary" },
  { match: ["refund", "reversal", "refnd"], category: "Refund" },
  { match: ["interest paid", "interest credit"], category: "Interest Income" },
  { match: ["dividend", "asx", "stake", "vanguard distrib"], category: "Investment Income" },
  { match: ["centrelink", "ato", "tax refund", "medicare benefit"], category: "Government" },

  // GROCERIES
  { match: ["woolworths", "coles", "aldi", "iga", "harris farm", "foodland", "costco", "spar"], category: "Groceries" },
  { match: ["fresh market", "butcher", "greengrocer", "bakery"], category: "Groceries" },

  // RENT/MORTGAGE
  { match: ["rent ", "mortgage", "home loan", "real estate", "estate agent", "ray white", "lj hooker"], category: "Rent / Mortgage" },

  // UTILITIES (partial WFH deductible)
  { match: ["agl", "origin energy", "energyaustralia", "red energy", "alinta", "powershop", "ergon", "synergy", "actewagl"], category: "Utilities" },
  { match: ["sydney water", "yarra valley water", "seqwater", "water corp"], category: "Utilities" },

  // INTERNET / MOBILE (partial WFH deductible)
  { match: ["telstra", "optus", "vodafone", "tpg", "aussie broadband", "iinet", "belong", "kogan mobile", "amaysim", "boost mobile"], category: "Internet & Mobile" },

  // INSURANCE
  { match: ["bupa", "medibank", "hcf", "nib ", "ahm health", "private health"], category: "Insurance" },
  { match: ["nrma insurance", "aami", "allianz", "budget direct", "youi", "racv insur", "racq insur", "suncorp insur"], category: "Insurance" },

  // TRANSPORT
  { match: ["opal", "myki", "translink", "metro tasmania", "transperth"], category: "Public Transport" },
  { match: ["7-eleven", "bp ", "shell ", "caltex", "ampol", "united petroleum", "metro petroleum"], category: "Fuel" },
  { match: ["uber trip", "ola", "didi", "13 cabs", "silver service taxi"], category: "Rideshare / Taxi" },
  { match: ["nrma roadside", "racv", "racq", "rego", "vicroads", "service nsw"], category: "Car Expenses" },
  { match: ["qantas", "virgin australia", "jetstar", "rex airlines", "airbnb", "booking.com", "trip.com", "expedia", "agoda"], category: "Travel" },

  // FOOD & DRINK
  { match: ["uber eats", "doordash", "menulog", "deliveroo", "hungry jacks", "mcdonald", "kfc", "domino", "subway", "guzman", "grilld", "boost juice", "sushi hub"], category: "Dining Out" },
  { match: ["starbucks", "gloria jean", "the coffee club", "cafe ", "espresso", "barista"], category: "Coffee" },
  { match: ["restaurant", "bistro", "tavern", "hotel ", "rsl"], category: "Dining Out" },

  // ENTERTAINMENT
  { match: ["netflix", "spotify", "disney plus", "stan ", "binge", "kayo", "amazon prime", "youtube premium", "apple music", "apple tv"], category: "Subscriptions" },
  { match: ["event cinemas", "hoyts", "village cinemas", "imax", "ticketmaster", "ticketek", "moshtix"], category: "Entertainment" },
  { match: ["playstation", "xbox", "nintendo", "steam ", "epic games"], category: "Entertainment" },

  // SHOPPING
  { match: ["amazon", "ebay", "kmart", "target ", "big w", "myer", "david jones", "kogan", "catch.com"], category: "Shopping" },
  { match: ["bunnings", "ikea", "harvey norman", "jb hi-fi"], category: "Shopping" },

  // PERSONAL
  { match: ["chemist", "priceline", "pharmacy", "terry white"], category: "Personal Care" },
  { match: ["mecca", "sephora", "lush"], category: "Personal Care" },
  { match: ["hairdress", "barber", "nail bar", "beauty salon"], category: "Personal Care" },

  // HEALTH
  { match: ["medical centre", "doctor", "dental", "physio", "psychologist", "optometrist", "pathology", "radiology", "specsavers"], category: "Health & Medical" },
  { match: ["fitness first", "anytime fitness", "f45", "goodlife", "snap fitness", "yoga", "pilates", "crossfit"], category: "Fitness" },

  // FINANCE
  { match: ["monthly account fee", "atm fee", "overseas fee", "intl txn fee", "foreign currency fee", "annual fee"], category: "Bank Fees" },
  { match: ["atm withdrawal", "cash out", "withdrawal -"], category: "ATM Withdrawal" },
  { match: ["transfer to", "transfer from", "osko", "payid", "direct debit transfer", "internet transfer"], category: "Transfers" },
  { match: ["currency conversion", "exchange fee"], category: "Forex / Conversion" },

  // WORK / TAX DEDUCTIBLE
  { match: ["officeworks", "jb hi-fi business"], category: "Work Equipment" },
  { match: ["udemy", "coursera", "linkedin learning", "pluralsight", "skillshare", "masterclass"], category: "Professional Development" },
  { match: ["github", "adobe creative", "microsoft 365", "google workspace", "notion ", "figma", "jetbrains", "1password", "lastpass"], category: "Software / Tools" },
  { match: ["union dues", "professional membership", "cpa australia", "ca anz", "engineers australia", "ama membership", "rcsa", "australian computer society"], category: "Union / Memberships" },
  { match: ["red cross", "salvation army", "world vision", "unicef", "oxfam", "guide dogs", "rspca donation", "donat"], category: "Charity / Donations" },

  // EDUCATION
  { match: ["school fees", "tafe", "university", "tertiary", "hecs"], category: "Education" },

  // PETS
  { match: ["petbarn", "pet stock", "vet ", "veterinary"], category: "Pets" },

  // KIDS
  { match: ["childcare", "daycare", "kindergarten", "school canteen"], category: "Kids" },
];

// Australian Taxation Office rule set
const ATO_RULES = {
  fixedRateCentsPerHour: 0.70, // FY 2024-25 & 2025-26 fixed rate method (covers utilities, internet, phone, stationery, consumables)
  noReceiptThreshold: 300,     // total work expenses below $300 don't need receipts (still need to justify)
  immediateAssetDeduction: 300,// individual assets below $300 immediately deductible
  carCentsPerKm: 0.88,         // FY 2024-25 cents per km method (max 5000km/yr)
  fyStartMonth: 7,             // July
  fyEndDay: 30,                // 30 June
  // categories whose entire spend is deductible for PAYG employees
  fullyDeductibleCategories: [
    "Work Equipment", "Professional Development", "Software / Tools",
    "Union / Memberships", "Charity / Donations", "Home Office"
  ],
  // categories where a portion is deductible if WFH (covered by fixed-rate method — do NOT also claim if using fixed rate)
  wfhCategories: ["Utilities", "Internet & Mobile"],
};

function categoriseTransaction(description, amount) {
  if (!description) return { category: "Uncategorised", taxClaimable: false };
  const d = description.toLowerCase();

  // INCOME first (positive amounts)
  if (amount > 0) {
    for (const rule of CATEGORY_RULES) {
      if (rule.match.some(kw => d.includes(kw.toLowerCase()))) {
        const def = CATEGORY_DEFS[rule.category];
        if (def && def.type === "income") {
          return { category: rule.category, taxClaimable: false };
        }
      }
    }
    // Default income heuristics
    if (/credit|deposit|refund|transfer in/i.test(description)) return { category: "Other Income", taxClaimable: false };
    return { category: "Other Income", taxClaimable: false };
  }

  // EXPENSES
  for (const rule of CATEGORY_RULES) {
    if (rule.match.some(kw => d.includes(kw.toLowerCase()))) {
      const def = CATEGORY_DEFS[rule.category] || {};
      let taxClaimable = false;
      if (def.taxClaimable === true) taxClaimable = true;
      else if (def.taxClaimable === "wfh") taxClaimable = "wfh";
      else if (def.taxClaimable === "maybe") taxClaimable = "maybe";
      return { category: rule.category, taxClaimable };
    }
  }

  return { category: "Uncategorised", taxClaimable: false };
}

// Estimate ATO deductions for a set of transactions in a financial year
function estimateAtoDeductions(transactions, settings) {
  const breakdown = {};
  let totalClaimable = 0;

  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const def = CATEGORY_DEFS[t.category] || {};
    const claim = t.taxClaimableOverride !== undefined ? t.taxClaimableOverride : t.taxClaimable;
    if (claim === true || (claim === "maybe" && t.userConfirmed)) {
      const v = Math.abs(t.amount);
      breakdown[t.category] = (breakdown[t.category] || 0) + v;
      totalClaimable += v;
    }
  }

  // WFH fixed-rate method (covers utilities/internet/phone/consumables)
  const wfhHoursSelf = (settings.wfhHoursSelf || 0) * (settings.wfhWeeks || 46);
  const wfhHoursWife = (settings.wfhHoursWife || 0) * (settings.wfhWeeks || 46);
  const wfhClaimSelf = wfhHoursSelf * ATO_RULES.fixedRateCentsPerHour;
  const wfhClaimWife = wfhHoursWife * ATO_RULES.fixedRateCentsPerHour;

  breakdown["Home Office (70¢/hr fixed-rate)"] = (wfhClaimSelf + wfhClaimWife);
  totalClaimable += (wfhClaimSelf + wfhClaimWife);

  return { breakdown, totalClaimable, wfhClaimSelf, wfhClaimWife };
}

// Current financial year label and bounds (Australian)
function currentFY(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const startYear = (m >= 7) ? y : y - 1;
  const endYear = startYear + 1;
  return {
    label: `FY${String(startYear).slice(2)}-${String(endYear).slice(2)}`,
    start: new Date(startYear, 6, 1), // 1 July
    end: new Date(endYear, 5, 30, 23, 59, 59), // 30 June
    startYear, endYear,
  };
}

function fyOfDate(date) {
  return currentFY(date);
}

function daysToEofy(date = new Date()) {
  const fy = currentFY(date);
  const diff = fy.end - date;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
