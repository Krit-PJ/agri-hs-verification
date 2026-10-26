/* ============================== คำขอใช้งาน / บัญชีผู้ใช้ ============================== */

/** ผู้ลงทะเบียน (Admin ลงทะเบียนเองใช้งานได้ทันที) พร้อมสถานะบัญชีปัจจุบัน เพื่อให้ผู้ดูแลจังหวัดตรวจและระงับได้ */
function requestsList_(user, b) {
  requireManager_(user);
  const status = (b && b.status) || 'all';
  const days = Math.max(0, Number(b && b.days) || 0);
  const since = days ? Utilities.formatDate(new Date(Date.now() - days * 86400000), 'Asia/Bangkok', "yyyy-MM-dd") : '';
  const accounts = {};
  readAll_('Accounts').forEach(a => { accounts[a.accountId] = a; accounts['p' + normalizePhone_(a.phone)] = a; });
  const rows = readAll_('Requests').filter(r => inScope_(user, r.provinceCode)
    && (isSuper_(user) || r.requestedRole !== 'minisuper')
    && (status === 'all' || r.status === status)
    && (!since || String(r.createdAt).slice(0, 10) >= since));
  rows.sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt)));
  return { ok: true, requests: rows.map(stripRow_).map(r => {
    const acc = accounts[r.accountId] || accounts['p' + normalizePhone_(r.phone)] || null;
    return Object.assign(r, { phone: normalizePhone_(r.phone), requestedRole: r.requestedRole || 'admin', accountId: acc ? acc.accountId : '', accountStatus: acc ? acc.status : 'deleted', accountRole: acc ? acc.role : '' });
  }) };
}

function requestDecide_(user, b) {
  requireManager_(user);
  return withLock_(() => {
    const req = findRow_('Requests', r => r.requestId === b.requestId);
    if (!req) throw new Error('ไม่พบคำขอ');
    const role = req.requestedRole === 'minisuper' ? 'minisuper' : 'admin';
    requireAccountManager_(user, role, req.provinceCode);
    if (req.status !== 'pending') throw new Error('คำขอนี้ได้รับการพิจารณาแล้ว');
    const approve = b.decision === 'approve';
    const grantRole = approve && isSuper_(user) && (b.role === 'minisuper' || b.role === 'admin') ? b.role : role;
    updateRow_('Requests', req._row, { status: approve ? 'approved' : 'rejected', decidedAt: now_(), decidedBy: user.name, reason: clean_(b.reason, 300) });
    if (approve) {
      const phone = normalizePhone_(req.phone);
      if (!findRow_('Accounts', r => normalizePhone_(r.phone) === phone)) {
        appendObj_('Accounts', {
          accountId: nextAccountId_(req.provinceCode), phone: phone, fullName: req.fullName, position: req.position, affiliation: req.affiliation,
          provinceCode: String(req.provinceCode), provinceName: PROVINCES[String(req.provinceCode)], role: grantRole, status: 'approved',
          createdAt: req.createdAt, approvedAt: now_(), approvedBy: user.name, lastLoginAt: ''
        });
      }
    }
    audit_(user, approve ? 'request_approve' : 'request_reject', req.requestId + ' ' + req.fullName, ROLE_LABELS[grantRole] + (b.reason ? ' · ' + clean_(b.reason, 300) : ''), req.provinceCode);
    return { ok: true };
  });
}

function accountsList_(user) {
  requireManager_(user);
  const rows = readAll_('Accounts').filter(r => inScope_(user, r.provinceCode) || (isSuper_(user) && r.provinceCode === ALL_PROVINCES) || (isNational_(user) && r.provinceCode === ALL_PROVINCES));
  const superUser = isNational_(user) ? { username: PropertiesService.getScriptProperties().getProperty('SUPER_USER') || '', configured: !!PropertiesService.getScriptProperties().getProperty('SUPER_HASH') } : null;
  rows.sort((a, c) => String(a.provinceCode).localeCompare(String(c.provinceCode)) || String(c.role).localeCompare(String(a.role)) || String(a.accountId).localeCompare(String(c.accountId)));
  return { ok: true, superAdmin: superUser, accounts: rows.map(stripRow_).map(r => Object.assign(r, { phone: normalizePhone_(r.phone), provinceName: r.provinceCode === ALL_PROVINCES ? 'ทุกจังหวัด (ทั้งระบบ)' : r.provinceName })) };
}

