'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/source-db.json');
const { createContext, Spreadsheet } = require('./helpers/gas-mock');

const SOURCE_ID = '178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A';
const uuid = () => require('node:crypto').randomUUID();

function boot() {
  const env = createContext({ sources: { [SOURCE_ID]: new Spreadsheet(JSON.parse(JSON.stringify(fixture))) } });
  const plain = x => JSON.parse(JSON.stringify(x));
  const call = body => { env.api.resetRequestCache_(); return plain(env.api.handle_(body)); };
  const rows = name => { env.api.resetRequestCache_(); return plain(env.api.readAll_(name)); };
  const get = params => { const out = env.api.doGet({ parameter: params }); return JSON.parse(out.text); };
  env.api.setup();
  return Object.assign(env, { call, get, rows });
}

function expectError(fn, pattern) {
  assert.throws(fn, err => pattern.test(String(err.message)));
}

function loginPhone(env, phone) { return env.call({ action: 'login_admin', phone, device: 'test' }); }
function loginSuper(env) { return env.call({ action: 'login_super', username: 'root', password: 'password-123', device: 'test' }); }

function addAdmin(env, token, phone, prov = '62', role = 'admin') {
  return env.call({ action: 'account_save', token, phone, fullName: 'ผู้บันทึก ' + phone, position: 'นวส.', affiliation: 'สนง.', provinceCode: prov, role });
}

function verifiedPayload(token, extra = {}) {
  return Object.assign({ action: 'verification_save', token, clientRequestId: uuid(), province: '62', hotspotId: 'VI1202401010701urgxyruxcx',
    status: 'verified', result: 'burned', obsLat: 16.4528, obsLng: 99.5877, gpsAccuracyM: 8, photoMissingReason: 'field_safety', personCategory: 'กำนัน' }, extra);
}

test('setup creates every sheet with the documented headers', () => {
  const env = boot();
  const names = env.db.getSheets().map(s => s.getName()).sort();
  assert.deepEqual([...names], ['Accounts', 'AuditLog', 'Counter', 'LoginAttempts', 'Photos', 'Requests', 'Settings', 'Verifications']);
  assert.equal(env.db.getSheetByName('Accounts').data[0][1], 'phone');
  const seeded = env.rows('Accounts');
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].role, 'minisuper');
  assert.equal(seeded[0].provinceCode, '62');
  assert.ok(env.props.SUPER_HASH && !JSON.stringify(env.props).includes('password-123'), 'password must be stored only as hash');
});

test('public reads: provinces and hotspots come from the source HS sheet, cleaned', () => {
  const env = boot();
  const provinces = env.get({ action: 'provinces' });
  assert.equal(provinces.ok, true);
  assert.deepEqual(provinces.provinces.map(p => p.code).sort(), ['51', '62']);
  const hs = env.get({ action: 'hotspots', province: '62' });
  assert.equal(hs.ok, true);
  assert.equal(hs.rows.length, 5, 'duplicate id and missing coordinates are dropped');
  assert.equal(hs.rows[0][0], 'VI1202401010701urgxyruxcx');
  assert.equal(hs.rows[0][9], 16.45278);
  assert.deepEqual(hs.status, {});
});

test('Admin / Mini Super Admin log in by phone; unknown numbers are recorded', () => {
  const env = boot();
  const mini = loginPhone(env, '081-111-1111');
  assert.equal(mini.user.role, 'minisuper');
  assert.equal(mini.user.prov, '62');
  expectError(() => loginPhone(env, '0822222222'), /ไม่พบเบอร์/);
  const attempts = env.rows('LoginAttempts');
  assert.deepEqual(attempts.map(a => a.result), ['success', 'not_found']);
  assert.ok(env.rows('AuditLog').some(l => l.action === 'login' && l.role === 'minisuper'));
});

test('Super Admin logs in with username + password and is throttled after failures', () => {
  const env = boot();
  expectError(() => env.call({ action: 'login_super', username: 'root', password: 'wrong' }), /ไม่ถูกต้อง/);
  const ok = loginSuper(env);
  assert.equal(ok.user.role, 'superadmin');
  for (let i = 0; i < 10; i++) { try { env.call({ action: 'login_super', username: 'root', password: 'x' }); } catch (_) {} }
  expectError(() => loginSuper(env), /รอ 15 นาที/);
});

test('tampered or expired tokens are rejected', () => {
  const env = boot();
  const { token } = loginSuper(env);
  const [p, s] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'SUPER', role: 'superadmin', prov: '*', exp: Date.now() + 1e9 })).toString('base64url');
  expectError(() => env.call({ action: 'me', token: forged + '.' + s }), /AUTH/);
  expectError(() => env.call({ action: 'me', token: p + '.x' }), /AUTH/);
});

