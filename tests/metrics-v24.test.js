const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function authBackend() {
  const properties = {};
  const cache = new Map();
  const inspectors = [];
  const registrations = [];
  const digestCalls = {count: 0};
  const scriptProperties = {
    getProperty: key => Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : null,
    getProperties: () => ({...properties}),
    setProperty: (key, value) => { properties[key] = String(value); },
    deleteProperty: key => { delete properties[key]; }
  };
  const scriptCache = {
    get: key => cache.has(key) ? cache.get(key) : null,
    put: (key, value) => { cache.set(key, String(value)); },
    remove: key => { cache.delete(key); }
  };
  const context = vm.createContext({
    console,
    Date,
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    PropertiesService: {getScriptProperties: () => scriptProperties},
    CacheService: {getScriptCache: () => scriptCache},
    Utilities: {
      DigestAlgorithm: {SHA_256: 'SHA_256'},
      Charset: {UTF_8: 'UTF_8'},
      getUuid: () => crypto.randomUUID(),
      computeDigest: (algorithm, value) => {
        digestCalls.count += 1;
        return [...crypto.createHash('sha256').update(typeof value === 'string' ? value : Buffer.from(value)).digest()];
      }
    },
    ContentService: {
      MimeType: {TEXT: 'text'},
      createTextOutput: text => ({setMimeType() { return this; }, getContent() { return text; }})
    }
  });
  for (const name of ['Config', 'Utils', 'Auth', 'MetricsService', 'Code']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', name + '.gs'), 'utf8'), context);
  }
  context.rowsAsObjects_ = name => name === 'User_Registration' ? registrations : inspectors;
  context.updateObjectRow_ = () => {};
  return {c: context, properties, cache, inspectors, registrations, digestCalls};
}

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

test('public counters persist aggregates, deduplicate visits, validate UUID and never reveal identity',()=>{
 const {c,properties,cache}=authBackend(),visitId=crypto.randomUUID();
 const post=(action,payload)=>JSON.parse(c.doPost({postData:{contents:JSON.stringify({action,payload})}}).getContent());
 assert.equal(post('getCounters',{}).data.totalVisits,0);
 assert.equal(post('recordVisit',{visitId}).data.totalVisits,1);
 assert.equal(post('recordVisit',{visitId}).data.counted,false);
 assert.equal(post('recordVisit',{visitId:'bad'}).error.code,'VALIDATION_ERROR');
 assert.equal(post('recordUsage',{}).error.code,'UNAUTHORIZED');
 assert.equal(post('listRegistrations',{}).ok,false);
 assert.equal(c.getCounters_().today.visits,1);
 assert.equal(properties.USAGE_COUNTERS_V1.includes(visitId),false);
 assert.equal([...cache.keys()].some(k=>k.includes(visitId)),false);
});
test('authenticated usage counts distinct accounts per day and hashes cache identifiers',()=>{
 const {c,properties,cache}=authBackend();
 c.setupPasswordAccount('admin-user','test-password',{role:'admin'});
 const login=c.login_({username:'admin-user',password:'test-password'});
 const post=token=>JSON.parse(c.doPost({postData:{contents:JSON.stringify({action:'recordUsage',token,payload:{phone:'0812345678'}})}}).getContent());
 assert.equal(post(login.token).data.today.users,1);
 assert.equal(post(login.token).data.counted,false);
 assert.equal(c.recordUsage_({id:'account:other',role:'inspector'}).today.users,2);
 assert.equal(c.getCounters_().totalUserDays,2);
 assert.equal(properties.USAGE_COUNTERS_V1.includes('admin-user'),false);
 assert.equal([...cache.keys()].filter(k=>k.startsWith('metrics:')).some(k=>k.includes('admin-user')||k.includes('account:other')),false);
});
test('metrics lock contention and anonymous admission cap avoid duplicate persistence',()=>{
 const {c,properties}=authBackend();
 for(let i=0;i<120;i++)c.recordVisit_({visitId:crypto.randomUUID()});
 assert.equal(c.recordVisit_({visitId:crypto.randomUUID()}).counted,false);
 assert.equal(c.getCounters_().totalVisits,120);
 c.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock(){throw Error('not owned')}})};
 assert.equal(c.recordVisit_({visitId:crypto.randomUUID()}).counted,false);
 assert.equal(JSON.parse(properties.USAGE_COUNTERS_V1).totalVisits,120);
});
test('daily buckets follow Bangkok midnight, retain thirty days and preserve lifetime aggregates',()=>{
 const {c,cache}=authBackend();let now=Date.parse('2026-10-01T16:59:59Z');c.Date=class extends Date{static now(){return now;}};
 c.recordVisit_({visitId:crypto.randomUUID()});assert.equal(c.getCounters_().today.date,'2026-10-01');
 now+=1000;cache.clear();c.recordVisit_({visitId:crypto.randomUUID()});assert.equal(c.getCounters_().today.date,'2026-10-02');
 for(let i=0;i<35;i++){now+=86400000;cache.clear();c.recordVisit_({visitId:crypto.randomUUID()});}
 assert.equal(c.getCounters_().daily.length,30);assert.equal(c.getCounters_().totalVisits,37);
});