function accountSave_(user, b) {
  requireManager_(user);
  return withLock_(() => {
    const phone = normalizePhone_(b.phone);
    if (!validPhone_(phone)) throw new Error('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
    const role = b.role === 'minisuper' ? 'minisuper' : 'admin';
    const prov = role === 'minisuper' && String(b.provinceCode) === ALL_PROVINCES ? ALL_PROVINCES : provCode_(b.provinceCode);
    if (!prov) throw new Error('กรุณาเลือกจังหวัด');
    if (!clean_(b.fullName)) throw new Error('กรุณากรอกชื่อ-นามสกุล');
    requireAccountManager_(user, role, prov);
    const dup = findRow_('Accounts', r => normalizePhone_(r.phone) === phone && r.accountId !== b.accountId);
    if (dup) throw new Error('เบอร์โทรศัพท์นี้มีในระบบแล้ว');
    const provName = prov === ALL_PROVINCES ? 'ทุกจังหวัด' : PROVINCES[prov];
    const data = { phone: phone, fullName: clean_(b.fullName), position: clean_(b.position), affiliation: clean_(b.affiliation), provinceCode: prov, provinceName: provName, role: role };
    if (b.accountId) {
      const acc = findRow_('Accounts', r => r.accountId === b.accountId);
      if (!acc) throw new Error('ไม่พบบัญชี');
      requireAccountManager_(user, acc.role, acc.provinceCode);
      if (acc.accountId === user.sub && (role !== acc.role || prov !== acc.provinceCode)) throw new Error('ไม่สามารถเปลี่ยนบทบาทหรือจังหวัดของตนเองได้');
      updateRow_('Accounts', acc._row, data);
      audit_(user, 'account_update', acc.accountId + ' ' + data.fullName, ROLE_LABELS[role] + ' · ' + provName, prov === ALL_PROVINCES ? '' : prov);
      return { ok: true, accountId: acc.accountId };
    }
    const id = nextAccountId_(prov);
    appendObj_('Accounts', Object.assign(data, { accountId: id, status: 'approved', createdAt: now_(), approvedAt: now_(), approvedBy: user.name, lastLoginAt: '' }));
    audit_(user, 'account_create', id + ' ' + data.fullName, ROLE_LABELS[role] + ' · ' + provName, prov === ALL_PROVINCES ? '' : prov);
    return { ok: true, accountId: id };
  });
}

function accountStatus_(user, b) {
  return withLock_(() => {
    const acc = findRow_('Accounts', r => r.accountId === b.accountId);
    if (!acc) throw new Error('ไม่พบบัญชี');
    if (acc.accountId === user.sub) throw new Error('ไม่สามารถระงับบัญชีของตนเองได้');
    requireAccountManager_(user, acc.role, acc.provinceCode);
    const status = b.status === 'approved' ? 'approved' : 'disabled';
    updateRow_('Accounts', acc._row, { status: status });
    audit_(user, 'account_' + status, acc.accountId + ' ' + acc.fullName, ROLE_LABELS[acc.role] || '', acc.provinceCode);
    return { ok: true };
  });
}

function accountDelete_(user, b) {
  return withLock_(() => {
    const acc = findRow_('Accounts', r => r.accountId === b.accountId);
    if (!acc) throw new Error('ไม่พบบัญชี');
    if (acc.accountId === user.sub) throw new Error('ไม่สามารถลบบัญชีของตนเองได้');
    requireAccountManager_(user, acc.role, acc.provinceCode);
    deleteRow_('Accounts', acc._row);
    audit_(user, 'account_delete', acc.accountId + ' ' + acc.fullName, ROLE_LABELS[acc.role] || '', acc.provinceCode);
    return { ok: true };
  });
}

function nextAccountId_(prov) {
  const tag = String(prov) === ALL_PROVINCES ? 'TH' : String(prov);
  const nums = readAll_('Accounts').filter(r => String(r.accountId).indexOf('A-' + tag + '-') === 0)
    .map(r => Number(String(r.accountId).split('-').pop()) || 0);
  return 'A-' + tag + '-' + String((nums.length ? Math.max.apply(null, nums) : 0) + 1).padStart(3, '0');
}
