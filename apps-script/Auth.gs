/* ============================== เข้าสู่ระบบ / สิทธิ์ ============================== */
/*
 * ระบบเดียวกับ TH-Agri-Risk-Maps-Burning:
 *   - Admin และ Mini Super Admin เข้าสู่ระบบด้วยเบอร์โทรศัพท์ที่ได้รับอนุญาต
 *   - Super Admin เข้าสู่ระบบด้วยชื่อผู้ใช้ + รหัสผ่าน (เก็บเป็นค่า Hash ใน Script Properties)
 *   - Token ลงลายมือชื่อ HMAC อายุ 8 ชั่วโมง ตรวจสถานะบัญชีทุกคำสั่ง (ระงับสิทธิ์มีผลทันที)
 *   - บันทึกทุกการพยายามเข้าใช้ในชีต LoginAttempts (ไม่บันทึกรหัสผ่าน)
 */

function loginAdmin_(b) {
  const phone = normalizePhone_(b.phone);
  const device = clean_(b.device, 120);
  if (!validPhone_(phone)) {
    logAttempt_('admin', clean_(b.phone, 20), 'invalid', null, device);
    throw new Error('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
  }
  const acc = findRow_('Accounts', r => normalizePhone_(r.phone) === phone);
  if (!acc) {
    const pending = findRow_('Requests', r => normalizePhone_(r.phone) === phone && r.status === 'pending');
    logAttempt_('admin', phone, pending ? 'pending' : 'not_found', pending ? { fullName: pending.fullName, provinceCode: pending.provinceCode } : null, device);
    throw new Error(pending ? 'คำขอของท่านอยู่ระหว่างรอการอนุมัติ' : 'ไม่พบเบอร์โทรศัพท์นี้ในระบบ กรุณายื่นคำขอใช้งาน');
  }
  const role = acc.role === 'minisuper' ? 'minisuper' : 'admin';
  if (acc.status !== 'approved') {
    logAttempt_(role, phone, 'disabled', acc, device);
    throw new Error('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบจังหวัด');
  }
  logAttempt_(role, phone, 'success', acc, device);
  updateRow_('Accounts', acc._row, { lastLoginAt: now_() });
  const user = accountUser_(acc);
  audit_(user, 'login', ROLE_LABELS[role], device);
  return { ok: true, token: signToken_(user), user: user };
}

function loginSuper_(b) {
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const u = clean_(b.username, 60);
  const device = clean_(b.device, 120);
  const failKey = 'superfail';
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 10) {
    logAttempt_('superadmin', u, 'wrong_credentials', null, device);
    throw new Error('พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที');
  }
  const ok = !!props.getProperty('SUPER_HASH') && u.toLowerCase() === String(props.getProperty('SUPER_USER') || '').toLowerCase()
    && superHash_(props.getProperty('SUPER_SALT'), String(b.password || '')) === props.getProperty('SUPER_HASH');
  logAttempt_('superadmin', u, ok ? 'success' : 'wrong_credentials', ok ? { accountId: 'SUPER', fullName: 'Super Admin' } : null, device);
  if (!ok) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  cache.remove(failKey);
  const user = { sub: 'SUPER', name: 'Super Admin (' + props.getProperty('SUPER_USER') + ')', role: 'superadmin', prov: '*', provName: 'ทุกจังหวัด' };
  audit_(user, 'login', 'Super Admin', device, '');
  return { ok: true, token: signToken_(user), user: user };
}

