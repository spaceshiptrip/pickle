/* Minimal Apps Script backend for Reservations + Attendance + Fees.
   Why: keeps persistence on Google Sheets while staying static-hosted. */

var ATTENDANCE_SHEET_NAME = 'Attendance';
var RESERVATIONS_SHEET_NAME = 'Reservations';
var FEES_SHEET_NAME = 'Fees';
var DEFAULT_HOURS = 2;

function doGet(e) {
  var action = (e.parameter.action || '').toLowerCase();
  if (action === 'listreservations') return json(listReservations());
  if (action === 'listattendance') return json(listAttendance_(e));
  return json({ ok: false, error: 'unknown_action' }, 400);
}

function doPost(e) {
  var action = (e.parameter.action || '').toLowerCase();
  var payload = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  if (action === 'signup') return json(signup_(payload));
  if (action === 'markpaid') return json(markPaid_(payload));
  if (action === 'upsertreservation') return json(upsertReservation_(payload));
  if (action === 'addfee') return json(addFee_(payload));
  return json({ ok: false, error: 'unknown_action' }, 400);
}

/** -------- Sheets helpers -------- */
function sheetByName(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

function headerIndexMap_(rowValues) {
  var map = {};
  for (var i = 0; i < rowValues.length; i++) map[rowValues[i]] = i;
  return map;
}

function readTable_(sheet) {
  var rng = sheet.getDataRange();
  var values = rng.getValues();
  if (values.length < 2) return { header: [], rows: [] };
  var header = values[0];
  var rows = values.slice(1).filter(function(r){ return r.join('').trim() !== ''; });
  return { header: header, rows: rows };
}

function upsertRowById_(sheet, idColName, rowObj) {
  var t = readTable_(sheet);
  var idx = headerIndexMap_(t.header);
  if (!(idColName in idx)) throw new Error('Missing ID column: ' + idColName);
  var idCol = idx[idColName];
  // find existing
  var foundRowIndex = -1; // 0-based in rows[]
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][idCol]) === String(rowObj[idColName])) { foundRowIndex = i; break; }
  }
  // ensure all header columns exist in rowObj
  var arr = t.header.map(function(h){ return rowObj[h] === undefined ? '' : rowObj[h]; });
  if (foundRowIndex >= 0) {
    sheet.getRange(foundRowIndex + 2, 1, 1, arr.length).setValues([arr]);
    return rowObj;
  }
  // append
  sheet.appendRow(arr);
  return rowObj;
}

function nextReservationId_() {
  var sh = sheetByName(RESERVATIONS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);
  var idCol = idx['Id'];
  var maxId = 0;
  for (var i=0;i<t.rows.length;i++){
    var v = Number(t.rows[i][idCol]);
    if (!isNaN(v) && v > maxId) maxId = v;
  }
  return String(maxId + 1);
}

/** -------- API impl -------- */
function listReservations() {
  var rs = sheetByName(RESERVATIONS_SHEET_NAME);
  var fs = sheetByName(FEES_SHEET_NAME);
  var rt = readTable_(rs);
  var ft = readTable_(fs);
  var rIdx = headerIndexMap_(rt.header);
  var fIdx = headerIndexMap_(ft.header);

  var feesByRes = {};
  for (var j=0;j<ft.rows.length;j++){
    var rId = String(ft.rows[j][fIdx['ReservationId']]);
    if (!feesByRes[rId]) feesByRes[rId] = [];
    feesByRes[rId].push({
      ReservationId: rId,
      FeeName: ft.rows[j][fIdx['FeeName']],
      Amount: Number(ft.rows[j][fIdx['Amount']]) || 0
    });
  }

  var items = rt.rows.map(function(r){
    var id = String(r[rIdx['Id']]);
    return {
      Id: id,
      Date: r[rIdx['Date']],      // yyyy-mm-dd
      Start: r[rIdx['Start']],    // HH:MM
      End: r[rIdx['End']],        // HH:MM
      Court: r[rIdx['Court']],
      Capacity: Number(r[rIdx['Capacity']]) || 0,
      BaseFee: Number(r[rIdx['BaseFee']]) || 0,
      Fees: feesByRes[id] || []
    };
  });
  return { ok: true, reservations: items };
}

