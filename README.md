# MAG — Personal Finance

Modern, mobile-friendly personal-finance dashboard for **Commonwealth Bank + Wise** with
Australian tax-claim recommendations (ATO rules), 12-month expense forecasting,
PDF reports, and an automatic monthly email reminder if you forget to upload a CSV.

- **All data stays on your device** (browser `localStorage`). The site is a static
  single-page app served from GitHub Pages — there is no backend, no account, no
  data transmitted anywhere.
- **Free infrastructure**: GitHub Pages (hosting) + GitHub Actions (email
  reminder) + Resend.com (3,000 free emails/month).
- **Installable** on iPhone/Android/laptop as a PWA — works offline.

## Quick start

### Option A — One-click deploy script (recommended, 2 min)

This does tasks 1 + 2 automatically. Open **PowerShell** in the MAG folder and run:

```powershell
cd "$env:USERPROFILE\Desktop\0 - Financial Report\Financial Report\MAG"
.\deploy.ps1
```

> First time only: install GitHub CLI with
> `winget install --id GitHub.cli` (Windows) or `brew install gh` (Mac).
> The script auto-installs/signs-in if needed and prints the live URL.

On Mac/Linux/WSL use `./deploy.sh` instead.

### Option B — Manual setup (if you don't want the CLI)

1. Sign in to GitHub as `moggielton@gmail.com`.
2. Click **+ → New repository** → name it `MAG` → set **Public** (required for free
   GitHub Pages) → **Create**.
3. On the new repo page click **uploading an existing file** and drag the entire
   `MAG` folder contents into the browser → **Commit changes**.
4. Repo → **Settings → Pages → Source = GitHub Actions** (NOT "Deploy from branch").
5. Wait ~1 minute. Live at `https://moggielton.github.io/MAG/`.

### Set up email reminders (5 min, after the deploy step above)

1. Sign up at <https://resend.com> (free) using `moggielton@gmail.com`.
2. After verifying email, go to **API Keys → Create API Key** (full access) →
   copy the key.
3. Back in GitHub → **Settings → Secrets and variables → Actions → New
   repository secret**. Add these three:

   | Name              | Value                                                  |
   | ----------------- | ------------------------------------------------------ |
   | `RESEND_API_KEY`  | (the key you just copied)                              |
   | `RESEND_FROM_EMAIL` | `MAG <onboarding@resend.dev>`                       |
   | `MAG_URL`         | `https://moggielton.github.io/MAG/`                    |

   `onboarding@resend.dev` is Resend's free sender — works without verifying a
   domain. If you have your own domain, add it in Resend and use a custom address.

4. (Optional) Test now: GitHub → **Actions → Monthly CSV Reminder → Run
   workflow**. You should get an email within ~30 seconds.

### Install as an app on your phone

- **iPhone (Safari)** → open the MAG URL → tap Share → **Add to Home Screen**.
- **Android (Chrome)** → open the MAG URL → menu → **Install app**.

The home-screen icon launches MAG full-screen, just like a native app.

## How to use it

1. **Upload CSV** (top-right button) → drop your Commonwealth Bank and/or Wise
   CSV files. MAG auto-detects the format and de-duplicates against transactions
   already loaded.
2. **Dashboard** — KPIs, cash flow, top categories, top merchants.
3. **Transactions** — searchable, sortable table. Click ✎ to fix a category,
   flag a transaction as tax-claimable, or add a note.
4. **Categories** — sees uncategorised transactions in one place. Add custom
   keyword rules to auto-categorise future uploads.
5. **Tax (ATO)** — current FY claimable total, estimated refund at your marginal
   rate, EOFY countdown, deduction breakdown, and the EOFY checklist.
6. **12-Month Forecast** — seasonal monthly prediction + linear trend, plus
   recurring-expense detection.
7. **Advice** — proactive suggestions on where to cut, with annual-savings dollar
   figures. Spending health score.
8. **Settings** — tax brackets and WFH hours for you and your wife, profile
   mapping per bank account, danger zone (wipe).
9. **Reports** (Settings tab) — download PDF for monthly summary, full FY, or
   tax claim itemisation.

## How the "stop reminders when uploaded" works

The simplest path (recommended):

- After you upload a CSV in MAG, your data is saved in the browser. Nothing
  is pushed to GitHub yet (your data stays private).
- Once a month, when you do upload, also drop the same CSV into a folder
  `data/uploads/<YYYY-MM>/` in the repo (via the GitHub web UI's drag-and-drop
  on the folder).
- The `stop-reminder-on-upload.yml` workflow notices the new file and writes a
  marker at `data/uploaded/<YYYY-MM>.txt`. The reminder workflow checks for that
  marker and skips emailing you for that month.

If you'd rather not push CSVs to GitHub at all, just commit an empty marker file
manually each month at `data/uploaded/2026-05.txt` etc.

## ATO tax rules used

- **Fixed-rate WFH method**: 70 ¢/hr — covers utilities, mobile/home internet,
  phone usage, electricity, gas, stationery, computer consumables (FY 2024-25
  and 2025-26).
- **$300 substantiation threshold**: total work-related expenses ≤ $300 don't
  need receipts (but you must still have actually incurred them and be able to
  explain the figure).
- **$300 immediate asset deduction**: individual assets under $300 are
  immediately deductible; over $300 must be depreciated.
- **Car**: cents/km method = 88 ¢/km up to 5,000 km/yr (FY 2024-25).
- **Categories defaulted to fully deductible** for PAYG employees: Work
  Equipment, Professional Development, Software/Tools, Union/Memberships,
  Charity/Donations (DGR), Home Office.

**Disclaimer**: MAG provides general guidance based on publicly available ATO
material. It is **not** personal tax advice. Confirm everything with a
registered tax agent or myTax. Keep records for **5 years**.

## File map

```
MAG/
├── index.html                 # the single-page app
├── styles.css
├── app.js                     # all UI + chart + PDF + forecast logic
├── categories.js              # AU merchant rules + ATO logic
├── manifest.json              # PWA manifest
├── sw.js                      # service worker (offline)
├── README.md                  # you are here
├── .gitignore
├── data/
│   ├── uploads/<YYYY-MM>/     # (optional) CSVs you drop here mark months done
│   └── uploaded/<YYYY-MM>.txt # marker files created by the workflow
├── scripts/
│   └── send-reminder.js       # Resend email sender used by GH Actions
└── .github/workflows/
    ├── deploy-pages.yml        # auto-publishes site on every push to main
    ├── email-reminder.yml      # 5th/12th/20th of every month
    └── stop-reminder-on-upload.yml
```

## Privacy

MAG never sends your transactions anywhere. The only outbound network traffic
from your browser is to the JS libraries on cdnjs (PapaParse, Chart.js, jsPDF)
when the page loads. Your CSVs are parsed locally and persisted in `localStorage`
on the device you're using. Use **Backup** (top nav) to download a JSON
snapshot for safekeeping.

## Updating MAG later

Edit any file via the GitHub web UI → **Commit changes** → the
`deploy-pages.yml` workflow auto-republishes in ~30 seconds. Refresh the
PWA on your phone to pick up changes.