test('Admin self-registration: usable immediately, phone-only, always role Admin', () => {
  const env = boot();
  const reg = env.call({ action: 'register', phone: '083-333-3333', fullName: 'สมชาย ใจดี', position: 'นวส.', affiliation: 'สนง.เกษตรอำเภอ', provinceCode: '62', requestedRole: 'minisuper', consent: true, device: 'phone' });
  assert.ok(reg.token, 'registration logs the user in');
  assert.equal(reg.user.role, 'admin', 'a Mini Super Admin cannot be self-registered');
  assert.equal(reg.user.prov, '62');
  assert.equal(env.call({ action: 'me', token: reg.token }).user.sub, reg.user.sub);
  const again = loginPhone(env, '0833333333');
  assert.equal(again.user.sub, reg.user.sub);
  expectError(() => env.call({ action: 'register', phone: '0833333333', fullName: 'x', position: 'a', affiliation: 'b', provinceCode: '62', consent: true }), /ลงทะเบียนแล้ว/);
  expectError(() => env.call({ action: 'register', phone: '0833333334', fullName: 'x', position: 'a', affiliation: 'b', provinceCode: '62' }), /ข้อมูลส่วนบุคคล/);
  const saved = env.call(verifiedPayload(reg.token));
  assert.equal(saved.verification.recordedById, reg.user.sub);
  assert.ok(env.rows('AuditLog').some(l => l.action === 'register' && l.actorId === reg.user.sub && l.provinceCode === '62'));
  assert.equal(env.rows('Requests')[0].status, 'auto_approved');
});

test('Mini Super Admin sees new registrations of its province and can suspend them at once', () => {
  const env = boot();
  const mini = loginPhone(env, '0811111111');
  const reg62 = env.call({ action: 'register', phone: '0833333333', fullName: 'ใหม่ 62', position: 'a', affiliation: 'b', provinceCode: '62', consent: true });
  env.call({ action: 'register', phone: '0855555555', fullName: 'ใหม่ 51', position: 'a', affiliation: 'b', provinceCode: '51', consent: true });
  const list = env.call({ action: 'requests_list', token: mini.token }).requests;
  assert.deepEqual(list.map(r => r.fullName), ['ใหม่ 62']);
  assert.equal(list[0].accountStatus, 'approved');
  env.call({ action: 'account_status', token: mini.token, accountId: list[0].accountId, status: 'disabled' });
  expectError(() => env.call({ action: 'me', token: reg62.token }), /ระงับ/);
  expectError(() => env.call({ action: 'register', phone: '0833333333', fullName: 'ซ้ำ', position: 'a', affiliation: 'b', provinceCode: '62', consent: true }), /ถูกระงับ/);
  assert.equal(env.call({ action: 'requests_list', token: mini.token }).requests[0].accountStatus, 'disabled');
});

test('registration burst is rate limited', () => {
  const env = boot();
  for (let i = 0; i < 30; i++) env.call({ action: 'register', phone: '08100000' + String(i).padStart(2, '0'), fullName: 'n' + i, position: 'a', affiliation: 'b', provinceCode: '62', consent: true });
  expectError(() => env.call({ action: 'register', phone: '0819999999', fullName: 'n', position: 'a', affiliation: 'b', provinceCode: '62', consent: true }), /10 นาที/);
});

test('Mini Super Admin is limited to its own province and cannot manage Mini Super Admins', () => {
  const env = boot();
  const mini = loginPhone(env, '0811111111');
  expectError(() => addAdmin(env, mini.token, '0844444444', '51'), /ไม่มีสิทธิ์/);
  expectError(() => addAdmin(env, mini.token, '0844444444', '62', 'minisuper'), /เฉพาะ Super Admin/);
  addAdmin(env, mini.token, '0844444444', '62');
  const accounts = env.call({ action: 'accounts_list', token: mini.token }).accounts;
  assert.deepEqual(accounts.map(a => a.provinceCode), ['62', '62']);
  const sup = loginSuper(env);
  addAdmin(env, sup.token, '0877777777', '51', 'minisuper');
  const other = loginPhone(env, '0877777777');
  assert.equal(other.user.prov, '51');
  assert.equal(other.user.role, 'minisuper');
  const miniAcc = env.call({ action: 'accounts_list', token: sup.token }).accounts.find(a => a.accountId === mini.user.sub);
  expectError(() => env.call({ action: 'account_status', token: other.token, accountId: miniAcc.accountId, status: 'disabled' }), /เฉพาะ Super Admin|ไม่มีสิทธิ์/);
});

