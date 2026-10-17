function tokenHash_(token) {
  const pepper = PropertiesService.getScriptProperties().getProperty('TOKEN_PEPPER');
  assert_(pepper && pepper.length >= 24, 'CONFIG_ERROR', 'ยังไม่ได้ตั้งค่า TOKEN_PEPPER');
  return sha256_(pepper + ':' + token);
}

const AUTH_ACCOUNTS_PROPERTY_ = 'AUTH_ACCOUNTS_V1';
const AUTH_PASSWORD_PEPPER_PROPERTY_ = 'AUTH_PASSWORD_PEPPER';
const AUTH_DUMMY_SALT_PROPERTY_ = 'AUTH_DUMMY_SALT';
const AUTH_SESSION_PREFIX_ = 'auth-session:';
const AUTH_FAILURE_PREFIX_ = 'auth-failure:';

function ensureAuthSecrets_() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('TOKEN_PEPPER')) properties.setProperty('TOKEN_PEPPER', uuid_() + uuid_());
  if (!properties.getProperty(AUTH_PASSWORD_PEPPER_PROPERTY_)) properties.setProperty(AUTH_PASSWORD_PEPPER_PROPERTY_, uuid_() + uuid_());
  if (!properties.getProperty(AUTH_DUMMY_SALT_PROPERTY_)) properties.setProperty(AUTH_DUMMY_SALT_PROPERTY_, uuid_() + uuid_());
}

function normalizeUsername_(username) {
  const value = cleanText_(username, 64).toLowerCase();
  assert_(/^[a-z0-9._-]{3,64}$/.test(value), 'VALIDATION_ERROR', 'ชื่อผู้ใช้ต้องมี 3-64 ตัว และใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');
  return value;
}

function readAuthAccounts_() {
  const raw = PropertiesService.getScriptProperties().getProperty(AUTH_ACCOUNTS_PROPERTY_);
  if (!raw){if(typeof HSNational!=='undefined'){const all=PropertiesService.getScriptProperties().getProperties(),result={};Object.keys(all).filter(function(k){return k.indexOf('AUTH_ACCOUNT_V2_')===0;}).forEach(function(k){result[k.slice(16)]=JSON.parse(all[k]);});return result;}return {};}
  try {
    const parsed = JSON.parse(raw);
    assert_(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'CONFIG_ERROR', 'ข้อมูลบัญชีเข้าสู่ระบบเสียหาย');
    if(typeof HSNational!=='undefined'){const all=PropertiesService.getScriptProperties().getProperties();Object.keys(all).filter(function(k){return k.indexOf('AUTH_ACCOUNT_V2_')===0;}).forEach(function(k){parsed[k.slice(16)]=JSON.parse(all[k]);});}
    return parsed;
  } catch (error) {
    if (error && error.name === 'ApiError') throw error;
    throw new ApiError('CONFIG_ERROR', 'ข้อมูลบัญชีเข้าสู่ระบบเสียหาย');
  }
}

function authAccountByKey_(accounts, key) {
  return accounts && Object.prototype.hasOwnProperty.call(accounts, key) ? accounts[key] : null;
}

function passwordHash_(password, salt, iterations) {
  const pepper = PropertiesService.getScriptProperties().getProperty(AUTH_PASSWORD_PEPPER_PROPERTY_);
  assert_(pepper && pepper.length >= 24, 'CONFIG_ERROR', 'ยังไม่ได้ตั้งค่าระบบรหัสผ่าน');
  let digest = sha256_(pepper + ':' + salt + ':' + password);
  for (let i = 1; i < iterations; i += 1) digest = sha256_(pepper + ':' + salt + ':' + digest);
  return digest;
}

function publicAccountProfile_(account) {
  const profile = account.profile || {};
  return {
    username: cleanText_(account.username, 64),
    inspectorId: cleanText_(profile.inspectorId, 64) || ('account:' + cleanText_(account.username, 64).toLowerCase()),
    displayName: cleanText_(profile.displayName, 120) || cleanText_(account.username, 64),
    assignedProvinceCode: cleanText_(profile.assignedProvinceCode,2),
    role: ['inspector', 'admin', 'super_admin'].indexOf(profile.role) >= 0 ? profile.role : 'inspector',
    district: cleanText_(profile.district, 120),
    tambon: cleanText_(profile.tambon, 120),
    personCategory: cleanText_(profile.personCategory, 120),
    personCategoryOther: cleanText_(profile.personCategoryOther, 200),
    position: cleanText_(profile.position, 120),
    agency: cleanText_(profile.agency, 200)
  };
}

