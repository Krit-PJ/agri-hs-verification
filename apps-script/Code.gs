/**
 * Router ของ Web App
 * วิธีติดตั้งโดยสรุป (รายละเอียด docs/INSTALL_V30_TH.md)
 *   1) เปิด Google Sheet "Thailand HS Verification - Database" > ส่วนขยาย > Apps Script
 *   2) วางไฟล์ทั้งหมดใน apps-script/ (หรือไฟล์รวม docs/AppsScript-v30-All.gs) และสร้าง Secrets.gs จาก Secrets.example.gs
 *   3) ทำให้ใช้งานได้ > การทำให้ใช้งานได้รายการใหม่ > เว็บแอป  (ดำเนินการในฐานะ: ฉัน · ผู้มีสิทธิ์เข้าถึง: ทุกคน)
 *   4) นำ URL /exec ไปใส่ site-config.js ช่อง apiEndpoint
 */

function doGet(e) {
  resetRequestCache_();
  const p = (e && e.parameter) || {};
  try {
    ensureSetup_();
    switch (p.action) {
      case 'ping': return json_({ ok: true, version: APP_VERSION, time: now_() });
      case 'provinces': return json_({ ok: true, provinces: publicProvinces_() });
      case 'hotspots': return json_(publicHotspots_(p.province));
      case 'hit': return json_({ ok: true, counter: counter_(true) });
      case 'counter': return json_({ ok: true, counter: counter_(false) });
      case 'settings': return json_({ ok: true, settings: { riskUrl: setting_('risk_url'), hubUrl: setting_('hub_url') } });
      default: return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  resetRequestCache_();
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) { return json_({ ok: false, error: 'invalid JSON' }); }
  try {
    ensureSetup_();
    return json_(handle_(body));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/** แยกจาก doPost เพื่อให้ทดสอบได้ */
function handle_(body) {
  const a = String(body.action || '');
  if (a === 'login_admin') return loginAdmin_(body);
  if (a === 'login_super') return loginSuper_(body);
  if (a === 'register') return register_(body);

  const user = verifyToken_(body.token);
  switch (a) {
    case 'me': return { ok: true, user: user };
    case 'logout': audit_(user, 'logout', ROLE_LABELS[user.role] || '', ''); return { ok: true };
    case 'touch': return touch_(user, body);
    // ผลตรวจ
    case 'verification_get': return verificationGet_(user, body);
    case 'verification_save': return verificationSave_(user, body);
    case 'verification_delete': return verificationDelete_(user, body);
    case 'verifications_list': return verificationsList_(user, body);
    case 'photo_upload': return photoUpload_(user, body);
    case 'photo_get': return photoGet_(user, body);
    case 'photo_delete': return photoDelete_(user, body);
    // คำขอและบัญชี
    case 'requests_list': return requestsList_(user, body);
    case 'request_decide': return requestDecide_(user, body);
    case 'accounts_list': return accountsList_(user);
    case 'account_save': return accountSave_(user, body);
    case 'account_status': return accountStatus_(user, body);
    case 'account_delete': return accountDelete_(user, body);
    // บันทึกการใช้งาน
    case 'audit_list': return auditList_(user, body);
    case 'login_report': return loginReport_(user, body);
    // ตั้งค่า
    case 'cache_clear': return cacheClear_(user, body);
    case 'settings_get': return settingsGet_(user);
    case 'settings_save': return settingsSave_(user, body);
    default: return { ok: false, error: 'unknown action' };
  }
}

function cacheClear_(user, b) {
  requireManager_(user);
  const prov = requireProvince_(user, b.province);
  clearHsCache_(prov);
  audit_(user, 'cache_clear', 'HS_' + prov, '', prov);
  return { ok: true };
}

const EDITABLE_SETTINGS = ['source_sheet_id', 'photo_folder_id', 'risk_url', 'hub_url'];

function settingsGet_(user) {
  requireSuper_(user);
  const out = {};
  EDITABLE_SETTINGS.forEach(k => { out[k] = setting_(k); });
  out.db_id = DB_ID;
  out.version = APP_VERSION;
  return { ok: true, settings: out };
}

function settingsSave_(user, b) {
  requireSuper_(user);
  const s = b.settings || {};
  const changed = [];
  withLock_(() => {
    EDITABLE_SETTINGS.forEach(k => {
      if (s[k] === undefined) return;
      let v = clean_(s[k], 300);
      if (/_id$/.test(k)) {
        const m = v.match(/[-\w]{25,}/);
        if (!m) throw new Error('รหัส ' + k + ' ไม่ถูกต้อง');
        v = m[0];
      } else if (v && !/^https:\/\//.test(v)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://');
      if (v !== setting_(k)) { setSetting_(k, v); changed.push(k); }
    });
  });
  if (changed.indexOf('source_sheet_id') >= 0) Object.keys(PROVINCES).forEach(clearHsCache_);
  audit_(user, 'settings_save', changed.join(', ') || '-', '', '');
  return { ok: true, changed: changed };
}
