/* ไฟล์รวมอัตโนมัติจาก apps-script/ — อย่าแก้ไฟล์นี้โดยตรง (npm run bundle)
 * วางไฟล์นี้เป็น Code.gs ใน Apps Script แล้วสร้าง Secrets.gs จาก apps-script/Secrets.example.gs */

/* ===== Config.gs ===== */
/**
 * ระบบตรวจสอบจุดความร้อน (Thailand HS Verification) — Backend v3.0
 * -----------------------------------------------------------------
 * แหล่ง HS (อ่านอย่างเดียว) : Google Sheet "TH Agri-Risk Map Burning V3 - Database" แท็บ HS_<รหัสจังหวัด>
 * ฐานข้อมูลระบบนี้           : Google Sheet "Thailand HS Verification - Database"
 *                              ในโฟลเดอร์ Drive "5. Thailand HS Verification"
 * รูปภาพหลักฐาน             : โฟลเดอร์ Drive "HS Verification Photos" (ไฟล์ส่วนตัว อ่านผ่าน API ที่ตรวจสิทธิ์)
 *
 * บทบาท (ระบบเดียวกับ TH-Agri-Risk-Maps-Burning: Admin/Mini Super Admin เข้าด้วยเบอร์โทร, Super Admin ใช้ชื่อผู้ใช้+รหัสผ่าน)
 *   superadmin : จัดการได้ทั้งระบบ
 *   minisuper  : ระดับจังหวัด — อนุมัติ/อนุญาตเจ้าหน้าที่ในจังหวัด, บันทึก แก้ไข เพิ่ม ลบ ข้อมูลระดับจังหวัด
 *   admin      : ผู้บันทึกข้อมูลผลตรวจจุดความร้อน (HS) ในจังหวัดของตน
 */

const APP_VERSION = '3.2.0';
const SETUP_VERSION = '3.2';

/** ฐานข้อมูลของระบบตรวจสอบ (สร้างไว้แล้วในโฟลเดอร์ 5. Thailand HS Verification) */
const DB_ID = '1LOuhCmG8nSS5Si-wHUtgyUtbWYkTw-XKaVjrYBHPxlQ';
/** แหล่ง HS ของระบบ Agri-Risk Map Burning (อ่านอย่างเดียว) — เปลี่ยนได้ที่ Settings key source_sheet_id */
const DEFAULT_SOURCE_ID = '178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A';
/** โฟลเดอร์รูปภาพ — เปลี่ยนได้ที่ Settings key photo_folder_id */
const DEFAULT_PHOTO_FOLDER_ID = '1bo9-9z9M2fb09T51qG2Od0SjZXkUd6vl';

const TOKEN_HOURS = 8;
const HS_CACHE_SECONDS = 600;
const MAX_PHOTOS_PER_HS = 3;
const REGISTER_LIMIT_PER_10_MIN = 30;
/** รหัสจังหวัดของ Mini Super Admin ระดับประเทศ (ดูแลทุกจังหวัด) */
const ALL_PROVINCES = 'ALL';
const VISIT_LOG_MINUTES = 30;
const MAX_PHOTO_BYTES = 1000000;
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const PROVINCES = {"10":"กรุงเทพมหานคร","11":"สมุทรปราการ","12":"นนทบุรี","13":"ปทุมธานี","14":"พระนครศรีอยุธยา","15":"อ่างทอง","16":"ลพบุรี","17":"สิงห์บุรี","18":"ชัยนาท","19":"สระบุรี","20":"ชลบุรี","21":"ระยอง","22":"จันทบุรี","23":"ตราด","24":"ฉะเชิงเทรา","25":"ปราจีนบุรี","26":"นครนายก","27":"สระแก้ว","30":"นครราชสีมา","31":"บุรีรัมย์","32":"สุรินทร์","33":"ศรีสะเกษ","34":"อุบลราชธานี","35":"ยโสธร","36":"ชัยภูมิ","37":"อำนาจเจริญ","38":"บึงกาฬ","39":"หนองบัวลำภู","40":"ขอนแก่น","41":"อุดรธานี","42":"เลย","43":"หนองคาย","44":"มหาสารคาม","45":"ร้อยเอ็ด","46":"กาฬสินธุ์","47":"สกลนคร","48":"นครพนม","49":"มุกดาหาร","50":"เชียงใหม่","51":"ลำพูน","52":"ลำปาง","53":"อุตรดิตถ์","54":"แพร่","55":"น่าน","56":"พะเยา","57":"เชียงราย","58":"แม่ฮ่องสอน","60":"นครสวรรค์","61":"อุทัยธานี","62":"กำแพงเพชร","63":"ตาก","64":"สุโขทัย","65":"พิษณุโลก","66":"พิจิตร","67":"เพชรบูรณ์","70":"ราชบุรี","71":"กาญจนบุรี","72":"สุพรรณบุรี","73":"นครปฐม","74":"สมุทรสาคร","75":"สมุทรสงคราม","76":"เพชรบุรี","77":"ประจวบคีรีขันธ์","80":"นครศรีธรรมราช","81":"กระบี่","82":"พังงา","83":"ภูเก็ต","84":"สุราษฎร์ธานี","85":"ระนอง","86":"ชุมพร","90":"สงขลา","91":"สตูล","92":"ตรัง","93":"พัทลุง","94":"ปัตตานี","95":"ยะลา","96":"นราธิวาส"};