function actorFromAccount_(account) {
  const profile = publicAccountProfile_(account);
  return {
    id: profile.inspectorId,
    username: profile.username,
    assignedProvinceCode:profile.assignedProvinceCode,
    displayName: profile.displayName,
    role: profile.role,
    district: profile.district,
    tambon: profile.tambon,
    personCategory: profile.personCategory,
    personCategoryOther: profile.personCategoryOther,
    position: profile.position,
    agency: profile.agency
  };
}

function sessionCache_() {
  return CacheService.getScriptCache();
}

function authRateKey_(username) {
  return AUTH_FAILURE_PREFIX_ + sha256_(username).slice(0, 40);
}

function readAuthFailures_(username) {
  const raw = sessionCache_().get(authRateKey_(username));
  if (!raw) return {count: 0, resetAt: 0};
  try {
    const value = JSON.parse(raw);
    if (Number(value.resetAt) <= Date.now()) return {count: 0, resetAt: 0};
    return {count: Number(value.count) || 0, resetAt: Number(value.resetAt) || 0};
  } catch (ignored) {
    return {count: 0, resetAt: 0};
  }
}

function assertLoginAllowed_(username) {
  const failures = readAuthFailures_(username);
  if (failures.count >= APP.AUTH_MAX_FAILURES) {
    throw new ApiError('RATE_LIMITED', 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่', {retryAfterSeconds: Math.max(1, Math.ceil((failures.resetAt - Date.now()) / 1000))});
  }
}

function recordLoginFailure_(username) {
  const failures = readAuthFailures_(username);
  const now = Date.now();
  const resetAt = failures.resetAt > now ? failures.resetAt : now + APP.AUTH_FAILURE_WINDOW_SECONDS * 1000;
  sessionCache_().put(authRateKey_(username), JSON.stringify({count: failures.count + 1, resetAt: resetAt}), Math.max(1, Math.ceil((resetAt - now) / 1000)));
}

function clearLoginFailures_(username) {
  sessionCache_().remove(authRateKey_(username));
}

function sessionKey_(token) {
  return AUTH_SESSION_PREFIX_ + tokenHash_(token);
}

function login_(payload) {
  const lock=LockService.getScriptLock();
  assert_(lock.tryLock(10000), 'RATE_LIMITED', 'ระบบเข้าสู่ระบบกำลังมีผู้ใช้งาน กรุณาลองอีกครั้ง');
  try { return loginUnlocked_(payload); } finally { lock.releaseLock(); }
}

function loginUnlocked_(payload) {
  payload = payload || {};
  ensureAuthSecrets_();
  let username;
  try { username = normalizeUsername_(payload.username); } catch (ignored) { username = 'invalid-user'; }
  const password = payload.password == null ? '' : String(payload.password);
  assert_(password.length <= 256, 'UNAUTHORIZED', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  assertLoginAllowed_(username);

  const accounts = readAuthAccounts_();
  const account = authAccountByKey_(accounts, username);
  const dummySalt = PropertiesService.getScriptProperties().getProperty(AUTH_DUMMY_SALT_PROPERTY_);
  const salt = account && account.salt ? account.salt : dummySalt;
  const storedIterations = account ? Number(account.iterations) : 0;
  const iterations = storedIterations >= APP.AUTH_HASH_ITERATIONS && storedIterations <= 100000 ? storedIterations : APP.AUTH_HASH_ITERATIONS;
  const candidate = passwordHash_(password, salt, iterations);
  const valid = account && account.active !== false && secureEquals_(candidate, account.hash);
  if (!valid) {
    recordLoginFailure_(username);
    throw new ApiError('UNAUTHORIZED', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  clearLoginFailures_(username);
  const token = (uuid_() + uuid_()).replace(/-/g, '');
  const csrf=(uuid_()+uuid_()).replace(/-/g,'');
  const expiresAtMs = Date.now() + APP.AUTH_SESSION_SECONDS * 1000;
  sessionCache_().put(sessionKey_(token), JSON.stringify({csrf:csrf, username: username, version: account.sessionVersion, expiresAt: expiresAtMs}), APP.AUTH_SESSION_SECONDS);
  return {csrf:csrf, token: token, profile: publicAccountProfile_(account), expiresAt: new Date(expiresAtMs).toISOString()};
}

function authenticateSession_(token) {
  token = cleanText_(token, 256);
  if (token.length < APP.TOKEN_MIN_LENGTH) return null;
  const raw = sessionCache_().get(sessionKey_(token));
  if (!raw) return null;
  let session;
  try { session = JSON.parse(raw); } catch (ignored) { return null; }
  if (!session || Number(session.expiresAt) <= Date.now()) {
    sessionCache_().remove(sessionKey_(token));
    return null;
  }
  const account = authAccountByKey_(readAuthAccounts_(), cleanText_(session.username, 64));
  if (!account || account.active === false || !secureEquals_(session.version, account.sessionVersion)) {
    sessionCache_().remove(sessionKey_(token));
    return null;
  }
  return actorFromAccount_(account);
}

function logoutSession_(token) {
  token = cleanText_(token, 256);
  if (token.length >= APP.TOKEN_MIN_LENGTH) sessionCache_().remove(sessionKey_(token));
  return {loggedOut: true};
}

function setupPasswordAccount(username, password, profile) {
  ensureAuthSecrets_();
  const key = normalizeUsername_(username);
  assert_(['__proto__', 'prototype', 'constructor'].indexOf(key) < 0, 'VALIDATION_ERROR', 'ชื่อผู้ใช้นี้สงวนไว้');
  password = password == null ? '' : String(password);
  assert_(password.length >= 6 && password.length <= 256, 'VALIDATION_ERROR', 'รหัสผ่านต้องมี 6-256 ตัวอักษร');
  profile = profile || {};
  const role = cleanText_(profile.role, 32) || 'inspector';
  assert_(['inspector', 'admin', 'super_admin'].indexOf(role) >= 0, 'VALIDATION_ERROR', 'role ไม่ถูกต้อง');
  const accounts = readAuthAccounts_();
  const salt = (uuid_() + uuid_()).replace(/-/g, '');
  accounts[key] = {
    username: cleanText_(username, 64),
    salt: salt,
    iterations: APP.AUTH_HASH_ITERATIONS,
    hash: passwordHash_(password, salt, APP.AUTH_HASH_ITERATIONS),
    sessionVersion: uuid_(),
    active: profile.active !== false,
    profile: {
      inspectorId: cleanText_(profile.inspectorId, 64) || ('account:' + key),
      displayName: cleanText_(profile.displayName, 120) || cleanText_(username, 64),
      role: role,
      assignedProvinceCode:cleanText_(profile.assignedProvinceCode,2),
      district: cleanText_(profile.district, 120),
      tambon: cleanText_(profile.tambon, 120),
      personCategory: cleanText_(profile.personCategory, 120),
      personCategoryOther: cleanText_(profile.personCategoryOther, 200),
      position: cleanText_(profile.position, 120),
      agency: cleanText_(profile.agency, 200)
    }
  };
  if(typeof HSNational!=='undefined')PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+key,JSON.stringify(accounts[key]));else PropertiesService.getScriptProperties().setProperty(AUTH_ACCOUNTS_PROPERTY_, JSON.stringify(accounts));
  return {configured: true, profile: publicAccountProfile_(accounts[key])};
}

function setupRequestedLoginAccounts() {
  const properties = PropertiesService.getScriptProperties();
  const adminPassword = properties.getProperty('BOOTSTRAP_ADMIN_PASSWORD');
  const superAdminPassword = properties.getProperty('BOOTSTRAP_SUPER_ADMIN_PASSWORD');
  assert_(adminPassword && superAdminPassword, 'CONFIG_ERROR', 'ตั้งค่า BOOTSTRAP_ADMIN_PASSWORD และ BOOTSTRAP_SUPER_ADMIN_PASSWORD ก่อน');
  const admin = setupPasswordAccount('620000', adminPassword, {displayName: 'ผู้ดูแลระบบ', role: 'admin'});
  const superAdmin = setupPasswordAccount('Krit', superAdminPassword, {displayName: 'Krit', role: 'super_admin'});
  properties.deleteProperty('BOOTSTRAP_ADMIN_PASSWORD');
  properties.deleteProperty('BOOTSTRAP_SUPER_ADMIN_PASSWORD');
  return {configured: true, accounts: [admin.profile, superAdmin.profile], note: 'ลบ plaintext bootstrap passwords ออกจาก Script Properties แล้ว'};
}

function authenticate_(token) {
  token = cleanText_(token, 256);
  assert_(token.length >= APP.TOKEN_MIN_LENGTH, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้อง');
  const sessionActor = authenticateSession_(token);
  if (sessionActor) return sessionActor;
  const hash = tokenHash_(token);
  const adminHash = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN_HASH');
  if (adminHash && secureEquals_(hash, adminHash)) {
    return {id: 'admin', displayName: 'ผู้ดูแลระบบ', role: 'super_admin', district: '', tambon: ''};
  }
  const inspectors = rowsAsObjects_(APP.SHEETS.INSPECTORS);
  for (let i = 0; i < inspectors.length; i += 1) {
    const row = inspectors[i];
    if (String(row.active).toLowerCase() === 'false') continue;
    if (secureEquals_(hash, cleanText_(row.token_hash))) {
      try {
        row.last_seen_at = isoNow_();
        updateObjectRow_(APP.SHEETS.INSPECTORS, row._row, row);
      } catch (ignored) {}
      return {
        id: cleanText_(row.inspector_id),
        displayName: cleanText_(row.display_name),
        role: cleanText_(row.role) || 'inspector',
        district: cleanText_(row.district),
        tambon: cleanText_(row.tambon),
        personCategory: cleanText_(row.person_category), personCategoryOther: cleanText_(row.person_category_other),
        position: cleanText_(row.position), agency: cleanText_(row.agency)
      };
    }
  }
  throw new ApiError('UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือถูกปิดใช้งาน');
}

function requireAdmin_(actor) {
  assert_(actor && ['admin', 'super_admin'].indexOf(actor.role) >= 0, 'FORBIDDEN', 'ต้องใช้สิทธิ์ผู้ดูแลระบบ');
}

function requireSuperAdmin_(actor) {
  assert_(actor && actor.role === 'super_admin', 'FORBIDDEN', 'ต้องใช้สิทธิ์ Super Admin');
}

function createInspector(profile) {
  ensureSchema_();
  profile = profile || {};
  const person = validatePersonCategory_(profile.personCategory, profile.personCategoryOther);
  const token = uuid_() + uuid_().replace(/-/g, '');
  const inspectorId = cleanText_(profile.inspectorId, 64) || uuid_();
  assert_(!findOne_(APP.SHEETS.INSPECTORS, 'inspector_id', inspectorId), 'CONFLICT', 'inspectorId นี้มีอยู่แล้ว');
  const now = isoNow_();
  appendObject_(APP.SHEETS.INSPECTORS, {
    inspector_id: inspectorId,
    display_name: cleanText_(profile.displayName, 120),
    district: cleanText_(profile.district, 120),
    tambon: cleanText_(profile.tambon, 120),
    assignedProvinceCode: cleanText_(profile.assignedProvinceCode,2),
    role: ['inspector', 'admin', 'super_admin'].indexOf(profile.role) >= 0 ? profile.role : 'inspector',
    token_hash: tokenHash_(token),
    active: true,
    created_at: now,
    last_seen_at: '', person_category: person.category, person_category_other: person.other,
    position: cleanText_(profile.position,120), agency: cleanText_(profile.agency,200)
  });
  return {inspectorId: inspectorId, token: token};
}

function rotateInspectorToken(inspectorId) {
  ensureSchema_();
  const row = findOne_(APP.SHEETS.INSPECTORS, 'inspector_id', cleanText_(inspectorId, 64));
  assert_(row, 'NOT_FOUND', 'ไม่พบเจ้าหน้าที่');
  const token = uuid_() + uuid_().replace(/-/g, '');
  row.token_hash = tokenHash_(token);
  updateObjectRow_(APP.SHEETS.INSPECTORS, row._row, row);
  return {inspectorId: cleanText_(row.inspector_id), token: token};
}

function initializeBackend() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('TOKEN_PEPPER')) properties.setProperty('TOKEN_PEPPER', uuid_() + uuid_());
  ensureAuthSecrets_();
  ensureSchema_();
  let adminToken = '';
  if (!properties.getProperty('ADMIN_TOKEN_HASH')) {
    adminToken = uuid_() + uuid_().replace(/-/g, '');
    properties.setProperty('ADMIN_TOKEN_HASH', tokenHash_(adminToken));
  }
  return {initialized: true, adminToken: adminToken || null, note: adminToken ? 'บันทึก token นี้ทันที ระบบไม่เก็บค่า plaintext' : 'มี ADMIN_TOKEN_HASH อยู่แล้ว'};
}

function rotateAdminToken() {
  const token = uuid_() + uuid_().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN_HASH', tokenHash_(token));
  return {token: token, note: 'บันทึก token นี้ทันที ระบบไม่เก็บค่า plaintext'};
}

function validatePersonCategory_(category, other) {
  category = cleanText_(category,120); other = cleanText_(other,200);
  assert_(!category || APP.PERSON_CATEGORIES.indexOf(category)>=0, 'VALIDATION_ERROR', 'ประเภทบุคคลไม่ถูกต้อง');
  assert_(category!=='อื่นๆ' || other, 'VALIDATION_ERROR', 'โปรดระบุประเภทบุคคลอื่นๆ');
  return {category:category,other:category==='อื่นๆ'?other:''};
}
