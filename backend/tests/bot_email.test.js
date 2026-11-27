const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const rows = [['UserId', 'Email'], ['u1', 'one@example.com'], ['u2', ''], ['u3', 'two@example.com']];
let sent = [], quota = 20;
const context = vm.createContext({
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'correct' }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  MailApp: { getRemainingDailyQuota: () => quota, sendEmail: message => sent.push(message) },
  SpreadsheetApp: { getActive: () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => rows }) }) }) }
});
for (const file of ['Code.gs', 'BotEmail.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script', file), 'utf8'), context);
const call = extra => JSON.parse(JSON.stringify(context.botEmail_({secret:'correct', userIds:['u1'], subject:'Hello', body:'Text', ...extra})));
assert.equal(call({secret:'wrong'}).error, 'forbidden');
assert.deepEqual(call({userIds:['u1','u2','missing','u3'], to:'intruder@example.com', bcc:'intruder@example.com'}), {ok:true,sent:2,skipped:['u2','missing']});
assert.equal(sent.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), {to:'owner@example.com',bcc:'one@example.com,two@example.com',subject:'Pickle Bot: Hello',body:'Text',name:'Pickle Bot',replyTo:'owner@example.com'});
assert.deepEqual(call({userIds:['intruder@example.com']}), {ok:true,sent:0,skipped:['intruder@example.com']});
assert.equal(sent.length, 1);
for (const extra of [{userIds:[]}, {userIds:Array(21).fill('u1')}, {subject:'x'.repeat(109)}, {body:'x'.repeat(2001)}, {subject:'bad\nBcc: x@example.com'}]) assert.equal(call(extra).error, 'bad_request');
assert.equal(call({subject:'x'.repeat(108),body:'x'.repeat(2000)}).ok, true);
assert.equal(call({subject:'Pickle Bot: Hello'}).ok, true);
assert.equal(sent.at(-1).subject, 'Pickle Bot: Hello');
quota = 1;
assert.equal(call({userIds:['u1','u3']}).error, 'quota');
assert.equal(sent.length, 3);
console.log('bot email tests passed');
