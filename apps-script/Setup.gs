/* ============================== ติดตั้ง / ปรับปรุงฐานข้อมูล ============================== */

/** ค่าเริ่มต้นที่เป็นความลับอยู่ในไฟล์ Secrets.gs (มีเฉพาะใน Apps Script ไม่อยู่ใน GitHub) — ดู Secrets.example.gs */
function initSecrets_() {
  return {
    superUser: typeof INIT_SUPER_USER !== 'undefined' ? String(INIT_SUPER_USER) : '',
    superPassword: typeof INIT_SUPER_PASSWORD !== 'undefined' ? String(INIT_SUPER_PASSWORD) : '',
    miniPhone: typeof INIT_MINISUPER_PHONE !== 'undefined' ? String(INIT_MINISUPER_PHONE) : '',
    miniProvince: typeof INIT_MINISUPER_PROVINCE !== 'undefined' ? String(INIT_MINISUPER_PROVINCE) : '',
    miniName: typeof INIT_MINISUPER_NAME !== 'undefined' ? String(INIT_MINISUPER_NAME) : ''
  };
}

/** สร้างชีตทั้งหมดและค่าเริ่มต้น เรียกซ้ำได้อย่างปลอดภัย */
function setup() {
  const ss = db_();
  Object.keys(SHEETS).forEach(name => ensureSheet_(ss, name, SHEETS[name], TEXT_COLUMNS[name] || []));
  ['Sheet1', 'แผ่น1', 'ชีต1', 'แผ่นงาน1'].forEach(n => {
    const blank = ss.getSheetByName(n);
    if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  });
  resetRequestCache_();

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN_SECRET')) props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  const sec = initSecrets_();
  if (!props.getProperty('SUPER_HASH') && sec.superUser && sec.superPassword) setSuperAdmin(sec.superUser, sec.superPassword);

  const phone = normalizePhone_(sec.miniPhone), prov = provCode_(sec.miniProvince);
  if (validPhone_(phone) && prov && !findRow_('Accounts', r => normalizePhone_(r.phone) === phone)) {
    appendObj_('Accounts', {
      accountId: 'A-' + prov + '-001', phone: phone, fullName: clean_(sec.miniName) || 'ผู้ดูแลระบบจังหวัด' + PROVINCES[prov],
      position: 'ผู้ดูแลระบบจังหวัด', affiliation: 'สำนักงานเกษตรจังหวัด' + PROVINCES[prov],
      provinceCode: prov, provinceName: PROVINCES[prov], role: 'minisuper', status: 'approved',
      createdAt: now_(), approvedAt: now_(), approvedBy: 'SETUP', lastLoginAt: ''
    });
  }
  const defaults = { source_sheet_id: DEFAULT_SOURCE_ID, photo_folder_id: DEFAULT_PHOTO_FOLDER_ID, counter_total: '0', risk_url: 'https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/', hub_url: 'https://krit-pj.github.io/Green_Gain_Hub-KPP/' };
  Object.keys(defaults).forEach(k => { if (!findRow_('Settings', r => r.key === k)) appendObj_('Settings', { key: k, value: defaults[k] }); });
  props.setProperty('SETUP_VERSION', SETUP_VERSION);
  audit_({ sub: 'SETUP', name: 'SETUP', role: 'system', prov: '' }, 'setup', 'v' + SETUP_VERSION, '');
  Logger.log('Setup complete v' + SETUP_VERSION);
}

/** เปลี่ยนชื่อผู้ใช้/รหัสผ่าน Super Admin — เรียกจาก Apps Script Editor เท่านั้น เก็บเป็นค่า Hash ใน Script Properties */
function setSuperAdmin(username, password) {
  if (!username || String(password || '').length < 8) throw new Error('ต้องระบุชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
  const props = PropertiesService.getScriptProperties();
  const salt = Utilities.getUuid();
  props.setProperties({ SUPER_USER: String(username), SUPER_SALT: salt, SUPER_HASH: superHash_(salt, String(password)) });
}

function superHash_(salt, password) {
  let h = sha256_(salt + ':' + password);
  for (let i = 0; i < 1000; i++) h = sha256_(salt + ':' + h);
  return h;
}

/** ติดตั้ง/อัปเกรดอัตโนมัติเมื่อมีการเรียก API ครั้งแรกหลัง Deploy */
function ensureSetup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_VERSION') === SETUP_VERSION) return;
  withLock_(() => { if (props.getProperty('SETUP_VERSION') !== SETUP_VERSION) setup(); });
}