test('Admin records results; cannot edit another Admin record; cannot delete; Mini Super Admin can', () => {
  const env = boot();
  const mini = loginPhone(env, '0811111111');
  addAdmin(env, mini.token, '0844444444');
  addAdmin(env, mini.token, '0845555555');
  const a1 = loginPhone(env, '0844444444'), a2 = loginPhone(env, '0845555555');
  expectError(() => env.call({ action: 'accounts_list', token: a1.token }), /เฉพาะ Mini Super Admin/);
  const saved = env.call(verifiedPayload(a1.token));
  assert.equal(saved.verification.recordedById, a1.user.sub);
  assert.equal(saved.verification.distanceM < 20, true);
  assert.equal(saved.verification.canDelete, false);
  expectError(() => env.call(verifiedPayload(a2.token, { result: 'not_burned' })), /แก้ไขได้/);
  const edited = env.call(verifiedPayload(a1.token, { result: 'not_burned' }));
  assert.equal(edited.verification.result, 'not_burned');
  expectError(() => env.call({ action: 'verification_delete', token: a1.token, verificationId: saved.verification.verificationId }), /ลบผลตรวจได้เฉพาะ/);
  expectError(() => env.call(verifiedPayload(a1.token, { province: '51', hotspotId: 'VI1202401010701urvpfzzxgz' })), /ไม่มีสิทธิ์/);
  const pub = env.get({ action: 'hotspots', province: '62' });
  assert.equal(pub.status['VI1202401010701urgxyruxcx'][1], 'not_burned');
  assert.ok(!JSON.stringify(pub).includes(a1.user.name), 'public data must not expose recorder names');
  env.call({ action: 'verification_delete', token: mini.token, verificationId: saved.verification.verificationId, reason: 'บันทึกผิดจุด' });
  assert.equal(env.rows('Verifications').length, 0);
  const actions = env.rows('AuditLog').map(l => l.action);
  for (const a of ['verification_create', 'verification_update', 'verification_delete']) assert.ok(actions.includes(a), a);
});

test('verification validation and idempotent replay', () => {
  const env = boot();
  const mini = loginPhone(env, '0811111111');
  expectError(() => env.call(verifiedPayload(mini.token, { result: '' })), /ผลการตรวจ/);
  expectError(() => env.call(verifiedPayload(mini.token, { obsLat: '', obsLng: '' })), /GPS/);
  expectError(() => env.call(verifiedPayload(mini.token, { photoMissingReason: '' })), /ภาพ/);
  expectError(() => env.call(verifiedPayload(mini.token, { hotspotId: 'NOPE' })), /ไม่พบจุด/);
  const draft = env.call(verifiedPayload(mini.token, { status: 'draft', result: '', obsLat: '', obsLng: '', photoMissingReason: '' }));
  assert.equal(draft.verification.status, 'draft');
  const id = uuid();
  env.call(verifiedPayload(mini.token, { clientRequestId: id }));
  const replay = env.call(verifiedPayload(mini.token, { clientRequestId: id, result: 'not_found' }));
  assert.equal(replay.replay, true);
  assert.equal(env.rows('Verifications').length, 1);
});

test('photos: upload, private read in scope, max 3, deletion trashes Drive files', () => {
  const env = boot();
  const mini = loginPhone(env, '0811111111');
  const v = env.call(verifiedPayload(mini.token, { plannedPhotos: 1, photoMissingReason: '' })).verification;
  const base64 = Buffer.from('fake-jpeg-bytes').toString('base64');
  const up = n => env.call({ action: 'photo_upload', token: mini.token, clientRequestId: uuid(), verificationId: v.verificationId, mimeType: 'image/jpeg', base64 });
  const first = up(1); up(2); up(3);
  expectError(() => up(4), /สูงสุด 3/);
  assert.equal(env.rows('Verifications')[0].photoCount, '3');
  const got = env.call({ action: 'photo_get', token: mini.token, photoId: first.photo.photoId });
  assert.equal(got.base64, base64);
  const sup = loginSuper(env);
  addAdmin(env, sup.token, '0877777777', '51');
  const other = loginPhone(env, '0877777777');
  expectError(() => env.call({ action: 'photo_get', token: other.token, photoId: first.photo.photoId }), /ไม่มีสิทธิ์/);
  env.call({ action: 'verification_delete', token: sup.token, verificationId: v.verificationId });
  assert.equal(env.rows('Photos').length, 0);
  assert.equal([...env.files.values()].every(f => f.trashed), true);
});

