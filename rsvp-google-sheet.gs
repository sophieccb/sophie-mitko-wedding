/**
 * Sophie & Dimitar – R.S.V.P. receiver
 *
 * Paste this whole file into your Google Sheet:
 *   Extensions → Apps Script → replace everything in Code.gs → Save
 * First time: Deploy → New deployment → type "Web app"
 *   Execute as: Me
 *   Who has access: Anyone
 * Updating later: Deploy → Manage deployments → pencil (Edit) → Version: "New version" → Deploy
 *   (keeps the same /exec link, so the website keeps working)
 *
 * Every reply from the website becomes a new row on a tab called "RSVPs",
 * and the guest gets a confirmation email in the language they used.
 */

// ---- Settings you can change ----
const SEND_CONFIRMATION = true;              // set to false to stop confirmation emails
const SENDER_NAME = "Sophie & Dimitar";      // the "from" name guests see
const SITE_URL = "";                         // optional: your website address, shown as a link in the email

const SHEET_NAME = "RSVPs";
const HEADERS = [
  "Submitted", "Name", "Attending", "Email", "Guests",
  "Guest names", "Dietary", "Dietary details", "Message", "Language", "Confirmation email"
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // two guests replying at the same moment won't overwrite each other
  try {
    const data = JSON.parse(e.postData.contents);

    // Spam bots fill in the hidden "_gotcha" field – quietly ignore them.
    if (data._gotcha) return json({ ok: true });

    // Send the confirmation first so its result can be noted in the sheet.
    // If the email fails for any reason, the reply is still saved.
    let emailStatus = "Off";
    if (SEND_CONFIRMATION) {
      try {
        emailStatus = sendConfirmation_(data) ? "Sent" : "Skipped (no valid email)";
      } catch (err) {
        emailStatus = "Failed: " + String(err).slice(0, 120);
      }
    }

    const sheet = getSheet_();
    sheet.appendRow([
      new Date(),
      clean_(data.name),
      clean_(data.attending),
      clean_(data.email),
      Number(data.guests_count) || 0,
      clean_(data.guest_names),
      clean_(data.dietary),
      clean_(data.dietary_details),
      clean_(data.message),
      clean_(data.language),
      emailStatus
    ]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the Web app URL in a browser shows this – handy to check it's live.
function doGet() {
  return json({ ok: true, message: "R.S.V.P. receiver is running." });
}

// ---------------------------------------------------------------------------
// Confirmation email
// ---------------------------------------------------------------------------

const TEXT = {
  English: {
    subject: "Your R.S.V.P. – Sophie & Dimitar, 14.08.27",
    hello: name => `Dear ${name},`,
    yes: "Thank you for your R.S.V.P. – we can’t wait to celebrate with you on the 14th of August 2027 at the Hyatt Regency, Pravets!",
    no: "Thank you for letting us know. We’ll miss you – and we’ll raise a glass to you on the day!",
    summary: "Here’s what you told us:",
    attending: "Attending", yesWord: "Yes", noWord: "No",
    guests: "Guests", guestNames: "Guest names", dietary: "Dietary needs", message: "Your message",
    none: "None",
    change: "If anything changes, just reply to this email or message Sophie or Mitko on WhatsApp.",
    site: "Wedding website",
    signoff: "With love,",
    names: "Sophie & Dimitar"
  },
  Bulgarian: {
    subject: "Вашият отговор – Софи и Димитър, 14.08.27",
    hello: name => `Здравейте, ${name},`,
    yes: "Благодарим ви за отговора – нямаме търпение да празнуваме заедно на 14 август 2027 г. в Хаят Риджънси, Правец!",
    no: "Благодарим ви, че ни уведомихте. Ще ни липсвате – ще вдигнем тост за вас!",
    summary: "Ето какво ни написахте:",
    attending: "Присъствие", yesWord: "Да", noWord: "Не",
    guests: "Гости", guestNames: "Имена на гостите", dietary: "Хранителни нужди", message: "Вашето послание",
    none: "Няма",
    change: "Ако нещо се промени, просто отговорете на този имейл или пишете на Софи или Митко в WhatsApp.",
    site: "Сватбен сайт",
    signoff: "С любов,",
    names: "Софи и Димитър"
  }
};

function sendConfirmation_(data) {
  const to = String(data.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200) return false;

  const t = TEXT[data.language] || TEXT.English;
  const coming = data.attending === "Yes";
  const firstName = String(data.name || "").trim().split(/\s+/)[0].slice(0, 60) || "";

  const rows = [[t.attending, coming ? t.yesWord : t.noWord]];
  if (coming) {
    rows.push([t.guests, String(Number(data.guests_count) || 0)]);
    if (data.guest_names) rows.push([t.guestNames, data.guest_names]);
    rows.push([t.dietary, data.dietary === "Yes" ? (data.dietary_details || t.yesWord) : t.none]);
  }
  if (data.message) rows.push([t.message, data.message]);

  // Plain-text version (for email apps that don't show formatting)
  const plain = [
    t.hello(firstName), "",
    coming ? t.yes : t.no, "",
    t.summary,
    ...rows.map(([k, v]) => `• ${k}: ${limit_(v)}`), "",
    t.change,
    SITE_URL ? `${t.site}: ${SITE_URL}` : null,
    "", t.signoff, t.names
  ].filter(line => line !== null).join("\n");

  // Styled version, in the website's colours and font
  const ink = "#7E8CA2", text = "#6F7A8C";
  const rowHtml = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 14px 6px 0;color:${ink};font-style:italic;font-weight:bold;vertical-align:top;white-space:nowrap">${esc_(k)}</td>` +
    `<td style="padding:6px 0;color:${text};vertical-align:top">${esc_(limit_(v)).replace(/\n/g, "<br>")}</td></tr>`
  ).join("");
  const html =
`<div style="background:#FAF8EF;padding:32px 16px;font-family:'Playfair Display',Georgia,serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #DDE1E8;border-radius:20px;padding:36px 32px;text-align:center;">
    <div style="font-style:italic;font-weight:bold;font-size:30px;color:${ink};letter-spacing:-1px;">${esc_(t.names)}</div>
    <div style="font-style:italic;font-size:16px;color:${ink};margin-top:2px;">14.08.27</div>
    <div style="width:60px;height:1px;background:#C9D0DA;margin:22px auto;"></div>
    <p style="font-size:17px;color:${text};margin:0 0 14px;">${esc_(t.hello(firstName))}</p>
    <p style="font-size:17px;line-height:1.55;color:${text};margin:0 0 24px;">${esc_(coming ? t.yes : t.no)}</p>
    <p style="font-style:italic;font-weight:bold;color:${ink};font-size:17px;margin:0 0 8px;">${esc_(t.summary)}</p>
    <table style="margin:0 auto 24px;font-size:15px;text-align:left;border-collapse:collapse;">${rowHtml}</table>
    <p style="font-size:14px;line-height:1.5;color:${text};margin:0 0 20px;">${esc_(t.change)}</p>
    ${SITE_URL ? `<p style="margin:0 0 20px;"><a href="${esc_(SITE_URL)}" style="color:${ink};">${esc_(t.site)}</a></p>` : ""}
    <p style="font-style:italic;color:${ink};font-size:16px;margin:0;">${esc_(t.signoff)}<br><b>${esc_(t.names)}</b></p>
  </div>
</div>`;

  MailApp.sendEmail({
    to: to,
    subject: t.subject,
    body: plain,
    htmlBody: html,
    name: SENDER_NAME
  });
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  } else if (sheet.getRange(1, HEADERS.length).getValue() === "") {
    // sheet created by the earlier version: add the new "Confirmation email" column header
    sheet.getRange(1, HEADERS.length).setValue(HEADERS[HEADERS.length - 1]).setFontWeight("bold");
  }
  return sheet;
}

// Keep entries tidy and stop anything that looks like a spreadsheet formula
// (e.g. text starting with "=") from being run when it lands in the sheet.
function clean_(value) {
  const text = String(value == null ? "" : value).trim().slice(0, 2000);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function limit_(value) {
  return String(value == null ? "" : value).trim().slice(0, 1000);
}

function esc_(value) {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