const SHEETS = {
  Accounts: ['accountId', 'phone', 'fullName', 'position', 'affiliation', 'provinceCode', 'provinceName', 'role', 'status', 'createdAt', 'approvedAt', 'approvedBy', 'lastLoginAt'],
  Requests: ['requestId', 'phone', 'fullName', 'position', 'affiliation', 'provinceCode', 'provinceName', 'requestedRole', 'note', 'consentAt', 'status', 'createdAt', 'decidedAt', 'decidedBy', 'reason', 'accountId'],
  Verifications: ['verificationId', 'clientRequestId', 'provinceCode', 'provinceName', 'hotspotId', 'hsDate', 'districtName', 'subdistrictName', 'village', 'plantType', 'hsLat', 'hsLng',
    'status', 'result', 'fireState', 'observedMatches', 'observedLandType', 'observedPlantType', 'personCategory', 'personCategoryOther', 'fieldInspectorName', 'inspectedAt',
    'obsLat', 'obsLng', 'gpsAccuracyM', 'missingGpsReason', 'distanceM', 'notes', 'followUpAction', 'photoCount', 'photoMissingReason',
    'recordedById', 'recordedByName', 'recordedByRole', 'createdAt', 'updatedAt', 'updatedById', 'updatedByName'],
  Photos: ['photoId', 'clientRequestId', 'verificationId', 'hotspotId', 'provinceCode', 'driveFileId', 'fileName', 'mimeType', 'sizeBytes', 'sha256', 'photoLat', 'photoLng', 'takenAt', 'uploadedById', 'uploadedByName', 'uploadedAt'],
  AuditLog: ['logId', 'time', 'actorId', 'actorName', 'role', 'provinceCode', 'action', 'target', 'detail'],
  LoginAttempts: ['time', 'role', 'identifier', 'result', 'accountId', 'fullName', 'provinceCode', 'provinceName', 'device'],
  Settings: ['key', 'value'],
  Counter: ['date', 'hits']
};

/** คอลัมน์ที่ต้องเก็บเป็นข้อความ (กัน Google Sheet ตัดเลข 0 นำหน้าหรือแปลงเป็นวันที่) */
const TEXT_COLUMNS = {
  Accounts: ['accountId', 'phone', 'provinceCode', 'createdAt', 'approvedAt', 'lastLoginAt'],
  Requests: ['requestId', 'phone', 'provinceCode', 'consentAt', 'createdAt', 'decidedAt', 'accountId'],
  Verifications: ['verificationId', 'clientRequestId', 'provinceCode', 'hotspotId', 'hsDate', 'inspectedAt', 'recordedById', 'createdAt', 'updatedAt', 'updatedById'],
  Photos: ['photoId', 'clientRequestId', 'verificationId', 'hotspotId', 'provinceCode', 'driveFileId', 'sha256', 'takenAt', 'uploadedById', 'uploadedAt'],
  AuditLog: ['logId', 'time', 'actorId', 'provinceCode'],
  LoginAttempts: ['time', 'identifier', 'accountId', 'provinceCode'],
  Settings: ['key', 'value'],
  Counter: ['date']
};

const ROLE_LABELS = { superadmin: 'Super Admin', minisuper: 'Mini Super Admin', admin: 'Admin' };
const RESULTS = ['burned', 'not_burned', 'not_found', 'needs_review', 'inaccessible'];
const RESULT_LABELS = { burned: 'พบการเผา', not_burned: 'ไม่พบการเผา', not_found: 'ไม่พบจุด', needs_review: 'ต้องตรวจซ้ำ', inaccessible: 'เข้าตรวจสอบไม่ได้' };
const STATUSES = ['draft', 'verified'];
const FIRE_STATES = ['', 'unknown', 'active', 'extinguished'];
const MISSING_GPS_REASONS = ['', 'permission_denied', 'signal_unavailable', 'device_unavailable', 'field_safety', 'other'];
const PHOTO_MISSING_REASONS = ['', 'field_safety', 'device_unavailable', 'retrospective'];
const PERSON_CATEGORIES = ['นักวิชาการส่งเสริมการเกษตร', 'กำนัน', 'ผู้ใหญ่บ้าน', 'ผู้ช่วยผู้ใหญ่บ้าน', 'อกม.', 'อื่นๆ'];
const LOGIN_RESULTS = { success: 'สำเร็จ', not_found: 'ไม่มีหมายเลขในระบบ', pending: 'รออนุมัติ', disabled: 'บัญชีถูกระงับ', invalid: 'รูปแบบไม่ถูกต้อง', wrong_credentials: 'ชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง' };
const AUDIT_LABELS = {
  setup: 'ติดตั้งระบบ', login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', register: 'ลงทะเบียน Admin',
  request_approve: 'อนุมัติคำขอ', request_reject: 'ปฏิเสธคำขอ',
  account_create: 'เพิ่มบัญชี', account_update: 'แก้ไขบัญชี', account_approved: 'เปิดใช้บัญชี', account_disabled: 'ระงับบัญชี', account_delete: 'ลบบัญชี',
  verification_create: 'บันทึกผลตรวจ', verification_update: 'แก้ไขผลตรวจ', verification_delete: 'ลบผลตรวจ',
  photo_upload: 'แนบภาพ', visit: 'เปิดใช้งานระบบ', photo_delete: 'ลบภาพ', export: 'ส่งออกข้อมูล', settings_save: 'ตั้งค่าระบบ', cache_clear: 'ล้างแคช HS'
};

