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
