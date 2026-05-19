// MAG — monthly CSV reminder email sender
// Uses Resend.com (free tier = 3,000 emails/mo, 100/day) — no SMTP server needed.
// Setup: see README.md → "Email reminder setup".

const apiKey = process.env.RESEND_API_KEY;
const to = process.env.TO_EMAIL || "moggielton@gmail.com";
const from = process.env.FROM_EMAIL || "MAG <onboarding@resend.dev>"; // resend.dev is the free dev sender
const prevMonth = process.env.PREV_MONTH || new Date().toISOString().slice(0,7);
const magUrl = process.env.MAG_URL || "https://YOUR-GITHUB-USERNAME.github.io/MAG/";

if (!apiKey) {
  console.error("RESEND_API_KEY not set. Add it under repo → Settings → Secrets → Actions.");
  process.exit(78); // neutral exit so workflow doesn't go red on first-time setup
}

const subject = `MAG reminder · Upload your ${prevMonth} CSV`;

const html = `
<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6e9f5">
  <div style="max-width:560px;margin:0 auto;padding:30px 20px">
    <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:14px;padding:24px;text-align:center;color:white">
      <div style="font-size:28px;font-weight:800;letter-spacing:1px">MAG</div>
      <div style="opacity:.9;font-size:13px">Personal Finance · Monthly Reminder</div>
    </div>
    <div style="background:#141a2e;border:1px solid #232b48;border-radius:14px;padding:22px;margin-top:16px">
      <h2 style="margin:0 0 12px;font-size:18px">G'day — time to upload ${prevMonth} 📊</h2>
      <p style="line-height:1.6;color:#cdd3ec;margin:0 0 14px">
        Your <b>${prevMonth}</b> CSV files haven't been uploaded yet.
        Pull this month's statements from your two banks and drop them into MAG:
      </p>
      <ul style="line-height:1.8;color:#cdd3ec;padding-left:18px;margin:0 0 18px">
        <li><b>Commonwealth Bank</b> — NetBank → Statements → export to CSV</li>
        <li><b>Wise</b> — Statements → Download statement → CSV</li>
      </ul>
      <div style="text-align:center;margin:24px 0 8px">
        <a href="${magUrl}" style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Open MAG →</a>
      </div>
      <p style="color:#8892b6;font-size:12px;text-align:center;margin-top:16px">
        Reminders stop automatically once your ${prevMonth} CSV is uploaded.
      </p>
    </div>
    <div style="color:#5a6488;font-size:11px;text-align:center;margin-top:16px;line-height:1.5">
      MAG runs on GitHub Pages + GitHub Actions. Reminders managed by you in the repo.<br>
      To stop reminders entirely: disable the <code>Monthly CSV Reminder</code> workflow in GitHub Actions.
    </div>
  </div>
</body></html>
`;

async function send() {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("Resend error:", res.status, body);
    process.exit(1);
  }
  console.log("Sent reminder for", prevMonth, "→", to);
  console.log(body);
}

send().catch(err => { console.error(err); process.exit(1); });
