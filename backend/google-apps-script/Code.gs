/* Minimal Apps Script backend for Reservations + Attendance + Fees + Basic Auth.
   Persistence: Google Sheets. Frontend: static GitHub Pages. */

var ATTENDANCE_SHEET_NAME = 'Attendance';
var RESERVATIONS_SHEET_NAME = 'Reservations';
var FEES_SHEET_NAME = 'Fees';
var APPROVALS_SHEET_NAME = 'Approvals';

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
  if (action === 'listreservations') {
    var ctx = requireAuth_(e, null);
    // allow all roles
    requireRole_(ctx, ['admin', 'memberplus', 'member', 'guest']);
    return json_(listReservations(ctx));
  }

  if (action === 'listattendance') {
    var ctx2 = requireAuth_(e, null);
    requireRole_(ctx2, ['admin', 'memberplus', 'member', 'guest']);
    return json_(listAttendance_(e, ctx2));
  }

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

  if (action === 'listapprovals') {
    var ctx4 = requireAuth_(e, null);
    requireRole_(ctx4, ['admin']);
    return json_(listApprovals_());
  }

  if (action === 'listusers') {
    var ctxUsers = requireAuth_(e, null);
    requireRole_(ctxUsers, ['admin', 'memberplus']); // <-- guests/basic members don't need the full roster
    return json_(listUsers_(ctxUsers));
  }

  if (action === 'listgroups') {
    var ctxG = requireAuth_(e, null);
    requireRole_(ctxG, ['admin']); // admin-only
    return json_(listGroups_());
  }


  return json_({ ok: false, error: 'unknown_action' }, 400);
}

function doPost(e) {
  var payload = parseBody_(e);
  var action = getAction_(e, payload);

  // Existing POST actions
  if (action === 'signup') {
    var ctxSignup = requireAuth_(e, payload);
    requireRole_(ctxSignup, ['admin', 'memberplus', 'member', 'guest']);
    return json_(signup_(payload, ctxSignup));
  }


  if (action === 'unrsvp') {
    var ctxUnrsvp = requireAuth_(e, payload);
    requireRole_(ctxUnrsvp, ['admin', 'memberplus', 'member', 'guest']);
    return json_(unrsvp_(payload, ctxUnrsvp));
  }

  if (action === 'cancelrsvp') {
    var ctxCancel = requireAuth_(e, payload);
    requireRole_(ctxCancel, ['admin', 'memberplus', 'member', 'guest']);
    return json_(unrsvp_(payload, ctxCancel));
  }

  if (action === 'markpaid') {
    var ctx = requireAuth_(e, payload);
    requireRole_(ctx, ['admin']);
    return json_(markPaid_(payload));
  }

  if (action === 'upsertreservation') {
    var ctx2 = requireAuth_(e, payload);
    requireRole_(ctx2, ['admin', 'memberplus']);

    // If MemberPLUS, force status to 'proposed' to prevent unauthorized confirmed reservations
    if (ctx2.role === 'memberplus') {
      payload.Status = 'proposed';
    }

    return json_(upsertReservation_(payload));
  }

  if (action === 'addfee') {
    var ctx3 = requireAuth_(e, payload);
    requireRole_(ctx3, ['admin']);
    return json_(addFee_(payload));
  }

  if (action === 'approveguest') {
    var ctx5 = requireAuth_(e, payload);
    requireRole_(ctx5, ['admin']);
    return json_(approveGuest_(payload));
  }

  if (action === 'auth.updatelogin') {
    var ctxSet = requireAuth_(e, payload);
    return json_(auth_updateLogin_(payload, ctxSet));
  }
  if (action === 'auth.updatepin') {
    var ctxPin = requireAuth_(e, payload);
    return json_(auth_updatePin_(payload, ctxPin));
  }


  // New auth actions (recommended to call with JSON {action:"auth.loginWithPin", ...})
  if (action === 'auth.loginwithpin') return json_(auth_loginWithPin_(payload));
  if (action === 'auth.requestmagiclink') return json_(auth_requestMagicLink_(payload));
  if (action === 'auth.consumetoken') return json_(auth_consumeToken_(payload));
  if (action === 'auth.logout') return json_(auth_logout_(payload));
  if (action === 'auth.whoami') return json_(auth_whoami_(payload));

  return json_({ ok: false, error: 'unknown_action' }, 400);
}


