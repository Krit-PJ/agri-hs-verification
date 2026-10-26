/* ============================== บันทึกการใช้งาน ============================== */

/** บันทึกทุกการกระทำของ Admin / Mini Super Admin / Super Admin */
function audit_(user, action, target, detail, prov) {
  try {
    appendObj_('AuditLog', {
      logId: newId_('L'), time: now_(), actorId: user.sub || '', actorName: user.name || '', role: user.role || '',
      provinceCode: prov !== undefined && prov !== null ? String(prov) : (user.prov && user.prov !== '*' ? user.prov : ''),
      action: action, target: clean_(target, 300), detail: clean_(typeof detail === 'string' ? detail : JSON.stringify(detail || ''), 2000)
    });
    if (['admin', 'minisuper', 'superadmin'].indexOf(user.role) >= 0) CacheService.getScriptCache().remove('staff:' + today_());
  } catch (err) {
    console.error('audit failed: ' + err);
  }
}

function logAttempt_(role, identifier, result, acc, device) {
  try {
    appendObj_('LoginAttempts', {
      time: now_(), role: role, identifier: identifier, result: result,
      accountId: acc ? acc.accountId || '' : '', fullName: acc ? acc.fullName || '' : '',
      provinceCode: acc ? acc.provinceCode || '' : '', provinceName: acc && acc.provinceCode ? PROVINCES[acc.provinceCode] || '' : '',
      device: clean_(device, 120)
    });
  } catch (err) {
    console.error('login log failed: ' + err);
  }
}

function inRange_(time, b) {
  const t = String(time || '').slice(0, 10);
  if (b.from && t < String(b.from)) return false;
  if (b.to && t > String(b.to)) return false;
  return true;
}

/** รายการบันทึกการใช้งานตามสิทธิ์ */
function auditList_(user, b) {
  b = b || {};
  const limit = Math.min(Number(b.limit) || 300, 2000);
  const q = clean_(b.q).toLowerCase();
  const prov = provCode_(b.province);
  let rows = readAll_('AuditLog').filter(r => {
    if (user.role === 'admin') return r.actorId === user.sub;
    if (user.role === 'minisuper') return (user.prov === '*' || r.provinceCode === user.prov) && r.role !== 'superadmin' && r.role !== 'system';
    return true;
  }).filter(r => (!prov || r.provinceCode === prov)
    && (!b.role || r.role === b.role)
    && (!b.filterAction || r.action === b.filterAction)
    && inRange_(r.time, b)
    && (!q || [r.actorName, r.actorId, r.target, r.detail].join(' ').toLowerCase().indexOf(q) >= 0));
  rows.sort((a, c) => String(c.time).localeCompare(String(a.time)));
  const summary = {};
  rows.forEach(r => {
    const key = r.actorId + '|' + r.role;
    if (!summary[key]) summary[key] = { actorId: r.actorId, actorName: r.actorName, role: r.role, provinceCode: r.provinceCode, actions: 0, logins: 0, verifications: 0, last: r.time };
    summary[key].actions++;
    if (r.action === 'login') summary[key].logins++;
    if (/^verification_/.test(r.action)) summary[key].verifications++;
  });
  return { ok: true, total: rows.length, logs: rows.slice(0, limit).map(stripRow_), people: Object.keys(summary).map(k => summary[k]), labels: AUDIT_LABELS };
}

/** ใครเห็นประวัติของใคร: Super Admin ทั้งหมด · Mini Super Admin ระดับประเทศ ทั้งหมดยกเว้น Super Admin · Mini Super Admin จังหวัด เฉพาะจังหวัด · Admin เฉพาะตนเอง */
function historyVisible_(user, row, actorKey) {
  if (user.role === 'admin') return row[actorKey] === user.sub;
  if (user.role === 'minisuper') return row.role !== 'superadmin' && row.role !== 'system' && (user.prov === '*' || row.provinceCode === user.prov);
  return true;
}

/** บันทึกการเปิดใช้งานระบบของผู้ที่เข้าสู่ระบบค้างไว้ (ไม่เกิน 1 ครั้งต่อ 30 นาทีต่อคน) */
function touch_(user, b) {
  const cache = CacheService.getScriptCache();
  const key = 'visit:' + user.sub;
  if (cache.get(key)) return { ok: true, logged: false };
  cache.put(key, '1', VISIT_LOG_MINUTES * 60);
  audit_(user, 'visit', clean_(b && b.page, 60) || 'เว็บไซต์', clean_(b && b.device, 120));
  return { ok: true, logged: true };
}

/**
 * ประวัติการเข้าใช้งานระบบ
 *   attempts : ทุกการพยายามเข้าสู่ระบบ (LoginAttempts)
 *   people   : สรุปรายบุคคล — จำนวนเข้าสู่ระบบ/เปิดใช้งาน/ล้มเหลว ครั้งแรก ล่าสุด อุปกรณ์ล่าสุด
 *   daily    : จำนวนรายวัน (เข้าสู่ระบบสำเร็จ / ล้มเหลว / เปิดใช้งาน / ผู้ใช้ไม่ซ้ำ)
 *   unknown  : หมายเลขที่ไม่มีในระบบแต่พยายามเข้าใช้ (Super Admin / Mini Super Admin ระดับประเทศ)
 */