/* ===== Utils.gs ===== */
/* ============================== เครื่องมือทั่วไป ============================== */

function now_() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss"); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); }

function clean_(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
}
function cleanLong_(v) { return clean_(v, 1500); }

function normalizePhone_(v) {
  let s = String(v === undefined || v === null ? '' : v).replace(/\D/g, '');
  if (s.indexOf('66') === 0 && s.length === 11) s = '0' + s.slice(2);
  if (s.length === 9 && s[0] !== '0') s = '0' + s; // Google Sheet เคยตัดเลข 0 นำหน้า
  return s;
}
function validPhone_(s) { return /^0\d{8,9}$/.test(s); }

function provCode_(v) {
  const s = String(v === undefined || v === null ? '' : v).replace(/\D/g, '');
  const code = s.length === 1 ? '0' + s : s;
  return PROVINCES[code] ? code : '';
}

function num_(v, min, max) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (!isFinite(n) || n < min || n > max) throw new Error('ค่าตัวเลขไม่ถูกต้อง');
  return n;
}

function oneOf_(v, list, label) {
  const s = String(v === undefined || v === null ? '' : v);
  if (list.indexOf(s) < 0) throw new Error('ค่า ' + label + ' ไม่ถูกต้อง');
  return s;
}

function isoish_(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/.test(s)) throw new Error('รูปแบบวันเวลาไม่ถูกต้อง');
  return s.slice(0, 19);
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function sha256Bytes_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function hmac_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET')));
}
function newId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 6);
}
function uuid_(v) {
  const s = String(v || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s.toLowerCase() : '';
}

/** ระยะทางเมตรระหว่างพิกัดสองจุด (Haversine) */
function distanceM_(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(x => x === '' || x === null || !isFinite(Number(x)))) return '';
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===== Db.gs ===== */
/* ============================== ฐานข้อมูล (Google Sheet) ============================== */

let DB_CACHE_ = null;
let ROWS_CACHE_ = {};

/** เรียกต้นทุกคำขอ เพื่อไม่ให้ค่าที่อ่านไว้จากคำขอก่อนค้างในหน่วยความจำ */
function resetRequestCache_() { ROWS_CACHE_ = {}; }

function db_() {
  if (!DB_CACHE_) DB_CACHE_ = DB_ID ? SpreadsheetApp.openById(DB_ID) : SpreadsheetApp.getActiveSpreadsheet();
  return DB_CACHE_;
}

function sheet_(name) {
  const sh = db_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' (เรียก setup ก่อน)');
  return sh;
}

function ensureSheet_(ss, name, headers, textCols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const width = headers.length;
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  const current = sh.getLastColumn() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), width)).getValues()[0].map(String) : [];
  // เพิ่มเฉพาะหัวคอลัมน์ที่ขาด ไม่สลับลำดับคอลัมน์เดิม
  if (!current.filter(String).length) sh.getRange(1, 1, 1, width).setValues([headers]);
  else headers.forEach(h => {
    if (current.indexOf(h) >= 0) return;
    const col = sh.getLastColumn() + 1;
    if (col > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
    sh.getRange(1, col).setValue(h);
    current.push(h);
  });
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#dff3ef');
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  (textCols || []).forEach(col => {
    const idx = header.indexOf(col);
    if (idx >= 0) sh.getRange(1, idx + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  return sh;
}

function headerOf_(sh) {
  const width = sh.getLastColumn();
  return width ? sh.getRange(1, 1, 1, width).getValues()[0].map(String) : [];
}

/** อ่านทุกแถวเป็น object พร้อม _row (เลขแถวจริงในชีต) */
function readAll_(name) {
  if (ROWS_CACHE_[name]) return ROWS_CACHE_[name];
  const sh = sheet_(name);
  const header = headerOf_(sh);
  const last = sh.getLastRow();
  const rows = [];
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, header.length).getValues();
    values.forEach((v, i) => {
      if (v.every(x => x === '' || x === null)) return;
      const o = { _row: i + 2 };
      header.forEach((h, j) => { if (h) o[h] = cellText_(v[j]); });
      rows.push(o);
    });
  }
  ROWS_CACHE_[name] = rows;
  return rows;
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    const full = Utilities.formatDate(v, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
    return /T00:00:00$/.test(full) ? full.slice(0, 10) : full;
  }
  return String(v);
}

function findRow_(name, fn) { return readAll_(name).find(fn) || null; }

/** ค่าในคอลัมน์ข้อความใส่ ' นำหน้า เพื่อไม่ให้ Google Sheet แปลงเป็นตัวเลข/วันที่ (เครื่องหมายนี้ไม่แสดงในเซลล์) */
function cellFor_(name, h, v) {
  const text = (TEXT_COLUMNS[name] || []).indexOf(h) >= 0;
  if (text && v !== undefined && v !== null && v !== '') return "'" + String(v);
  return safeCell_(v);
}

function appendObj_(name, obj) {
  const sh = sheet_(name);
  const header = headerOf_(sh);
  sh.appendRow(header.map(h => cellFor_(name, h, obj[h])));
  delete ROWS_CACHE_[name];
}

function updateRow_(name, rowNum, patch) {
  const sh = sheet_(name);
  const header = headerOf_(sh);
  const range = sh.getRange(rowNum, 1, 1, header.length);
  const row = range.getValues()[0];
  header.forEach((h, i) => { row[i] = Object.prototype.hasOwnProperty.call(patch, h) ? cellFor_(name, h, patch[h]) : (typeof row[i] === 'string' && (TEXT_COLUMNS[name] || []).indexOf(h) >= 0 && row[i] !== '' ? "'" + row[i] : row[i]); });
  range.setValues([row]);
  delete ROWS_CACHE_[name];
}

function deleteRow_(name, rowNum) {
  sheet_(name).deleteRow(rowNum);
  delete ROWS_CACHE_[name];
}

/** ค่าที่เขียนลงชีต: ไม่ให้ขึ้นต้นด้วย = + - @ เพื่อกันสูตรแฝง (formula injection) ยกเว้นตัวเลข */
function safeCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  return /^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) ? "'" + s : s;
}

