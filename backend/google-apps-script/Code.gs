/* Minimal Apps Script backend for Reservations + Attendance + Fees + Basic Auth.
   Persistence: Google Sheets. Frontend: static GitHub Pages. */

var ATTENDANCE_SHEET_NAME = 'Attendance';
var RESERVATIONS_SHEET_NAME = 'Reservations';
var FEES_SHEET_NAME = 'Fees';
var DEFAULT_HOURS = 2;

// New auth-related sheets
var USERS_SHEET_NAME = 'Users';
var AUTHTOKENS_SHEET_NAME = 'AuthTokens';
var SESSIONS_SHEET_NAME = 'Sessions';

// Magic link settings
var MAGIC_LINK_TTL_MIN = 15; // minutes
var APP_PUBLIC_BASE_URL = 'https://pickle.nadabarkada.com'; // used in the email link

// Session settings
var SESSION_TTL_DAYS = 30;

// Secret salt used for PIN hashing. Set once using setPinSalt_() (see helper at bottom).
var PIN_SALT_PROPERTY_KEY = 'PIN_SALT_V1';

function doGet(e) {
  var action = getAction_(e, null);

  // Existing GET actions
  if (action === 'listreservations') return json_(listReservations());
  if (action === 'listattendance') return json_(listAttendance_(e));

  // Optional: allow token consumption via GET link
  // /exec?action=auth.consumetoken&token=...
  if (action === 'auth.consumetoken') {
    try {
      var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
      var data = auth_consumeToken_({ token: token });
      return json_({ ok: true, session: data.session });
    } catch (err) {
      return json_({ ok: false, error: String(err) }, 400);
    }
  }

  return json_({ ok: false, error: 'unknown_action' }, 400);
}

function doPost(e) {
  var payload = parseBody_(e);
  var action = getAction_(e, payload);

  // Existing POST actions
  if (action === 'signup') return json_(signup_(payload));
  if (action === 'markpaid') return json_(markPaid_(payload));
  if (action === 'upsertreservation') return json_(upsertReservation_(payload));
  if (action === 'addfee') return json_(addFee_(payload));

  // New auth actions (recommended to call with JSON {action:"auth.loginWithPin", ...})
  if (action === 'auth.loginwithpin') return json_(auth_loginWithPin_(payload));
  if (action === 'auth.requestmagiclink') return json_(auth_requestMagicLink_(payload));
  if (action === 'auth.consumetoken') return json_(auth_consumeToken_(payload));
  if (action === 'auth.logout') return json_(auth_logout_(payload));
  if (action === 'auth.whoami') return json_(auth_whoami_(payload));

  return json_({ ok: false, error: 'unknown_action' }, 400);
}

/** -------- Request helpers -------- */
function parseBody_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return {};
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function getAction_(e, payload) {
  // Support current approach: ?action=signup
  var a = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';

  // Also support JSON body: { action: "auth.loginWithPin" }
  if (!a && payload && payload.action) a = String(payload.action);

  return (a || '').trim().toLowerCase();
}

/** -------- Sheets helpers -------- */
function sheetByName(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

function headerIndexMap_(rowValues) {
  var map = {};
  for (var i = 0; i < rowValues.length; i++) map[String(rowValues[i])] = i;
  return map;
}

function readTable_(sheet) {
  var rng = sheet.getDataRange();
  var values = rng.getValues();
  if (values.length < 1) return { header: [], rows: [] };
  var header = values[0];
  var rows = values.length < 2 ? [] : values.slice(1).filter(function(r){ return r.join('').trim() !== ''; });
  return { header: header, rows: rows };
}

function upsertRowById_(sheet, idColName, rowObj) {
  var t = readTable_(sheet);
  var idx = headerIndexMap_(t.header);
  if (!(idColName in idx)) throw new Error('Missing ID column: ' + idColName);
  var idCol = idx[idColName];

  var foundRowIndex = -1; // 0-based in rows[]
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][idCol]) === String(rowObj[idColName])) { foundRowIndex = i; break; }
  }

  var arr = t.header.map(function(h){ return rowObj[h] === undefined ? '' : rowObj[h]; });

  if (foundRowIndex >= 0) {
    sheet.getRange(foundRowIndex + 2, 1, 1, arr.length).setValues([arr]);
    return rowObj;
  }

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

