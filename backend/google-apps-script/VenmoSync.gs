/* Venmo notification reconciliation. Dry runs log once; a later live run still processes them. */
function parseVenmoSubject_(s) {
  var match = String(s || '').match(/^(.+?) paid you \$([\d,]+\.\d{2})/);
  return match ? { payer: match[1].trim(), amount: Number(match[2].replace(/,/g, '')) } : null;
}

function parseVenmoNote_(body) {
  var text = String(body || '').replace(/\r/g, '');
  var labeled = text.match(/(?:^|\n)\s*(?:note|message)\s*:\s*([^\n]*)/i);
  if (labeled) return labeled[1].trim();
  var quoted = text.match(/[“"]([^”"\n]+)[”"]/);
  return quoted ? quoted[1].trim() : text.trim();
}

function sessionDatesFromNote_(note, receivedDate) {
  var text = String(note || '').replace(/\+/g, ' '), dates = [], seen = {};
  function add(y, m, d) {
    var date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return;
    var key = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
    if (!seen[key]) { seen[key] = true; dates.push(key); }
  }
  var app = /\bPickleball\s+(\d{4})-(\d{2})-(\d{2})\s+\d{1,2}:\d{2}\b/gi, match;
  while ((match = app.exec(text))) add(Number(match[1]), Number(match[2]), Number(match[3]));
  // Remove ISO dates so their month/day components cannot be interpreted again.
  text = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  var shortDate = /(^|[^\d])([0-1]?\d)[\/-]([0-3]?\d)(?![\d\/-])/g;
  while ((match = shortDate.exec(text))) {
    var year = receivedDate.getFullYear(), month = Number(match[2]), day = Number(match[3]);
    var candidate = new Date(year, month - 1, day);
    var today = new Date(year, receivedDate.getMonth(), receivedDate.getDate());
    if (candidate > today) year--;
    add(year, month, day);
  }
  return dates;
}

function venmoUser_(payer, users, idx) {
  function normalize(value) { return String(value || '').trim().replace(/^@/, '').trim().toLowerCase(); }
  var target = normalize(payer), matches = users.filter(function (row) {
    return target && normalize(row[idx.Venmo]) === target && String(row[idx.UserId] || '').trim();
  });
  return matches.length === 1 ? String(matches[0][idx.UserId]).trim() : null;
}

function venmoPlan_(payer, amount, dates, users, userIdx, attendance, attIdx, statuses) {
  var userId = venmoUser_(payer, users, userIdx), remaining = Math.round(amount * 100), marked = [];
  if (!userId || !dates.length) return { result: 'review', rows: marked };
  attendance.forEach(function (row, i) {
    var date = parseSheetDate_(row[attIdx.Date]);
    if (!date && typeof row[attIdx.Date] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row[attIdx.Date].trim())) date = parseYmd_(row[attIdx.Date].trim());
    var key = date && date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
    var charge = Math.round(Number(row[attIdx.charge]) * 100), paid = Math.round(Number(row[attIdx.PAID] || 0) * 100);
    if (String(row[attIdx.UserId] || '').trim() !== userId || Number(row[attIdx.present]) !== 1 ||
        String(statuses[String(row[attIdx.ReservationId])] || '').trim().toLowerCase() !== 'reserved' ||
        dates.indexOf(key) === -1 || !isFinite(charge) || charge <= 0 || !isFinite(paid) || paid >= charge || remaining < charge) return;
    remaining -= charge;
    marked.push({ row: i + 2, charge: charge / 100 });
  });
  return { result: marked.length && remaining === 0 ? 'done' : 'review', rows: marked };
}

function venmoSync() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return; }
  try {
    var live = PropertiesService.getScriptProperties().getProperty('VENMO_SYNC_LIVE') === 'true';
    var ss = SpreadsheetApp.getActive(), log = ss.getSheetByName('VenmoLog');
    if (!log) log = ss.insertSheet('VenmoLog');
    if (log.getLastRow() === 0) log.appendRow(['MessageId', 'Received', 'Payer', 'Amount', 'Note', 'Result', 'RowsMarked', 'Mode']);
    var logValues = log.getDataRange().getValues(), seen = {};
    // Live runs skip only messages already handled live, so dry-run rows never block a real payment.
    for (var l = 1; l < logValues.length; l++) if (!live || logValues[l][7] === 'live') seen[String(logValues[l][0])] = true;
    var users = sheetByName('Users').getDataRange().getValues(), userIdx = headerIndexMap_(users.shift());
    var sheet = sheetByName('Attendance'), att = sheet.getDataRange().getValues(), attIdx = headerIndexMap_(att.shift());
    attIdx.present = attIdx['Present (1/0)'] !== undefined ? attIdx['Present (1/0)'] : attIdx.Present;
    attIdx.charge = attIdx['Charge (auto)'] !== undefined ? attIdx['Charge (auto)'] : attIdx.Charge;
    ['UserId', 'Venmo'].forEach(function (key) { if (userIdx[key] === undefined) throw new Error('Users missing ' + key); });
    ['Date', 'UserId', 'present', 'charge', 'PAID', 'ReservationId'].forEach(function (key) { if (attIdx[key] === undefined) throw new Error('Attendance missing ' + key); });
    var reservations = sheetByName('Reservations').getDataRange().getValues(), reservationIdx = headerIndexMap_(reservations.shift());
    if (reservationIdx.Id === undefined || reservationIdx.Status === undefined) throw new Error('Reservations missing Id or Status');
    var statuses = {};
    reservations.forEach(function (row) { statuses[String(row[reservationIdx.Id])] = String(row[reservationIdx.Status] || '').trim().toLowerCase(); });
    var threads = GmailApp.search('from:venmo@venmo.com newer_than:30d -label:venmo-done -label:venmo-review -label:venmo-skipped');
    var messages = [];
    threads.forEach(function (thread) { thread.getMessages().forEach(function (message) { messages.push({ thread: thread, message: message }); }); });
    messages.sort(function (a, b) { return a.message.getDate().getTime() - b.message.getDate().getTime(); });
    var threadResults = [];
    messages.forEach(function (item) {
      var message = item.message, id = message.getId();
      if (!/(?:^|[<\s])venmo@venmo\.com(?:>|$)/i.test(message.getFrom().trim()) || seen[id]) return;
      var parsed = parseVenmoSubject_(message.getSubject()), note = parsed ? parseVenmoNote_(message.getPlainBody()) : '';
      var plan = parsed ? venmoPlan_(parsed.payer, parsed.amount, sessionDatesFromNote_(note, message.getDate()), users, userIdx, att, attIdx, statuses) : { result: 'skipped', rows: [] };
      if (live) plan.rows.forEach(function (entry) { sheet.getRange(entry.row, attIdx.PAID + 1).setValue(entry.charge); att[entry.row - 2][attIdx.PAID] = entry.charge; });
      else plan.rows.forEach(function (entry) { att[entry.row - 2][attIdx.PAID] = entry.charge; });
      log.appendRow([id, message.getDate(), parsed ? parsed.payer : '', parsed ? parsed.amount : '', note, plan.result, plan.rows.length, live ? 'live' : 'dry']);
      seen[id] = true;
      threadResults.push({ thread: item.thread, result: plan.result });
    });
    // GmailApp labels threads, so apply labels after all messages in each thread are processed.
    if (live) threadResults.forEach(function (entry) {
      var name = 'venmo-' + entry.result, label = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
      entry.thread.addLabel(label);
    });
  } finally { lock.releaseLock(); }
}

function installVenmoTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) { if (trigger.getHandlerFunction() === 'venmoSync') ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('venmoSync').timeBased().everyMinutes(10).create();
}