function loginReport_(user, b) {
  b = b || {};
  const limit = Math.min(Number(b.limit) || 300, 2000);
  const q = clean_(b.q).toLowerCase();
  const prov = provCode_(b.province);
  const days = Math.max(1, Math.min(Number(b.days) || 30, 366));
  const since = Utilities.formatDate(new Date(Date.now() - (days - 1) * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
  const from = b.from || since, to = b.to || '';
  const match = r => (!prov || r.provinceCode === prov) && (!b.role || r.role === b.role)
    && (!q || [r.identifier, r.fullName, r.accountId, r.actorName, r.actorId].join(' ').toLowerCase().indexOf(q) >= 0)
    && inRange_(r.time, { from: from, to: to });
  const attempts = readAll_('LoginAttempts').filter(r => historyVisible_(user, r, 'accountId') && match(r) && (!b.result || r.result === b.result));
  attempts.sort((a, c) => String(c.time).localeCompare(String(a.time)));
  const visits = readAll_('AuditLog').filter(r => (r.action === 'visit' || r.action === 'login' || r.action === 'logout' || r.action === 'register') && historyVisible_(user, r, 'actorId') && match(r));

  const people = {}, daily = {};
  const person = (key, base) => people[key] || (people[key] = Object.assign({ logins: 0, visits: 0, failed: 0, first: '', last: '', lastDevice: '', lastAction: '' }, base));
  const day = d => daily[d] || (daily[d] = { date: d, success: 0, failed: 0, visits: 0, users: {} });
  const seen = (p, time, device, action) => {
    if (!p.first || time < p.first) p.first = time;
    if (!p.last || time > p.last) { p.last = time; p.lastDevice = device || p.lastDevice; p.lastAction = action; }
  };
  attempts.forEach(r => {
    const d = day(String(r.time).slice(0, 10));
    if (r.result === 'success') d.success++; else d.failed++;
    if (r.result === 'not_found' || r.result === 'invalid') return;
    const p = person(r.accountId || r.identifier, { key: r.accountId || r.identifier, name: r.fullName || r.identifier, role: r.role, provinceCode: r.provinceCode, identifier: r.identifier });
    if (r.result === 'success') { p.logins++; d.users[p.key] = true; } else p.failed++;
    seen(p, r.time, r.device, r.result === 'success' ? 'เข้าสู่ระบบ' : (LOGIN_RESULTS[r.result] || r.result));
  });
  visits.forEach(r => {
    if (r.action === 'login') return;
    const d = day(String(r.time).slice(0, 10));
    const p = person(r.actorId, { key: r.actorId, name: r.actorName, role: r.role, provinceCode: r.provinceCode, identifier: '' });
    if (r.action === 'visit' || r.action === 'register') { p.visits++; d.visits++; d.users[p.key] = true; }
    seen(p, r.time, r.action === 'visit' ? r.detail : '', AUDIT_LABELS[r.action] || r.action);
  });
  const dailyList = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = Utilities.formatDate(new Date(Date.now() - i * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
    if (key < from || (to && key > to)) continue;
    const d = daily[key] || { date: key, success: 0, failed: 0, visits: 0, users: {} };
    dailyList.push({ date: key, success: d.success, failed: d.failed, visits: d.visits, users: Object.keys(d.users).length });
  }
  const unknown = {};
  if (isNational_(user)) {
    attempts.filter(r => r.result === 'not_found').forEach(r => {
      const u = unknown[r.identifier] || (unknown[r.identifier] = { identifier: r.identifier, count: 0, first: r.time, last: r.time });
      u.count++;
      if (r.time < u.first) u.first = r.time;
      if (r.time > u.last) u.last = r.time;
    });
  }
  const peopleList = Object.keys(people).map(k => people[k]).sort((a, c) => String(c.last).localeCompare(String(a.last)));
  const today = today_();
  return {
    ok: true, from: from, to: to, total: attempts.length, attempts: attempts.slice(0, limit).map(stripRow_), people: peopleList, daily: dailyList,
    unknown: Object.keys(unknown).map(k => unknown[k]),
    stats: {
      loginsToday: attempts.filter(r => r.result === 'success' && String(r.time).slice(0, 10) === today).length,
      activeToday: (dailyList.find(d => d.date === today) || { users: 0 }).users,
      activePeople: peopleList.filter(p => p.logins + p.visits > 0).length,
      failed: attempts.filter(r => r.result !== 'success').length
    },
    labels: LOGIN_RESULTS
  };
}

/* ตัวนับผู้เข้าชม (สาธารณะ) */
function counter_(increment) {
  return withLock_(() => {
    const today = today_();
    let row = findRow_('Counter', r => String(r.date).slice(0, 10) === today);
    let todayHits = row ? Number(row.hits) || 0 : 0;
    let total = Number(setting_('counter_total')) || 0;
    if (increment) {
      todayHits++; total++;
      if (row) updateRow_('Counter', row._row, { hits: todayHits });
      else appendObj_('Counter', { date: today, hits: todayHits });
      setSetting_('counter_total', total);
    }
    return { today: todayHits, total: total, staffToday: staffToday_() };
  });
}

/** จำนวนเจ้าหน้าที่ (Admin / Mini Super Admin / Super Admin) ที่ใช้งานวันนี้ จากบันทึกการใช้งาน — แคช 5 นาที */
function staffToday_() {
  const cache = CacheService.getScriptCache();
  const key = 'staff:' + today_();
  const hit = cache.get(key);
  if (hit !== null && hit !== undefined) return Number(hit);
  const today = today_(), seen = {};
  readAll_('AuditLog').forEach(r => {
    if (String(r.time).slice(0, 10) === today && ['admin', 'minisuper', 'superadmin'].indexOf(r.role) >= 0) seen[r.actorId] = true;
  });
  const n = Object.keys(seen).length;
  cache.put(key, String(n), 300);
  return n;
}