test('usage log visibility: Super sees all, Mini Super sees province (no Super), Admin sees own', () => {
  const env = boot();
  const sup = loginSuper(env);
  const mini = loginPhone(env, '0811111111');
  addAdmin(env, mini.token, '0844444444');
  const admin = loginPhone(env, '0844444444');
  env.call(verifiedPayload(admin.token));
  addAdmin(env, sup.token, '0877777777', '51');
  const all = env.call({ action: 'audit_list', token: sup.token });
  assert.ok(all.logs.some(l => l.role === 'superadmin'));
  assert.ok(all.logs.some(l => l.provinceCode === '51'));
  const prov = env.call({ action: 'audit_list', token: mini.token });
  assert.ok(prov.logs.length > 0);
  assert.ok(prov.logs.every(l => l.provinceCode === '62' && l.role !== 'superadmin'));
  const own = env.call({ action: 'audit_list', token: admin.token });
  assert.ok(own.logs.every(l => l.actorId === admin.user.sub));
  assert.ok(own.logs.some(l => l.action === 'verification_create'));
  const person = prov.people.find(p => p.actorId === admin.user.sub);
  assert.equal(person.verifications, 1);
  const report = env.call({ action: 'login_report', token: sup.token });
  assert.ok(report.attempts.length === 3);
  env.call({ action: 'logout', token: admin.token });
  assert.ok(env.rows('AuditLog').some(l => l.action === 'logout' && l.actorId === admin.user.sub));
});

test('suspended accounts lose access immediately', () => {
  const env = boot();
  const mini = loginPhone(env, '0811111111');
  const { accountId } = addAdmin(env, mini.token, '0844444444');
  const admin = loginPhone(env, '0844444444');
  env.call({ action: 'account_status', token: mini.token, accountId, status: 'disabled' });
  expectError(() => env.call({ action: 'me', token: admin.token }), /ระงับ/);
  expectError(() => loginPhone(env, '0844444444'), /ระงับ/);
  expectError(() => env.call({ action: 'account_status', token: mini.token, accountId: mini.user.sub, status: 'disabled' }), /ไม่สามารถ/);
});

test('settings are Super Admin only; formula injection is neutralised', () => {
  const env = boot();
  const mini = loginPhone(env, '0811111111');
  expectError(() => env.call({ action: 'settings_get', token: mini.token }), /เฉพาะ Super Admin/);
  env.call({ action: 'register', phone: '0833333333', fullName: '=IMPORTXML("http://x")', position: 'a', affiliation: 'b', provinceCode: '62', consent: true });
  const raw = env.db.getSheetByName('Requests').data[1][2];
  assert.equal(raw, '=IMPORTXML("http://x")', 'stored as text (apostrophe prefix accepted by Sheets)');
  const sup = loginSuper(env);
  const res = env.call({ action: 'settings_save', token: sup.token, settings: { risk_url: 'https://example.org/' } });
  assert.deepEqual(res.changed, ['risk_url']);
  expectError(() => env.call({ action: 'settings_save', token: sup.token, settings: { hub_url: 'javascript:alert(1)' } }), /https/);
});

test('copyAccountsFromRiskMap copies approved accounts only, once', () => {
  const env = boot();
  assert.equal(env.api.copyAccountsFromRiskMap(), 1);
  assert.equal(env.api.copyAccountsFromRiskMap(), 0);
  const copied = env.rows('Accounts').find(a => a.provinceCode === '51');
  assert.equal(copied.role, 'minisuper');
  assert.equal(loginPhone(env, '0899999999').user.prov, '51');
});

test('values keep their text form in the sheet (phones, dates) and the daily counter matches today', () => {
  const env = boot();
  const reg = env.call({ action: 'register', phone: '0833333333', fullName: 'ทดสอบ', position: 'a', affiliation: 'b', provinceCode: '62', consent: true });
  const raw = env.db.getSheetByName('Accounts').data.find(r => r[0] === reg.user.sub);
  assert.equal(raw[1], '0833333333', 'phone stays text with leading zero');
  assert.equal(typeof raw[9], 'string', 'createdAt stays text');
  const first = env.get({ action: 'hit' });
  const second = env.get({ action: 'hit' });
  assert.equal(first.counter.today, 1);
  assert.equal(second.counter.today, 2);
  assert.equal(env.get({ action: 'counter' }).counter.today, 2);
});
