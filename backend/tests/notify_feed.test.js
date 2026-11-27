const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const tables = {
  Reservations: [['Id', 'Date', 'Start', 'End', 'Court', 'Status'], [80, '11/25/2026', '18:30', '20:00', 'North', 'reserved'], [81, '11/30/2026', '9:00', '10:00', 'South', 'reserved'], [82, '12/1/2026', '09:00', '10:00', 'South', 'reserved']],
  Attendance: [['Date', 'Player Name', 'UserId', 'Present (1/0)', 'Charge (auto)', 'PAID', 'ReservationId'], ['', '', '', '', '', '', ''], ['11/25/2026', 'Player', 'u1', 1, 10, 5, 80], ['12/1/2026', 'Other', 'u2', 1, 10, 0, 82]],
  Users: [['UserId', 'Name', 'FirstName', 'Phone', 'TextVia', 'GameTexts', 'LoginHash', 'Email', 'Notes', 'PinHash'], ['u1', 'Player', 'First', ' ‭6264295260‬ ', 'sms', 'yes', 'secret-hash', 'private@example.com', 'private-note', 'pin-hash'], ['u2', 'Other', '', '', '', '', '', '', '', '']]
};
const context = vm.createContext({ PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'correct' }) }, Session: { getScriptTimeZone: () => 'UTC' }, Utilities: { formatDate: (d, tz, format) => format === 'yyyy-MM-dd' ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }, SpreadsheetApp: { getActive: () => ({ getSheetByName: name => ({ getDataRange: () => ({ getValues: () => tables[name] }) }) }) } });
for (const file of ['Code.gs', 'NotifyFeed.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script', file), 'utf8'), context);
const feed = extra => JSON.parse(JSON.stringify(context.botFeed_({fromDate:'2026-11-20',toDate:'2026-11-30', ...extra})));
assert.equal(feed({}).error, 'forbidden');
assert.equal(feed({secret:'wrong'}).error, 'forbidden');
assert.equal(feed({secret:'correct',fromDate:'2026-11-30',toDate:'2026-11-20'}).error, 'bad_request');
assert.equal(feed({secret:'correct',fromDate:'2026-01-01',toDate:'2026-02-15'}).error, 'bad_request');
assert.equal(feed({secret:'correct',fromDate:'2026-02-30'}).error, 'bad_request');
const result = feed({secret:'correct'});
assert.equal(result.ok, true);
assert.deepEqual(result.sessions.map(s => s.id), ['80','81']);
assert.equal(result.sessions[0].date, '2026-11-25');
assert.equal(result.sessions[1].start, '09:00');
assert.deepEqual(result.rows, [{row:3,date:'2026-11-25',reservationId:'80',name:'Player',userId:'u1',present:1,charge:10,paid:5}]);
assert.equal(result.users[0].phone, '6264295260');
assert.deepEqual(Object.keys(result.users[0]), ['userId','name','firstName','phone','textVia','gameTexts']);
assert.doesNotMatch(JSON.stringify(result), /secret-hash|private@example.com|private-note|pin-hash|LoginHash|Email|Notes|PinHash/);
assert.equal(result.users.length, 1);
tables.Users[0][2] = 'MissingFirstName';
assert.equal(feed({secret:'correct'}).users[0].firstName, '');
console.log('notify feed tests passed');