/** -------- Settings helpers -------- */
function updateUserField_(userId, colName, value) {
  var sh = sheetByName(USERS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  if (idx['UserId'] === undefined) throw new Error('Users missing UserId');
  if (idx[colName] === undefined) throw new Error('Users missing ' + colName);

  for (var i=0;i<t.rows.length;i++){
    var r = t.rows[i];
    if (String(r[idx['UserId']]) === String(userId)) {
      sh.getRange(i+2, idx[colName]+1).setValue(value);
      return true;
    }
  }
  return false;
}

function auth_updateLogin_(payload, ctx) {
  var newLogin = String(payload.newLogin || '').trim();
  if (!newLogin) return { ok:false, error:'bad_request' };

  var h = hashLoginId_(newLogin);
  if (!h) return { ok:false, error:'invalid_login_format' };

  if (isLoginHashTaken_(h, ctx.userId)) return { ok:false, error:'login_taken' };

  updateUserField_(ctx.userId, 'LoginHash', h);
  return { ok:true };
}

function auth_updatePin_(payload, ctx) {
  var oldPin = String(payload.oldPin || '').trim();
  var newPin = String(payload.newPin || '').trim();
  if (!oldPin || !newPin) return { ok:false, error:'bad_request' };

  // verify old pin
  if (!verifyPin_(oldPin, ctx.user.PinHash)) return { ok:false, error:'invalid_old_pin' };

  var salt = getPinSalt_();
  var newHash = sha256Hex_(salt + ':' + newPin);
  updateUserField_(ctx.userId, 'PinHash', newHash);
  return { ok:true };
}


/** -------- Request helpers -------- */

function requireAuth_(e, payload) {
  var sid = '';

  // allow sessionId from query string for GETs
  if (e && e.parameter && e.parameter.sessionId) sid = String(e.parameter.sessionId).trim();

  // allow sessionId in JSON body for POSTs
  if (!sid && payload && payload.sessionId) sid = String(payload.sessionId).trim();

  if (!sid) throw new Error('auth_required');

  var sess = findSession_(sid);
  if (!sess) throw new Error('invalid_session');
  if (sess.ExpiresAtMs < Date.now()) throw new Error('session_expired');

  var user = findUserById_(sess.UserId);
  if (!user || !user.Active) throw new Error('invalid_user');

  return {
    sessionId: sid,
    user: user,
    role: String(user.Role || 'guest').toLowerCase().trim(),
    userId: String(user.UserId).trim()
  };

}

function requireRole_(ctx, allowed) {
  if (!ctx || !ctx.role) throw new Error('auth_required');
  if (allowed.indexOf(ctx.role) === -1) throw new Error('forbidden');
}

function roleRank_(role) {
  role = String(role || 'guest').toLowerCase();
  if (role === 'admin') return 4;
  if (role === 'memberplus') return 3;
  if (role === 'member') return 2;
  return 1; // guest
}

function visibilityRank_(vis) {
  vis = String(vis || 'member').toLowerCase();
  if (vis === 'admin') return 4;
  if (vis === 'memberplus') return 3;
  if (vis === 'member') return 2;
  return 1; // guest
}

function parseUserIdCsv_(s) {
  return String(s || '')
    .split(',')
    .map(function(x){ return String(x).trim(); })
    .filter(Boolean);
}

function parseGroupCsv_(s) {
  return String(s || '')
    .split(',')
    .map(function(x){ return String(x).trim(); })
    .filter(Boolean);
}


function canSeeReservation_(ctx, resObj) {
  // Admin sees all
  if (ctx && String(ctx.role).toLowerCase() === 'admin') return true;

  var userRank = roleRank_(ctx && ctx.role);
  var reqRank = visibilityRank_(resObj && resObj.Visibility);

  // role-based visibility
  if (userRank >= reqRank) return true;

  // allowlist visibility (optional)
  var uid = (ctx && ctx.userId) ? String(ctx.userId) : '';
  if (!uid) return false;

  var allow = parseUserIdCsv_(resObj && resObj.VisibleToUserIds);
  if (allow.indexOf(uid) !== -1) return true;

  // NEW: group-based allowlist (optional)
  var userGroup = (ctx && ctx.user && ctx.user.Group) ? String(ctx.user.Group).trim().toLowerCase() : '';
  if (!userGroup) return false;

  var groups = parseGroupCsv_(resObj && resObj.VisibleToGroups).map(function(g){
    return String(g).trim().toLowerCase();
  });

  return groups.indexOf(userGroup) !== -1;

}


function reservationStatusMap_() {
  var rt = readTable_(sheetByName(RESERVATIONS_SHEET_NAME));
  var idx = headerIndexMap_(rt.header);
  var out = {};
  if (idx['Id'] === undefined) return out;

  var statusCol = idx['Status'];
  for (var i=0;i<rt.rows.length;i++){
    var r = rt.rows[i];
    var id = String(r[idx['Id']]);
    var st = (statusCol !== undefined) ? String(r[statusCol] || '').toLowerCase().trim() : '';
    out[id] = st || 'reserved';
  }
  return out;
}


function parseLocalDateTime_(dateStr, timeStr) {
  var parts = String(dateStr).split('-'); // yyyy-mm-dd
  var t = String(timeStr).split(':');     // HH:mm
  return new Date(
    Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]),
    Number(t[0]), Number(t[1] || 0), 0, 0
  );
}



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
  for (var i = 0; i < rowValues.length; i++) {
    map[String(rowValues[i]).trim()] = i;
  }
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