/** -------- API impl (existing) -------- */
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
    var rawDate = r[rIdx['Date']];
    var rawStart = r[rIdx['Start']];
    var rawEnd = r[rIdx['End']];
    var tz = Session.getScriptTimeZone();

    var dateStr = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, tz, 'yyyy-MM-dd') : rawDate;
    var startStr = (rawStart instanceof Date) ? Utilities.formatDate(rawStart, tz, 'HH:mm') : rawStart;
    var endStr = (rawEnd instanceof Date) ? Utilities.formatDate(rawEnd, tz, 'HH:mm') : rawEnd;

    return {
      Id: id,
      Date: dateStr,
      Start: startStr,
      End: endStr,
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
  var month = e.parameter.month; // YYYY-MM (optional)

  var at = readTable_(sheetByName(ATTENDANCE_SHEET_NAME));
  if (at.rows.length === 0) return { ok: true, attendees: [] };
  var idx = headerIndexMap_(at.header);

  var rows = at.rows.filter(function(r){
    if (resId) return String(r[idx['ReservationId']]) === String(resId);

    if (month) {
      var d = r[idx['Date']];
      var ds = (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM') : String(d).substring(0, 7);
      return ds === month;
    }

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
  if (!payload || !payload.reservationId || !payload.players || payload.players.length===0)
    return { ok: false, error: 'bad_request' };

  var res = findReservation_(payload.reservationId);
  if (!res) return { ok: false, error: 'reservation_not_found' };

  var attendees = readTable_(sheetByName(ATTENDANCE_SHEET_NAME));

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
    .map(function(r){
      return {
        ReservationId: reservationId,
        FeeName: r[idx['FeeName']],
        Amount: Number(r[idx['Amount']]) || 0
      };
    });
}

/** -------- Auth: Users / Tokens / Sessions --------
Roles:
- admin
- member
- guest
*/

function auth_loginWithPin_(payload) {
  var phone = normalizePhone_(payload.phone);
  var pin = String(payload.pin || '').trim();

  if (!phone || !pin) return { ok: false, error: 'bad_request' };

  var user = findUserByPhone_(phone);
  if (!user || !user.Active) return { ok: false, error: 'invalid_login' };
  if (user.Role !== 'admin' && user.Role !== 'member') return { ok: false, error: 'invalid_login' };

  if (!verifyPin_(pin, user.PinHash)) return { ok: false, error: 'invalid_login' };

  var session = createSession_(user.UserId, user.Role);
  return { ok: true, session: session };
}

function auth_requestMagicLink_(payload) {
  // Guests (or anyone you allow) can request a one-time link via email
  var email = normalizeEmail_(payload.email);
  if (!email) return { ok: true, message: 'If approved, you will receive an email shortly.' };

  var user = findUserByEmail_(email);

  // Do not leak existence; always return same message
  if (!user || !user.Active) return { ok: true, message: 'If approved, you will receive an email shortly.' };

  // Only allow guests by default; change this if you want members to also use email
  if (user.Role !== 'guest') return { ok: true, message: 'If approved, you will receive an email shortly.' };

  var token = createAuthToken_(user.UserId, MAGIC_LINK_TTL_MIN);
  sendMagicLinkEmail_(email, token);

  return { ok: true, message: 'If approved, you will receive an email shortly.' };
}

function auth_consumeToken_(payload) {
  var token = String(payload.token || '').trim();
  if (!token) return { ok: false, error: 'bad_request' };

  var tok = findAuthToken_(token);
  if (!tok) return { ok: false, error: 'invalid_token' };
  if (tok.Used) return { ok: false, error: 'token_used' };
  if (tok.ExpiresAtMs < Date.now()) return { ok: false, error: 'token_expired' };

  markAuthTokenUsed_(token);

  var user = findUserById_(tok.UserId);
  if (!user || !user.Active) return { ok: false, error: 'invalid_user' };

  var session = createSession_(user.UserId, user.Role);
  return { ok: true, session: session };
}

function auth_whoami_(payload) {
  var sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) return { ok: true, user: null };

  var sess = findSession_(sessionId);
  if (!sess) return { ok: true, user: null };
  if (sess.ExpiresAtMs < Date.now()) return { ok: true, user: null };

  var user = findUserById_(sess.UserId);
  if (!user || !user.Active) return { ok: true, user: null };

  // minimal user payload
  return { ok: true, user: { userId: user.UserId, role: user.Role, name: user.Name, phone: user.Phone, email: user.Email } };
}

function auth_logout_(payload) {
  var sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) return { ok: true };

  deleteSession_(sessionId);
  return { ok: true };
}

/** -------- Users helpers -------- */
function findUserByPhone_(phone) {
  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(t.header);

  for (var i=0;i<t.rows.length;i++) {
    var r = t.rows[i];
    var p = normalizePhone_(r[idx['Phone']]);
    if (p && p === phone) return rowToUser_(t.header, r, idx);
  }
  return null;
}

function findUserByEmail_(email) {
  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(t.header);

  for (var i=0;i<t.rows.length;i++) {
    var r = t.rows[i];
    var em = normalizeEmail_(r[idx['Email']]);
    if (em && em === email) return rowToUser_(t.header, r, idx);
  }
  return null;
}

function findUserById_(userId) {
  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(t.header);

  for (var i=0;i<t.rows.length;i++) {
    var r = t.rows[i];
    if (String(r[idx['UserId']]) === String(userId)) return rowToUser_(t.header, r, idx);
  }
  return null;
}

function rowToUser_(header, row, idx) {
  var activeRaw = row[idx['Active']];
  var active = (String(activeRaw).trim() === '1' || String(activeRaw).toLowerCase() === 'true');

  return {
    UserId: String(row[idx['UserId']]),
    Role: String(row[idx['Role']]).toLowerCase(),
    Name: row[idx['Name']],
    Phone: normalizePhone_(row[idx['Phone']]),
    Email: normalizeEmail_(row[idx['Email']]),
    Venmo: row[idx['Venmo']],
    PinHash: row[idx['PinHash']],
    Active: active
  };
}

/** -------- PIN hashing -------- */
function verifyPin_(pin, storedHash) {
  if (!storedHash) return false;
  var salt = getPinSalt_();
  var computed = sha256Hex_(salt + ':' + String(pin).trim());
  return computed === String(storedHash).trim();
}

function sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function(b){
    var v = (b < 0) ? b + 256 : b;
    var h = v.toString(16);
    return (h.length === 1) ? '0' + h : h;
  }).join('');
}

