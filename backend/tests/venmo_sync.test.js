const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script/VenmoSync.gs'), 'utf8'), context);
const dates = (note, received = new Date(2026, 10, 20)) => Array.from(context.sessionDatesFromNote_(note, received));
const users = [['1', 'Pat Example, Sam Example', '@pat-ex'], ['2', '', '@solo-ex']];
const uidx = { UserId: 0, VenmoName: 1, Venmo: 2 };
const tests = [
  ['add names with trimming and case-insensitive deduplication', () => { assert.equal(context.addVenmoName_(" Pat Example , Sam Example ", " sam example "), "Pat Example, Sam Example"); assert.equal(context.addVenmoName_("Pat Example", " Alex Example "), "Pat Example, Alex Example"); assert.equal(context.addVenmoName_("", " Alex Example "), "Alex Example"); }],
  ['live review rows newest first', () => { const rows = [["id", "received", "payer", "amount", "note", "result", "rows", "mode"], ["a", new Date("2026-11-19T00:00:00Z"), "Pat Example", 5, "game", "review", 0, "live"], ["b", new Date("2026-11-20T00:00:00Z"), "Sam Example", 10, "games", "review", 0, "live"], ["c", new Date(), "Alex Example", 5, "", "review", 0, "dry"], ["d", new Date(), "Alex Example", 5, "", "done", 1, "live"]]; const result = JSON.parse(JSON.stringify(context.reviewRows_(rows))); assert.deepEqual(result.map(r => r.MessageId), ["b", "a"]); assert.equal(result[0].Received, "2026-11-20T00:00:00.000Z"); assert.deepEqual(Object.keys(result[0]), ["MessageId", "Received", "Payer", "Amount", "Note"]); }],
  ['VenmoName list and handle match', () => { assert.equal(context.venmoUser_('Sam Example', users, uidx), '1'); assert.equal(context.venmoUser_('@solo-ex', users, uidx), '2'); assert.equal(context.venmoUser_('Pat', users, uidx), null); }],

  ['app note formats', () => { assert.deepEqual(dates('Pickleball 2026-11-19 18:30'), ['2026-11-19']); assert.deepEqual(dates('Pickleball+2026-11-19+18:30'), ['2026-11-19']); }],
  ['ISO dates with and without a time', () => { assert.deepEqual(dates('Pickleball 2026-11-22'), ['2026-11-22']); assert.deepEqual(dates('pickleball 2026-11-22 19:00'), ['2026-11-22']); assert.deepEqual(dates('2026-11-22 and 11/25', new Date(2026, 10, 26)), ['2026-11-22', '2026-11-25']); }],
  ['dates with explicit years', () => { assert.deepEqual(dates('Pickleball 11-25-2026 and 11-27-2026 and 11-29-2026'), ['2026-11-25', '2026-11-27', '2026-11-29']); assert.deepEqual(dates('11/25/26'), ['2026-11-25']); assert.deepEqual(dates('11/25/2026 and 11-27-26'), ['2026-11-25', '2026-11-27']); assert.deepEqual(dates('11/25', new Date(2026, 10, 26)), ['2026-11-25']); }],
  ['M/D and previous year', () => assert.deepEqual(dates('games 12/31', new Date(2026, 0, 2)), ['2025-12-31'])],
  ['two dates', () => assert.deepEqual(dates('games 9/16 and 10-14'), ['2026-09-16', '2026-10-14'])],
  ['you paid skipped', () => assert.equal(context.parseVenmoSubject_('You paid Example Player $10.00'), null)],
  ['payment subject formats', () => { assert.deepEqual(JSON.parse(JSON.stringify(context.parseVenmoSubject_('Rhoniel Chan paid $10.00 to your Venmo account. Leave it in Venmo'))), { payer: 'Rhoniel Chan', amount: 10 }); assert.deepEqual(JSON.parse(JSON.stringify(context.parseVenmoSubject_('  Example Player paid you $1,234.50'))), { payer: 'Example Player', amount: 1234.5 }); assert.equal(context.parseVenmoSubject_('You paid X $5.00'), null); assert.equal(context.parseVenmoSubject_('Example charged you $5.00'), null); assert.equal(context.parseVenmoSubject_('Example requests $5.00'), null); assert.equal(context.parseVenmoSubject_('Example paid $1,234.50 to your Venmo account').amount, 1234.5); }],
  ['new payment body contains session date', () => { const note = context.parseVenmoNote_('Rhoniel chan paid you $10.00\nRhoniel chan paid you $ 10 . 00 Picklebal Sun 11/22 See transaction ...'); assert.deepEqual(dates(note, new Date(2026, 10, 22)), ['2026-11-22']); }],
  ['account notice skipped', () => assert.equal(context.parseVenmoSubject_('Your account notice'), null)],
  ['amount with comma', () => assert.equal(context.parseVenmoSubject_('Example Player paid you $1,234.50').amount, 1234.5)],
  ['note from body', () => assert.equal(context.parseVenmoNote_('Payment received\nNote: Pickleball 2026-11-19 18:30\nThanks'), 'Pickleball 2026-11-19 18:30')],
  ['unknown payer review', () => assert.equal(context.venmoPlan_('Unknown Person', 10, ['2026-11-19'], [['known', '42']], { Venmo: 0, UserId: 1 }, [], {}, {}).result, 'review')],
];
for (const [name, fn] of tests) { fn(); console.log('ok - ' + name); }
console.log(`${tests.length} tests passed`);
const normalize = value => JSON.parse(JSON.stringify(value));
const unpaid = { row: 2, present: 1, charge: 10, paid: 2 };
assert.deepEqual(normalize(context.planAssign_(2, [unpaid, { row: 3, present: 1, charge: 10, paid: 10 }])), { marked: [unpaid], add: 1 });
assert.deepEqual(normalize(context.planAssign_(1, [])), { marked: [], add: 1 });
assert.deepEqual(normalize(context.planAssign_(0, [unpaid])), { marked: [], add: 0 });
const amount = 25, fee = 10, spots = Math.floor(amount / fee);
assert.deepEqual(normalize(context.planAssign_(spots, [])), { marked: [], add: 2 });
assert.equal(amount - spots * fee, 5);
assert.deepEqual(Array.from(context.guestNames_('Pat Example', false, 3)), ['Pat Example', 'Pat Example +1', 'Pat Example +2']);
assert.deepEqual(Array.from(context.guestNames_('Pat Example', true, 2)), ['Pat Example +1', 'Pat Example +2']);
console.log('ok - assignment and guest names');
// Exercise the sheet and log effects without contacting Apps Script services.
const tables = {
  VenmoLog: [['MessageId', 'Received', 'Payer', 'Amount', 'Note', 'Result', 'RowsMarked', 'Mode'], ['m1', new Date(2026, 10, 20), 'Sam Example', 25, '11/19', 'review', 0, 'live']],
  Users: [['UserId', 'Name', 'VenmoName', 'Venmo'], ['u1', 'Pat Example', '', '']],
  Reservations: [['Id', 'Date', 'Status', 'BaseFee'], ['r1', '2026-11-19', 'reserved', 10], ['r2', '2026-11-19', 'cancelled', 10]],
  Attendance: [['Date', 'Hours', 'Player Name', 'UserId', 'Present (1/0)', 'Charge (auto)', 'PAID', 'ReservationId'], ['2026-11-19', 2, 'Pat Example', 'u1', 1, 10, 0, 'r1'], ['2026-11-19', 2, 'Alex Example', 'u2', 1, 10, 0, 'r1']]
};
const sheets = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
  getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
  getRange: (row, col) => ({ setValue: value => { rows[row - 1][col - 1] = value; }, setValues: values => values.forEach((r, i) => r.forEach((v, j) => { rows[row - 1 + i][col - 1 + j] = v; })) }),
  appendRow: row => rows.push(Array.from(row))
}]));
context.headerIndexMap_ = headers => Object.fromEntries(Array.from(headers, (h, i) => [h, i]));
context.sheetByName = name => sheets[name];
context.SpreadsheetApp = { getActive: () => ({ getSheetByName: name => sheets[name] }) };
context.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
context.GmailApp = { getMessageById: () => ({ getThread: () => ({ removeLabel() {}, addLabel() {} }) }), getUserLabelByName: () => ({}), createLabel: () => ({}) };
context.parseSheetDate_ = () => null;
context.parseYmd_ = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
assert.deepEqual(Array.from(context.listVenmoReview_()[0].SuggestedReservationIds), ['r1']);
assert.equal(context.resolveVenmo_({ messageId: 'm1', userId: 'u1', reservationId: 'r2' }).error, 'bad_reservation');
assert.equal(tables.Users[1][2], '');
assert.deepEqual(normalize(context.resolveVenmo_({ messageId: 'm1', userId: 'u1', reservationId: 'r1' })), { ok: true, result: 'done', rowsMarked: 2 });
assert.equal(tables.Attendance[1][6], 10);
assert.equal(tables.Attendance[2][6], 0);
assert.deepEqual(tables.Attendance[3], ['2026-11-19', 2, 'Pat Example +1', 'u1', 1, 10, 10, 'r1']);
assert.equal(tables.VenmoLog[1][6], 2);
console.log('ok - offline review and assignment integration');