function createApprovalRequest_(email, name) {
  var sh = sheetByName(APPROVALS_SHEET_NAME);
  var t = readTable_(sh);
  if (!t.header || t.header.length === 0) throw new Error('Approvals sheet missing header');

  var requestId = Utilities.getUuid().replace(/-/g, '');
  var now = new Date();

  var rowObj = {};
  t.header.forEach(function(h){ rowObj[h] = ''; });

  rowObj['RequestId'] = requestId;
  rowObj['Email'] = email;
  rowObj['Name'] = name || '';
  rowObj['Status'] = 'pending';
  rowObj['CreatedAt'] = now;

  sh.appendRow(t.header.map(function(h){ return rowObj[h]; }));
  return requestId;
}

function findPendingApprovalByEmail_(email) {
  var sh = sheetByName(APPROVALS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var em = normalizeEmail_(r[idx['Email']]);
    var status = String(r[idx['Status']] || '').toLowerCase();
    if (em === email && status === 'pending') return true;
  }
  return false;
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
function isAllowlistedForAny_(ctx, items) {
  var uid = (ctx && ctx.userId) ? String(ctx.userId) : '';
  if (!uid) return false;

  var userGroup = (ctx && ctx.user && ctx.user.Group) ? String(ctx.user.Group).trim().toLowerCase() : '';

  return (items || []).some(function(it){
    var allow = parseUserIdCsv_(it && it.VisibleToUserIds);
    if (allow.indexOf(uid) !== -1) return true;

    if (userGroup) {
      var groups = parseGroupCsv_(it && it.VisibleToGroups).map(function(g){ return String(g).trim().toLowerCase(); });
      if (groups.indexOf(userGroup) !== -1) return true;
    }

    return false;
  });


}



function listReservations(ctx) {
  var userRole = String((ctx && ctx.role) || 'guest').toLowerCase();

  var rs = sheetByName(RESERVATIONS_SHEET_NAME);
  var fs = sheetByName(FEES_SHEET_NAME);
  var rt = readTable_(rs);
  var ft = readTable_(fs);
  var rIdx = headerIndexMap_(rt.header);
  var fIdx = headerIndexMap_(ft.header);

  var hasVisibility = (rIdx['Visibility'] !== undefined);
  var hasAllow = (rIdx['VisibleToUserIds'] !== undefined);
  var hasGroupAllow = (rIdx['VisibleToGroups'] !== undefined);


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
      Status: String(r[rIdx['Status']] || 'reserved').toLowerCase().trim(),
      Visibility: hasVisibility ? normalizeVisibility_(r[rIdx['Visibility']]) : 'member',
      VisibleToUserIds: hasAllow ? String(r[rIdx['VisibleToUserIds']] || '').trim() : '',
      VisibleToGroups: hasGroupAllow ? String(r[rIdx['VisibleToGroups']] || '').trim() : '',

      Fees: feesByRes[id] || []
    };
  });

  // NEW: apply visibility filter
  items = items.filter(function(it){ return canSeeReservation_(ctx, it); });

  // Keep your current restriction: members/guests only see the next upcoming allowed event
  // BUT: if they are explicitly allowlisted on any event, allow full visibility of allowed items.
  var allowlisted = isAllowlistedForAny_(ctx, items);
  
  if ((userRole === 'member' || userRole === 'guest') && !allowlisted) {
    var now = new Date();
    items.sort(function(a, b) {
      return a.Date.localeCompare(b.Date) || a.Start.localeCompare(b.Start);
    });

    var nextEvent = items.find(function(item) {
      var eventStart = parseLocalDateTime_(item.Date, item.Start);

      return eventStart >= now;
    });
  
    items = nextEvent ? [nextEvent] : [];
  }

  return { ok: true, reservations: items };
}