function stripRow_(r) { const o = Object.assign({}, r); delete o._row; return o; }

function setting_(key) { const r = findRow_('Settings', x => x.key === key); return r ? String(r.value || '') : ''; }

function setSetting_(key, value) {
  const r = findRow_('Settings', x => x.key === key);
  if (r) updateRow_('Settings', r._row, { value: String(value) });
  else appendObj_('Settings', { key: key, value: String(value) });
}

/* ===== Setup.gs ===== */
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

/* ===== Audit.gs ===== */
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

/* ===== Auth.gs ===== */
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

/**
 * ลงทะเบียน Admin ด้วยตนเอง — ใช้งานได้ทันที (เข้าสู่ระบบให้อัตโนมัติ) ในจังหวัดที่เลือก
 * Mini Super Admin ไม่เปิดให้ลงทะเบียน: แต่งตั้งได้โดย Super Admin เท่านั้น
 * Mini Super Admin ของจังหวัดเห็นผู้ลงทะเบียนใหม่ และระงับ/ลบได้ทันทีหากไม่ใช่เจ้าหน้าที่จริง
 */
function register_(b) {
  const phone = normalizePhone_(b.phone);
  const prov = provCode_(b.provinceCode);
  const device = clean_(b.device, 120);
  if (!validPhone_(phone)) throw new Error('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ตัวอย่าง 0812345678)');
  if (!prov) throw new Error('กรุณาเลือกจังหวัด');
  if (!clean_(b.fullName)) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  if (!clean_(b.position)) throw new Error('กรุณากรอกตำแหน่ง');
  if (!clean_(b.affiliation)) throw new Error('กรุณากรอกสังกัด');
  if (b.consent !== true) throw new Error('กรุณายืนยันการรับทราบการใช้ข้อมูลส่วนบุคคล');
  const cache = CacheService.getScriptCache();
  const recent = Number(cache.get('regcount') || 0);
  if (recent >= REGISTER_LIMIT_PER_10_MIN) throw new Error('มีการลงทะเบียนจำนวนมากในขณะนี้ กรุณาลองใหม่ในอีก 10 นาที');
  return withLock_(() => {
    const existing = findRow_('Accounts', r => normalizePhone_(r.phone) === phone);
    if (existing) throw new Error(existing.status === 'approved' ? 'เบอร์โทรศัพท์นี้ลงทะเบียนแล้ว กรุณาเข้าสู่ระบบด้วยเบอร์นี้' : 'เบอร์โทรศัพท์นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบจังหวัด');
    const accountId = nextAccountId_(prov);
    const data = {
      accountId: accountId, phone: phone, fullName: clean_(b.fullName), position: clean_(b.position), affiliation: clean_(b.affiliation),
      provinceCode: prov, provinceName: PROVINCES[prov], role: 'admin', status: 'approved',
      createdAt: now_(), approvedAt: now_(), approvedBy: 'ลงทะเบียนด้วยตนเอง', lastLoginAt: now_()
    };
    appendObj_('Accounts', data);
    const id = newId_('R');
    appendObj_('Requests', {
      requestId: id, phone: phone, fullName: data.fullName, position: data.position, affiliation: data.affiliation,
      provinceCode: prov, provinceName: PROVINCES[prov], requestedRole: 'admin', note: clean_(b.note, 500), consentAt: now_(),
      status: 'auto_approved', createdAt: now_(), decidedAt: now_(), decidedBy: 'อัตโนมัติ', reason: '', accountId: accountId
    });
    cache.put('regcount', String(recent + 1), 600);
    const acc = findRow_('Accounts', r => r.accountId === accountId);
    const user = accountUser_(acc);
    logAttempt_('admin', phone, 'success', acc, device);
    audit_(user, 'register', accountId + ' ' + data.fullName, 'ลงทะเบียน Admin ด้วยตนเอง · ' + data.position + ' · ' + data.affiliation, prov);
    return { ok: true, requestId: id, token: signToken_(user), user: user };
  });
}

