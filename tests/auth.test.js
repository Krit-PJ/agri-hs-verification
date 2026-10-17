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
  const digestCalls = {count: 0};
  const scriptProperties = {
    getProperty: key => Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : null,
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
  for (const name of ['Config', 'Utils', 'Auth', 'Code']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', name + '.gs'), 'utf8'), context);
  }
  context.rowsAsObjects_ = () => inspectors;
  context.updateObjectRow_ = () => {};
  return {c: context, properties, cache, inspectors, digestCalls};
}

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

test('password account stores only an iterative salted hash and returns no secret material', () => {
  const {c, properties, digestCalls} = authBackend();
  const password = 'correct horse demo 91';
  const result = c.setupPasswordAccount('AdminDemo', password, {displayName: 'Admin Demo', role: 'admin'});
  const stored = properties.AUTH_ACCOUNTS_V1;
  assert.equal(stored.includes(password), false);
  assert.equal(JSON.stringify(result).includes('hash'), false);
  assert.equal(JSON.stringify(result).includes('salt'), false);
  assert.equal(result.profile.role, 'admin');
  assert.ok(digestCalls.count >= 20000);
});

test('login creates an opaque expiring session, validates current backend role, and logout revokes it', () => {
  const {c} = authBackend();
  c.setupPasswordAccount('CaseUser', 'session-passphrase', {displayName: 'Case User', role: 'super_admin'});
  const login = c.login_({username: 'caseuser', password: 'session-passphrase'});
  assert.match(login.token, /^[0-9a-f]{64}$/);
  assert.equal(login.profile.username, 'CaseUser');
  assert.equal(login.profile.role, 'super_admin');
  assert.ok(Date.parse(login.expiresAt) > Date.now());
  assert.equal(c.authenticate_(login.token).role, 'super_admin');

  c.setupPasswordAccount('CaseUser', 'new-session-passphrase', {displayName: 'Case User', role: 'inspector'});
  expectCode(() => c.authenticate_(login.token), 'UNAUTHORIZED');
  const replacement = c.login_({username: 'CASEUSER', password: 'new-session-passphrase'});
  assert.equal(c.authenticate_(replacement.token).role, 'inspector');
  assert.equal(c.logoutSession_(replacement.token).loggedOut, true);
  expectCode(() => c.authenticate_(replacement.token), 'UNAUTHORIZED');
});

test('login failures use a generic response and enforce a per-username attempt limit', () => {
  const {c} = authBackend();
  c.setupPasswordAccount('limited-user', 'valid-passphrase', {role: 'admin'});
  for (let i = 0; i < 5; i += 1) expectCode(() => c.login_({username: 'limited-user', password: 'wrong-password'}), 'UNAUTHORIZED');
  expectCode(() => c.login_({username: 'limited-user', password: 'valid-passphrase'}), 'RATE_LIMITED');
  expectCode(() => c.login_({username: 'unknown-user', password: 'wrong-password'}), 'UNAUTHORIZED');
  expectCode(() => c.login_({username: 'constructor', password: 'wrong-password'}), 'UNAUTHORIZED');
  expectCode(() => c.setupPasswordAccount('__proto__', 'reserved-passphrase', {role: 'admin'}), 'VALIDATION_ERROR');
});

test('HTTP login runs before token authentication and HTTP logout revokes the supplied session', () => {
  const {c} = authBackend();
  c.setupPasswordAccount('web-user', 'web-passphrase', {displayName: 'Web User', role: 'admin'});
  const response = JSON.parse(c.doPost({postData: {contents: JSON.stringify({action: 'login', payload: {username: 'web-user', password: 'web-passphrase'}})}}).getContent());
  assert.equal(response.ok, true);
  assert.equal(response.data.profile.role, 'admin');
  const logout = JSON.parse(c.doPost({postData: {contents: JSON.stringify({action: 'logout', token: response.data.token, payload: {}})}}).getContent());
  assert.deepEqual(logout.data, {loggedOut: true});
  expectCode(() => c.authenticate_(response.data.token), 'UNAUTHORIZED');
});

test('requested account helper consumes bootstrap properties and deletes plaintext values', () => {
  const {c, properties} = authBackend();
  properties.BOOTSTRAP_ADMIN_PASSWORD = 'temporary-admin-secret';
  properties.BOOTSTRAP_SUPER_ADMIN_PASSWORD = 'temporary-super-secret';
  const result = c.setupRequestedLoginAccounts();
  assert.deepEqual(JSON.parse(JSON.stringify(result.accounts.map(item => [item.username, item.role]))), [['620000', 'admin'], ['Krit', 'super_admin']]);
  assert.equal(properties.BOOTSTRAP_ADMIN_PASSWORD, undefined);
  assert.equal(properties.BOOTSTRAP_SUPER_ADMIN_PASSWORD, undefined);
  assert.equal(c.login_({username: '620000', password: 'temporary-admin-secret'}).profile.role, 'admin');
  assert.equal(c.login_({username: 'Krit', password: 'temporary-super-secret'}).profile.role, 'super_admin');
});

test('legacy inspector tokens remain valid alongside password sessions', () => {
  const {c, inspectors} = authBackend();
  c.ensureAuthSecrets_();
  const legacyToken = crypto.randomBytes(32).toString('hex');
  inspectors.push({inspector_id: 'legacy', display_name: 'Legacy Inspector', role: 'inspector', token_hash: c.tokenHash_(legacyToken), active: true});
  const actor = c.authenticate_(legacyToken);
  assert.equal(actor.id, 'legacy');
  assert.equal(actor.role, 'inspector');
});

test('login refuses concurrent authentication when global lock is unavailable',()=>{
 const {c}=authBackend();c.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock(){throw Error('not acquired')}})};
 expectCode(()=>c.login_({username:'admin',password:'unused'}),'RATE_LIMITED');
});
