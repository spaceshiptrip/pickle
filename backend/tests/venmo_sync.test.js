const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script/VenmoSync.gs'), 'utf8'), context);
const dates = (note, received = new Date(2026, 10, 20)) => Array.from(context.sessionDatesFromNote_(note, received));
const tests = [
  ['app note formats', () => { assert.deepEqual(dates('Pickleball 2026-11-19 18:30'), ['2026-11-19']); assert.deepEqual(dates('Pickleball+2026-11-19+18:30'), ['2026-11-19']); }],
  ['M/D and previous year', () => assert.deepEqual(dates('games 12/31', new Date(2026, 0, 2)), ['2025-12-31'])],
  ['two dates', () => assert.deepEqual(dates('games 9/16 and 10-14'), ['2026-09-16', '2026-10-14'])],
  ['you paid skipped', () => assert.equal(context.parseVenmoSubject_('You paid Example Player $10.00'), null)],
  ['account notice skipped', () => assert.equal(context.parseVenmoSubject_('Your account notice'), null)],
  ['amount with comma', () => assert.equal(context.parseVenmoSubject_('Example Player paid you $1,234.50').amount, 1234.5)],
  ['note from body', () => assert.equal(context.parseVenmoNote_('Payment received\nNote: Pickleball 2026-11-19 18:30\nThanks'), 'Pickleball 2026-11-19 18:30')],
  ['unknown payer review', () => assert.equal(context.venmoPlan_('Unknown Person', 10, ['2026-11-19'], [['known', '42']], { Venmo: 0, UserId: 1 }, [], {}, {}).result, 'review')],
];
for (const [name, fn] of tests) { fn(); console.log('ok - ' + name); }
console.log(`${tests.length} tests passed`);
