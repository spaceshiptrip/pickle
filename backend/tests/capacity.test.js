const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../google-apps-script/Code.gs'), 'utf8');
const header = ['Date', 'Hours', 'Player Name', 'Present (1/0)', 'Charge (auto)', 'PAID', 'ReservationId', 'UserId'];
function run(count, names, capacity, role = 'member', existingSelf = false) {
  const rows = Array.from({length: count}, (_, i) => ['', '', existingSelf && i === 0 ? 'Self' : `Player ${i}`, 1, 0, 0, 91, '']);
  const writes = [];
  let locked = false;
  const ctx = vm.createContext({
    LockService: {getScriptLock: () => ({waitLock: () => { assert.equal(locked, false); locked = true; }, releaseLock: () => { assert.equal(locked, true); locked = false; }})},
    SpreadsheetApp: {flush: () => assert.equal(locked, true)},
  });
  vm.runInContext(source, ctx);
  ctx.findReservation_ = () => ({Id: 91, Capacity: capacity, BaseFee: 10, Fees: []});
  ctx.sheetByName = () => ({getLastRow: () => rows.length + 1, getRange: () => ({setValues: values => { assert.equal(locked, true); writes.push(...values); }})});
  ctx.readTable_ = () => { assert.equal(locked, true); return {header, rows}; };
  ctx.findUserByName_ = () => null;
  const result = ctx.signup_({reservationId: 91, players: names}, {role, user: {Name: 'Self'}, userId: 'u1'});
  assert.equal(locked, false);
  return {result, writes};
}
let r = run(7, ['Self'], 8); assert.equal(r.result.ok, true); assert.equal(r.writes.length, 1);
r = run(8, ['Self'], 8); assert.equal(r.result.error, 'full'); assert.equal(r.result.spotsLeft, 0); assert.equal(r.writes.length, 0);
r = run(7, ['Self', 'Guest'], 8); assert.equal(r.result.error, 'full'); assert.equal(r.result.spotsLeft, 1); assert.equal(r.writes.length, 0);
r = run(8, ['Extra'], 8, 'admin'); assert.equal(r.result.ok, true); assert.equal(r.writes.length, 1);
for (const capacity of [0, '']) { r = run(8, ['Self'], capacity); assert.equal(r.result.ok, true); assert.equal(r.writes.length, 1); }
r = run(8, ['Self'], 8, 'member', true); assert.equal(r.result.ok, true); assert.equal(r.writes.length, 0);
r = run(7, ['Guest'], 8, 'member', true); assert.equal(r.result.ok, true); assert.equal(r.writes.length, 1);
console.log('capacity tests passed');