function listAttendance_(e, ctx) {

  var resId = (e && e.parameter && e.parameter.reservationId) ? String(e.parameter.reservationId) : '';
  var month = (e && e.parameter && e.parameter.month) ? String(e.parameter.month) : '';

  var atSheet = sheetByName(ATTENDANCE_SHEET_NAME);
  var at = readTable_(atSheet);
  if (at.rows.length === 0) return { ok: true, attendees: [] };

  var idx = headerIndexMap_(at.header);
  var isAdmin = (ctx && ctx.role === 'admin');

  var resStatus = reservationStatusMap_();

  var hasUserIdCol = (idx['UserId'] !== undefined);
  var currentUserId = (ctx && ctx.userId) ? String(ctx.userId) : '';

  var out = [];

  for (var i = 0; i < at.rows.length; i++) {
    var r = at.rows[i];


    // Filter: reservationId OR month OR all
    if (resId) {
      if (String(r[idx['ReservationId']]) !== String(resId)) continue;
    } else if (month) {
      var d = r[idx['Date']];
      var ds = (d instanceof Date)
        ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM')
        : String(d).substring(0, 7);
      if (ds !== month) continue;
    }


    // NEW: skip attendance for cancelled reservations
    if (idx['ReservationId'] !== undefined) {
      var rid = String(r[idx['ReservationId']] || '');
      if (rid && resStatus[rid] === 'cancelled') continue;
    }



    // Skip cancelled rows (robust: handles 0, "0", false, "")
    if (idx['Present (1/0)'] !== undefined) {
      var presentRaw = r[idx['Present (1/0)']];
      if (Number(presentRaw) === 0) continue;
    }

    var rowUserId = '';
    if (hasUserIdCol) rowUserId = String(r[idx['UserId']] || '');

    var isSelf = (rowUserId && currentUserId && rowUserId === currentUserId);

    var chargeVal = null;
    var paidVal = null;

    // Privacy: only admin or self sees Charge/PAID
    if (isAdmin || isSelf) {
      chargeVal = Number(r[idx['Charge (auto)']]) || 0;
      // your sheet uses 1/0; keep same behavior
      paidVal = (String(r[idx['PAID']]) === '1');
    }

    out.push({
      Date: r[idx['Date']],
      Hours: r[idx['Hours']],
      Player: r[idx['Player Name']],
      UserId: rowUserId || '',             // ✅ add this
      Present: r[idx['Present (1/0)']],
      Charge: chargeVal,
      PAID: paidVal,
      ReservationId: r[idx['ReservationId']],
      _sheetRow: i + 2                      // ✅ 1-based sheet row number
    });
  }

  return { ok: true, attendees: out };
}

function signup_(payload, ctx) {
  if (!payload || !payload.reservationId)
    return { ok: false, error: 'bad_request' };

  var res = findReservation_(payload.reservationId);
  if (!res) return { ok: false, error: 'reservation_not_found' };

  var attendees = readTable_(sheetByName(ATTENDANCE_SHEET_NAME));

  // Determine who is being signed up
  var players = [];

  if (ctx.role === 'admin') {
    if (!payload.players || payload.players.length === 0) return { ok: false, error: 'bad_request' };
    players = payload.players.map(function(p){ return String(p || '').trim(); }).filter(Boolean);
  } else {
    // member/guest can only sign up themselves
    players = [String((ctx.user && ctx.user.Name) || '').trim()];

    if (!players[0]) return { ok: false, error: 'missing_user_name' };
  }

  var totalFees = res.BaseFee + sum_(res.Fees.map(function(f){ return Number(f.Amount)||0; }));
  var totalAmount = payload.totalAmount ? Number(payload.totalAmount) : totalFees;
  var perPlayer = round2_(totalAmount / players.length);

  var rowsToAppend = players.map(function(p){
    var row = {};
    attendees.header.forEach(function(h){ row[h] = ''; });

    row['Date'] = res.Date;
    row['Hours'] = DEFAULT_HOURS;
    row['Player Name'] = p;

    // Bind row to userId when possible
    if (idxHasHeader_(attendees.header, 'UserId')) {
      if (ctx.role !== 'admin') {
        // member/guest signing themselves
        row['UserId'] = ctx.userId;
      } else {
        // admin adding by name: try to match a user by Name
        var u = findUserByName_(p);
        row['UserId'] = (u && u.Active) ? u.UserId : '';
      }
    }

    row['Present (1/0)'] = 1;
    row['Charge (auto)'] = perPlayer;

    // Only admin can mark paid server-side
    row['PAID'] = (ctx.role === 'admin' && payload.markPaid) ? 1 : 0;

    row['ReservationId'] = res.Id;
    return attendees.header.map(function(h){ return row[h]; });
  });

  if (rowsToAppend.length > 0) {
    var sh = sheetByName(ATTENDANCE_SHEET_NAME);
    sh.getRange(sh.getLastRow()+1, 1, rowsToAppend.length, attendees.header.length).setValues(rowsToAppend);
  }

  return { ok: true, perPlayer: perPlayer };
}

