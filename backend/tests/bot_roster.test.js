const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rows = [
  ['UserId', 'Name', 'FirstName', 'Role', 'Active', 'Phone', 'TextVia', 'Email', 'Household', 'PinHash', 'LoginHash', 'Notes'],
  ['u1', 'Player', 'Pat', 'Member', true, ' \u202a(626) 429-5260\u202c ', 'sms', '  Pat@Example.COM ', 'family', 'pin', 'login', 'private'],
  ['u2', 'Other', '', 'guest', false, '', '', '', '', '', '', '']
];
const context = vm.createContext({
  PropertiesService: {getScriptProperties: () => ({getProperty: () => 'correct'})},
  SpreadsheetApp: {getActive: () => ({getSheetByName: () => ({getDataRange: () => ({getValues: () => rows})})})},
  Utilities: {DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'}, computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(value).digest()]},
  ContentService: {MimeType: {JSON: 'json'}, createTextOutput: value => ({setMimeType: () => value})}
});
for (const file of ['Code.gs', 'NotifyFeed.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script', file), 'utf8'), context);
const post = secret => JSON.parse(context.doPost({postData: {contents: JSON.stringify({action: 'botroster', secret})}}));
assert.deepEqual(post('wrong'), {ok: false, error: 'forbidden'});
const result = post('correct');
assert.equal(result.ok, true);
assert.equal(result.users.length, 2);
assert.deepEqual(result.users[0], {userId:'u1', name:'Player', firstName:'Pat', role:'member', active:true, phone:'6264295260', textVia:'sms', hasEmail:true, emailSha256:crypto.createHash('sha256').update('pat@example.com').digest('hex'), household:'family'});
assert.equal(result.users[1].active, false);
assert.equal(result.users[1].hasEmail, false);
assert.equal(result.users[1].emailSha256, '');
for (const user of result.users) for (const key of Object.keys(user)) assert.ok(!['email', 'PinHash', 'LoginHash', 'Notes'].includes(key));
assert.doesNotMatch(JSON.stringify(result), /Pat@Example.COM|"pin"|"login"|"private"/);
console.log('bot roster tests passed');