const payment = (subject, body = '', html = '') => normalize(context.parseVenmoPayment_(subject, body, html));
const real = payment('Rhoniel Chan paid $10.00 to your Venmo account. Leave it in Venmo or transfer it to your bank account.', 'Rhoniel chan paid you $10.00\nRhoniel chan paid you $ 10 . 00 Picklebal Sun 11/22 See transaction Money credited to your Venmo account.');
assert.equal(real.payer, 'Rhoniel Chan'); assert.equal(real.amount, 10); assert.match(real.note, /Sun 11\/22/); assert.deepEqual(dates(real.note, new Date(2026, 10, 22)), ['2026-11-22']);
assert.equal(payment('Unknown wording', 'Pat paid you $12.00').payer, 'Pat');
assert.equal(payment('Old Name paid you $5.00').amount, 5);
assert.equal(payment('', '', '<html><title>Pat sent you $ 10 . 00</title></html>').amount, 10);
assert.equal(payment('You paid X $5.00'), null);
assert.equal(payment('Pat requests $5.00'), null);
assert.equal(payment('Pat charged you $5.00'), null);
assert.equal(context.venmoMoneyRelated_('Venmo statement $5.00 payment ...', '', ''), true);
assert.equal(context.venmoMoneyRelated_('New remembered device added', '', ''), false);
console.log('ok - robust payment parsing and classification');

