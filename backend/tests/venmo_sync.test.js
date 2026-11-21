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
