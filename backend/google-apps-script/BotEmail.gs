/** Send a plain-text bot message only to users in the roster. */
function botEmail_(p) {
  var secret = PropertiesService.getScriptProperties().getProperty("BOT_SHARED_SECRET");
  if (!secret || p.secret !== secret) return { ok: false, error: "forbidden" };
  if (!Array.isArray(p.userIds) || p.userIds.length < 1 || p.userIds.length > 20 ||
      p.userIds.some(function(id) { return (typeof id !== "string" && typeof id !== "number") || !String(id).trim(); }) ||
      typeof p.subject !== "string" || typeof p.body !== "string" || p.body.length > 2000 || /[\r\n]/.test(p.subject)) {
    return { ok: false, error: "bad_request" };
  }
  var subject = p.subject.indexOf("Pickle Bot: ") === 0 ? p.subject : "Pickle Bot: " + p.subject;
  if (subject.length > 120) return { ok: false, error: "bad_request" };
  var table = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(table.header), emails = Object.create(null);
  if (idx.UserId === undefined || idx.Email === undefined) throw new Error("Users missing UserId or Email");
  table.rows.forEach(function(row) {
    var id = String(row[idx.UserId] == null ? "" : row[idx.UserId]).trim();
    var email = String(row[idx.Email] == null ? "" : row[idx.Email]).trim();
    if (id && /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(email)) emails[id] = email;
  });
  var recipients = [], skipped = [], seen = Object.create(null);
  p.userIds.forEach(function(id) {
    var email = emails[String(id).trim()];
    if (!email) skipped.push(id);
    else if (!seen[email.toLowerCase()]) { seen[email.toLowerCase()] = true; recipients.push(email); }
  });
  if (MailApp.getRemainingDailyQuota() < recipients.length) return { ok: false, error: "quota" };
  if (recipients.length) {
    var owner = Session.getEffectiveUser().getEmail();
    MailApp.sendEmail({ to: owner, bcc: recipients.join(","), subject: subject, body: p.body, name: "Pickle Bot", replyTo: owner });
  }
  return { ok: true, sent: recipients.length, skipped: skipped };
}