const received = new Date(2026, 10, 27);
const namedDates = (note, rows = []) => Array.from(context.sessionDatesFromNote_(note, received, rows));
assert.deepEqual(namedDates('Pickleball Nov 25'), ['2026-11-25']);
assert.deepEqual(namedDates('november 25th and dec 2'), ['2026-11-25', '2026-12-02']);
assert.deepEqual(namedDates('25 Nov and Nov. 25, 2026'), ['2026-11-25']);
assert.deepEqual(namedDates('11.25 and 11.25.26 and 11.25.2026'), ['2026-11-25']);
assert.deepEqual(namedDates('wed and fri', ['2026-11-25', '2026-11-27']), ['2026-11-25', '2026-11-27']);
assert.deepEqual(namedDates('this sunday and last wed', ['2026-11-29', '2026-11-25']), ['2026-11-29', '2026-11-25']);
assert.deepEqual(namedDates('Wednesday Sun Fri 7pm 19:00 $10.00 25th'), []);
const ai = { Date: 0, UserId: 1, present: 2, charge: 3, PAID: 4, ReservationId: 5 };
const openRows = [['2026-11-27', '1', 1, 10, 0, 'r2'], ['2026-11-25', '1', 1, 10, 0, 'r1']];
const statuses = { r1: 'reserved', r2: 'reserved' };
const plan = amount => normalize(context.venmoPlan_('Pat Example', amount, [], users, uidx, openRows, ai, statuses, received));
assert.deepEqual(plan(20), { result: 'done', rows: [{ row: 3, charge: 10 }, { row: 2, charge: 10 }] });
assert.deepEqual(plan(10), { result: 'review', rows: [] });
assert.deepEqual(Array.from(context.venmoPayerDates_('Pat Example', users, uidx, openRows.concat([['2026-11-29', '2']]), ai)), ['2026-11-27', '2026-11-25']);
console.log('ok - common note dates and exact-total fallback');

const householdUsers = [
  ['4', 'Jennifer Rivera', '@jenn', ' Rivera '],
  ['5', 'Randy Rivera', '@randy', 'rivera'],
  ['9', 'Other Person', '@other', ''],
  ['10', 'Another Person', '@another', '']
];
const householdIdx = { UserId: 0, VenmoName: 1, Venmo: 2, Household: 3 };
const householdRows = [
  ['2026-11-27', '4', 1, 10, 0, 'r2', 'Randy Rivera'],
  ['2026-11-25', '4', 1, 10, 0, 'r1', 'Jenn'],
  ['2026-11-25', '5', 1, 10, 0, 'r1', 'Randy']
];
const householdPlan = (payer, amount, note, rows = householdRows) => normalize(context.venmoPlan_(payer, amount, Array.from(context.sessionDatesFromNote_(note, received, context.venmoPayerDates_(payer, householdUsers, householdIdx, rows, ai))), householdUsers, householdIdx, rows, ai, statuses, received));
assert.deepEqual(householdPlan('Randy Rivera', 10, 'Fri 11/27'), { result: 'done', rows: [{ row: 2, charge: 10 }] });
assert.deepEqual(householdPlan('Jennifer Rivera', 20, '11/25'), { result: 'done', rows: [{ row: 3, charge: 10 }, { row: 4, charge: 10 }] });
assert.deepEqual(householdPlan('Other Person', 10, '11/27'), { result: 'review', rows: [] });
assert.deepEqual(householdPlan('Randy Rivera', 15, '11/27'), { result: 'review', rows: [] });
assert.deepEqual(normalize(context.venmoPlan_('Randy Rivera', 10, ['2026-11-27'], householdUsers, uidx, householdRows, ai, statuses, received)), { result: 'review', rows: [] });
assert.deepEqual(householdPlan('Jennifer Rivera', 30, ''), { result: 'done', rows: [{ row: 3, charge: 10 }, { row: 4, charge: 10 }, { row: 2, charge: 10 }] });
console.log('ok - household payments and isolation');
