/** Read-only, minimal feed for the notifier. */
function botFeed_(p) {
  var secret = PropertiesService.getScriptProperties().getProperty("BOT_SHARED_SECRET");
  if (!secret || p.secret !== secret) return { ok: false, error: "forbidden" };
  function validDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  if (!validDate(p.fromDate) || !validDate(p.toDate)) return { ok: false, error: "bad_request" };
  var span = (new Date(p.toDate + "T00:00:00Z") - new Date(p.fromDate + "T00:00:00Z")) / 86400000;
  if (span < 0 || span >= 45) return { ok: false, error: "bad_request" };
  var tz = Session.getScriptTimeZone();
  function dateString(v) {
    if (typeof v === "string" && validDate(v.trim())) return v.trim();
    var d = parseSheetDate_(v);
    return d && !isNaN(d.getTime()) ? Utilities.formatDate(d, tz, "yyyy-MM-dd") : "";
  }
  function timeString(v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, "HH:mm");
    var s = String(v == null ? "" : v).trim();
    var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!m) return s;
    var h = Number(m[1]);
    if (m[3]) h = h % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0);
    return ("0" + h).slice(-2) + ":" + m[2];
  }
  function value(r, idx, name) { return idx[name] === undefined ? "" : r[idx[name]]; }
  function str(v) { return String(v == null ? "" : v).trim(); }
  var rt = readTable_(sheetByName(RESERVATIONS_SHEET_NAME));
  var ri = headerIndexMap_(rt.header), ids = Object.create(null), sessions = [];
  rt.rows.forEach(function(r) {
    var date = dateString(value(r, ri, "Date")), id = str(value(r, ri, "Id"));
    if (!id || !date || date < p.fromDate || date > p.toDate) return;
    ids[id] = true;
    sessions.push({ id: id, date: date, start: timeString(value(r, ri, "Start")), end: timeString(value(r, ri, "End")), court: str(value(r, ri, "Court")), status: str(value(r, ri, "Status")) });
  });
  // Read raw values to retain actual sheet row numbers, including blank rows.
  var av = sheetByName(ATTENDANCE_SHEET_NAME).getDataRange().getValues();
  var ai = headerIndexMap_(av[0] || []), rows = [], userIds = Object.create(null);
  for (var i = 1; i < av.length; i++) {
    var r = av[i], id = str(value(r, ai, "ReservationId"));
    if (!ids[id]) continue;
    var uid = str(value(r, ai, "UserId"));
    if (uid) userIds[uid] = true;
    rows.push({ row: i + 1, date: dateString(value(r, ai, "Date")), reservationId: id, name: str(value(r, ai, "Player Name")), userId: uid, present: Number(value(r, ai, "Present (1/0)")) === 1 ? 1 : 0, charge: num_(value(r, ai, "Charge (auto)")), paid: num_(value(r, ai, "PAID")) });
  }
  var ut = readTable_(sheetByName(USERS_SHEET_NAME)), ui = headerIndexMap_(ut.header), users = [];
  ut.rows.forEach(function(r) {
    var uid = str(value(r, ui, "UserId"));
    if (!userIds[uid]) return;
    users.push({ userId: uid, name: str(value(r, ui, "Name")), firstName: str(value(r, ui, "FirstName")), phone: str(value(r, ui, "Phone")).replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim(), textVia: str(value(r, ui, "TextVia")), gameTexts: str(value(r, ui, "GameTexts")) });
  });
  return { ok: true, generatedAt: new Date().toISOString(), sessions: sessions, rows: rows, users: users };
}

/** Read-only routing roster; email addresses and credentials stay private. */
function botRoster_(p) {
  var secret = PropertiesService.getScriptProperties().getProperty("BOT_SHARED_SECRET");
  if (!secret || p.secret !== secret) return { ok: false, error: "forbidden" };
  var table = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(table.header);
  function value(row, key) { return idx[key] === undefined ? "" : row[idx[key]]; }
  function str(v) { return String(v == null ? "" : v).trim(); }
  var users = table.rows.map(function(row) {
    var email = str(value(row, "Email")).toLowerCase();
    var active = str(value(row, "Active")).toLowerCase();
    return {
      userId: str(value(row, "UserId")),
      name: str(value(row, "Name")),
      firstName: str(value(row, "FirstName")),
      role: str(value(row, "Role")).toLowerCase(),
      active: active === "1" || active === "true",
      phone: str(value(row, "Phone")).replace(/\D/g, ""),
      textVia: str(value(row, "TextVia")),
      hasEmail: !!email,
      emailSha256: email ? sha256Hex_(email) : "",
      household: str(value(row, "Household"))
    };
  });
  return { ok: true, users: users };
}
