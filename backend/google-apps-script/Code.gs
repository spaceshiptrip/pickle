// Google Apps Script backend for the Pickleball Check-In app.
//
// Attach this script to your Google Sheet (Extensions -> Apps Script),
// deploy as a Web App, and use the deployed URL as APP_SCRIPT_URL in src/config.js.
//
// Expected POST payload (x-www-form-urlencoded: payload=<JSON>):
// {
//   "userName": "Jay",
//   "targets": ["Jay", "Alice"],
//   "paid": true,
//   "amount": 10,
//   "date": "2025-10-31"  // YYYY-MM-DD
// }
//
// This script is tailored to your existing sheet structure with an
// `Attendance` tab that looks like:
//
//   Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID
//
// It appends one row per checked-in player. If `paid` is true, the total
// amount is divided equally among all players being checked in in that
// request, and that per-player amount is written to `Charge (auto)`.

var ATTENDANCE_SHEET_NAME = 'Attendance';
var DEFAULT_HOURS = 2; // You can change this to 1 or another default.

function doPost(e) {
  try {
    if (!e || !e.parameter || !e.parameter.payload) {
      return jsonResponse({ status: 'error', message: 'No payload' });
    }

    var data = JSON.parse(e.parameter.payload);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(ATTENDANCE_SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ status: 'error', message: 'Attendance sheet not found: ' + ATTENDANCE_SHEET_NAME });
    }

    var byUser = data.userName || '';
    var targets = data.targets || [];
    var paid = !!data.paid;
    var totalAmount = Number(data.amount) || 0;

    var checkinDateString = data.date || '';
    var checkinDate = parseYyyyMmDdOrToday(checkinDateString);

    if (targets.length === 0 && byUser) {
      targets = [byUser];
    }

    if (targets.length === 0) {
      return jsonResponse({ status: 'error', message: 'No targets to check in.' });
    }

    var perPlayerCharge = 0;
    if (paid && totalAmount > 0) {
      perPlayerCharge = totalAmount / targets.length;
      perPlayerCharge = Math.round(perPlayerCharge * 100) / 100; // 2 decimal places
    }

    // Build rows
    var rows = [];
    for (var i = 0; i < targets.length; i++) {
      var name = targets[i];
      var charge = paid ? perPlayerCharge : 0;
      // Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID
      rows.push([checkinDate, DEFAULT_HOURS, name, 1, charge, paid]);
    }

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return jsonResponse({ status: 'ok', rowsAdded: rows.length });

  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

// GET handler used both as a health check and for the "admin view".
//
// If called with ?date=YYYY-MM-DD, it returns rows from `Attendance`
// whose Date equals that date (by calendar day):
//
// {
//   "status": "ok",
//   "date": "2025-10-31",
//   "rows": [
//     { "playerName": "Jay", "paid": true, "charge": 5, "hours": 2 },
//     ...
//   ]
// }
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ATTENDANCE_SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ status: 'error', message: 'Attendance sheet not found: ' + ATTENDANCE_SHEET_NAME });
  }

  if (e && e.parameter && e.parameter.date) {
    var dateParam = e.parameter.date;
    var targetDate = parseYyyyMmDdOrToday(dateParam);
    var targetSerial = dateSerial(targetDate);

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse({ status: 'ok', date: dateParam, rows: [] });
    }

    // Assume headers in row 1, data from row 2.
    var dataRange = sheet.getRange(2, 1, lastRow - 1, 6); // Date..PAID
    var values = dataRange.getValues();

    var rows = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var dateValue = row[0]; // Date
      if (!dateValue) continue;

      // Compare only by date (ignore time)
      if (dateSerial(dateValue) === targetSerial) {
        rows.push({
          playerName: row[2],                // Player Name
          paid: !!row[5],                    // PAID (boolean)
          charge: Number(row[4]) || 0,       // Charge (auto)
          hours: Number(row[1]) || DEFAULT_HOURS
        });
      }
    }

    return jsonResponse({ status: 'ok', date: dateParam, rows: rows });
  }

  // Default health check
  return jsonResponse({ status: 'ok' });
}

// Helpers

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseYyyyMmDdOrToday(s) {
  if (!s) {
    return new Date();
  }
  var parts = s.split('-');
  if (parts.length === 3) {
    var year = Number(parts[0]);
    var month = Number(parts[1]) - 1;
    var day = Number(parts[2]);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  return new Date();
}

// Convert a Date to a serial day number (ignoring time) for comparison.
function dateSerial(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