/**
 * (ไม่บังคับ) คัดลอกบัญชีที่อนุมัติแล้วจากฐานข้อมูล Agri-Risk Map Burning มาใช้ในระบบนี้
 * - เรียกจาก Apps Script Editor โดยเจ้าของระบบเท่านั้น ข้อมูลไม่ออกนอก Google Sheet ของหน่วยงาน
 * - บัญชี minisuper ของระบบแผนที่ (ระดับประเทศ) จะมีสิทธิ์ระดับจังหวัดของตนในระบบนี้ตามนิยามบทบาทใหม่
 * - ข้ามเบอร์ที่มีอยู่แล้ว ตัวอย่าง: copyAccountsFromRiskMap(['62','60'])  หรือ copyAccountsFromRiskMap() ทุกจังหวัด
 */
function copyAccountsFromRiskMap(provinceCodes) {
  ensureSetup_();
  const source = SpreadsheetApp.openById(sourceId_()).getSheetByName('Accounts');
  if (!source) throw new Error('ไม่พบชีต Accounts ในฐานข้อมูลต้นทาง');
  const values = source.getDataRange().getValues();
  const header = values.shift().map(String);
  const col = n => header.indexOf(n);
  const only = (provinceCodes || []).map(provCode_);
  let added = 0;
  withLock_(() => {
    values.forEach(v => {
      const phone = normalizePhone_(v[col('phone')]);
      const prov = provCode_(v[col('provinceCode')]);
      if (!validPhone_(phone) || !prov || String(v[col('status')]) !== 'approved') return;
      if (only.length && only.indexOf(prov) < 0) return;
      if (findRow_('Accounts', r => normalizePhone_(r.phone) === phone)) return;
      appendObj_('Accounts', {
        accountId: nextAccountId_(prov), phone: phone, fullName: clean_(v[col('fullName')]), position: clean_(v[col('position')]),
        affiliation: clean_(v[col('affiliation')]), provinceCode: prov, provinceName: PROVINCES[prov],
        role: String(v[col('role')]) === 'minisuper' ? 'minisuper' : 'admin', status: 'approved',
        createdAt: now_(), approvedAt: now_(), approvedBy: 'คัดลอกจาก Agri-Risk Map', lastLoginAt: ''
      });
      added++;
    });
  });
  audit_({ sub: 'SETUP', name: 'SETUP', role: 'system', prov: '' }, 'account_create', 'copy from risk map', added + ' accounts');
  Logger.log('คัดลอกบัญชี ' + added + ' รายการ');
  return added;
}

/* ---------- เมนูในชีตฐานข้อมูล (สำหรับเจ้าของระบบ) ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ระบบตรวจสอบ HS')
    .addItem('ตั้งชื่อผู้ใช้ / รหัสผ่าน Super Admin', 'setSuperAdminFromMenu')
    .addItem('คัดลอกบัญชีจากระบบ Agri-Risk Map', 'copyAccountsFromMenu')
    .addSeparator()
    .addItem('ติดตั้ง / ตรวจโครงสร้างชีต', 'setup')
    .addToUi();
}

/** ให้เจ้าของระบบพิมพ์ชื่อผู้ใช้และรหัสผ่าน Super Admin ในชีต — ระบบเก็บเฉพาะค่า Hash ใน Script Properties */
function setSuperAdminFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const u = ui.prompt('Super Admin', 'ชื่อผู้ใช้ Super Admin', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK || !u.getResponseText().trim()) return;
  const p = ui.prompt('Super Admin', 'รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร) — ปิดหน้าจอจากผู้อื่นขณะพิมพ์', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  try {
    setSuperAdmin(u.getResponseText().trim(), p.getResponseText());
    audit_({ sub: 'SETUP', name: 'เจ้าของระบบ', role: 'system', prov: '' }, 'settings_save', 'Super Admin credentials', '');
    ui.alert('ตั้งค่า Super Admin เรียบร้อย เข้าสู่ระบบที่เว็บไซต์ → เข้าใช้งานระบบ → Super Admin');
  } catch (err) { ui.alert(String(err.message || err)); }
}

function copyAccountsFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('คัดลอกบัญชีที่อนุมัติแล้วจากระบบ Agri-Risk Map Burning (ข้ามเบอร์ที่มีอยู่แล้ว)?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  ui.alert('คัดลอกแล้ว ' + copyAccountsFromRiskMap() + ' บัญชี');
}
