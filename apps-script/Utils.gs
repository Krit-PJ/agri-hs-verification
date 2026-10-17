function ApiError(code, message, details) {
  this.name = 'ApiError';
  this.code = code;
  this.message = message;
  this.details = details || null;
}
ApiError.prototype = Object.create(Error.prototype);

function assert_(condition, code, message, details) {
  if (!condition) throw new ApiError(code, message, details);
}

function cleanText_(value, maxLength) {
  const text = value == null ? '' : String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text;
}

function compact_(value) {
  return cleanText_(value).replace(/\s+/g, '').toLowerCase();
}

function safeCell_(value) {
  if (typeof value !== 'string') return value;
  const cleaned = cleanText_(value);
  return /^[=+\-@]/.test(cleaned) ? "'" + cleaned : cleaned;
}

function normalizePlantType_(value) {
  const key = compact_(value);
  const map = {
    'นาข้าว': 'นาข้าว',
    'อ้อย': 'อ้อย',
    'เกษตรอื่นๆ': 'เกษตรอื่น ๆ',
    'อื่นๆ': 'อื่น ๆ',
    'อื่น': 'อื่น ๆ'
  };
  return map[key] || '';
}

function normalizeProvince_(value) {
  return compact_(value).replace(/^จังหวัด/, '');
}

function normalizeLandType_(value) {
  return compact_(value);
}

function parseNumber_(value, min, max, field) {
  const number = typeof value === 'number' ? value : Number(cleanText_(value));
  assert_(value !== null && value !== undefined && cleanText_(value) !== '' && typeof value !== 'boolean' && Number.isFinite(number) && number >= min && number <= max, 'VALIDATION_ERROR', field + ' ไม่ถูกต้อง', {field: field});
  return number;
}

function parseOptionalIsoDate_(value, field) {
  if (value === '' || value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  assert_(!isNaN(date.getTime()), 'VALIDATION_ERROR', field + ' ไม่ใช่วันที่ที่ถูกต้อง', {field: field});
  return date.toISOString();
}

function isoNow_() {
  return new Date().toISOString();
}

function uuid_() {
  return Utilities.getUuid().toLowerCase();
}

function requireUuid_(value, field) {
  const text = cleanText_(value, 64).toLowerCase();
  assert_(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text), 'VALIDATION_ERROR', field + ' ต้องเป็น UUID', {field: field});
  return text;
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function sha256Bytes_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function secureEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) diff |= (left.charCodeAt(i % Math.max(1, left.length)) || 0) ^ (right.charCodeAt(i % Math.max(1, right.length)) || 0);
  return diff === 0;
}

function jsonStringifySafe_(value) {
  return JSON.stringify(value, function (key, item) {
    if (key === 'token' || key === 'password' || key === 'base64' || key === 'token_hash' || key === 'hash' || key === 'salt') return undefined;
    if (item instanceof Date) return item.toISOString();
    return item;
  });
}

function parseJsonObject_(text) {
  let value;
  try { value = JSON.parse(text); } catch (error) { throw new ApiError('INVALID_JSON', 'รูปแบบ JSON ไม่ถูกต้อง'); }
  assert_(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_REQUEST', 'คำขอต้องเป็น JSON object');
  return value;
}

function outputJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.TEXT);
}

function publicError_(error) {
  if (error && error.name === 'ApiError') {
    const result = {code: error.code, message: error.message};
    if (error.details) result.details = error.details;
    return result;
  }
  console.error(error && error.stack ? error.stack : error);
  return {code: 'INTERNAL_ERROR', message: 'ระบบขัดข้อง กรุณาลองใหม่'};
}

function haversineMeters_(lat1, lon1, lat2, lon2) {
  const radians = function (degrees) { return degrees * Math.PI / 180; };
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function findHeader_(headers, aliases) {
  const normalized = headers.map(compact_);
  for (let i = 0; i < aliases.length; i += 1) {
    const index = normalized.indexOf(compact_(aliases[i]));
    if (index >= 0) return index;
  }
  return -1;
}

function valueAt_(row, index) {
  return index >= 0 && index < row.length ? row[index] : '';
}

function parseMapCoordinates_(value) {
  const match = cleanText_(value).match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {latitude: latitude, longitude: longitude};
}

function bytesMatchMime_(bytes, mimeType) {
  const unsigned = function (index) { return (bytes[index] + 256) % 256; };
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && unsigned(0) === 0xFF && unsigned(1) === 0xD8 && unsigned(2) === 0xFF;
  if (mimeType === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every(function (value, index) { return unsigned(index) === value; });
  if (mimeType === 'image/webp') return bytes.length >= 12 && String.fromCharCode(unsigned(0), unsigned(1), unsigned(2), unsigned(3)) === 'RIFF' && String.fromCharCode(unsigned(8), unsigned(9), unsigned(10), unsigned(11)) === 'WEBP';
  return false;
}

function toIsoSourceDate_(dateValue, timeValue) {
  const zone = 'Asia/Bangkok';
  let datePart = '';
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) datePart = Utilities.formatDate(dateValue, zone, 'yyyy-MM-dd');
  const text = cleanText_(dateValue);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const dateOnly = text.slice(0,10);
    const parts = dateOnly.split('-').map(Number);
    const dateCheck = new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    if (dateCheck.toISOString().slice(0,10) !== dateOnly) return '';
    const iso = new Date(text);
    if (!isNaN(iso.getTime())) return iso.toISOString();
    return '';
  }
  if (!datePart && !text) return '';
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    let year = Number(match[1]);
    if (year > 2400) year -= 543;
    datePart = [String(year).padStart(4, '0'), String(Number(match[2])).padStart(2, '0'), String(Number(match[3])).padStart(2, '0')].join('-');
  } else {
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      let year = Number(match[3]);
      if (year > 2400) year -= 543;
      datePart = [String(year).padStart(4, '0'), String(Number(match[2])).padStart(2, '0'), String(Number(match[1])).padStart(2, '0')].join('-');
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '';
  let timePart = '00:00:00';
  if (timeValue instanceof Date && !isNaN(timeValue.getTime())) timePart = Utilities.formatDate(timeValue, zone, 'HH:mm:ss');
  else {
    const timeMatch = cleanText_(timeValue).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) timePart = String(Number(timeMatch[1])).padStart(2, '0') + ':' + timeMatch[2] + ':' + (timeMatch[3] || '00');
  }
  const candidate = datePart + 'T' + timePart + '+07:00';
  const parsed = new Date(candidate);
  if (isNaN(parsed.getTime()) || Utilities.formatDate(parsed, zone, 'yyyy-MM-dd') !== datePart) return '';
  return candidate;
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  assert_(lock.tryLock(30000), 'BUSY', 'ระบบกำลังบันทึกข้อมูล กรุณาลองใหม่');
  try { return callback(); } finally { lock.releaseLock(); }
}
