const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let rows, writes, locks;
const sheet = {
  getDataRange: () => ({getValues: () => rows.map(row => row.slice())}),
  getRange: (r, c) => ({setValue: value => { writes.push([r, c, value]); rows[r - 1][c - 1] = value; }})
};
const context = vm.createContext({
  PropertiesService: {getScriptProperties: () => ({getProperty: () => 'correct'})},
  LockService: {getScriptLock: () => ({waitLock: () => locks.push('wait'), releaseLock: () => locks.push('release')})},
  SpreadsheetApp: {getActive: () => ({getSheetByName: name => { assert.equal(name, 'Reservations'); return sheet; }})},
  ContentService: {MimeType: {JSON: 'json'}, createTextOutput: value => ({setMimeType: () => value})}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script/Code.gs'), 'utf8'), context);
function run(court, remove, status = 'reserved', extra = {}) {
  rows = [['Id', 'Court', 'Capacity', 'Status'], ['', '', '', ''], [12, court, 14, status]];
  writes = []; locks = [];
  const payload = {action: 'botsetcourt', secret: 'correct', reservationId: '12', remove, ...extra};
  const result = JSON.parse(context.doPost({postData: {contents: JSON.stringify(payload)}}));
  return {result, writes: writes.slice(), locks: locks.slice()};
}
for (const [remove, court] of [['south', 'North'], ['north', 'South']]) {
  const r = run('Both', remove);
  assert.deepEqual(r.result, {ok:true, reservationId:12, court, capacity:8, status:'reserved'});
  assert.deepEqual(r.writes, [[3, 2, court], [3, 3, 8]]);
  assert.deepEqual(r.locks, ['wait', 'release']);
}
for (const court of ['North', 'South']) {
  const r = run(court, court.toLowerCase());
  assert.deepEqual(r.result, {ok:true, reservationId:12, court, capacity:14, status:'canceled'});
  assert.deepEqual(r.writes, [[3, 4, 'canceled']]);
}
for (const args of [['North','south'], ['South','north'], ['Both','south','canceled'], ['Both','south','proposed'], ['Both','east'], ['Both','south','reserved',{reservationId:'999999'}], ['Both','south','reserved',{secret:'wrong'}]]) {
  const r = run(...args);
  assert.equal(r.result.ok, false);
  assert.ok(r.result.error);
  assert.deepEqual(r.writes, []);
}
assert.equal(run('Both', 'south', 'reserved', {secret:'wrong'}).result.error, 'forbidden');
console.log('bot court tests passed');