function unrsvp_(payload, ctx) {

  if (!payload.reservationId) return { ok: false, error: 'missing_reservation_id' };

  var sheetRow = Number(payload.sheetRow || 0);
  if (!sheetRow || sheetRow < 2) return { ok: false, error: 'bad_request' };

  var sh = sheetByName(ATTENDANCE_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  if (idx['Present (1/0)'] === undefined) return { ok: false, error: 'missing_present_column' };

  // Read the target row values from the sheet
  // sheetRow is 1-based; range row index in table rows[] is sheetRow - 2
  var tableRowIndex = sheetRow - 2;
  if (tableRowIndex < 0 || tableRowIndex >= t.rows.length) return { ok: false, error: 'row_not_found' };

  var row = t.rows[tableRowIndex];

  // Optional safety: ensure reservation matches if provided
  if (payload.reservationId && idx['ReservationId'] !== undefined) {
    if (String(row[idx['ReservationId']]) !== String(payload.reservationId)) {
      return { ok: false, error: 'reservation_mismatch' };
    }
  }

  // Permission check: admin can cancel anyone; others only cancel their own rows (when UserId exists)
  var isAdmin = ctx && ctx.role === 'admin';

  if (!isAdmin) {
    if (idx['UserId'] === undefined) return { ok: false, error: 'missing_userid_column' };
    var rowUserId = String(row[idx['UserId']] || '');
    if (!rowUserId || String(rowUserId) !== String(ctx.userId)) {
      return { ok: false, error: 'forbidden' };
    }
  }

  // Set Present (1/0) = 0
  sh.getRange(sheetRow, idx['Present (1/0)'] + 1).setValue(0);

  return { ok: true };
}



function markPaid_(payload) {
  var sh = sheetByName(ATTENDANCE_SHEET_NAME);
  var at = readTable_(sh);
  var idx = headerIndexMap_(at.header);

  if (idx['PAID'] === undefined) return { ok: false, error: 'missing_paid_column' };

  // ✅ Preferred: direct update by sheetRow (unambiguous)
  var sheetRow = Number(payload.sheetRow || 0);
  if (sheetRow && sheetRow >= 2) {
    var tableRowIndex = sheetRow - 2;
    if (tableRowIndex < 0 || tableRowIndex >= at.rows.length) {
      return { ok: false, error: 'row_not_found' };
    }

    // Optional safety: ensure reservation matches
    if (payload.reservationId && idx['ReservationId'] !== undefined) {
      var row = at.rows[tableRowIndex];
      if (String(row[idx['ReservationId']]) !== String(payload.reservationId)) {
        return { ok: false, error: 'reservation_mismatch' };
      }
    }

    sh.getRange(sheetRow, idx['PAID'] + 1).setValue(payload.paid ? 1 : 0);
    return { ok: true };
  }

  // 🔁 Backward-compatible fallback (ONLY if unambiguous)
  if (!payload.reservationId || !payload.player) return { ok: false, error: 'bad_request' };

  var matches = [];
  for (var i = 0; i < at.rows.length; i++) {
    var r = at.rows[i];
    if (
      String(r[idx['ReservationId']]) === String(payload.reservationId) &&
      String(r[idx['Player Name']]).trim().toLowerCase() === String(payload.player).trim().toLowerCase() &&
      (idx['Present (1/0)'] === undefined || Number(r[idx['Present (1/0)']]) !== 0) // only active rows
    ) {
      matches.push(i);
    }
  }

  if (matches.length === 0) return { ok: false, error: 'player_not_found' };
  if (matches.length > 1) return { ok: false, error: 'ambiguous_match_use_sheetrow' };

  sh.getRange(matches[0] + 2, idx['PAID'] + 1).setValue(payload.paid ? 1 : 0);
  return { ok: true };
}


/** 
 * Upserts a reservation.
 * Recommends: "Status" column in "Reservations" sheet (Issue #31)
 */
function upsertReservation_(payload) {
  var sh = sheetByName(RESERVATIONS_SHEET_NAME);

  var status = String(payload.Status || 'reserved').toLowerCase().trim();
  var visibility = normalizeVisibility_(payload.Visibility);

  var row = {
    'Id': payload.Id || nextReservationId_(),
    'Date': payload.Date,
    'Start': payload.Start,
    'End': payload.End,
    'Court': payload.Court,
    'Capacity': payload.Capacity,
    'BaseFee': payload.BaseFee,
    'Status': status,
    'Visibility': visibility,
    'VisibleToUserIds': String(payload.VisibleToUserIds || '').trim(),
    'VisibleToGroups': String(payload.VisibleToGroups || '').trim()

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
        Status: String(r[idx['Status']] || 'reserved').toLowerCase().trim(),
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

  // DEBUG
  Logger.log('login payload: ' + JSON.stringify(payload));



  var loginId = String(
    payload.loginId ||           // preferred (camelCase)
    payload.loginid ||           // in case client lowercases
    payload.login ||             // alias
    payload.phone ||
    payload.email ||
    ''
  ).trim();


  var pin = String(payload.pin || '').trim();

  if (!loginId || !pin) return { ok: false, error: 'bad_request' };

  // Prefer hashed lookup
  var user = findUserByLoginIdentifier_(loginId);

  // Backward-compat: if LoginHash isn't populated yet, fallback to phone/email lookup
  if (!user) {
    var c = canonicalizeLogin_(loginId);
    if (c.ok && c.kind === 'phone') user = findUserByPhone_(c.normalized);
    if (c.ok && c.kind === 'email') user = findUserByEmail_(c.normalized);
  }

  if (!user || !user.Active) return { ok: false, error: 'invalid_login' };

  var role = String(user.Role || '').toLowerCase();
  if (role !== 'admin' && role !== 'memberplus' && role !== 'member' && role !== 'guest')
    return { ok: false, error: 'invalid_login' };

  if (!verifyPin_(pin, user.PinHash)) return { ok: false, error: 'invalid_login' };

  var session = createSession_(user.UserId, user.Role);
  return { ok: true, session: session };
}


function auth_requestMagicLink_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return { ok: true, message: 'If approved, you will receive an email shortly.' };

  var user = findUserByLoginIdentifier_(email) || findUserByEmail_(email); // fallback during migration


  // 1. Approved Guest: Send a new fresh link
  if (user && user.Active && String(user.Role).toLowerCase().trim() === 'guest') {
    var token = createAuthToken_(user.UserId, MAGIC_LINK_TTL_MIN);
    sendMagicLinkEmail_(email, token);
    return { ok: true, message: 'Welcome back! You are already approved. A new magic link has been sent to your email.' };
  }

  // 2. Pending Request: Tell them it is in progress
  if (findPendingApprovalByEmail_(email)) {
    return { ok: true, message: 'Your request is currently pending approval. We will email you once approved!' };
  }

  // 3. New Request: Submit for approval
  createApprovalRequest_(email, String(payload.name || '').trim());
  return { ok: true, message: 'Your access request has been submitted! We will email you a magic link once approved.' };
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
  return {
    ok: true,
    user: {
      userId: user.UserId,
      role: String(user.Role || 'guest').toLowerCase().trim(),
      name: user.Name,
      venmo: user.Venmo
    }
  };

}

function auth_logout_(payload) {
  var sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) return { ok: true };

  deleteSession_(sessionId);
  return { ok: true };
}