/**
 * แปลงบัญชีในชีตเป็นผู้ใช้ในระบบ
 *   admin            : จังหวัดของตน
 *   minisuper (จังหวัด): จังหวัดของตน
 *   minisuper (ALL)  : ทั้งระบบ — จัดการได้เหมือน Super Admin ยกเว้นบัญชี Super Admin / Mini Super Admin และการตั้งค่าระบบ
 */
function accountUser_(acc) {
  const role = acc.role === 'minisuper' ? 'minisuper' : 'admin';
  const national = role === 'minisuper' && String(acc.provinceCode) === ALL_PROVINCES;
  const prov = national ? '*' : String(acc.provinceCode);
  return { sub: acc.accountId, name: acc.fullName, phone: normalizePhone_(acc.phone), role: role, prov: prov, provName: national ? 'ทุกจังหวัด' : PROVINCES[prov] || '', position: acc.position || '', affiliation: acc.affiliation || '' };
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
/** ขอบเขตทั้งประเทศ: Super Admin และ Mini Super Admin ระดับประเทศ */
function isNational_(user) { return user.role === 'superadmin' || (user.role === 'minisuper' && user.prov === '*'); }
function isManager_(user) { return user.role === 'superadmin' || user.role === 'minisuper'; }
function requireSuper_(user) { if (!isSuper_(user)) throw new Error('เฉพาะ Super Admin เท่านั้น'); }
function requireManager_(user) { if (!isManager_(user)) throw new Error('เฉพาะ Mini Super Admin / Super Admin เท่านั้น'); }
function inScope_(user, prov) { return isNational_(user) || String(prov) === user.prov; }

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
  if (role === 'minisuper' && !isSuper_(user)) throw new Error('การเพิ่ม/แก้ไข/ระงับ/ลบ Mini Super Admin ทำได้เฉพาะ Super Admin');
  if (String(prov) === ALL_PROVINCES) { if (!isSuper_(user)) throw new Error('ไม่มีสิทธิ์จัดการบัญชีระดับประเทศ'); return; }
  requireProvince_(user, prov);
}

/* ===== Accounts.gs ===== */
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

/* ===== Hotspots.gs ===== */
/* ============================== แหล่งข้อมูล HS (อ่านอย่างเดียว) ============================== */
/*
 * อ่านจาก Google Sheet ฐานข้อมูล Agri-Risk Map Burning แท็บ HS_<รหัสจังหวัด>
 * หัวตาราง: hotspotId, date, time, districtCode, subdistrictCode, districtName, subdistrictName, village, plantType, lat, lng, batchId, importedAt
 * ระบบนี้ไม่แก้ไขข้อมูลต้นทาง ผลตรวจเก็บแยกในชีต Verifications ของฐานข้อมูลใหม่
 */

const HS_FIELDS = ['hotspotId', 'date', 'time', 'districtCode', 'subdistrictCode', 'districtName', 'subdistrictName', 'village', 'plantType', 'lat', 'lng'];

function sourceId_() { return setting_('source_sheet_id') || DEFAULT_SOURCE_ID; }
function source_() { return SpreadsheetApp.openById(sourceId_()); }

function cachePutBig_(key, text) {
  const cache = CacheService.getScriptCache();
  const size = 90000, parts = Math.ceil(text.length / size) || 1;
  if (parts > 80) return;
  const map = { [key + ':n']: String(parts) };
  for (let i = 0; i < parts; i++) map[key + ':' + i] = text.slice(i * size, (i + 1) * size);
  cache.putAll(map, HS_CACHE_SECONDS);
}

function cacheGetBig_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key + ':n') || 0);
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + ':' + i);
  const got = cache.getAll(keys);
  if (keys.some(k => got[k] === undefined || got[k] === null)) return null;
  return keys.map(k => got[k]).join('');
}

function clearHsCache_(prov) {
  const cache = CacheService.getScriptCache();
  cache.remove('hs:' + prov + ':n');
  cache.remove('provinces:n');
}

function dateText_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