function getPinSalt_() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty(PIN_SALT_PROPERTY_KEY);
  if (!salt) throw new Error('PIN salt not set. Run setPinSalt_() once from the script editor.');
  return salt;
}

// One-time helper: run manually in Apps Script editor to set a secret salt.
function setPinSalt_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PIN_SALT_PROPERTY_KEY)) return 'Already set';
  var salt = Utilities.getUuid() + Utilities.getUuid();
  props.setProperty(PIN_SALT_PROPERTY_KEY, salt);
  return 'Set';
}

/** -------- AuthTokens helpers -------- */
function createAuthToken_(userId, ttlMin) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var now = Date.now();
  var expires = now + (ttlMin * 60 * 1000);

  var sh = sheetByName(AUTHTOKENS_SHEET_NAME);
  var t = readTable_(sh);
  if (!t.header || t.header.length === 0) throw new Error('AuthTokens sheet missing header');

  var rowObj = {};
  t.header.forEach(function(h){ rowObj[h] = ''; });

  rowObj['Token'] = token;
  rowObj['UserId'] = String(userId);
  rowObj['ExpiresAt'] = new Date(expires);
  rowObj['Used'] = 0;
  rowObj['CreatedAt'] = new Date(now);

  sh.appendRow(t.header.map(function(h){ return rowObj[h]; }));
  return token;
}