/** -------- Users helpers -------- */
function listUsers_(ctx) {
  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  if (!t.header || t.header.length === 0) return { ok: true, users: [] };

  var idx = headerIndexMap_(t.header);

  // Only expose names of active member/admin users (and optionally active guests if you want)
  var rows = t.rows
    .map(function(r) {
      var activeRaw = r[idx['Active']];
      var active = (String(activeRaw).trim() === '1' || String(activeRaw).toLowerCase() === 'true');

      var role = String(r[idx['Role']] || '').toLowerCase();
      var name = String(r[idx['Name']] || '').trim();

      return { active: active, role: role, name: name };
    })
    .filter(function(u) {
      if (!u.active) return false;
      if (!u.name) return false;

      // Keep dropdown clean: only show players that are real members/admins
      // (Change to include guests if you want: role === 'guest')
      return (u.role === 'admin' || u.role === 'memberplus' || u.role === 'member');
    })
    .map(function(u) { return { Name: u.name }; });

  // Unique + sort
  var seen = {};
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var nm = rows[i].Name;
    var key = nm.toLowerCase();
    if (!seen[key]) { seen[key] = true; out.push({ Name: nm }); }
  }
  out.sort(function(a, b) { return a.Name.localeCompare(b.Name); });

  return { ok: true, users: out };
}



function listGroups_() {
  var sh = sheetByName(USERS_SHEET_NAME);
  var t = readTable_(sh);
  if (!t.header || t.header.length === 0) return { ok: true, groups: [] };

  var idx = headerIndexMap_(t.header);
  if (idx['Group'] === undefined) return { ok: true, groups: [] };

  var set = {};
  for (var i = 0; i < t.rows.length; i++) {
    var g = String(t.rows[i][idx['Group']] || '').trim();
    if (g) set[g] = true;
  }

  var groups = Object.keys(set).sort(function(a,b){
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  return { ok: true, groups: groups };
}


function idxHasHeader_(header, colName) {
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === colName) return true;
  }
  return false;
}

