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
    if (user.role === 'minisuper') return r.provinceCode === user.prov && r.role !== 'superadmin' && r.role !== 'system';
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

/** รายงานการพยายามเข้าใช้ */
function loginReport_(user, b) {
  b = b || {};
  const limit = Math.min(Number(b.limit) || 300, 2000);
  let rows = readAll_('LoginAttempts').filter(r => {
    if (user.role === 'admin') return r.accountId === user.sub;
    if (user.role === 'minisuper') return r.provinceCode === user.prov && r.role !== 'superadmin';
    return true;
  }).filter(r => inRange_(r.time, b) && (!b.result || r.result === b.result));
  rows.sort((a, c) => String(c.time).localeCompare(String(a.time)));
  const unknown = {};
  if (user.role === 'superadmin') {
    rows.filter(r => r.result === 'not_found').forEach(r => {
      const u = unknown[r.identifier] || (unknown[r.identifier] = { identifier: r.identifier, count: 0, first: r.time, last: r.time });
      u.count++;
      if (r.time < u.first) u.first = r.time;
      if (r.time > u.last) u.last = r.time;
    });
  }
  return { ok: true, total: rows.length, attempts: rows.slice(0, limit).map(stripRow_), unknown: Object.keys(unknown).map(k => unknown[k]), labels: LOGIN_RESULTS };
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