function findAuthToken_(token) {
  var sh = sheetByName(AUTHTOKENS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  for (var i=0;i<t.rows.length;i++) {
    var r = t.rows[i];
    if (String(r[idx['Token']]) === token) {
      var usedRaw = r[idx['Used']];
      var used = (String(usedRaw).trim() === '1' || String(usedRaw).toLowerCase() === 'true');

      var exp = r[idx['ExpiresAt']];
      var expMs = (exp instanceof Date) ? exp.getTime() : new Date(exp).getTime();

      return {
        RowNum: i + 2,
        Token: token,
        UserId: String(r[idx['UserId']]),
        ExpiresAtMs: expMs,
        Used: used
      };
    }
  }
  return null;
}

function markAuthTokenUsed_(token) {
  var sh = sheetByName(AUTHTOKENS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  for (var i=0;i<t.rows.length;i++) {
    var r = t.rows[i];
    if (String(r[idx['Token']]) === token) {
      var rowNum = i + 2;
      var usedCol = idx['Used'] + 1;
      sh.getRange(rowNum, usedCol).setValue(1);
      return true;
    }
  }
  return false;
}

/** -------- Sessions helpers -------- */
function createSession_(userId, role) {
  var sessionId = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var now = Date.now();
  var expires = now + (SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  var sh = sheetByName(SESSIONS_SHEET_NAME);
  var t = readTable_(sh);
  if (!t.header || t.header.length === 0) throw new Error('Sessions sheet missing header');

  var rowObj = {};
  t.header.forEach(function(h){ rowObj[h] = ''; });

  rowObj['SessionId'] = sessionId;
  rowObj['UserId'] = String(userId);
  rowObj['Role'] = String(role).toLowerCase();
  rowObj['CreatedAt'] = new Date(now);
  rowObj['ExpiresAt'] = new Date(expires);
  rowObj['Revoked'] = 0;

  sh.appendRow(t.header.map(function(h){ return rowObj[h]; }));
  return { sessionId: sessionId, expiresAt: new Date(expires) };
}

function findSession_(sessionId) {
  var sh = sheetByName(SESSIONS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  for (var i=0;i<t.rows.length;i++) {
    var r = t.rows[i];
    if (String(r[idx['SessionId']]) === sessionId) {
      var revokedRaw = r[idx['Revoked']];
      var revoked = (String(revokedRaw).trim() === '1' || String(revokedRaw).toLowerCase() === 'true');

      if (revoked) return null;

      var exp = r[idx['ExpiresAt']];
      var expMs = (exp instanceof Date) ? exp.getTime() : new Date(exp).getTime();

      return {
        RowNum: i + 2,
        SessionId: sessionId,
        UserId: String(r[idx['UserId']]),
        Role: String(r[idx['Role']]).toLowerCase(),
        ExpiresAtMs: expMs
      };
    }
  }
  return null;
}

function deleteSession_(sessionId) {
  var sh = sheetByName(SESSIONS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  for (var i=0;i<t.rows.length;i++) {
    var r = t.rows[i];
    if (String(r[idx['SessionId']]) === sessionId) {
      var rowNum = i + 2;
      var col = idx['Revoked'] + 1;
      sh.getRange(rowNum, col).setValue(1);
      return true;
    }
  }
  return false;
}

/** -------- Email sending -------- */
function sendMagicLinkEmail_(toEmail, token) {
  // Option A (recommended): link goes to your site and your frontend calls auth.consumeToken
  // Example: https://pickle.nadabarkada.com/#/login?token=...
  var link = APP_PUBLIC_BASE_URL.replace(/\/+$/, '') + '/?token=' + encodeURIComponent(token);

  // Option B: backend GET consumes token directly, then you’d need a redirect page; keeping it simple with Option A.
  // var link = ScriptApp.getService().getUrl() + '?action=auth.consumeToken&token=' + encodeURIComponent(token);

  var subject = 'Pickle guest login link';
  var body =
    'Use this link to access the upcoming reservation and settle payment.\n\n' +
    link + '\n\n' +
    'This link expires in ' + MAGIC_LINK_TTL_MIN + ' minutes.';

  MailApp.sendEmail(toEmail, subject, body);
}

/** -------- Normalizers -------- */
function normalizeEmail_(s) {
  if (!s) return '';
  return String(s).trim().toLowerCase();
}

function normalizePhone_(s) {
  if (!s) return '';
  var digits = String(s).replace(/[^\d]/g, '');
  // Allow US 10-digit, or 11-digit starting with 1
  if (digits.length === 11 && digits[0] === '1') digits = digits.substring(1);
  if (digits.length !== 10) return '';
  return digits;
}

/** -------- Response helpers -------- */
function json_(obj, status) {
  // Apps Script ContentService cannot set HTTP status codes reliably.
  // We include status in the JSON for debugging.
  var out = obj || {};
  if (status) out.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function sum_(arr){ return arr.reduce(function(a,b){ return a+(Number(b)||0); }, 0); }
function round2_(n){ return Math.round((Number(n)||0)*100)/100; }

/** ---- Setup note (one-time) ----
Create these headers exactly:

Reservations:  Id | Date | Start | End | Court | Capacity | BaseFee
Attendance:    Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID | ReservationId
Fees:          ReservationId | FeeName | Amount

NEW:
Users:         UserId | Role | Name | Phone | Email | Venmo | PinHash | Active
AuthTokens:    Token | UserId | ExpiresAt | Used | CreatedAt
Sessions:      SessionId | UserId | Role | CreatedAt | ExpiresAt | Revoked

Role values: admin | member | guest
Active: 1 or 0

PIN hashing:
- Run setPinSalt_() once from the Apps Script editor to create a secret salt.
- For members/admins, set PinHash to sha256Hex_(salt + ":" + PIN).
  Easiest workflow: I can give you a tiny helper function to generate hashes for specific PINs if you want.
*/