function findUserByName_(name) {
  var target = String(name || '').trim().toLowerCase();
  if (!target) return null;

  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(t.header);

  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var nm = String(r[idx['Name']] || '').trim().toLowerCase();
    if (nm === target) return rowToUser_(t.header, r, idx);
  }
  return null;
}

function findUserByPhone_(phone) {
  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(t.header);

  if (idx['Phone'] === undefined) return null;

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


  if (idx['Email'] === undefined) return null;

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


function findUserByLoginHash_(loginHash) {
  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(t.header);

  if (idx['LoginHash'] === undefined) throw new Error('Users sheet missing LoginHash column');

  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var h = String(r[idx['LoginHash']] || '').trim();
    if (h && h === String(loginHash).trim()) return rowToUser_(t.header, r, idx);
  }
  return null;
}

function findUserByLoginIdentifier_(loginInput) {
  var h = hashLoginId_(loginInput);
  if (!h) return null;
  return findUserByLoginHash_(h);
}

function isLoginHashTaken_(loginHash, exceptUserId) {
  var t = readTable_(sheetByName(USERS_SHEET_NAME));
  var idx = headerIndexMap_(t.header);
  if (idx['LoginHash'] === undefined) throw new Error('Users sheet missing LoginHash column');

  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var rowHash = String(r[idx['LoginHash']] || '').trim();
    if (!rowHash) continue;
    if (rowHash === String(loginHash).trim()) {
      var uid = String(r[idx['UserId']] || '').trim();
      if (!exceptUserId || uid !== String(exceptUserId).trim()) return true;
    }
  }
  return false;
}

function rowToUser_(header, row, idx) {
  var activeRaw = row[idx['Active']];
  var active = (String(activeRaw).trim() === '1' || String(activeRaw).toLowerCase() === 'true');

  return {
    UserId: String(row[idx['UserId']] || '').trim(),
    Role: String(row[idx['Role']] || '').trim().toLowerCase(),
    Name: String(row[idx['Name']] || '').trim(),
    Phone: normalizePhone_(row[idx['Phone']]),
    Email: normalizeEmail_(row[idx['Email']]),
    LoginHash: (idx['LoginHash'] !== undefined) ? String(row[idx['LoginHash']] || '').trim() : '',
    Venmo: String(row[idx['Venmo']] || '').trim(),
    PinHash: String(row[idx['PinHash']] || '').trim(),
    Active: active,
    Group: (idx['Group'] !== undefined) ? String(row[idx['Group']] || '').trim() : ''

  };
}


/** -------- Approval helpers -------- */
function listApprovals_() {
  var sh = sheetByName(APPROVALS_SHEET_NAME);
  var t = readTable_(sh);
  if (t.rows.length === 0) return { ok: true, requests: [] };
  var idx = headerIndexMap_(t.header);

  var pending = t.rows.filter(function(r) {
    return String(r[idx['Status']] || '').trim().toLowerCase() === 'pending';
  }).map(function(r) {
    return {
      RequestId: r[idx['RequestId']],
      Email: r[idx['Email']],
      Name: r[idx['Name']],
      CreatedAt: r[idx['CreatedAt']]
    };
  });

  return { ok: true, requests: pending };
}