function timeText_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Bangkok', 'HH:mm');
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2}):?(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

/** อ่านจุด HS ของจังหวัด คืนค่าเป็นอาร์เรย์ตามลำดับ HS_FIELDS */
function sourceHs_(prov) {
  const key = 'hs:' + prov;
  const cached = cacheGetBig_(key);
  if (cached) return JSON.parse(cached);
  const sh = source_().getSheetByName('HS_' + prov);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const header = values.shift().map(String);
  const idx = HS_FIELDS.map(f => header.indexOf(f));
  ['hotspotId', 'date', 'lat', 'lng'].forEach(f => { if (header.indexOf(f) < 0) throw new Error('แท็บ HS_' + prov + ' ขาดคอลัมน์ ' + f); });
  const seen = {}, rows = [];
  values.forEach(v => {
    const get = i => (idx[i] >= 0 ? v[idx[i]] : '');
    const id = String(get(0)).trim();
    const lat = Number(get(9)), lng = Number(get(10));
    const date = dateText_(get(1));
    if (!id || seen[id] || !date || !isFinite(lat) || !isFinite(lng) || lat < 5 || lat > 21 || lng < 97 || lng > 106) return;
    seen[id] = true;
    rows.push([id, date, timeText_(get(2)), String(get(3)), String(get(4)), String(get(5)).trim(), String(get(6)).trim(), String(get(7)).trim(), String(get(8)).trim(), Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]);
  });
  cachePutBig_(key, JSON.stringify(rows));
  return rows;
}

function sourceHsById_(prov, hotspotId) {
  const row = sourceHs_(prov).find(r => r[0] === hotspotId);
  if (!row) return null;
  const o = {};
  HS_FIELDS.forEach((f, i) => { o[f] = row[i]; });
  return o;
}

/** รายชื่อจังหวัดที่มีข้อมูล HS (จากชีต ProvinceSummary ของต้นทาง หรือจากชื่อแท็บ HS_xx) พร้อมจำนวนผลตรวจ */
function publicProvinces_() {
  const cached = cacheGetBig_('provinces');
  let list = cached ? JSON.parse(cached) : null;
  if (!list) {
    const ss = source_();
    const summary = ss.getSheetByName('ProvinceSummary');
    list = [];
    if (summary && summary.getLastRow() > 1) {
      const values = summary.getDataRange().getValues();
      const h = values.shift().map(String);
      values.forEach(v => {
        const code = provCode_(v[h.indexOf('provinceCode')]);
        const count = Number(v[h.indexOf('hsCount')]) || 0;
        if (code && count > 0) list.push({ code: code, name: PROVINCES[code], hsCount: count, firstDate: dateText_(v[h.indexOf('firstDate')]), lastDate: dateText_(v[h.indexOf('lastDate')]) });
      });
    } else {
      ss.getSheets().forEach(s => {
        const m = s.getName().match(/^HS_(\d{2})$/);
        if (m && PROVINCES[m[1]] && s.getLastRow() > 1) list.push({ code: m[1], name: PROVINCES[m[1]], hsCount: s.getLastRow() - 1, firstDate: '', lastDate: '' });
      });
    }
    list.sort((a, c) => a.name.localeCompare(c.name, 'th'));
    cachePutBig_('provinces', JSON.stringify(list));
  }
  const counts = {};
  readAll_('Verifications').forEach(r => {
    const c = counts[r.provinceCode] || (counts[r.provinceCode] = { verified: 0, draft: 0, burned: 0 });
    if (r.status === 'verified') c.verified++; else c.draft++;
    if (r.status === 'verified' && r.result === 'burned') c.burned++;
  });
  return list.map(p => Object.assign({}, p, counts[p.code] || { verified: 0, draft: 0, burned: 0 }));
}

/** ข้อมูลสาธารณะ: จุด HS + สถานะ/ผลตรวจ (ไม่เปิดเผยชื่อผู้บันทึก พิกัดหน้างาน หรือภาพ) */
function publicHotspots_(prov) {
  const code = provCode_(prov);
  if (!code) throw new Error('รหัสจังหวัดไม่ถูกต้อง');
  const status = {};
  readAll_('Verifications').forEach(r => {
    if (r.provinceCode === code) status[r.hotspotId] = [r.status, r.result, String(r.inspectedAt || r.updatedAt || '').slice(0, 10), Number(r.photoCount) || 0];
  });
  return { ok: true, province: code, provinceName: PROVINCES[code], fields: HS_FIELDS, rows: sourceHs_(code), status: status, statusFields: ['status', 'result', 'inspectedDate', 'photoCount'], generatedAt: now_() };
}

/* ===== Verification.gs ===== */
/* ============================== ผลตรวจจุดความร้อน ============================== */
/*
 * สิทธิ์
 *   admin     : บันทึกผลตรวจในจังหวัดของตน และแก้ไขรายการที่ตนบันทึก
 *   minisuper : บันทึก แก้ไข เพิ่ม ลบ ผลตรวจทุกรายการในจังหวัดของตน
 *   superadmin: ทุกจังหวัด
 * 1 จุด HS มีผลตรวจปัจจุบัน 1 รายการ ประวัติการแก้ไขทุกครั้งอยู่ใน AuditLog
 */

function canEdit_(user, rec) {
  if (isNational_(user)) return true;
  if (rec.provinceCode !== user.prov) return false;
  return user.role === 'minisuper' || rec.recordedById === user.sub;
}
function canDelete_(user, rec) { return isNational_(user) || (user.role === 'minisuper' && rec.provinceCode === user.prov); }

function publicVerification_(rec, user) {
  const o = stripRow_(rec);
  o.canEdit = canEdit_(user, rec);
  o.canDelete = canDelete_(user, rec);
  return o;
}

function photosOf_(verificationId) {
  return readAll_('Photos').filter(p => p.verificationId === verificationId).map(stripRow_);
}

function verificationGet_(user, b) {
  const prov = requireProvince_(user, b.province);
  const id = clean_(b.hotspotId, 80);
  const hs = sourceHsById_(prov, id);
  if (!hs) throw new Error('ไม่พบจุด HS ' + id + ' ในข้อมูลต้นทาง');
  const rec = findRow_('Verifications', r => r.provinceCode === prov && r.hotspotId === id);
  return { ok: true, hotspot: hs, verification: rec ? publicVerification_(rec, user) : null, photos: rec ? photosOf_(rec.verificationId) : [], canCreate: true };
}

function verificationSave_(user, b) {
  const prov = requireProvince_(user, b.province);
  const hotspotId = clean_(b.hotspotId, 80);
  const clientRequestId = uuid_(b.clientRequestId);
  if (!clientRequestId) throw new Error('ต้องมีรหัสคำขอ (clientRequestId)');
  const hs = sourceHsById_(prov, hotspotId);
  if (!hs) throw new Error('ไม่พบจุด HS ' + hotspotId + ' ในข้อมูลต้นทางของจังหวัด' + PROVINCES[prov]);

  const status = oneOf_(b.status || 'draft', STATUSES, 'สถานะ');
  const result = b.result ? oneOf_(b.result, RESULTS, 'ผลตรวจ') : '';
  const obsLat = num_(b.obsLat, 5, 21), obsLng = num_(b.obsLng, 97, 106);
  const missingGpsReason = oneOf_(b.missingGpsReason || '', MISSING_GPS_REASONS, 'เหตุผลไม่มี GPS');
  const photoMissingReason = oneOf_(b.photoMissingReason || '', PHOTO_MISSING_REASONS, 'เหตุผลไม่มีภาพ');
  const plannedPhotos = Math.max(0, Math.min(MAX_PHOTOS_PER_HS, Number(b.plannedPhotos) || 0));
  if (status === 'verified') {
    if (!result) throw new Error('กรุณาเลือกผลการตรวจ');
    if ((obsLat === '' || obsLng === '') && !missingGpsReason) throw new Error('กรุณาบันทึกตำแหน่ง GPS หรือระบุเหตุผลที่ไม่มี GPS');
  }
  const personCategory = b.personCategory ? oneOf_(b.personCategory, PERSON_CATEGORIES, 'ประเภทผู้ลงพื้นที่') : '';

  return withLock_(() => {
    const replay = findRow_('Verifications', r => r.clientRequestId === clientRequestId);
    if (replay) return { ok: true, replay: true, verification: publicVerification_(replay, user) };
    const existing = findRow_('Verifications', r => r.provinceCode === prov && r.hotspotId === hotspotId);
    if (existing && !canEdit_(user, existing)) throw new Error('จุดนี้บันทึกโดย ' + existing.recordedByName + ' แล้ว ผู้บันทึกเดิมหรือผู้ดูแลจังหวัดเท่านั้นที่แก้ไขได้');
    const photoCount = existing ? photosOf_(existing.verificationId).length : 0;
    if (status === 'verified' && photoCount + plannedPhotos === 0 && !photoMissingReason) throw new Error('กรุณาแนบภาพถ่าย หรือระบุเหตุผลที่ไม่มีภาพ');
    const data = {
      clientRequestId: clientRequestId, provinceCode: prov, provinceName: PROVINCES[prov], hotspotId: hotspotId,
      hsDate: hs.date, districtName: hs.districtName, subdistrictName: hs.subdistrictName, village: hs.village, plantType: hs.plantType, hsLat: hs.lat, hsLng: hs.lng,
      status: status, result: result, fireState: oneOf_(b.fireState || '', FIRE_STATES, 'สถานะไฟ'),
      observedMatches: oneOf_(b.observedMatches || '', ['', 'yes', 'no'], 'สภาพพื้นที่'), observedLandType: clean_(b.observedLandType, 100), observedPlantType: clean_(b.observedPlantType, 150),
      personCategory: personCategory, personCategoryOther: personCategory === 'อื่นๆ' ? clean_(b.personCategoryOther, 150) : '',
      fieldInspectorName: clean_(b.fieldInspectorName, 200) || user.name, inspectedAt: isoish_(b.inspectedAt) || now_(),
      obsLat: obsLat, obsLng: obsLng, gpsAccuracyM: num_(b.gpsAccuracyM, 0, 100000), missingGpsReason: obsLat === '' ? missingGpsReason : '',
      distanceM: distanceM_(Number(hs.lat), Number(hs.lng), obsLat, obsLng),
      notes: clean_(b.notes, 500), followUpAction: clean_(b.followUpAction, 1000), photoMissingReason: photoMissingReason,
      updatedAt: now_(), updatedById: user.sub, updatedByName: user.name
    };
    let rec;
    if (existing) {
      updateRow_('Verifications', existing._row, data);
      rec = findRow_('Verifications', r => r.verificationId === existing.verificationId);
      audit_(user, 'verification_update', hotspotId, summaryText_(data), prov);
    } else {
      const id = newId_('V');
      appendObj_('Verifications', Object.assign({}, data, {
        verificationId: id, photoCount: 0, recordedById: user.sub, recordedByName: user.name, recordedByRole: user.role, createdAt: now_()
      }));
      rec = findRow_('Verifications', r => r.verificationId === id);
      audit_(user, 'verification_create', hotspotId, summaryText_(data), prov);
    }
    return { ok: true, verification: publicVerification_(rec, user) };
  });
}

function summaryText_(d) {
  return [d.status === 'verified' ? 'ยืนยันผล' : 'งานร่าง', RESULT_LABELS[d.result] || '', d.districtName, d.subdistrictName].filter(String).join(' · ');
}

function verificationDelete_(user, b) {
  return withLock_(() => {
    const rec = findRow_('Verifications', r => r.verificationId === b.verificationId);
    if (!rec) throw new Error('ไม่พบผลตรวจ');
    if (!canDelete_(user, rec)) throw new Error('ลบผลตรวจได้เฉพาะ Mini Super Admin ของจังหวัด หรือ Super Admin');
    const photos = readAll_('Photos').filter(p => p.verificationId === rec.verificationId);
    photos.slice().sort((a, c) => c._row - a._row).forEach(p => {
      trashDriveFile_(p.driveFileId);
      deleteRow_('Photos', p._row);
    });
    deleteRow_('Verifications', rec._row);
    audit_(user, 'verification_delete', rec.hotspotId, JSON.stringify(Object.assign(stripRow_(rec), { photos: photos.length, reason: clean_(b.reason, 300) })), rec.provinceCode);
    return { ok: true };
  });
}

function trashDriveFile_(id) {
  try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (err) { console.warn('trash failed ' + id + ': ' + err); }
}

/* ------------------------------ ภาพหลักฐาน ------------------------------ */

function photoFolder_(prov) {
  const root = DriveApp.getFolderById(setting_('photo_folder_id') || DEFAULT_PHOTO_FOLDER_ID);
  const name = prov + ' ' + PROVINCES[prov];
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function photoUpload_(user, b) {
  const clientRequestId = uuid_(b.clientRequestId);
  if (!clientRequestId) throw new Error('ต้องมีรหัสคำขอ (clientRequestId)');
  const mime = oneOf_(b.mimeType, PHOTO_MIME_TYPES, 'ชนิดภาพ');
  const base64 = String(b.base64 || '');
  if (!base64 || base64.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 8) throw new Error('ภาพต้องมีขนาดไม่เกิน 1 MB');
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('ภาพต้องมีขนาดไม่เกิน 1 MB');
  return withLock_(() => {
    const replay = findRow_('Photos', p => p.clientRequestId === clientRequestId);
    if (replay) return { ok: true, replay: true, photo: stripRow_(replay) };
    const rec = findRow_('Verifications', r => r.verificationId === b.verificationId);
    if (!rec) throw new Error('ไม่พบผลตรวจ กรุณาบันทึกผลก่อนแนบภาพ');
    if (!canEdit_(user, rec)) throw new Error('ไม่มีสิทธิ์แนบภาพในผลตรวจนี้');
    const count = photosOf_(rec.verificationId).length;
    if (count >= MAX_PHOTOS_PER_HS) throw new Error('แนบภาพได้สูงสุด ' + MAX_PHOTOS_PER_HS + ' ภาพต่อจุด');
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const fileName = rec.hotspotId + '_' + (count + 1) + '_' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss') + '.' + ext;
    const file = photoFolder_(rec.provinceCode).createFile(Utilities.newBlob(bytes, mime, fileName));
    const photo = {
      photoId: newId_('P'), clientRequestId: clientRequestId, verificationId: rec.verificationId, hotspotId: rec.hotspotId, provinceCode: rec.provinceCode,
      driveFileId: file.getId(), fileName: fileName, mimeType: mime, sizeBytes: bytes.length, sha256: sha256Bytes_(bytes),
      photoLat: num_(b.photoLat, -90, 90), photoLng: num_(b.photoLng, -180, 180), takenAt: clean_(b.takenAt, 40),
      uploadedById: user.sub, uploadedByName: user.name, uploadedAt: now_()
    };
    appendObj_('Photos', photo);
    updateRow_('Verifications', rec._row, { photoCount: count + 1 });
    audit_(user, 'photo_upload', rec.hotspotId, fileName + ' ' + bytes.length + ' bytes', rec.provinceCode);
    return { ok: true, photo: photo };
  });
}

function photoGet_(user, b) {
  const p = findRow_('Photos', x => x.photoId === b.photoId);
  if (!p) throw new Error('ไม่พบภาพ');
  requireProvince_(user, p.provinceCode);
  const blob = DriveApp.getFileById(p.driveFileId).getBlob();
  return { ok: true, photoId: p.photoId, mimeType: p.mimeType, base64: Utilities.base64Encode(blob.getBytes()) };
}

function photoDelete_(user, b) {
  return withLock_(() => {
    const p = findRow_('Photos', x => x.photoId === b.photoId);
    if (!p) throw new Error('ไม่พบภาพ');
    const rec = findRow_('Verifications', r => r.verificationId === p.verificationId);
    if (!rec || !canEdit_(user, rec)) throw new Error('ไม่มีสิทธิ์ลบภาพนี้');
    trashDriveFile_(p.driveFileId);
    deleteRow_('Photos', p._row);
    const fresh = findRow_('Verifications', r => r.verificationId === rec.verificationId);
    updateRow_('Verifications', fresh._row, { photoCount: photosOf_(rec.verificationId).length });
    audit_(user, 'photo_delete', rec.hotspotId, p.fileName, rec.provinceCode);
    return { ok: true };
  });
}

/** รายการผลตรวจเต็มของจังหวัด (สำหรับสรุปผล/ส่งออก) */
function verificationsList_(user, b) {
  const prov = requireProvince_(user, b.province);
  const rows = readAll_('Verifications').filter(r => r.provinceCode === prov).map(r => publicVerification_(r, user));
  if (b.export) audit_(user, 'export', 'ผลตรวจจังหวัด' + PROVINCES[prov], rows.length + ' รายการ', prov);
  return { ok: true, province: prov, verifications: rows };
}

/* ===== Code.gs ===== */
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