function listAttendance_(e) {
  var resId = e.parameter.reservationId;
  var month = e.parameter.month; // YYYY-MM (optional) parameter for reports

  var at = readTable_(sheetByName(ATTENDANCE_SHEET_NAME));
  if (at.rows.length === 0) return { ok: true, attendees: [] };
  var idx = headerIndexMap_(at.header);

  // Filter
  var rows = at.rows.filter(function(r){
    // If reservationId is specific, match it
    if (resId) return String(r[idx['ReservationId']]) === String(resId);
    
    // If looking for a specific month (format YYYY-MM)
    if (month) {
      // Date in sheet is usually a Date object or string YYYY-MM-DD
      var d = r[idx['Date']];
      var ds = (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM') : String(d).substring(0, 7);
      return ds === month;
    }
    
    // Otherwise return everything (careful with large datasets)
    return true;
  }).map(function(r){
    return {
      Date: r[idx['Date']],
      Hours: r[idx['Hours']],
      Player: r[idx['Player Name']],
      Present: r[idx['Present (1/0)']],
      Charge: Number(r[idx['Charge (auto)']]) || 0,
      PAID: String(r[idx['PAID']]) === '1',
      ReservationId: r[idx['ReservationId']]
    };
  });
  return { ok: true, attendees: rows };
}

function signup_(payload) {
  // payload: { reservationId, players: [name], markPaid, totalAmount }
  if (!payload || !payload.reservationId || !payload.players || payload.players.length===0)
    return { ok: false, error: 'bad_request' };

  var res = findReservation_(payload.reservationId);
  if (!res) return { ok: false, error: 'reservation_not_found' };

  var attendees = readTable_(sheetByName(ATTENDANCE_SHEET_NAME));
  var idx = headerIndexMap_(attendees.header);

  var totalFees = res.BaseFee + sum_(res.Fees.map(function(f){ return Number(f.Amount)||0; }));
  var perPlayer = round2_((payload.totalAmount || totalFees) / payload.players.length);

  var rowsToAppend = payload.players.map(function(p){
    var row = {};
    attendees.header.forEach(function(h){ row[h] = ''; });
    row['Date'] = res.Date;
    row['Hours'] = DEFAULT_HOURS;
    row['Player Name'] = p;
    row['Present (1/0)'] = 1;
    row['Charge (auto)'] = perPlayer;
    row['PAID'] = payload.markPaid ? 1 : 0;
    row['ReservationId'] = res.Id;
    return attendees.header.map(function(h){ return row[h]; });
  });

  if (rowsToAppend.length > 0) {
    var sh = sheetByName(ATTENDANCE_SHEET_NAME);
    sh.getRange(sh.getLastRow()+1, 1, rowsToAppend.length, attendees.header.length).setValues(rowsToAppend);
  }
  return { ok: true, perPlayer: perPlayer };
}

function markPaid_(payload) {
  // payload: { reservationId, player, paid: true/false }
  var at = readTable_(sheetByName(ATTENDANCE_SHEET_NAME));
  var idx = headerIndexMap_(at.header);
  var sh = sheetByName(ATTENDANCE_SHEET_NAME);
  for (var i=0;i<at.rows.length;i++){
    var r = at.rows[i];
    if (String(r[idx['ReservationId']]) === String(payload.reservationId) &&
        String(r[idx['Player Name']]).trim().toLowerCase() === String(payload.player).trim().toLowerCase()) {
      var rowNum = i + 2;
      var colNum = idx['PAID'] + 1;
      sh.getRange(rowNum, colNum).setValue(payload.paid ? 1 : 0);
      return { ok: true };
    }
  }
  return { ok: false, error: 'player_not_found' };
}

function upsertReservation_(payload) {
  // payload: { Id? , Date, Start, End, Court, Capacity, BaseFee }
  var sh = sheetByName(RESERVATIONS_SHEET_NAME);
  var row = {
    'Id': payload.Id || nextReservationId_(),
    'Date': payload.Date,
    'Start': payload.Start,
    'End': payload.End,
    'Court': payload.Court,
    'Capacity': payload.Capacity,
    'BaseFee': payload.BaseFee
  };
  upsertRowById_(sh, 'Id', row);
  return { ok: true, reservation: row };
}

function addFee_(payload) {
  // payload: { ReservationId, FeeName, Amount }
  var sh = sheetByName(FEES_SHEET_NAME);
  sh.appendRow([payload.ReservationId, payload.FeeName, payload.Amount]);
  return { ok: true };
}

function findReservation_(id) {
  var rs = readTable_(sheetByName(RESERVATIONS_SHEET_NAME));
  var idx = headerIndexMap_(rs.header);
  for (var i=0;i<rs.rows.length;i++){
    var r = rs.rows[i];
    if (String(r[idx['Id']]) === String(id)) {
      return {
        Id: String(r[idx['Id']]),
        Date: r[idx['Date']],
        Start: r[idx['Start']],
        End: r[idx['End']],
        Court: r[idx['Court']],
        Capacity: Number(r[idx['Capacity']]) || 0,
        BaseFee: Number(r[idx['BaseFee']]) || 0,
        Fees: listFeesFor_(String(r[idx['Id']]))
      };
    }
  }
  return null;
}

function listFeesFor_(reservationId) {
  var fs = readTable_(sheetByName(FEES_SHEET_NAME));
  var idx = headerIndexMap_(fs.header);
  return fs.rows
    .filter(function(r){ return String(r[idx['ReservationId']]) === reservationId; })
    .map(function(r){ return { ReservationId: reservationId, FeeName: r[idx['FeeName']], Amount: Number(r[idx['Amount']]) || 0 }; });
}

function json(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sum_(arr){ return arr.reduce(function(a,b){ return a+(Number(b)||0); }, 0); }
function round2_(n){ return Math.round((Number(n)||0)*100)/100; }

/** ---- Setup note (one-time) ----
Create these headers exactly:

Reservations:  Id | Date | Start | End | Court | Capacity | BaseFee
Attendance:    Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID | ReservationId
Fees:          ReservationId | FeeName | Amount
*/