/** ยื่นคำขอใช้งาน (ผู้ใช้ทั่วไป) — Admin: ผู้ดูแลจังหวัดหรือ Super Admin อนุมัติ, Mini Super Admin: Super Admin อนุมัติ */
function register_(b) {
  const phone = normalizePhone_(b.phone);
  const prov = provCode_(b.provinceCode);
  const requestedRole = b.requestedRole === 'minisuper' ? 'minisuper' : 'admin';
  if (!validPhone_(phone)) throw new Error('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ตัวอย่าง 0812345678)');
  if (!prov) throw new Error('กรุณาเลือกจังหวัด');
  if (!clean_(b.fullName)) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  if (!clean_(b.position)) throw new Error('กรุณากรอกตำแหน่ง');
  if (!clean_(b.affiliation)) throw new Error('กรุณากรอกสังกัด');
  if (b.consent !== true) throw new Error('กรุณายืนยันการรับทราบการใช้ข้อมูลส่วนบุคคล');
  return withLock_(() => {
    if (findRow_('Accounts', r => normalizePhone_(r.phone) === phone)) throw new Error('เบอร์โทรศัพท์นี้มีสิทธิ์ใช้งานแล้ว สามารถเข้าสู่ระบบได้ทันที');
    if (findRow_('Requests', r => normalizePhone_(r.phone) === phone && r.status === 'pending')) throw new Error('มีคำขอของเบอร์นี้รอการอนุมัติอยู่แล้ว');
    const id = newId_('R');
    appendObj_('Requests', {
      requestId: id, phone: phone, fullName: clean_(b.fullName), position: clean_(b.position), affiliation: clean_(b.affiliation),
      provinceCode: prov, provinceName: PROVINCES[prov], requestedRole: requestedRole, note: clean_(b.note, 500), consentAt: now_(),
      status: 'pending', createdAt: now_(), decidedAt: '', decidedBy: '', reason: ''
    });
    audit_({ sub: phone, name: clean_(b.fullName), role: 'public', prov: prov }, 'register', id, ROLE_LABELS[requestedRole], prov);
    return { ok: true, requestId: id };
  });
}

/** แปลงบัญชีในชีตเป็นผู้ใช้ในระบบ — ทั้ง admin และ minisuper มีขอบเขตจังหวัดของตน */
function accountUser_(acc) {
  const role = acc.role === 'minisuper' ? 'minisuper' : 'admin';
  const prov = String(acc.provinceCode);
  return { sub: acc.accountId, name: acc.fullName, phone: normalizePhone_(acc.phone), role: role, prov: prov, provName: PROVINCES[prov] || '', position: acc.position || '', affiliation: acc.affiliation || '' };
}

function signToken_(user) {
  const payload = Object.assign({}, user, { exp: Date.now() + TOKEN_HOURS * 3600 * 1000 });
  const p = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  return p + '.' + hmac_(p);
}

function verifyToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || hmac_(parts[0]) !== parts[1]) throw new Error('AUTH: กรุณาเข้าสู่ระบบ');
  const user = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!user.exp || Date.now() > user.exp) throw new Error('AUTH: หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่');
  if (user.role === 'admin' || user.role === 'minisuper') {
    const acc = findRow_('Accounts', r => r.accountId === user.sub);
    if (!acc || acc.status !== 'approved') throw new Error('AUTH: บัญชีถูกระงับหรือถูกลบ');
    return Object.assign({ exp: user.exp }, accountUser_(acc));
  }
  if (user.role === 'superadmin') return user;
  throw new Error('AUTH: กรุณาเข้าสู่ระบบ');
}

function isSuper_(user) { return user.role === 'superadmin'; }
function isManager_(user) { return user.role === 'superadmin' || user.role === 'minisuper'; }
function requireSuper_(user) { if (!isSuper_(user)) throw new Error('เฉพาะ Super Admin เท่านั้น'); }
function requireManager_(user) { if (!isManager_(user)) throw new Error('เฉพาะ Mini Super Admin / Super Admin เท่านั้น'); }
function inScope_(user, prov) { return isSuper_(user) || String(prov) === user.prov; }

/** ตรวจว่าผู้ใช้ทำงานกับจังหวัดนี้ได้ (Super Admin ทุกจังหวัด, อื่น ๆ เฉพาะจังหวัดของตน) */
function requireProvince_(user, prov) {
  const code = provCode_(prov);
  if (!code) throw new Error('รหัสจังหวัดไม่ถูกต้อง');
  if (!inScope_(user, code)) throw new Error('ไม่มีสิทธิ์จัดการข้อมูลจังหวัดนี้');
  return code;
}

/** Mini Super Admin จัดการได้เฉพาะบัญชี Admin ในจังหวัดของตน — บัญชี Mini Super Admin จัดการได้โดย Super Admin เท่านั้น */
function requireAccountManager_(user, role, prov) {
  requireManager_(user);
  requireProvince_(user, prov);
  if (role === 'minisuper' && !isSuper_(user)) throw new Error('การเพิ่ม/แก้ไข/ระงับ/ลบ Mini Super Admin ทำได้เฉพาะ Super Admin');
}