function approveGuest_(payload) {
  var requestId = payload.requestId;
  if (!requestId) return { ok: false, error: 'missing_request_id' };

  var ash = sheetByName(APPROVALS_SHEET_NAME);
  var at = readTable_(ash);
  var aidx = headerIndexMap_(at.header);

  var found = -1;
  var email = '';
  var name = '';

  for (var i = 0; i < at.rows.length; i++) {
    if (String(at.rows[i][aidx['RequestId']]) === requestId) {
      found = i;
      email = at.rows[i][aidx['Email']];
      name = at.rows[i][aidx['Name']];
      break;
    }
  }

  if (found === -1) return { ok: false, error: 'request_not_found' };

  // 1. Move to Users
  var ush = sheetByName(USERS_SHEET_NAME);
  var ut = readTable_(ush);
  var uidx = headerIndexMap_(ut.header);

  // find max userId
  var maxId = 0;
  for (var j = 0; j < ut.rows.length; j++) {
    var id = Number(ut.rows[j][uidx['UserId']]) || 0;
    if (id > maxId) maxId = id;
  }

  var newUser = {};
  ut.header.forEach(function(h) { newUser[h] = ''; });
  newUser['UserId'] = String(maxId + 1);
  newUser['Role'] = 'guest';
  newUser['Name'] = name;
  newUser['Email'] = email;

  var h = hashLoginId_(email);
  if (!h) return { ok:false, error:'invalid_email' };
  newUser['LoginHash'] = h;

  newUser['Active'] = 1;


  ush.appendRow(ut.header.map(function(h) { return newUser[h]; }));

  // 2. Mark as approved
  var col = aidx['Status'] + 1;
  ash.getRange(found + 2, col).setValue('approved');

  // 3. Automatically send magic link email
  var token = createAuthToken_(newUser['UserId'], MAGIC_LINK_TTL_MIN);
  sendMagicLinkEmail_(email, token);

  return { ok: true };
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

function normalizeVisibility_(v) {
  v = String(v || 'member').toLowerCase().trim();
  if (v === 'admin' || v === 'memberplus' || v === 'member' || v === 'guest') return v;
  return 'member';
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
  if (s === undefined || s === null || s === '') return '';
  // If it's a number (likely from Sheets), format it to avoid scientific notation (e.g., 6.26E+09)
  if (typeof s === 'number') {
    s = s.toFixed(0);
  }
  var digits = String(s).replace(/[^\d]/g, '');
  // Allow US 10-digit, or 11-digit starting with 1
  if (digits.length === 11 && digits[0] === '1') digits = digits.substring(1);
  if (digits.length !== 10) return '';
  return digits;
}


/** -------- HASH -------- */
function generateMyHash() {
  const myPin = "1234"; // <-- Change this to the PIN you want!
  const salt = PropertiesService.getScriptProperties().getProperty("PIN_SALT_V1");
  const hash = sha256Hex_(salt + ":" + myPin);
  Logger.log("Your PIN Hash is: " + hash);
}

// --- Login canonicalization + deterministic hash (phone OR email) ---

function canonicalizeLogin_(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { ok: false, error: 'missing_login' };

  // Treat as email if it contains "@"
  if (raw.indexOf('@') >= 0) {
    var email = raw.toLowerCase().trim();
    // basic validation
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) return { ok: false, error: 'invalid_email' };
    return { ok: true, kind: 'email', normalized: email };
  }

  // Otherwise treat as phone
  var digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, error: 'invalid_phone' };
  return { ok: true, kind: 'phone', normalized: digits };
}

/**
 * Deterministic hash used for login lookup.
 * IMPORTANT: prefix kind to avoid phone/email collisions.
 * phone -> sha256("phone:8186539874")
 * email -> sha256("email:jay.torres@gmail.com")
 */
function hashLoginId_(input) {
  var c = canonicalizeLogin_(input);
  if (!c.ok) return '';
  return sha256Hex_(c.kind + ':' + c.normalized);
}


function migrateUsersToLoginHash_() {
  var sh = sheetByName(USERS_SHEET_NAME);
  var t = readTable_(sh);
  var idx = headerIndexMap_(t.header);

  if (idx['LoginHash'] === undefined) throw new Error('Add LoginHash column first');

  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var existing = String(r[idx['LoginHash']] || '').trim();
    if (existing) continue;

    var email = (idx['Email'] !== undefined) ? normalizeEmail_(r[idx['Email']]) : '';
    var phone = (idx['Phone'] !== undefined) ? normalizePhone_(r[idx['Phone']]) : '';

    var source = email || phone;
    if (!source) continue;

    var h = hashLoginId_(source);
    if (!h) {
      Logger.log('Row ' + (i + 2) + ' invalid login source: ' + source);
      continue;
    }

    sh.getRange(i + 2, idx['LoginHash'] + 1).setValue(h);
  }

  Logger.log('Done migrating LoginHash.');
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

Reservations:  Id | Date | Start | End | Court | Capacity | BaseFee | Status | Visibility | VisibleToUserIds | VisibleToGroups
Users:         UserId | Role | Name | Phone | Email | LoginHash | Venmo | PinHash | Active | Group

Attendance: Date | Hours | Player Name | UserId | Present (1/0) | Charge (auto) | PAID | ReservationId
Fees:          ReservationId | FeeName | Amount

AuthTokens:    Token | UserId | ExpiresAt | Used | CreatedAt
Sessions:      SessionId | UserId | Role | CreatedAt | ExpiresAt | Revoked

Role values: admin | memberplus | member | guest
Active: 1 or 0

PIN hashing:
- Run setPinSalt_() once from the Apps Script editor to create a secret salt.
- For members/admins, set PinHash to sha256Hex_(salt + ":" + PIN).
  Easiest workflow: I can give you a tiny helper function to generate hashes for specific PINs if you want.
*/
