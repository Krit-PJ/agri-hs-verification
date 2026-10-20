// ==== Config.gs ====
const APP = Object.freeze({
  VERSION: '2.9.0',
  PROVINCE: 'กำแพงเพชร',
  LAND_TYPE: 'พื้นที่เกษตร',
  PLANT_TYPES: Object.freeze(['นาข้าว', 'อ้อย', 'เกษตรอื่น ๆ', 'อื่น ๆ']),
  PERSON_CATEGORIES: Object.freeze(['นักวิชาการส่งเสริมการเกษตร', 'กำนัน', 'ผู้ใหญ่บ้าน', 'ผู้ช่วยผู้ใหญ่บ้าน', 'อกม.', 'อื่นๆ']),
  RESULTS: Object.freeze(['burned', 'not_burned', 'not_found', 'needs_review', 'inaccessible']),
  STATUSES: Object.freeze(['draft', 'verified']),
  DEFAULT_SOURCE_SHEET: 'hsPlant2026',
  DETAIL_FALLBACK_SHEET: 'hsAll',
  PIVOT_REFERENCE_SHEET: 'hsPlant2026',
  MAX_PAGE_SIZE: 500,
  MAX_IMPORT_ROWS: 5000,
  MAX_BODY_CHARS: 7500000,
  MAX_PHOTO_BYTES: 1000000,
  MAX_READ_PHOTO_BYTES: 5 * 1024 * 1024,
  PHOTO_MIME_TYPES: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  TOKEN_MIN_LENGTH: 24,
  AUTH_SESSION_SECONDS: 4 * 60 * 60,
  AUTH_HASH_ITERATIONS: 20000,
  AUTH_MAX_FAILURES: 5,
  AUTH_FAILURE_WINDOW_SECONDS: 15 * 60,
  SHEETS: Object.freeze({
    BASE: 'HS_Base',
    VERIFICATION: 'HS_Verification',
    PHOTOS: 'HS_Photos',
    INSPECTORS: 'Inspector_Profile',
    LOG: 'Verification_Log',
    REGISTRATIONS: 'User_Registration',
    ADMIN_REGISTRATIONS: 'Admin_Registration'
  }),
  HEADERS: Object.freeze({
    Admin_Registration: Object.freeze(['registration_id','phone','full_name','position','work_group','work_group_other','agency','province_code','username','privacy_version','privacy_acknowledged_at','status','created_at','reviewed_at','reviewed_by']),
    User_Registration: Object.freeze(['registration_id','phone','full_name','position','agency_level','agency','province_code','district','privacy_version','privacy_acknowledged_at','status','created_at','reviewed_at','reviewed_by']),
    HS_Base: Object.freeze([
      'hs_id', 'acquired_at', 'latitude', 'longitude', 'province', 'district',
      'tambon', 'village', 'land_type', 'plant_type', 'source_sheet',
      'source_row', 'source_snapshot_json', 'imported_at', 'active', 'dataset_year_be'
    ]),
    HS_Verification: Object.freeze([
      'verification_id', 'request_id', 'hs_id', 'status', 'result', 'notes', 'action',
      'observed_latitude', 'observed_longitude', 'gps_accuracy_m', 'missing_gps_reason',
      'distance_m', 'inspector_id', 'inspector_name', 'verified_at',
      'source_snapshot_json', 'created_at', 'updated_at',
      'person_category', 'person_category_other', 'field_inspector_name', 'reported_by_id', 'reported_by_name', 'agency',
      'inspected_at', 'inspected_at_source', 'submitted_at', 'observed_land_matches_source', 'observed_land_type',
      'observed_plant_type', 'fire_state', 'evidence_required', 'photo_missing_reason'
    ]),
    HS_Photos: Object.freeze([
      'photo_id', 'request_id', 'verification_id', 'hs_id', 'drive_file_id',
      'mime_type', 'size_bytes', 'sha256', 'caption', 'inspector_id',
      'client_captured_at', 'uploaded_at', 'attachment_source', 'exif_json', 'coordinate_source',
      'photo_latitude', 'photo_longitude', 'photo_accuracy_m', 'photo_taken_at', 'photo_taken_at_source',
      'device_capture_json', 'distance_to_hs_m', 'evidence_qa_json', 'original_sha256'
    ]),
    Inspector_Profile: Object.freeze([
      'inspector_id', 'display_name', 'district', 'tambon', 'role', 'token_hash',
      'active', 'created_at', 'last_seen_at', 'person_category', 'person_category_other', 'position', 'agency'
    ]),
    Verification_Log: Object.freeze([
      'log_id', 'request_id', 'timestamp', 'actor_id', 'action', 'entity_type',
      'entity_id', 'status', 'details_json'
    ])
  })
});

const SOURCE_ALIASES = Object.freeze({
  hsId: ['hsid', 'hs_id', 'hotspotid', 'hotspot_id', 'id'],
  acquiredAt: ['date', 'yyyy-mm-dd', 'acq_date', 'acquired_at', 'วันที่'],
  time: ['time', 'acq_time', 'เวลา'],
  latitude: ['latitude', 'lat', 'y', 'ละติจูด'],
  longitude: ['longitude', 'lon', 'lng', 'long', 'x', 'ลองจิจูด'],
  maps: ['maps', 'map', 'googlemaps', 'พิกัด'],
  province: ['province', 'province_n', 'provincen', 'จังหวัด'],
  district: ['amphoe', 'amphoen', 'district', 'อำเภอ'],
  tambon: ['tambon', 'tambonn', 'subdistrict', 'ตำบล'],
  village: ['baann', 'village', 'หมู่บ้าน'],
  landType: ['landtype', 'land_type', 'ประเภทพื้นที่'],
  plantType: ['planttype', 'plant_type', 'crop', 'crop_type', 'ชนิดพืช']
});

// ==== Utils.gs ====
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

// ==== SharedData.gs ====
/* Shared source adapters: preserve source IDs and dataset/season year. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HSData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024, MAX_ROWS = 5000;
  const aliases = {
    hsId:['hsId','hs_id','hsID','id','HS ID','ID','รหัสจุดความร้อน'],
    date:['acquiredAt','acquired_at','hs_date','date','Date','acq_date','__date','YYYY-MM-DD','วันที่'],
    time:['time','hs_time','Time','acq_time','เวลา'],
    latitude:['latitude','lat','Latitude','LATITUDE','y','ละติจูด'],
    longitude:['longitude','lng','lon','long','x','Longitude','LONGITUDE','ลองจิจูด'],
    province:['province','Province','ProvinceN','__province','จังหวัด'],
    district:['district','Amphoe','AmphoeN','amphoe','__district','อำเภอ'],
    tambon:['tambon','Tambon','TambonN','subdistrict','__subdistrict','ตำบล'],
    village:['village','BaanN','Village','__village','หมู่บ้าน'],
    landType:['landType','land_type','LandType','ประเภทพื้นที่'],
    plantType:['plantType','plant_type','PlantType','crop_type','__plant_type','__crop','ชนิดพืช'],
    datasetYearBe:['datasetYearBe','dataset_year_be','season_be','ปีชุดข้อมูล'],
    sourceSheet:['sourceSheet','source_sheet']
  };
  const trim = value => String(value ?? '').trim();
  function pick(row, key) {
    for (const name of aliases[key]) if (row[name] !== undefined && trim(row[name]) !== '') return row[name];
    return '';
  }
  function yearBE(value) { const n=Number(value); return Number.isInteger(n) && n>1900 ? (n<2400?n+543:n):null; }
  function dateISO(value) {
    if(value instanceof Date) return Number.isFinite(value.getTime()) ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` : '';
    if(typeof value==='number') { if(value<1||value>100000) return ''; return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10); }
    const raw=trim(value);
    if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) { const dt=new Date(raw); if(!Number.isFinite(dt.getTime()))return '';const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt);const part=t=>parts.find(p=>p.type===t).value;return `${part('year')}-${part('month')}-${part('day')}`; }
    let y,m,d;
    let match=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    if(match) [,y,m,d]=match;
    else { match=raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); if(!match)return ''; [,d,m,y]=match; }
    y=Number(y); if(y>2400)y-=543; m=Number(m);d=Number(d);
    const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  }
  function timeISO(value, acquired) {
    if(value instanceof Date)return `${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}`;
    if(typeof value==='number'&&value>=0&&value<1) {const minutes=Math.round(value*1440)%1440;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
    if (!trim(value) && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(trim(acquired))) { const dt=new Date(acquired);if(!Number.isFinite(dt.getTime()))return '';return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(dt); }
    let raw=trim(value)||((trim(acquired).match(/[T ](\d{2}:\d{2})/)||[])[1]||'');
    if(/^\d{3,4}$/.test(raw))raw=raw.padStart(4,'0').replace(/^(\d{2})(\d{2})$/,'$1:$2');
    const m=raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);return m&&Number(m[1])<24&&Number(m[2])<60?`${m[1].padStart(2,'0')}:${m[2]}`:'';
  }
  function crop(value) {const s=trim(value).replace(/\s+/g,'');return s==='เกษตรอื่นๆ'?'เกษตรอื่นๆ':s==='อื่นๆ'?'อื่นๆ':trim(value);}
  function normalizeRows(input, options={}) {
    if(options.national) return options.national.normalize(input,{...options,helpers:{dateISO,timeISO}});
    const metadata=input?.metadata||{};
    const source=input?.type==='FeatureCollection'?input.features:Array.isArray(input)?input:(input?.rows||input?.data||[]);
    if(!Array.isArray(source))throw new Error('ข้อมูลต้องเป็นตารางหรือ GeoJSON FeatureCollection');
    if(source.length>MAX_ROWS)throw new Error(`รองรับไม่เกิน ${MAX_ROWS} แถวต่อครั้ง`);
    const qa={total:source.length,accepted:0,outOfScope:0,invalid:0,duplicates:0,errors:[]}, rows=[], ids=new Set(), observations=new Set();
    for(let i=0;i<source.length;i++) {
      const feature=source[i],raw=feature?.type==='Feature'?feature.properties||{}:feature||{};
      let coords=feature?.geometry?.type==='Point'?feature.geometry.coordinates:null;
      if(!coords&&!trim(pick(raw,'latitude'))&&!trim(pick(raw,'longitude'))){const link=trim(raw.Maps||raw.maps||raw.map||raw.googlemaps||raw['พิกัด']);const m=link.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);if(m)coords=[Number(m[2]),Number(m[1])];}
      const acquiredAt=dateISO(pick(raw,'date')), time=timeISO(pick(raw,'time'),pick(raw,'date'));
      const row={hsId:trim(pick(raw,'hsId')),acquiredAt,time,latitude:Number(coords?.[1]??pick(raw,'latitude')),longitude:Number(coords?.[0]??pick(raw,'longitude')),province:trim(pick(raw,'province')),district:trim(pick(raw,'district')),tambon:trim(pick(raw,'tambon')),village:trim(pick(raw,'village')),landType:trim(pick(raw,'landType')),plantType:crop(pick(raw,'plantType')),datasetYearBe:yearBE(pick(raw,'datasetYearBe')||options.datasetYearBe||metadata.dataset_year_be||metadata.season_be),calendarYearBe:acquiredAt?Number(acquiredAt.slice(0,4))+543:null,sourceSheet:trim(pick(raw,'sourceSheet')||options.sourceSheet||metadata.source_sheet||'hsAll'),status:raw.status||'pending'};
      row.datasetYearBe = row.datasetYearBe || row.calendarYearBe;
      if(!row.hsId||!acquiredAt||!time||!row.district||!row.tambon||!trim(coords?.[1]??pick(raw,'latitude'))||!trim(coords?.[0]??pick(raw,'longitude'))||!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||Math.abs(row.latitude)>90||Math.abs(row.longitude)>180) {qa.invalid++;if(qa.errors.length<20)qa.errors.push({row:i+2,message:'ต้องมี HS ID, วันที่, เวลา, อำเภอ, ตำบล และพิกัดที่ถูกต้อง'});continue;}
      if(row.province!=='กำแพงเพชร'||row.landType!=='พื้นที่เกษตร'||!['นาข้าว','อ้อย','เกษตรอื่นๆ','อื่นๆ'].includes(row.plantType)) {qa.outOfScope++;continue;}
      const observation=`${acquiredAt}|${time}|${row.latitude}|${row.longitude}`;
      if(ids.has(row.hsId)||observations.has(observation)){qa.duplicates++;continue;}
      ids.add(row.hsId);observations.add(observation);rows.push(row);
    }
    qa.accepted=rows.length;return {rows,qa};
  }
  function parseCSV(text) {
    text=String(text).replace(/^\uFEFF/,''); const records=[];let record=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field==='')quoted=!quoted;else throw new Error('CSV มีเครื่องหมายคำพูดไม่ถูกต้อง');}else if(!quoted&&(c===','||c==='\n'||c==='\r')){record.push(field);field='';if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(record.some(x=>trim(x)))records.push(record);record=[];}}else field+=c;}
    if(quoted)throw new Error('CSV มีเครื่องหมายคำพูดปิดไม่ครบ');record.push(field);if(record.some(x=>trim(x)))records.push(record);
    const headers=(records.shift()||[]).map(trim);if(new Set(headers).size!==headers.length)throw new Error('CSV มีชื่อคอลัมน์ซ้ำ');
    return records.map((values,i)=>{if(values.length!==headers.length)throw new Error(`CSV แถว ${i+2} มีจำนวนคอลัมน์ไม่ตรงหัวตาราง`);return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));});
  }
  async function parseFile(file, options={}) {
    if(file.size>MAX_BYTES)throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
    const ext=file.name.toLowerCase().split('.').pop();let raw,summary=null;
    if(['json','geojson'].includes(ext))raw=JSON.parse(await file.text());
    else if(ext==='csv')raw=parseCSV(await file.text());
    else if(['xlsx','xls'].includes(ext)){
      const xlsx=options.XLSX||(typeof globalThis!=='undefined'?globalThis.XLSX:null);if(!xlsx)throw new Error('ยังโหลดตัวอ่าน Excel ไม่สำเร็จ โปรดลองใหม่หรือใช้ CSV');
      const book=xlsx.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      if(options.national){let names=book.SheetNames.includes('AllData')?['AllData']:book.SheetNames.filter(n=>options.national.detail(xlsx.utils.sheet_to_json(book.Sheets[n],{defval:'',raw:true})));if(!names.length)throw new Error('ไม่พบ AllData หรือชีตรายจุดที่มีหัวตารางครบ');raw=names.flatMap(n=>xlsx.utils.sheet_to_json(book.Sheets[n],{defval:'',raw:true}).map(r=>({...r,sourceSheet:n})));return options.rawOnly?{raw}:normalizeRows(raw,options);}
      const name=options.sheetName||(['hsAll','HS_Base','hsPlant2026'].find(n=>book.SheetNames.includes(n)))||book.SheetNames[0];
      if(!book.Sheets[name])throw new Error('ไม่พบชีตที่เลือก');raw=xlsx.utils.sheet_to_json(book.Sheets[name],{defval:'',raw:true});options={...options,sourceSheet:name};
      if(name!=='hsPlant2026'&&book.Sheets.hsPlant2026){summary=readPivot(xlsx.utils.sheet_to_json(book.Sheets.hsPlant2026,{header:1,defval:'',raw:true}));if(!summary)throw new Error('พบ hsPlant2026 แต่ไม่สามารถอ่านยอด Pivot จังหวัดและพืชทั้ง 4 ชนิดเพื่อเทียบได้');}
    }else throw new Error('รองรับ Excel (.xlsx/.xls), CSV, JSON และ GeoJSON');
    if(options.rawOnly)return {raw};
    const result=normalizeRows(raw,options);if(!result.rows.length)throw new Error('ไม่พบข้อมูล HS ที่ผ่าน QA ต้องมีข้อมูลรายจุดพร้อม HS ID วันที่ เวลา พิกัด และพื้นที่; hsPlant2026 แบบตารางสรุปไม่สามารถสร้างจุดแผนที่ได้');
    if(summary){const counts=Object.fromEntries(['นาข้าว','อ้อย','เกษตรอื่นๆ','อื่นๆ'].map(p=>[p,0]));result.rows.forEach(r=>counts[r.plantType]++);if(summary.total!==result.rows.length||Object.keys(counts).some(p=>counts[p]!==summary.byPlantType[p]))throw new Error('ยอดข้อมูลรายจุดไม่ตรง hsPlant2026 กรุณาตรวจฐานต้นทางก่อนนำเข้า');result.summary=summary;result.reconciliation={available:true,match:true};}return result;
  }
  function readPivot(values){const plants=['นาข้าว','อ้อย','เกษตรอื่นๆ','อื่นๆ'];for(let i=0;i<values.length;i++){const headers=values[i].map(v=>trim(v).replace(/\s+/g,'')),provinceColumn=headers.indexOf('จังหวัด'),columns=plants.map(p=>headers.indexOf(p));if(provinceColumn<0||columns.some(c=>c<0))continue;const data=values.slice(i+1).find(r=>trim(r[provinceColumn])==='กำแพงเพชร');if(!data)continue;const counts=columns.map(c=>Number(data[c]||0));if(counts.some(n=>!Number.isInteger(n)||n<0))throw new Error('ยอด Pivot ต้องเป็นจำนวนเต็มที่ไม่ติดลบ');return {total:counts.reduce((a,b)=>a+b,0),byPlantType:Object.fromEntries(plants.map((p,j)=>[p,counts[j]]))};}return null;}
  function parseSheetId(value) {const s=trim(value),m=s.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:[/?#]|$)/);if(m)return m[1];if(/^[A-Za-z0-9_-]{20,}$/.test(s))return s;throw new Error('ใช้ Google Sheet URL หรือ Spreadsheet ID ที่ถูกต้อง');}
  async function loadRiskDataset(options={}) {
    const fetcher=options.fetch||globalThis.fetch;
    const response=await fetcher(options.manifestUrl||'data/risk-datasets.json',{cache:'no-store'});if(!response.ok)throw new Error('อ่านทะเบียนชุดข้อมูล HS ไม่สำเร็จ');const manifest=await response.json();
    const datasets=manifest.datasets||manifest.years||[];const available=datasets.filter(d=>Number(d.yearBe||d.datasetYearBe||d.year_be));
    const latest=Math.max(...available.map(d=>Number(d.yearBe||d.datasetYearBe||d.year_be)));
    const yearBe=Number(options.yearBe)||latest, entry=available.find(d=>Number(d.yearBe||d.datasetYearBe||d.year_be)===yearBe);if(!entry)throw new Error('ไม่พบชุดข้อมูล HS ของปีที่เลือก');
    const dataResponse=await fetcher(entry.url,{cache:'no-store'});if(!dataResponse.ok)throw new Error('โหลดข้อมูล HS จากแผนที่ความเสี่ยงไม่สำเร็จ');const raw=await dataResponse.json();
    return {...normalizeRows(raw,{datasetYearBe:yearBe}),yearBe,metadata:raw.metadata||{},manifest,sourceUrl:entry.url};
  }
  return {MAX_BYTES,MAX_ROWS,normalizeRows,parseCSV,parseFile,parseSheetId,loadRiskDataset,dateISO,timeISO,readPivot};
});

// ==== NationalCore.gs ====
/* One registry/context/normalizer for browser and Apps Script. Boundary data is NOT bundled. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HSNational=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const provinces=Object.freeze(Object.fromEntries('10:กรุงเทพมหานคร,11:สมุทรปราการ,12:นนทบุรี,13:ปทุมธานี,14:พระนครศรีอยุธยา,15:อ่างทอง,16:ลพบุรี,17:สิงห์บุรี,18:ชัยนาท,19:สระบุรี,20:ชลบุรี,21:ระยอง,22:จันทบุรี,23:ตราด,24:ฉะเชิงเทรา,25:ปราจีนบุรี,26:นครนายก,27:สระแก้ว,30:นครราชสีมา,31:บุรีรัมย์,32:สุรินทร์,33:ศรีสะเกษ,34:อุบลราชธานี,35:ยโสธร,36:ชัยภูมิ,37:อำนาจเจริญ,38:บึงกาฬ,39:หนองบัวลำภู,40:ขอนแก่น,41:อุดรธานี,42:เลย,43:หนองคาย,44:มหาสารคาม,45:ร้อยเอ็ด,46:กาฬสินธุ์,47:สกลนคร,48:นครพนม,49:มุกดาหาร,50:เชียงใหม่,51:ลำพูน,52:ลำปาง,53:อุตรดิตถ์,54:แพร่,55:น่าน,56:พะเยา,57:เชียงราย,58:แม่ฮ่องสอน,60:นครสวรรค์,61:อุทัยธานี,62:กำแพงเพชร,63:ตาก,64:สุโขทัย,65:พิษณุโลก,66:พิจิตร,67:เพชรบูรณ์,70:ราชบุรี,71:กาญจนบุรี,72:สุพรรณบุรี,73:นครปฐม,74:สมุทรสาคร,75:สมุทรสงคราม,76:เพชรบุรี,77:ประจวบคีรีขันธ์,80:นครศรีธรรมราช,81:กระบี่,82:พังงา,83:ภูเก็ต,84:สุราษฎร์ธานี,85:ระนอง,86:ชุมพร,90:สงขลา,91:สตูล,92:ตรัง,93:พัทลุง,94:ปัตตานี,95:ยะลา,96:นราธิวาส'.split(',').map(x=>x.split(':'))));
const config=Object.freeze({landTypes:['พื้นที่เกษตร'],plantTypes:['นาข้าว','อ้อย','เกษตรอื่นๆ','อื่นๆ'],maxRows:50000,maxPartitionRows:5000,registryVersion:'TH-admin1-codes-v1',boundaryCoverage:[],areaRegistryCoverage:[]});
const text=x=>String(x??'').trim(),compact=x=>text(x).replace(/\s+/g,'');
function provinceCode(name,code){name=text(name).replace(/^(?:จังหวัด|จ\.)\s*/,'');if(['กทม.','กรุงเทพฯ','กรุงเทพ'].includes(name))name='กรุงเทพมหานคร';code=text(code);if(code&&!provinces[code])return '';const named=Object.keys(provinces).find(c=>provinces[c]===name);if(code&&name&&named!==code)return '';return code||named||'';}
function allowed(actor){return actor?.role==='super_admin'?Object.keys(provinces):(provinceCode('',actor?.assignedProvinceCode)?[actor.assignedProvinceCode]:[]);}
function context(actor,selected,imported){const active=actor&&['admin','super_admin'].includes(actor.role);const assigned=provinceCode('',actor?.assignedProvinceCode);const title=active&&actor.role==='admin'?(assigned?`ระบบตรวจสอบจุดความร้อนในพื้นที่การเกษตรจังหวัด${provinces[assigned]}`:'ระบบตรวจสอบจุดความร้อนในพื้นที่การเกษตร — ยังไม่กำหนดจังหวัด'):'ระบบตรวจสอบจุดความร้อนในพื้นที่การเกษตรของประเทศไทย';return {title,subtitle:selected?`กำลังแสดงข้อมูลจังหวัด${provinces[selected]||'ไม่ระบุ'}`:`กำลังแสดงภาพรวมข้อมูลที่นำเข้าแล้ว ${new Set(imported||[]).size} จาก 77 จังหวัด`,scope:selected?`จังหวัด${provinces[selected]}`:`ข้อมูลที่นำเข้าแล้ว ${new Set(imported||[]).size} จังหวัด`};}
function observation(r){return [r.provinceCode,r.acquiredAt,r.time||'',Number(r.latitude),Number(r.longitude)].join('|');}
function key(r){return r.provinceCode+'|'+r.datasetYearBe;}
function detail(rows){const r=rows?.[0];if(!r)return false;const names=Object.keys(r).map(x=>x.toLowerCase());const any=a=>a.some(x=>names.includes(x.toLowerCase()));return any(['YYYY-MM-DD','Date','acq_date','acquiredAt','acquired_at','hs_date'])&&any(['Province','provinceCode','province_code','จังหวัด'])&&any(['LandType','land_type'])&&any(['PlantType','plant_type'])&&((any(['Latitude','lat'])&&any(['Longitude','lng','lon']))||any(['Maps','พิกัด']));}
function normalize(input,options){options=options||{};const H=options.helpers;const source=input?.type==='FeatureCollection'?input.features:Array.isArray(input)?input:input?.rows||[];if(source.length>config.maxRows)throw Error('แบ่งชุดนำเข้าไม่เกิน '+config.maxRows+' แถว');const rows=[],seen=new Set(),errors=[],warnings=[],stages={province:0,landType:0,plantType:0,date:0,coordinates:0},reasons={};let duplicates=0,outOfScope=0;const groups={province:{},district:{},tambon:{},month:{},year:{}};const count=(obj,k)=>obj[k]=(obj[k]||0)+1;
source.forEach((f,i)=>{const r=f?.type==='Feature'?f.properties||{}:f;const pick=(...a)=>{for(const n of a)if(r?.[n]!==undefined&&text(r[n])!=='')return r[n];return '';};const reject=(reason)=>{count(reasons,reason);errors.push({row:i+2,sourceFile:options.sourceName||'',reason});};
const p=provinceCode(pick('province','Province','ProvinceN','province_n','จังหวัด'),pick('provinceCode','province_code','PROV_CODE','รหัสจังหวัด'));
if(!p){reject('unknown_or_conflicting_province');return;}if(options.authorizedProvinceCodes&&!options.authorizedProvinceCodes.includes(p)){outOfScope++;reject('unauthorized_province');return;}if(options.selectedProvinceCodes?.length&&!options.selectedProvinceCodes.includes(p)){outOfScope++;reject('unselected_province');return;}stages.province++;
const land=text(pick('landType','LandType','land_type','ประเภทพื้นที่'));if(!(options.config||config).landTypes.includes(land)){reject('land_type');return;}stages.landType++;
const rawPlant=text(pick('plantType','PlantType','plant_type','crop_type','ชนิดพืช'));const plant=(options.config||config).plantTypes.find(x=>compact(x)===compact(rawPlant));if(!plant){reject('plant_type');return;}stages.plantType++;
const dateRaw=pick('acquiredAt','acquired_at','hs_date','YYYY-MM-DD','Date','date','acq_date','วันที่'),date=H.dateISO(dateRaw);if(!date||(typeof dateRaw==='number'&&Math.floor(dateRaw)===60)||(/^\d{4}-\d{1,2}-\d{1,2}T/.test(text(dateRaw))&&!H.dateISO(text(dateRaw).split('T')[0]))){reject('invalid_date');return;}const suppliedTime=pick('Time','time','hs_time','acq_time','เวลา'),time=H.timeISO(suppliedTime,dateRaw);if(text(suppliedTime)&&!time){reject('invalid_time');return;}stages.date++;
let lat=pick('latitude','Latitude','lat','LATITUDE','y','ละติจูด'),lon=pick('longitude','Longitude','lng','lon','LONGITUDE','x','ลองจิจูด');if(f?.geometry?.type==='Point'){lon=f.geometry.coordinates[0];lat=f.geometry.coordinates[1];}if(text(lat)===''&&text(lon)===''){const m=text(pick('Maps','maps','พิกัด')).match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);if(m){lat=m[1];lon=m[2];}}
if(text(lat)===''||text(lon)===''||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180){reject('invalid_coordinates');return;}const crs=text(pick('crs','CRS'));if(crs&&!['EPSG:4326','WGS84','WGS 84'].includes(crs)){reject('unsupported_crs');return;}if(pick('coordinateProvinceCode')&&text(pick('coordinateProvinceCode'))!==p){reject('coordinate_province_conflict');return;}stages.coordinates++;
const district=text(pick('district','Amphoe','AmphoeN','amphoe','อำเภอ')).replace(/^(?:อำเภอ|อ\.)\s*/,''),tambon=text(pick('tambon','Tambon','TambonN','ตำบล')).replace(/^(?:ตำบล|ต\.)\s*/,''),dc=text(pick('districtCode','district_code','AMP_CODE')),tc=text(pick('tambonCode','tambon_code','TAM_CODE'));
if((dc&&(!/^\d{4}$/.test(dc)||!dc.startsWith(p)))||(tc&&(!/^\d{6}$/.test(tc)||!tc.startsWith(dc||p)))){reject('parent_code_conflict');return;}
const year=options.yearMode==='single'?Number(options.datasetYearBe):Number(date.slice(0,4))+543;if(!Number.isInteger(year)||year<2400||year>2800){reject('invalid_dataset_year');return;}
const row={provinceCode:p,province:provinces[p],districtCode:dc,tambonCode:tc,district,tambon,village:text(pick('village','Village','BaanN','หมู่บ้าน')),landType:land,plantType:plant,acquiredAt:date,time,latitude:Number(lat),longitude:Number(lon),calendarYearBe:Number(date.slice(0,4))+543,datasetYearBe:year,sourceSheet:text(pick('sourceSheet'))||options.sourceSheet||'AllData',sourceRow:i+2,sourceFile:text(pick('sourceFile'))||options.sourceName||'',sourceFields:f?.type==='Feature'?f:{...r},sourceHsId:text(pick('sourceHsId','hsId','hsID','hs_id','id','HS ID'))};
const obs=observation(row);if(seen.has(obs)){duplicates++;reject('duplicate_observation');return;}seen.add(obs);row.hsId='N-'+obs.replace(/\|/g,'~');if(!district||!tambon)warnings.push({row:i+2,reason:'missing_district_or_tambon'});if(!time)warnings.push({row:i+2,reason:'missing_time_duplicate_precision_limited'});warnings.push({row:i+2,reason:'boundary_and_area_registry_not_verified'});rows.push(row);count(groups.province,p);count(groups.district,dc||p+'|'+(district||'(ไม่ระบุ)'));count(groups.tambon,tc||p+'|'+district+'|'+(tambon||'(ไม่ระบุ)'));count(groups.month,p+'|'+year+'|'+date.slice(0,7));count(groups.year,p+'|'+year);
});return {rows,qa:{total:source.length,accepted:rows.length,rejected:source.length-rows.length,outOfScope,duplicates,invalid:errors.filter(e=>!['duplicate_observation','land_type','plant_type','unauthorized_province','unselected_province'].includes(e.reason)).length,stages,reasons,errors,warnings,groups,countBasis:'each rejected source row counted once; warnings overlap accepted rows',boundaryVerified:false}};}
return {provinces,config,provinceCode,allowed,context,observation,key,detail,normalize};});

// ==== Repository.gs ====
// Memo is reset for every API invocation; never shared across identities or requests.
let repositoryRequestMemo_ = null;
function beginRepositoryRequest_(){repositoryRequestMemo_={spreadsheet:null,rows:Object.create(null)};}
function invalidateRepositoryRows_(name){if(repositoryRequestMemo_)delete repositoryRequestMemo_.rows[name];}
function ensureRegistrationSheet_(name){
 const headers=APP.HEADERS[name];assert_(headers,'CONFIG_ERROR','ไม่พบ schema');
 const book=getSpreadsheet_();let sheet=book.getSheetByName(name);
 if(!sheet)sheet=book.insertSheet(name);
 ensureSheetColumns_(sheet,headers.length);
 if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);sheet.getRange(1,1,1,headers.length).setFontWeight('bold');}
 const actual=sheet.getRange(1,1,1,Math.max(headers.length,sheet.getLastColumn())).getDisplayValues()[0].slice(0,headers.length);
 assert_(actual.join('|')===headers.join('|'),'SCHEMA_MISMATCH','หัวคอลัมน์ชีต '+name+' ไม่ตรงกับ schema');
}

function getSpreadsheet_() {
  if(repositoryRequestMemo_&&repositoryRequestMemo_.spreadsheet)return repositoryRequestMemo_.spreadsheet;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  assert_(spreadsheet, 'CONFIG_ERROR', 'ไม่พบ Spreadsheet กรุณาตั้งค่า SPREADSHEET_ID');
  if(repositoryRequestMemo_)repositoryRequestMemo_.spreadsheet=spreadsheet;
  return spreadsheet;
}

function getRequiredSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  assert_(sheet, 'CONFIG_ERROR', 'ไม่พบชีต ' + name);
  return sheet;
}

function ensureSchema_() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(APP.HEADERS).forEach(function (name) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = APP.HEADERS[name];
    ensureSheetColumns_(sheet, headers.length);
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const actual = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getDisplayValues()[0].slice(0, headers.length);
    assert_(actual.join('|') === headers.join('|'), 'SCHEMA_MISMATCH', 'หัวคอลัมน์ชีต ' + name + ' ไม่ตรงกับ schema');
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
}

function rowsAsObjects_(sheetName) {
  if(repositoryRequestMemo_&&repositoryRequestMemo_.rows[sheetName])return repositoryRequestMemo_.rows[sheetName].map(function(row){return Object.assign({},row);});
  const sheet = getRequiredSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const headers = APP.HEADERS[sheetName];
  if (lastRow < 2) return [];
  const rows=sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row, offset) {
    const object = {_row: offset + 2};
    headers.forEach(function (header, index) {
      const value = row[index];
      object[header] = value instanceof Date ? value.toISOString() : value;
    });
    return object;
  });
  if(repositoryRequestMemo_)repositoryRequestMemo_.rows[sheetName]=rows;
  return rows.map(function(row){return Object.assign({},row);});
}

function objectToRow_(sheetName, object) {
  return APP.HEADERS[sheetName].map(function (header) {
    const value = object[header];
    return typeof value === 'string' ? safeCell_(value) : (value == null ? '' : value);
  });
}

function appendObject_(sheetName, object) {
  invalidateRepositoryRows_(sheetName);
  const sheet = getRequiredSheet_(sheetName);
  const row = objectToRow_(sheetName, object);
  const rowNumber=sheet.getLastRow()+1;
  formatPhoneCells_(sheet,sheetName,rowNumber);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  if(typeof touchHsRevision_==='function' && [APP.SHEETS.BASE,APP.SHEETS.VERIFICATION,APP.SHEETS.PHOTOS].indexOf(sheetName)>=0)touchHsRevision_();
  return object;
}

function updateObjectRow_(sheetName, rowNumber, object) {
  invalidateRepositoryRows_(sheetName);
  const sheet = getRequiredSheet_(sheetName);
  const row = objectToRow_(sheetName, object);
  formatPhoneCells_(sheet,sheetName,rowNumber);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  if(typeof touchHsRevision_==='function' && [APP.SHEETS.BASE,APP.SHEETS.VERIFICATION,APP.SHEETS.PHOTOS].indexOf(sheetName)>=0)touchHsRevision_();
  return object;
}

function formatPhoneCells_(sheet,sheetName,rowNumber){
 APP.HEADERS[sheetName].forEach(function(header,index){
  if(header==='phone'||header==='phone_number')sheet.getRange(rowNumber,index+1,1,1).setNumberFormat('@');
 });
}

function findOne_(sheetName, field, value) {
  const rows = rowsAsObjects_(sheetName);
  for (let i = 0; i < rows.length; i += 1) if (String(rows[i][field]) === String(value)) return rows[i];
  return null;
}

function appendLog_(actor, requestId, action, entityType, entityId, status, details) {
  try {
    appendObject_(APP.SHEETS.LOG, {
      log_id: uuid_(),
      request_id: cleanText_(requestId, 64),
      timestamp: isoNow_(),
      actor_id: actor && actor.id ? actor.id : 'anonymous',
      action: cleanText_(action, 64),
      entity_type: cleanText_(entityType, 64),
      entity_id: cleanText_(entityId, 128),
      status: cleanText_(status, 32),
      details_json: safeCell_(jsonStringifySafe_(details || {}))
    });
  } catch (logError) {
    console.error('Audit log failure: ' + (logError && logError.message ? logError.message : logError));
  }
}

function replaceBaseAtomically_(objects) {
  invalidateRepositoryRows_(APP.SHEETS.BASE);
  const spreadsheet = getSpreadsheet_();
  const targetName = APP.SHEETS.BASE;
  const oldSheet = spreadsheet.getSheetByName(targetName);
  const stamp = new Date().getTime();
  const stageName = '_HS_Base_stage_' + stamp;
  const backupName = '_HS_Base_backup_' + stamp;
  const stage = spreadsheet.insertSheet(stageName);
  const headers = APP.HEADERS[targetName];
  try {
    stage.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (objects.length) {
      const values = objects.map(function (object) { return objectToRow_(targetName, object); });
      stage.getRange(2, 1, values.length, headers.length).setValues(values);
    }
    stage.setFrozenRows(1);
    stage.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    assert_(stage.getLastRow() === objects.length + 1, 'WRITE_FAILED', 'จำนวนแถว staging ไม่ถูกต้อง');
    if (oldSheet) oldSheet.setName(backupName);
    stage.setName(targetName);
    if (oldSheet) spreadsheet.deleteSheet(oldSheet);
    if(typeof touchHsRevision_==='function')touchHsRevision_();
  } catch (error) {
    const currentStage = spreadsheet.getSheetByName(stageName);
    if (currentStage) spreadsheet.deleteSheet(currentStage);
    const backup = spreadsheet.getSheetByName(backupName);
    if (backup && !spreadsheet.getSheetByName(targetName)) backup.setName(targetName);
    throw error;
  }
}

function publicInspector_(row) {
  return {
    inspectorId: cleanText_(row.inspector_id),
    displayName: cleanText_(row.display_name),
    district: cleanText_(row.district),
    tambon: cleanText_(row.tambon),
    role: cleanText_(row.role),
    personCategory: cleanText_(row.person_category), personCategoryOther: cleanText_(row.person_category_other),
    position: cleanText_(row.position), agency: cleanText_(row.agency)
  };
}

function publicHs_(row, latestVerification) {
  return {
    provinceCode:typeof nationalCode_==='function'?nationalCode_(row):'',
    hsId: cleanText_(row.hs_id),
    acquiredAt: cleanText_(row.acquired_at),
    datasetYearBe: Number(row.dataset_year_be) || Number(Utilities.formatDate(new Date(row.acquired_at), 'Asia/Bangkok', 'yyyy')) + 543,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    province: cleanText_(row.province),
    district: cleanText_(row.district),
    tambon: cleanText_(row.tambon),
    village: cleanText_(row.village),
    landType: cleanText_(row.land_type),
    plantType: cleanText_(row.plant_type),
    active: String(row.active).toLowerCase() !== 'false',
    verification: latestVerification ? publicVerification_(latestVerification) : null
  };
}

function publicVerification_(row) {
  return {
    verificationId: cleanText_(row.verification_id),
    hsId: cleanText_(row.hs_id),
    status: cleanText_(row.status),
    result: cleanText_(row.result),
    notes: cleanText_(row.notes),
    action: cleanText_(row.action),
    observedLatitude: row.observed_latitude === '' ? null : Number(row.observed_latitude),
    observedLongitude: row.observed_longitude === '' ? null : Number(row.observed_longitude),
    gpsAccuracyM: row.gps_accuracy_m === '' ? null : Number(row.gps_accuracy_m),
    missingGpsReason: cleanText_(row.missing_gps_reason),
    distanceM: row.distance_m === '' ? null : Number(row.distance_m),
    inspectorId: cleanText_(row.inspector_id),
    inspectorName: cleanText_(row.inspector_name),
    verifiedAt: cleanText_(row.verified_at),
    updatedAt: cleanText_(row.updated_at),
    personCategory: cleanText_(row.person_category), personCategoryOther: cleanText_(row.person_category_other),
    fieldInspectorName: cleanText_(row.field_inspector_name) || cleanText_(row.inspector_name),
    reportedById: cleanText_(row.reported_by_id) || cleanText_(row.inspector_id),
    reportedByName: cleanText_(row.reported_by_name) || cleanText_(row.inspector_name), agency: cleanText_(row.agency),
    inspectedAt: cleanText_(row.inspected_at), inspectedAtSource: cleanText_(row.inspected_at_source),
    submittedAt: cleanText_(row.submitted_at) || cleanText_(row.verified_at),
    observedLandMatchesSource: row.observed_land_matches_source === true || row.observed_land_matches_source === 'true' ? true : row.observed_land_matches_source === false || row.observed_land_matches_source === 'false' ? false : null,
    observedLandType: cleanText_(row.observed_land_type), observedPlantType: cleanText_(row.observed_plant_type),
    fireState: cleanText_(row.fire_state), evidenceRequired: row.evidence_required === true || row.evidence_required === 'true',
    photoMissingReason: cleanText_(row.photo_missing_reason),
    evidenceState: verificationEvidenceState_(row),
    followUpRequired: ['not_found', 'needs_review'].indexOf(cleanText_(row.result)) >= 0

  };
}

// Run once from the Apps Script editor before deploying v1.1. Keeps every existing row.
function migrateSchemaV11() {
  const sheet = getRequiredSheet_(APP.SHEETS.BASE);
  const headers = APP.HEADERS.HS_Base;
  const actual = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  if (actual.join('|') === headers.join('|')) return {migrated:false};
  assert_(actual.join('|') === headers.slice(0,-1).join('|'), 'SCHEMA_MISMATCH', 'รองรับการย้ายจาก schema v1.0 เท่านั้น');
  sheet.getRange(1,headers.length).setValue('dataset_year_be');
  const count = sheet.getLastRow()-1;
  if (count > 0) {
    const rows = sheet.getRange(2,1,count,headers.length-1).getValues();
    sheet.getRange(2,headers.length,count,1).setValues(rows.map(function(row){return [sourceDatasetYear_(row[10],row[1])];}));
  }
  ensureSchema_();
  return {migrated:true,rows:Math.max(0,count)};
}

// Additive migration only; validates every existing header before any mutation.
function migrateSchemaV12() {
  return withScriptLock_(function () {
    const spreadsheet = getSpreadsheet_();
    const plans = Object.keys(APP.HEADERS).map(function (name) {
      const sheet = spreadsheet.getSheetByName(name);
      if (!sheet || !sheet.getLastRow()) return {name:name, sheet:sheet, existing:0};
      const actual = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
      const expected = APP.HEADERS[name];
      assert_(actual.length <= expected.length && actual.every(function(h,i){return h===expected[i];}), 'SCHEMA_MISMATCH', 'หัวคอลัมน์ '+name+' ไม่ตรง ไม่แก้ข้อมูลเดิม');
      return {name:name,sheet:sheet,existing:actual.length};
    });
    plans.forEach(function(p){
      const headers=APP.HEADERS[p.name];
      const sheet=p.sheet || spreadsheet.insertSheet(p.name);
      ensureSheetColumns_(sheet,headers.length);
      if(p.existing < headers.length) sheet.getRange(1,p.existing+1,1,headers.length-p.existing).setValues([headers.slice(p.existing)]);
    });
    ensureSchema_();
    return {migrated:plans.some(function(p){return p.existing<APP.HEADERS[p.name].length;}),version:APP.VERSION};
  });
}

function verificationEvidenceState_(row) {
  if (row._evidenceState) return row._evidenceState;
  if (!(row.evidence_required === true || row.evidence_required === 'true')) return 'not_required';
  if (rowsAsObjects_(APP.SHEETS.PHOTOS).some(function(p){return cleanText_(p.verification_id)===cleanText_(row.verification_id);})) return 'provided';
  return cleanText_(row.photo_missing_reason) ? 'exception' : 'pending';
}

function ensureSheetColumns_(sheet,required) {
  if(typeof sheet.getMaxColumns==='function' && sheet.getMaxColumns()<required) sheet.insertColumnsAfter(sheet.getMaxColumns(),required-sheet.getMaxColumns());
}

// ==== Auth.gs ====
function tokenHash_(token) {
  const pepper = PropertiesService.getScriptProperties().getProperty('TOKEN_PEPPER');
  assert_(pepper && pepper.length >= 24, 'CONFIG_ERROR', 'ยังไม่ได้ตั้งค่า TOKEN_PEPPER');
  return sha256_(pepper + ':' + token);
}

const AUTH_ACCOUNTS_PROPERTY_ = 'AUTH_ACCOUNTS_V1';
const AUTH_PASSWORD_PEPPER_PROPERTY_ = 'AUTH_PASSWORD_PEPPER';
const AUTH_DUMMY_SALT_PROPERTY_ = 'AUTH_DUMMY_SALT';
const AUTH_SESSION_PREFIX_ = 'auth-session:';
const AUTH_FAILURE_PREFIX_ = 'auth-failure:';
const AUTH_GLOBAL_RATE_PREFIX_ = 'auth-global-rate:';
const AUTH_GLOBAL_ATTEMPTS_PER_MINUTE_ = 60;

function ensureAuthSecrets_() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('TOKEN_PEPPER')) properties.setProperty('TOKEN_PEPPER', uuid_() + uuid_());
  if (!properties.getProperty(AUTH_PASSWORD_PEPPER_PROPERTY_)) properties.setProperty(AUTH_PASSWORD_PEPPER_PROPERTY_, uuid_() + uuid_());
  if (!properties.getProperty(AUTH_DUMMY_SALT_PROPERTY_)) properties.setProperty(AUTH_DUMMY_SALT_PROPERTY_, uuid_() + uuid_());
}

function normalizeUsername_(username) {
  const value = cleanText_(username, 64).toLowerCase();
  assert_(/^[a-z0-9._-]{3,64}$/.test(value), 'VALIDATION_ERROR', 'ชื่อผู้ใช้ต้องมี 3-64 ตัว และใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');
  return value;
}

function readAuthAccounts_() {
  const raw = PropertiesService.getScriptProperties().getProperty(AUTH_ACCOUNTS_PROPERTY_);
  if (!raw){if(typeof HSNational!=='undefined'){const all=PropertiesService.getScriptProperties().getProperties(),result={};Object.keys(all).filter(function(k){return k.indexOf('AUTH_ACCOUNT_V2_')===0;}).forEach(function(k){result[k.slice(16)]=JSON.parse(all[k]);});return result;}return {};}
  try {
    const parsed = JSON.parse(raw);
    assert_(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'CONFIG_ERROR', 'ข้อมูลบัญชีเข้าสู่ระบบเสียหาย');
    if(typeof HSNational!=='undefined'){const all=PropertiesService.getScriptProperties().getProperties();Object.keys(all).filter(function(k){return k.indexOf('AUTH_ACCOUNT_V2_')===0;}).forEach(function(k){parsed[k.slice(16)]=JSON.parse(all[k]);});}
    return parsed;
  } catch (error) {
    if (error && error.name === 'ApiError') throw error;
    throw new ApiError('CONFIG_ERROR', 'ข้อมูลบัญชีเข้าสู่ระบบเสียหาย');
  }
}

function authAccountByKey_(accounts, key) {
  return accounts && Object.prototype.hasOwnProperty.call(accounts, key) ? accounts[key] : null;
}

function passwordHash_(password, salt, iterations) {
  const pepper = PropertiesService.getScriptProperties().getProperty(AUTH_PASSWORD_PEPPER_PROPERTY_);
  assert_(pepper && pepper.length >= 24, 'CONFIG_ERROR', 'ยังไม่ได้ตั้งค่าระบบรหัสผ่าน');
  let digest = sha256_(pepper + ':' + salt + ':' + password);
  for (let i = 1; i < iterations; i += 1) digest = sha256_(pepper + ':' + salt + ':' + digest);
  return digest;
}

function publicAccountProfile_(account) {
  const profile = account.profile || {};
  return {
    username: cleanText_(account.username, 64),
    inspectorId: cleanText_(profile.inspectorId, 64) || ('account:' + cleanText_(account.username, 64).toLowerCase()),
    displayName: cleanText_(profile.displayName, 120) || cleanText_(account.username, 64),
    assignedProvinceCode: cleanText_(profile.assignedProvinceCode,2),
    agencyLevel: cleanText_(profile.agencyLevel,16),
    phone: cleanText_(profile.phone,20),
    authMethod: account.authMethod === 'phone_only' ? 'phone_only' : 'password',
    role: ['inspector', 'admin', 'super_admin'].indexOf(profile.role) >= 0 ? profile.role : 'inspector',
    district: cleanText_(profile.district, 120),
    tambon: cleanText_(profile.tambon, 120),
    personCategory: cleanText_(profile.personCategory, 120),
    personCategoryOther: cleanText_(profile.personCategoryOther, 200),
    position: cleanText_(profile.position, 120),
    agency: cleanText_(profile.agency, 200)
  };
}

function actorFromAccount_(account) {
  const profile = publicAccountProfile_(account);
  return {
    id: profile.inspectorId,
    username: profile.username,
    assignedProvinceCode:profile.assignedProvinceCode,
    agencyLevel:profile.agencyLevel,
    phone:profile.phone,
    displayName: profile.displayName,
    role: profile.role,
    district: profile.district,
    tambon: profile.tambon,
    personCategory: profile.personCategory,
    personCategoryOther: profile.personCategoryOther,
    position: profile.position,
    agency: profile.agency
  };
}

function sessionCache_() {
  return CacheService.getScriptCache();
}

function authRateKey_(username) {
  return AUTH_FAILURE_PREFIX_ + sha256_(username).slice(0, 40);
}

function readAuthFailures_(username) {
  const raw = sessionCache_().get(authRateKey_(username));
  if (!raw) return {count: 0, resetAt: 0};
  try {
    const value = JSON.parse(raw);
    if (Number(value.resetAt) <= Date.now()) return {count: 0, resetAt: 0};
    return {count: Number(value.count) || 0, resetAt: Number(value.resetAt) || 0};
  } catch (ignored) {
    return {count: 0, resetAt: 0};
  }
}

function assertLoginAllowed_(username) {
  const failures = readAuthFailures_(username);
  if (failures.count >= APP.AUTH_MAX_FAILURES) {
    throw new ApiError('RATE_LIMITED', 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่', {retryAfterSeconds: Math.max(1, Math.ceil((failures.resetAt - Date.now()) / 1000))});
  }
}

function recordLoginFailure_(username) {
  const failures = readAuthFailures_(username);
  const now = Date.now();
  const resetAt = failures.resetAt > now ? failures.resetAt : now + APP.AUTH_FAILURE_WINDOW_SECONDS * 1000;
  sessionCache_().put(authRateKey_(username), JSON.stringify({count: failures.count + 1, resetAt: resetAt}), Math.max(1, Math.ceil((resetAt - now) / 1000)));
}

function clearLoginFailures_(username) {
  sessionCache_().remove(authRateKey_(username));
}

function authGlobalAdmission_() {
  const cache = sessionCache_();
  const key = AUTH_GLOBAL_RATE_PREFIX_ + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0);
  assert_(count < AUTH_GLOBAL_ATTEMPTS_PER_MINUTE_, 'RATE_LIMITED', 'มีคำขอเข้าสู่ระบบจำนวนมาก กรุณาลองใหม่ภายหลัง');
  cache.put(key, String(count + 1), 120);
}

function sessionKey_(token) {
  return AUTH_SESSION_PREFIX_ + tokenHash_(token);
}

function login_(payload) {
  const lock=LockService.getScriptLock();
  assert_(lock.tryLock(10000), 'RATE_LIMITED', 'ระบบเข้าสู่ระบบกำลังมีผู้ใช้งาน กรุณาลองอีกครั้ง');
  try { return loginUnlocked_(payload); } finally { lock.releaseLock(); }
}

function loginUnlocked_(payload) {
  payload = payload || {};
  ensureAuthSecrets_();
  authGlobalAdmission_();
  let username;
  try { username = normalizeUsername_(payload.username); } catch (ignored) { username = 'invalid-user'; }
  const password = payload.password == null ? '' : String(payload.password);
  assert_(password.length <= 256, 'UNAUTHORIZED', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  assertLoginAllowed_(username);

  const accounts = readAuthAccounts_();
  const account = authAccountByKey_(accounts, username);
  const dummySalt = PropertiesService.getScriptProperties().getProperty(AUTH_DUMMY_SALT_PROPERTY_);
  const salt = account && account.salt ? account.salt : dummySalt;
  const storedIterations = account ? Number(account.iterations) : 0;
  const iterations = storedIterations >= APP.AUTH_HASH_ITERATIONS && storedIterations <= 100000 ? storedIterations : APP.AUTH_HASH_ITERATIONS;
  const candidate = passwordHash_(password, salt, iterations);
  const valid = account && account.authMethod !== 'phone_only' && account.active !== false && secureEquals_(candidate, account.hash);
  if (!valid) {
    recordLoginFailure_(username);
    throw new ApiError('UNAUTHORIZED', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  clearLoginFailures_(username);
  return createAccountSession_(username, account);
}

function createAccountSession_(username, account) {
  const token = (uuid_() + uuid_()).replace(/-/g, '');
  const csrf=(uuid_()+uuid_()).replace(/-/g,'');
  const expiresAtMs = Date.now() + APP.AUTH_SESSION_SECONDS * 1000;
  sessionCache_().put(sessionKey_(token), JSON.stringify({csrf:csrf, username: username, version: account.sessionVersion, expiresAt: expiresAtMs}), APP.AUTH_SESSION_SECONDS);
  return {csrf:csrf, token: token, profile: publicAccountProfile_(account), expiresAt: new Date(expiresAtMs).toISOString()};
}

function loginPhone_(payload) {
  const lock=LockService.getScriptLock();
  assert_(lock.tryLock(10000), 'RATE_LIMITED', 'ระบบเข้าสู่ระบบกำลังมีผู้ใช้งาน กรุณาลองอีกครั้ง');
  try { return loginPhoneUnlocked_(payload); } finally { lock.releaseLock(); }
}

function loginPhoneUnlocked_(payload) {
  payload=payload||{};
  ensureAuthSecrets_();
  authGlobalAdmission_();
  const supplied=cleanText_(payload.phone,20).replace(/[ -]/g,'');
  const phone=/^0[689][0-9]{8}$/.test(supplied)?supplied:'invalid-phone';
  assertLoginAllowed_(phone);
  const account=authAccountByKey_(readAuthAccounts_(),phone);
  const profile=account&&account.profile||{};
  const registrations=phone==='invalid-phone'?[]:rowsAsObjects_(APP.SHEETS.REGISTRATIONS).filter(function(row){
    return canonicalStoredPhone_(row.phone)===phone;
  });
  const registration=registrations.length===1&&registrations[0].status==='approved'?registrations[0]:null;
  const valid=Boolean(
    registration&&account&&account.active===true&&account.authMethod==='phone_only'&&
    cleanText_(account.username,64).toLowerCase()===phone&&profile.role==='inspector'&&
    cleanText_(profile.phone,20).replace(/[ -]/g,'')===phone&&
    cleanText_(profile.assignedProvinceCode,2)===cleanText_(registration.province_code,2)&&
    cleanText_(profile.agencyLevel,16)===cleanText_(registration.agency_level,16)&&
    cleanText_(profile.district,120)===cleanText_(registration.district,120)&&
    ['district','province'].indexOf(cleanText_(profile.agencyLevel,16))>=0&&
    (typeof HSNational==='undefined'||Boolean(HSNational.provinces[cleanText_(profile.assignedProvinceCode,2)]))
  );
  if(!valid){
    recordLoginFailure_(phone);
    throw new ApiError('UNAUTHORIZED','ไม่สามารถเข้าสู่ระบบด้วยหมายเลขโทรศัพท์นี้ได้');
  }
  clearLoginFailures_(phone);
  return createAccountSession_(phone,account);
}

function authenticateSession_(token) {
  token = cleanText_(token, 256);
  if (token.length < APP.TOKEN_MIN_LENGTH) return null;
  const raw = sessionCache_().get(sessionKey_(token));
  if (!raw) return null;
  let session;
  try { session = JSON.parse(raw); } catch (ignored) { return null; }
  if (!session || Number(session.expiresAt) <= Date.now()) {
    sessionCache_().remove(sessionKey_(token));
    return null;
  }
  const account = authAccountByKey_(readAuthAccounts_(), cleanText_(session.username, 64));
  if (!account || account.active === false || !secureEquals_(session.version, account.sessionVersion)) {
    sessionCache_().remove(sessionKey_(token));
    return null;
  }
  return actorFromAccount_(account);
}

function logoutSession_(token) {
  token = cleanText_(token, 256);
  if (token.length >= APP.TOKEN_MIN_LENGTH) sessionCache_().remove(sessionKey_(token));
  return {loggedOut: true};
}

function setupPasswordAccount(username, password, profile) {
  ensureAuthSecrets_();
  const key = normalizeUsername_(username);
  assert_(['__proto__', 'prototype', 'constructor'].indexOf(key) < 0, 'VALIDATION_ERROR', 'ชื่อผู้ใช้นี้สงวนไว้');
  password = password == null ? '' : String(password);
  assert_(password.length >= 6 && password.length <= 256, 'VALIDATION_ERROR', 'รหัสผ่านต้องมี 6-256 ตัวอักษร');
  profile = profile || {};
  const role = cleanText_(profile.role, 32) || 'inspector';
  assert_(['inspector', 'admin', 'super_admin'].indexOf(role) >= 0, 'VALIDATION_ERROR', 'role ไม่ถูกต้อง');
  const accounts = readAuthAccounts_();
  const salt = (uuid_() + uuid_()).replace(/-/g, '');
  accounts[key] = {
    username: cleanText_(username, 64),
    authMethod: 'password',
    salt: salt,
    iterations: APP.AUTH_HASH_ITERATIONS,
    hash: passwordHash_(password, salt, APP.AUTH_HASH_ITERATIONS),
    sessionVersion: uuid_(),
    active: profile.active !== false,
    profile: {
      inspectorId: cleanText_(profile.inspectorId, 64) || ('account:' + key),
      displayName: cleanText_(profile.displayName, 120) || cleanText_(username, 64),
      role: role,
      assignedProvinceCode:cleanText_(profile.assignedProvinceCode,2),
      agencyLevel:cleanText_(profile.agencyLevel,16),
      phone:cleanText_(profile.phone,20),
      district: cleanText_(profile.district, 120),
      tambon: cleanText_(profile.tambon, 120),
      personCategory: cleanText_(profile.personCategory, 120),
      personCategoryOther: cleanText_(profile.personCategoryOther, 200),
      position: cleanText_(profile.position, 120),
      agency: cleanText_(profile.agency, 200)
    }
  };
  if(typeof HSNational!=='undefined')PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+key,JSON.stringify(accounts[key]));else PropertiesService.getScriptProperties().setProperty(AUTH_ACCOUNTS_PROPERTY_, JSON.stringify(accounts));
  return {configured: true, profile: publicAccountProfile_(accounts[key])};
}

function setupPhoneOnlyInspectorAccount_(phone, profile) {
  const key=cleanText_(phone,20).replace(/[ -]/g,'');
  assert_(/^0[689][0-9]{8}$/.test(key),'VALIDATION_ERROR','กรุณาระบุหมายเลขโทรศัพท์มือถือไทย 10 หลัก');
  profile=profile||{};
  const account={
    username:key,
    authMethod:'phone_only',
    sessionVersion:uuid_(),
    active:false,
    profile:{
      inspectorId:cleanText_(profile.inspectorId,64)||('account:'+key),
      displayName:cleanText_(profile.displayName,120)||key,
      role:'inspector',
      assignedProvinceCode:cleanText_(profile.assignedProvinceCode,2),
      agencyLevel:cleanText_(profile.agencyLevel,16),
      phone:key,
      district:cleanText_(profile.district,120),
      tambon:cleanText_(profile.tambon,120),
      personCategory:cleanText_(profile.personCategory,120),
      personCategoryOther:cleanText_(profile.personCategoryOther,200),
      position:cleanText_(profile.position,120),
      agency:cleanText_(profile.agency,200)
    }
  };
  PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+key,JSON.stringify(account));
  return {configured:true,profile:publicAccountProfile_(account)};
}

function setupRequestedLoginAccounts() {
  const properties = PropertiesService.getScriptProperties();
  const adminPassword = properties.getProperty('BOOTSTRAP_ADMIN_PASSWORD');
  const superAdminPassword = properties.getProperty('BOOTSTRAP_SUPER_ADMIN_PASSWORD');
  assert_(adminPassword && superAdminPassword, 'CONFIG_ERROR', 'ตั้งค่า BOOTSTRAP_ADMIN_PASSWORD และ BOOTSTRAP_SUPER_ADMIN_PASSWORD ก่อน');
  const admin = setupPasswordAccount('620000', adminPassword, {displayName: 'ผู้ดูแลระบบ', role: 'admin'});
  const superAdmin = setupPasswordAccount('Krit', superAdminPassword, {displayName: 'Krit', role: 'super_admin'});
  properties.deleteProperty('BOOTSTRAP_ADMIN_PASSWORD');
  properties.deleteProperty('BOOTSTRAP_SUPER_ADMIN_PASSWORD');
  return {configured: true, accounts: [admin.profile, superAdmin.profile], note: 'ลบ plaintext bootstrap passwords ออกจาก Script Properties แล้ว'};
}

function authenticate_(token) {
  token = cleanText_(token, 256);
  assert_(token.length >= APP.TOKEN_MIN_LENGTH, 'UNAUTHORIZED', 'โทเคนไม่ถูกต้อง');
  const sessionActor = authenticateSession_(token);
  if (sessionActor) return sessionActor;
  const hash = tokenHash_(token);
  const adminHash = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN_HASH');
  if (adminHash && secureEquals_(hash, adminHash)) {
    return {id: 'admin', displayName: 'ผู้ดูแลระบบ', role: 'super_admin', district: '', tambon: ''};
  }
  const inspectors = rowsAsObjects_(APP.SHEETS.INSPECTORS);
  for (let i = 0; i < inspectors.length; i += 1) {
    const row = inspectors[i];
    if (String(row.active).toLowerCase() === 'false') continue;
    if (secureEquals_(hash, cleanText_(row.token_hash))) {
      try {
        row.last_seen_at = isoNow_();
        updateObjectRow_(APP.SHEETS.INSPECTORS, row._row, row);
      } catch (ignored) {}
      return {
        id: cleanText_(row.inspector_id),
        displayName: cleanText_(row.display_name),
        role: cleanText_(row.role) || 'inspector',
        district: cleanText_(row.district),
        tambon: cleanText_(row.tambon),
        personCategory: cleanText_(row.person_category), personCategoryOther: cleanText_(row.person_category_other),
        position: cleanText_(row.position), agency: cleanText_(row.agency)
      };
    }
  }
  throw new ApiError('UNAUTHORIZED', 'โทเคนไม่ถูกต้องหรือถูกปิดใช้งาน');
}

function requireAdmin_(actor) {
  assert_(actor && ['admin', 'super_admin'].indexOf(actor.role) >= 0, 'FORBIDDEN', 'ต้องใช้สิทธิ์ผู้ดูแลระบบ');
}

function requireSuperAdmin_(actor) {
  assert_(actor && actor.role === 'super_admin', 'FORBIDDEN', 'ต้องใช้สิทธิ์ Super Admin');
}

function createInspector(profile) {
  ensureSchema_();
  profile = profile || {};
  const person = validatePersonCategory_(profile.personCategory, profile.personCategoryOther);
  const token = uuid_() + uuid_().replace(/-/g, '');
  const inspectorId = cleanText_(profile.inspectorId, 64) || uuid_();
  assert_(!findOne_(APP.SHEETS.INSPECTORS, 'inspector_id', inspectorId), 'CONFLICT', 'inspectorId นี้มีอยู่แล้ว');
  const now = isoNow_();
  appendObject_(APP.SHEETS.INSPECTORS, {
    inspector_id: inspectorId,
    display_name: cleanText_(profile.displayName, 120),
    district: cleanText_(profile.district, 120),
    tambon: cleanText_(profile.tambon, 120),
    assignedProvinceCode: cleanText_(profile.assignedProvinceCode,2),
    agencyLevel: cleanText_(profile.agencyLevel,16),
    phone: cleanText_(profile.phone,20),
    role: ['inspector', 'admin', 'super_admin'].indexOf(profile.role) >= 0 ? profile.role : 'inspector',
    token_hash: tokenHash_(token),
    active: true,
    created_at: now,
    last_seen_at: '', person_category: person.category, person_category_other: person.other,
    position: cleanText_(profile.position,120), agency: cleanText_(profile.agency,200)
  });
  return {inspectorId: inspectorId, token: token};
}

function rotateInspectorToken(inspectorId) {
  ensureSchema_();
  const row = findOne_(APP.SHEETS.INSPECTORS, 'inspector_id', cleanText_(inspectorId, 64));
  assert_(row, 'NOT_FOUND', 'ไม่พบเจ้าหน้าที่');
  const token = uuid_() + uuid_().replace(/-/g, '');
  row.token_hash = tokenHash_(token);
  updateObjectRow_(APP.SHEETS.INSPECTORS, row._row, row);
  return {inspectorId: cleanText_(row.inspector_id), token: token};
}

function initializeBackend() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('TOKEN_PEPPER')) properties.setProperty('TOKEN_PEPPER', uuid_() + uuid_());
  ensureAuthSecrets_();
  ensureSchema_();
  let adminToken = '';
  if (!properties.getProperty('ADMIN_TOKEN_HASH')) {
    adminToken = uuid_() + uuid_().replace(/-/g, '');
    properties.setProperty('ADMIN_TOKEN_HASH', tokenHash_(adminToken));
  }
  return {initialized: true, adminToken: adminToken || null, note: adminToken ? 'บันทึก token นี้ทันที ระบบไม่เก็บค่า plaintext' : 'มี ADMIN_TOKEN_HASH อยู่แล้ว'};
}

function rotateAdminToken() {
  const token = uuid_() + uuid_().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN_HASH', tokenHash_(token));
  return {token: token, note: 'บันทึก token นี้ทันที ระบบไม่เก็บค่า plaintext'};
}

function validatePersonCategory_(category, other) {
  category = cleanText_(category,120); other = cleanText_(other,200);
  assert_(!category || APP.PERSON_CATEGORIES.indexOf(category)>=0, 'VALIDATION_ERROR', 'ประเภทบุคคลไม่ถูกต้อง');
  assert_(category!=='อื่นๆ' || other, 'VALIDATION_ERROR', 'โปรดระบุประเภทบุคคลอื่นๆ');
  return {category:category,other:category==='อื่นๆ'?other:''};
}

/* Recover only the known spreadsheet loss of a leading zero, never arbitrary identifiers. */
function canonicalStoredPhone_(value){
 const text=cleanText_(value,20).replace(/[ -]/g,'');
 return /^[689][0-9]{8}$/.test(text)?'0'+text:text;
}

// ==== Evidence.gs ====
/* Photo coordinates describe the camera position, not the photographed object. */
var HSEvidence = (function () {
  'use strict';
  function empty(status) { return {parseStatus:status,latitude:null,longitude:null,accuracyM:null,capturedAt:null,timeZoneKnown:false,rawDateTimeOriginal:null,timeSource:null,source:'none',warnings:[]}; }
  function inspectBytes(input) {
    var out=empty('unsupported'), b=input, n=b && b.length;
    if (!n || n<4) return empty('malformed');
    function u(i){ if(i<0||i>=n) throw Error('bounds'); return Number(b[i])&255; }
    if(u(0)!==255||u(1)!==216) return out;
    out.parseStatus='no_metadata';
    try {
      var p=2, segments=0;
      while(p<n && segments++<2048){
        if(u(p++)!==255) throw Error('marker');
        while(u(p)===255)p++;
        var marker=u(p++); if(marker===217||marker===218)break;
        if(marker===1||(marker>=208&&marker<=215))continue;
        var len=u(p)*256+u(p+1); if(len<2||p+len>n)throw Error('segment');
        if(marker===225&&len>=8&&u(p+2)===69&&u(p+3)===120&&u(p+4)===105&&u(p+5)===102&&u(p+6)===0&&u(p+7)===0){
          parseTiff(p+8,p+len); return out;
        }
        p+=len;
      }
      if(segments>=2048)throw Error('segment limit');
    } catch(e){ out=empty('malformed'); out.warnings.push('อ่านโครงสร้าง EXIF ไม่สำเร็จ'); }
    return out;
    function parseTiff(base,end){
      var little=u(base)===73&&u(base+1)===73;
      if(!little&&!(u(base)===77&&u(base+1)===77))throw Error('endian');
      function check(i,l){if(i<base||l<0||i+l>end)throw Error('tiff bounds');}
      function v16(i){check(i,2);return little?u(i)+u(i+1)*256:u(i)*256+u(i+1);}
      function v32(i){check(i,4);return little?u(i)+u(i+1)*256+u(i+2)*65536+u(i+3)*16777216:u(i)*16777216+u(i+1)*65536+u(i+2)*256+u(i+3);}
      if(v16(base+2)!==42)throw Error('tiff magic');
      var seen={}, countTotal=0;
      function ifd(offset){
        if(!offset)return {};
        if(seen['p'+offset])throw Error('ifd cycle'); seen['p'+offset]=true;
        var at=base+offset, count=v16(at), tags={};
        if(count>512||(countTotal+=count)>1024)throw Error('entry limit'); check(at+2,count*12+4);
        for(var i=0;i<count;i++){
          var e=at+2+i*12, tag=v16(e),type=v16(e+2), cnt=v32(e+4), size=({1:1,2:1,3:2,4:4,5:8,7:1})[type];
          if(!size)continue; if(cnt>65536)throw Error('value limit');
          var bytes=size*cnt, pos=bytes<=4?e+8:base+v32(e+8);check(pos,bytes);
          tags['t'+tag]={type:type,count:cnt,pos:pos};
        }return tags;
      }
      function nums(t){if(!t)return null;var a=[];for(var j=0;j<t.count;j++){var pos=t.pos+j*({1:1,3:2,4:4,5:8}[t.type]||1), value;
        if(t.type===5){var den=v32(pos+4);if(!den)throw Error('zero rational denominator');value=v32(pos)/den;}
        else value=t.type===3?v16(pos):t.type===4?v32(pos):u(pos);
        if(!isFinite(value))throw Error('nonfinite');a.push(value);
      }return a;}
      function str(t){if(!t||t.type!==2)return null;var s='';for(var j=0;j<t.count;j++){var c=u(t.pos+j);if(!c)break;s+=String.fromCharCode(c);}return s.trim();}
      var root=ifd(v32(base+4)), exifPtr=nums(root.t34665), gpsPtr=nums(root.t34853), ex=exifPtr?ifd(exifPtr[0]):{}, gps=gpsPtr?ifd(gpsPtr[0]):{};
      out.parseStatus='parsed';out.source='exif';out.warnings.push('EXIF แก้ไขได้; พิกัดเป็นตำแหน่งกล้อง ไม่ใช่ตำแหน่งวัตถุ');
      function coordinate(tag,refTag,positive,negative,max){var a=nums(gps['t'+tag]),ref=str(gps['t'+refTag]);if(!a&&!ref)return null;if(!a||a.length!==3||[positive,negative].indexOf(ref)<0||a[1]>=60||a[2]>=60)throw Error('coordinate');var val=a[0]+a[1]/60+a[2]/3600;if(val>max)throw Error('range');return ref===negative?-val:val;}
      out.latitude=coordinate(2,1,'N','S',90);out.longitude=coordinate(4,3,'E','W',180);
      if((out.latitude===null)!==(out.longitude===null)){out.latitude=null;out.longitude=null;out.warnings.push('พิกัด GPS ไม่ครบคู่');}
      var acc=nums(gps.t31);if(acc&&acc.length===1)out.accuracyM=acc[0];
      var raw=str(ex.t36867),offset=str(ex.t36881);out.rawDateTimeOriginal=raw;
      if(raw&&/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)){
        var iso=raw.slice(0,10).replace(/:/g,'-')+'T'+raw.slice(11);
        if(offset&&/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)){var dt=Date.parse(iso+offset);if(isFinite(dt)){out.capturedAt=new Date(dt).toISOString();out.timeZoneKnown=true;out.timeSource='DateTimeOriginal+OffsetTimeOriginal';}}
        else {out.capturedAt=iso;out.timeSource='DateTimeOriginal';out.warnings.push('ไม่ทราบเขตเวลาถ่ายภาพ');}
      }
      var gd=str(gps.t29),gt=nums(gps.t7);
      if(!out.timeZoneKnown&&gd&&/^\d{4}:\d{2}:\d{2}$/.test(gd)&&gt&&gt.length===3&&gt[0]<24&&gt[1]<60&&gt[2]<60){var utc=Date.parse(gd.replace(/:/g,'-')+'T00:00:00Z');if(isFinite(utc)){out.capturedAt=new Date(utc+(gt[0]*3600+gt[1]*60+gt[2])*1000).toISOString();out.timeZoneKnown=true;out.timeSource='GPS UTC';}}
    }
  }
  function validPoint(p){return p&&typeof p.latitude==='number'&&typeof p.longitude==='number'&&isFinite(p.latitude)&&isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;}
  function distance(a,b){var r=Math.PI/180,dlat=(b.latitude-a.latitude)*r,dlon=(b.longitude-a.longitude)*r,q=Math.sin(dlat/2)*Math.sin(dlat/2)+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)*Math.sin(dlon/2);return Math.round(6371008.8*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q))));}
  function knownTime(t){return typeof t==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(t)&&isFinite(Date.parse(t));}
  function assess(input){
    input=input||{};var hs=input.hs||{},m=input.metadata||{},policy=input.policy||{},out={status:'insufficient',distanceM:null,deviceDistanceM:null,reasons:[],policyVersion:'1.0',timeDeltaHours:null};
    if(!validPoint(hs)||!validPoint(m)){out.reasons.push('ไม่มีพิกัด HS หรือพิกัดภาพที่ครบและถูกต้อง');return out;}
    out.distanceM=distance(hs,m);var radius=hs.spatialRadiusM;
    if(!(typeof radius==='number'&&isFinite(radius)&&radius>0))out.reasons.push('ยังไม่มีเกณฑ์ระยะเชิงตำแหน่งของผลิตภัณฑ์ HS');
    else {out.status=out.distanceM<=radius?'consistent':'review';if(out.status==='review')out.reasons.push('พิกัดกล้องอยู่นอกเกณฑ์ระยะ HS; อาจถ่ายจากจุดปลอดภัย');}
    if(m.timeZoneKnown&&knownTime(m.capturedAt)&&knownTime(hs.acquiredAt)){out.timeDeltaHours=(Date.parse(m.capturedAt)-Date.parse(hs.acquiredAt))/3600000;if(out.timeDeltaHours<0){out.status='review';out.reasons.push('ภาพมีเวลาก่อนเหตุการณ์ HS');}}
    var loc=input.captureLocation,at=input.captureAt,windowSec=typeof policy.contemporaneousSeconds==='number'?Math.max(0,policy.contemporaneousSeconds):120;
    if(validPoint(loc)&&m.timeZoneKnown&&knownTime(m.capturedAt)&&knownTime(at)&&Math.abs(Date.parse(m.capturedAt)-Date.parse(at))<=windowSec*1000){out.deviceDistanceM=distance(m,loc);var limit=policy.deviceToleranceM;if(typeof limit==='number'&&isFinite(limit)&&limit>0&&out.deviceDistanceM>limit){out.status='review';out.reasons.push('พิกัดภาพต่างจากพิกัดอุปกรณ์ในช่วงเวลาเดียวกัน');}}
    out.reasons.push('ผลสอบทวนความสอดคล้อง ไม่ใช่การรับรองความแท้จริงของภาพ');return out;
  }
  return {inspectBytes:inspectBytes,assess:assess};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HSEvidence;

// ==== ImportService.gs ====
function sourceSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SOURCE_SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : getSpreadsheet_();
}

function sourceIndex_(headers) {
  const index = {};
  Object.keys(SOURCE_ALIASES).forEach(function (key) { index[key] = findHeader_(headers, SOURCE_ALIASES[key]); });
  return index;
}

function isDetailIndex_(index) {
  return index.hsId >= 0 && index.acquiredAt >= 0 && index.province >= 0 && index.district >= 0 &&
    index.tambon >= 0 && index.landType >= 0 && index.plantType >= 0 &&
    ((index.latitude >= 0 && index.longitude >= 0) || index.maps >= 0);
}

function readPivotReference_(sheet) {
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const normalized = row.map(compact_);
    const provinceColumn = normalized.indexOf('จังหวัด');
    if (provinceColumn < 0) continue;
    const plantColumns = {};
    let valid = true;
    APP.PLANT_TYPES.forEach(function (plant) {
      const column = normalized.indexOf(compact_(plant));
      if (column < 0) valid = false;
      plantColumns[plant] = column;
    });
    if (!valid) continue;
    for (let dataIndex = rowIndex + 1; dataIndex < values.length; dataIndex += 1) {
      if (normalizeProvince_(values[dataIndex][provinceColumn]) !== normalizeProvince_(APP.PROVINCE)) continue;
      const byPlantType = {};
      let total = 0;
      APP.PLANT_TYPES.forEach(function (plant) {
        const count = Number(values[dataIndex][plantColumns[plant]] || 0);
        assert_(Number.isFinite(count) && count >= 0 && Math.floor(count) === count, 'SOURCE_INVALID', 'ยอด Pivot ของ ' + plant + ' ไม่ถูกต้อง');
        byPlantType[plant] = count;
        total += count;
      });
      return {sheet: sheet.getName(), byPlantType: byPlantType, total: total};
    }
  }
  return null;
}

function parseDetailSheet_(sheet) {
  const values = sheet.getDataRange().getValues();
  assert_(values.length >= 2, 'SOURCE_INVALID', 'ชีตรายละเอียดไม่มีข้อมูล');
  const headers = values[0].map(function (value) { return cleanText_(value); });
  const index = sourceIndex_(headers);
  assert_(isDetailIndex_(index), 'SOURCE_INVALID', 'ชีตรายละเอียดขาด hsID, วันที่, พื้นที่ หรือพิกัด');
  const importedAt = isoNow_();
  const seen = {};
  const rows = [];
  const qa = {
    inputRows: values.length - 1,
    accepted: 0,
    wrongProvince: 0,
    wrongLandType: 0,
    wrongPlantType: 0,
    duplicateHsId: 0,
    missingDate: 0,
    missingId: 0,
    missingCoordinates: 0,
    byPlantType: {}
  };
  APP.PLANT_TYPES.forEach(function (plant) { qa.byPlantType[plant] = 0; });
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (normalizeProvince_(valueAt_(row, index.province)) !== normalizeProvince_(APP.PROVINCE)) { qa.wrongProvince += 1; continue; }
    if (normalizeLandType_(valueAt_(row, index.landType)) !== normalizeLandType_(APP.LAND_TYPE)) { qa.wrongLandType += 1; continue; }
    const plantType = normalizePlantType_(valueAt_(row, index.plantType));
    if (APP.PLANT_TYPES.indexOf(plantType) < 0) { qa.wrongPlantType += 1; continue; }
    const rawId = cleanText_(valueAt_(row, index.hsId), 128);
    if (!rawId) { qa.missingId += 1; continue; }
    const hsId = rawId;
    if (seen[hsId]) { qa.duplicateHsId += 1; continue; }
    const acquiredAt = toIsoSourceDate_(valueAt_(row, index.acquiredAt), valueAt_(row, index.time));
    if (!acquiredAt) { qa.missingDate += 1; continue; }
    let latitude;
    let longitude;
    if (index.latitude >= 0 && index.longitude >= 0) {
      if (!cleanText_(valueAt_(row, index.latitude)) || !cleanText_(valueAt_(row, index.longitude))) { qa.missingCoordinates += 1; continue; }
      latitude = Number(valueAt_(row, index.latitude));
      longitude = Number(valueAt_(row, index.longitude));
    } else {
      const coordinates = parseMapCoordinates_(valueAt_(row, index.maps));
      latitude = coordinates && coordinates.latitude;
      longitude = coordinates && coordinates.longitude;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { qa.missingCoordinates += 1; continue; }
    seen[hsId] = true;
    const snapshot = {
      hsId: hsId,
      acquiredAt: acquiredAt,
      latitude: latitude,
      longitude: longitude,
      province: APP.PROVINCE,
      district: cleanText_(valueAt_(row, index.district), 120),
      tambon: cleanText_(valueAt_(row, index.tambon), 120),
      village: cleanText_(valueAt_(row, index.village), 120),
      landType: APP.LAND_TYPE,
      plantType: plantType,
      sourceSheet: sheet.getName(),
      sourceRow: rowIndex + 1
    };
    rows.push({
      hs_id: hsId,
      acquired_at: acquiredAt,
      latitude: latitude,
      longitude: longitude,
      province: APP.PROVINCE,
      district: snapshot.district,
      tambon: snapshot.tambon,
      village: snapshot.village,
      land_type: APP.LAND_TYPE,
      plant_type: plantType,
      source_sheet: sheet.getName(),
      source_row: rowIndex + 1,
      source_snapshot_json: jsonStringifySafe_(snapshot),
      imported_at: importedAt,
      active: true,
      dataset_year_be: sourceDatasetYear_(sheet.getName(), acquiredAt)
    });
    qa.accepted += 1;
    qa.byPlantType[plantType] += 1;
  }
  assert_(rows.length > 0, 'SOURCE_EMPTY', 'ไม่พบรายการที่ผ่านเงื่อนไขนำเข้า');
  return {rows: rows, qa: qa};
}

function resolveSource_() {
  const spreadsheet = sourceSpreadsheet_();
  const configuredName = cleanText_(PropertiesService.getScriptProperties().getProperty('SOURCE_SHEET')) || APP.DEFAULT_SOURCE_SHEET;
  const configured = spreadsheet.getSheetByName(configuredName);
  assert_(configured, 'SOURCE_NOT_FOUND', 'ไม่พบชีตต้นทาง ' + configuredName);
  const configuredValues = configured.getDataRange().getValues();
  const configuredIndex = configuredValues.length ? sourceIndex_(configuredValues[0].map(function (value) { return cleanText_(value); })) : {};
  const configuredIsDetail = isDetailIndex_(configuredIndex);
  let detail = configured;
  let fallbackUsed = false;
  if (!configuredIsDetail) {
    detail = spreadsheet.getSheetByName(APP.DETAIL_FALLBACK_SHEET);
    assert_(detail, 'SOURCE_INVALID', configuredName + ' ไม่ใช่ข้อมูลรายจุดและไม่พบชีต ' + APP.DETAIL_FALLBACK_SHEET);
    const detailValues = detail.getDataRange().getValues();
    assert_(detailValues.length && isDetailIndex_(sourceIndex_(detailValues[0].map(function (value) { return cleanText_(value); }))), 'SOURCE_INVALID', APP.DETAIL_FALLBACK_SHEET + ' ขาดข้อมูลรายจุดที่จำเป็น');
    fallbackUsed = true;
  }
  const pivotSheet = spreadsheet.getSheetByName(APP.PIVOT_REFERENCE_SHEET);
  const reference = readPivotReference_(pivotSheet);
  return {
    configuredSheet: configuredName,
    detailSheet: detail,
    detailSheetName: detail.getName(),
    fallbackUsed: fallbackUsed,
    reference: reference
  };
}

function reconcileSource_(parsed, resolved) {
  const reference = resolved.reference;
  if (!reference) {
    assert_(!resolved.fallbackUsed, 'RECONCILIATION_UNAVAILABLE', 'ชีตสรุปไม่มีรูปแบบยอดที่อ่านได้ ต้องตรวจ Pivot ก่อนนำเข้า หรือกำหนดชีตรายจุดโดยตรง');
    return {available: false, match: null, note: 'ไม่พบ Pivot ที่อ่านยอดได้; นำเข้าจาก detail โดยไม่มีการเทียบยอด'};
  }
  const mismatches = [];
  APP.PLANT_TYPES.forEach(function (plant) {
    if (parsed.qa.byPlantType[plant] !== reference.byPlantType[plant]) {
      mismatches.push({plantType: plant, detail: parsed.qa.byPlantType[plant], pivot: reference.byPlantType[plant]});
    }
  });
  const match = parsed.qa.accepted === reference.total && mismatches.length === 0;
  assert_(match, 'RECONCILIATION_FAILED', 'ยอดข้อมูลรายจุดไม่ตรงกับ ' + reference.sheet, {
    detailTotal: parsed.qa.accepted,
    pivotTotal: reference.total,
    mismatches: mismatches
  });
  return {available: true, match: true, sheet: reference.sheet, total: reference.total, byPlantType: reference.byPlantType};
}

function syncSource_(actor, requestId) {
  requireSuperAdmin_(actor);
  return withScriptLock_(function () {
    const prior = findOne_(APP.SHEETS.LOG, 'request_id', requestId);
    if (prior && prior.action === 'syncSource' && prior.status === 'success') {
      return {idempotent: true, imported: Number(JSON.parse(cleanText_(prior.details_json) || '{}').imported || 0)};
    }
    try {
      const resolved = resolveSource_();
      const parsed = parseDetailSheet_(resolved.detailSheet);
      parsed.rows.forEach(function(row){ row.dataset_year_be = sourceDatasetYear_(resolved.configuredSheet, row.acquired_at); });
      assert_(parsed.rows.length <= APP.MAX_IMPORT_ROWS, 'SOURCE_TOO_LARGE', 'รองรับข้อมูลไม่เกิน 5000 จุด');
      assert_(!(parsed.qa.duplicateHsId + parsed.qa.missingDate + parsed.qa.missingId + parsed.qa.missingCoordinates), 'IMPORT_QA_FAILED', 'ต้นทางมีรายการผิดพลาด ต้องแก้ก่อนแทนที่ฐาน', parsed.qa);
      assert_(parsed.rows.every(function(row){return row.district && row.tambon;}), 'IMPORT_QA_FAILED', 'ต้นทางขาดอำเภอหรือตำบล');
      const reconciliation = reconcileSource_(parsed, resolved);
      replaceBaseAtomically_(parsed.rows);
      const result = {
        imported: parsed.rows.length,
        configuredSheet: resolved.configuredSheet,
        detailSheet: resolved.detailSheetName,
        fallbackUsed: resolved.fallbackUsed,
        reconciliation: reconciliation,
        qa: parsed.qa
      };
      appendLog_(actor, requestId, 'syncSource', 'sheet', APP.SHEETS.BASE, 'success', result);
      return result;
    } catch (error) {
      appendLog_(actor, requestId, 'syncSource', 'sheet', APP.SHEETS.BASE, 'failure', {code: error.code || 'INTERNAL_ERROR', message: error.message});
      throw error;
    }
  });
}

function parseSpreadsheetId_(value) {
  value = cleanText_(value, 500);
  if (!value) return '';
  const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:[\/?#].*)?$/.exec(value);
  const id = match ? match[1] : value;
  assert_(/^[A-Za-z0-9_-]+$/.test(id), 'VALIDATION_ERROR', 'Google Sheet URL หรือ ID ไม่ถูกต้อง');
  return id;
}

function sourceDatasetYear_(sourceName, acquiredAt) {
  const match = /(?:hsPlant|hsAll)(20\d{2})/i.exec(sourceName || '');
  return match ? Number(match[1]) + 543 : Number(Utilities.formatDate(new Date(acquiredAt), 'Asia/Bangkok', 'yyyy')) + 543;
}

function canonicalImport_(payload) {
  payload = payload || {};
  assert_(Array.isArray(payload.rows) && payload.rows.length > 0 && payload.rows.length <= APP.MAX_IMPORT_ROWS, 'VALIDATION_ERROR', 'ต้องมีข้อมูล 1–5000 แถว');
  const sourceName = cleanText_(payload.sourceName, 100) || 'file-import';
  const year = payload.datasetYearBe == null || payload.datasetYearBe === '' ? null : Number(payload.datasetYearBe);
  assert_(year === null || (Number.isInteger(year) && year >= 2500 && year <= 2700), 'VALIDATION_ERROR', 'datasetYearBe ต้องเป็นปี พ.ศ.');
  // Reuse the source parser so local file imports have identical scope and QA rules.
  const headers = ['hsID','acquired_at','Time','Province','Amphoe','Tambon','Village','LandType','PlantType','latitude','longitude'];
  const values = [headers].concat(payload.rows.map(function (row) {
    assert_(row && typeof row === 'object' && !Array.isArray(row), 'VALIDATION_ERROR', 'แถวข้อมูลต้องเป็น object');
    return [row.hsId,row.acquiredAt,row.time || '',row.province,row.district,row.tambon,row.village,row.landType,row.plantType,row.latitude,row.longitude];
  }));
  const parsed = parseDetailSheet_({getName: function () { return sourceName; }, getDataRange: function () { return {getValues: function () { return values; }}; }});
  parsed.rows.forEach(function (row) { row.dataset_year_be = year || sourceDatasetYear_(sourceName, row.acquired_at); });
  parsed.qa.missingLocation = parsed.rows.filter(function (row) { return !row.district || !row.tambon; }).length;
  const invalid = parsed.qa.duplicateHsId + parsed.qa.missingDate + parsed.qa.missingId + parsed.qa.missingCoordinates + parsed.qa.missingLocation;
  const reconciliation = payload.summary ? reconcileSource_(parsed, {reference: {sheet:sourceName, total:Number(payload.summary.total), byPlantType:payload.summary.byPlantType || {}}, fallbackUsed:false}) : {available:false,match:null,note:'ไม่มี summary สำหรับเทียบยอด'};
  return {rows:parsed.rows, result:{imported:parsed.rows.length, qa:parsed.qa, reconciliation:reconciliation, datasetYearBe:year, sourceName:sourceName, canImport:invalid === 0}};
}

function previewImportRows_(actor, payload) {
  requireSuperAdmin_(actor);
  return canonicalImport_(payload).result;
}

function importRows_(actor, requestId, payload) {
  requireSuperAdmin_(actor);
  assert_(payload && payload.confirmed === true, 'CONFIRMATION_REQUIRED', 'ตรวจ QA แล้วกดยืนยันนำเข้า');
  return withScriptLock_(function () {
    const prior = findOne_(APP.SHEETS.LOG, 'request_id', requestId);
    if (prior) {
      assert_(prior.action === 'importRows' && prior.actor_id === actor.id && prior.status === 'success', 'CONFLICT', 'requestId ถูกใช้แล้ว');
      return Object.assign({idempotent:true}, JSON.parse(cleanText_(prior.details_json)));
    }
    try {
      const parsed = canonicalImport_(payload);
      assert_(parsed.result.canImport, 'IMPORT_QA_FAILED', 'มีแถวผิดพลาดหรือซ้ำ กรุณาแก้ก่อนแทนที่ฐานข้อมูล', parsed.result.qa);
      replaceBaseAtomically_(parsed.rows);
      appendLog_(actor, requestId, 'importRows', 'sheet', APP.SHEETS.BASE, 'success', parsed.result);
      return parsed.result;
    } catch (error) {
      appendLog_(actor, requestId, 'importRows', 'sheet', APP.SHEETS.BASE, 'failure', {code:error.code || 'INTERNAL_ERROR', message:error.message, qa:error.details || null});
      throw error;
    }
  });
}

// ==== VerificationService.gs ====
function actorCanAccessHs_(actor, hs) {
  if(typeof nationalReadActor_==='function'&&!nationalReadActor_(actor,hs))return false;
  if (['admin', 'super_admin'].indexOf(actor.role) >= 0) return true;
  if (actor.district && cleanText_(hs.district) !== actor.district) return false;
  if (actor.tambon && cleanText_(hs.tambon) !== actor.tambon) return false;
  return true;
}

function requireAccessibleHs_(actor, hsId) {
  const hs = findOne_(APP.SHEETS.BASE, 'hs_id', cleanText_(hsId, 128));
  assert_(hs && String(hs.active).toLowerCase() !== 'false', 'NOT_FOUND', 'ไม่พบ Hotspot');
  assert_(actorCanAccessHs_(actor, hs), 'FORBIDDEN', 'Hotspot อยู่นอกพื้นที่รับผิดชอบ');
  return hs;
}

function latestVerificationMap_() {
  const map = {};
  const photosByVerification = {};
  rowsAsObjects_(APP.SHEETS.PHOTOS).forEach(function(p){photosByVerification[cleanText_(p.verification_id)]=true;});
  rowsAsObjects_(APP.SHEETS.VERIFICATION).forEach(function (row) {
    const key = cleanText_(row.hs_id);
    const prior = map[key];
    if (!prior || Date.parse(row.updated_at || row.verified_at) >= Date.parse(prior.updated_at || prior.verified_at)) map[key] = row;
  });
  Object.keys(map).forEach(function(key){const row=map[key];row._evidenceState=!(row.evidence_required===true || row.evidence_required==='true') ? 'not_required' : photosByVerification[cleanText_(row.verification_id)] ? 'provided' : cleanText_(row.photo_missing_reason) ? 'exception' : 'pending';});
  return map;
}

function applyHsFilters_(rows, filters, actor, latest) {
  filters = filters || {};
  let fiscalStart='',fiscalEnd='';
  if(filters.startMonth!=null){const start=String(filters.startMonth),end=String(filters.endMonth||'');assert_(/^\d{4}-(0[1-9]|1[0-2])$/.test(start)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(end)&&start<=end&&Number(start.slice(0,4))>=1900&&Number(end.slice(0,4))<=2300,'VALIDATION_ERROR','ช่วงเดือนเริ่มต้นและสิ้นสุดไม่ถูกต้อง');fiscalStart=start+'-01';fiscalEnd=end;}
  else if(filters.fiscalYearBe){const fy=Number(filters.fiscalYearBe),end=cleanText_(filters.endMonth,7);assert_(Number.isInteger(fy)&&fy>=2400&&fy<=2800&&/^\d{4}-\d{2}$/.test(end),'VALIDATION_ERROR','ช่วงปีงบประมาณไม่ถูกต้อง');fiscalStart=String(fy-544)+'-10-01';const last=String(fy-543)+'-09';assert_(end>=fiscalStart.slice(0,7)&&end<=last&&Number(end.slice(5))>=1&&Number(end.slice(5))<=12,'VALIDATION_ERROR','เดือนสิ้นสุดต้องอยู่ในปีงบประมาณ');fiscalEnd=end;}
  const search = compact_(filters.search);
  return rows.filter(function (row) {
    if (String(row.active).toLowerCase() === 'false' || !actorCanAccessHs_(actor, row)) return false;
    if(fiscalStart){const at=new Date(row.acquired_at);if(isNaN(at.getTime()))return false;const date=Utilities.formatDate(at,'Asia/Bangkok','yyyy-MM-dd');if(date<fiscalStart||date.slice(0,7)>fiscalEnd)return false;}

    if(filters.provinceCode&&typeof nationalCode_==='function'&&nationalCode_(row)!==filters.provinceCode)return false;
    const verification = latest[cleanText_(row.hs_id)];
    const status = verification ? cleanText_(verification.status) : 'pending';
    if (filters.district && cleanText_(row.district) !== cleanText_(filters.district)) return false;
    if (filters.tambon && cleanText_(row.tambon) !== cleanText_(filters.tambon)) return false;
    if (filters.village && cleanText_(row.village) !== cleanText_(filters.village)) return false;
    if (filters.plantType && cleanText_(row.plant_type) !== normalizePlantType_(filters.plantType)) return false;
    if (filters.status && status !== cleanText_(filters.status)) return false;
    if (filters.result && (!verification || cleanText_(verification.result) !== cleanText_(filters.result))) return false;
    if (filters.year || filters.month) {
      const acquired = new Date(cleanText_(row.acquired_at));
      if (isNaN(acquired.getTime())) return false;
      const localYear = Number(Utilities.formatDate(acquired, 'Asia/Bangkok', 'yyyy'));
      const localMonth = Number(Utilities.formatDate(acquired, 'Asia/Bangkok', 'M'));
      const requestedYear = Number(filters.year || 0);
      const cohortYear = Number(row.dataset_year_be) || localYear + 543;
      const yearMatches = !requestedYear || requestedYear === cohortYear || requestedYear + 543 === cohortYear;
      if (!yearMatches || (filters.month && Number(filters.month) !== localMonth)) return false;
    }
    if (search) {
      const haystack = compact_([row.hs_id, row.district, row.tambon, row.village, row.plant_type].join(' '));
      if (haystack.indexOf(search) < 0) return false;
    }
    return true;
  });
}

function allHs_(actor, payload) {
  payload = payload || {};
  const latest = latestVerificationMap_();
  const filtered = applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE), payload.filters, actor, latest);
  return {
    items: filtered.map(function (row) { return publicHs_(row, latest[cleanText_(row.hs_id)]); }),
    page: 1,
    pageSize: filtered.length,
    total: filtered.length,
    totalPages: filtered.length ? 1 : 0
  };
}

function listHs_(actor, payload) {
  payload = payload || {};
  const page = Math.max(1, Math.floor(Number(payload.page) || 1));
  const pageSize = Math.min(APP.MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(payload.pageSize) || 100)));
  const latest = latestVerificationMap_();
  const filtered = applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE), payload.filters, actor, latest);
  const offset = (page - 1) * pageSize;
  return {
    items: filtered.slice(offset, offset + pageSize).map(function (row) { return publicHs_(row, latest[cleanText_(row.hs_id)]); }),
    page: page,
    pageSize: pageSize,
    total: filtered.length,
    totalPages: Math.ceil(filtered.length / pageSize)
  };
}

function photoMetadataForHs_(hsId) {
  return rowsAsObjects_(APP.SHEETS.PHOTOS).filter(function (row) { return cleanText_(row.hs_id) === hsId; }).map(function (row) {
    return {
      photoId: cleanText_(row.photo_id),
      verificationId: cleanText_(row.verification_id),
      hsId: cleanText_(row.hs_id),
      mimeType: cleanText_(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      caption: cleanText_(row.caption),
      inspectorId: cleanText_(row.inspector_id),
      capturedAt: cleanText_(row.photo_taken_at),
      uploadedAt: cleanText_(row.uploaded_at), source: cleanText_(row.attachment_source),
      coordinateSource: cleanText_(row.coordinate_source),
      latitude: row.photo_latitude === '' || row.photo_latitude == null ? null : Number(row.photo_latitude),
      longitude: row.photo_longitude === '' || row.photo_longitude == null ? null : Number(row.photo_longitude),
      accuracyM: row.photo_accuracy_m === '' || row.photo_accuracy_m == null ? null : Number(row.photo_accuracy_m),
      capturedAtSource: cleanText_(row.photo_taken_at_source),
      distanceToHsM: row.distance_to_hs_m === '' || row.distance_to_hs_m == null ? null : Number(row.distance_to_hs_m),
      sha256: cleanText_(row.sha256),
      originalSha256: cleanText_(row.original_sha256) || cleanText_(row.sha256),
      derivativeSha256: cleanText_(row.sha256),
      exif: parseStoredJson_(row.exif_json), evidenceQa: parseStoredJson_(row.evidence_qa_json),
      deviceCapture: parseStoredJson_(row.device_capture_json)
    };
  });
}

function getHs_(actor, payload) {
  const hs = requireAccessibleHs_(actor, payload && payload.hsId);
  const latest = latestVerificationMap_()[cleanText_(hs.hs_id)];
  const result = publicHs_(hs, latest);
  result.photos = photoMetadataForHs_(cleanText_(hs.hs_id));
  return result;
}

function idempotentVerification_(requestId, actor, hsId) {
  const direct = findOne_(APP.SHEETS.VERIFICATION, 'request_id', requestId);
  if (direct) {
    assert_(cleanText_(direct.inspector_id) === actor.id && cleanText_(direct.hs_id) === hsId, 'CONFLICT', 'requestId ถูกใช้กับรายการอื่นแล้ว');
    return publicVerification_(direct);
  }
  const log = findOne_(APP.SHEETS.LOG, 'request_id', requestId);
  if (log && log.action === 'saveVerification' && log.status === 'success') {
    let replay;
    try { replay = JSON.parse(cleanText_(log.details_json)).verification; } catch (ignored) {}
    assert_(cleanText_(log.actor_id) === actor.id && replay && replay.hsId === hsId, 'CONFLICT', 'requestId ถูกใช้กับรายการอื่นแล้ว');
    return replay;
  }
  return null;
}

function saveVerification_(actor, requestId, payload) {
  payload = payload || {};
  return withScriptLock_(function () {
    const hs = requireAccessibleHs_(actor, payload.hsId);
    const replay = idempotentVerification_(requestId, actor, cleanText_(hs.hs_id));
    if (replay) return {verification: replay, idempotent: true};
    const status = cleanText_(payload.status) || 'verified';
    const result = cleanText_(payload.result);
    assert_(APP.STATUSES.indexOf(status) >= 0, 'VALIDATION_ERROR', 'status ไม่ถูกต้อง');
    assert_((status === 'draft' && (!result || APP.RESULTS.indexOf(result) >= 0)) || (status === 'verified' && APP.RESULTS.indexOf(result) >= 0), 'VALIDATION_ERROR', 'result ไม่ถูกต้องหรือยังไม่ได้ระบุ');
    let observedLatitude = '';
    let observedLongitude = '';
    let gpsAccuracyM = '';
    let missingGpsReason = cleanText_(payload.missingGpsReason, 500);
    let distanceM = '';
    if (payload.location != null) {
      assert_(payload.location && typeof payload.location === 'object', 'VALIDATION_ERROR', 'location ไม่ถูกต้อง');
      observedLatitude = parseNumber_(payload.location.latitude, -90, 90, 'location.latitude');
      observedLongitude = parseNumber_(payload.location.longitude, -180, 180, 'location.longitude');
      if (payload.location.accuracyM != null && payload.location.accuracyM !== '') gpsAccuracyM = parseNumber_(payload.location.accuracyM, 0, 100000, 'location.accuracyM');
      missingGpsReason = '';
      distanceM = haversineMeters_(Number(hs.latitude), Number(hs.longitude), observedLatitude, observedLongitude);
    }
    if (status === 'verified' && payload.location == null) assert_(missingGpsReason, 'VALIDATION_ERROR', 'ต้องระบุ missingGpsReason เมื่อไม่มีพิกัด GPS');
    const now = isoNow_();
    const person = validatePersonCategory_(payload.personCategory || actor.personCategory, payload.personCategoryOther || actor.personCategoryOther);
    const fieldInspectorName = cleanText_(payload.fieldInspectorName,120) || actor.displayName;
    const inspectedAt = parseOptionalIsoDate_(payload.inspectedAt, 'inspectedAt') || now;
    assert_(Date.parse(inspectedAt) <= Date.parse(now) + 5*60000, 'VALIDATION_ERROR', 'วันเวลาตรวจต้องไม่อยู่ในอนาคต');
    const inspectedAtSource = payload.inspectedAt ? cleanText_(payload.inspectedAtSource) || 'client_device' : 'server_default';
    assert_(['client_device','user_confirmed','server_default'].indexOf(inspectedAtSource)>=0, 'VALIDATION_ERROR', 'ที่มาวันเวลาตรวจไม่ถูกต้อง');
    assert_(payload.observedLandMatchesSource == null || typeof payload.observedLandMatchesSource === 'boolean', 'VALIDATION_ERROR', 'ต้องยืนยันประเภทพื้นที่เป็น true/false');
    const matches = payload.observedLandMatchesSource == null ? '' : payload.observedLandMatchesSource;
    const observedLand = matches === false ? cleanText_(payload.observedLandType,120) : matches === true ? cleanText_(hs.land_type) : '';
    const observedPlant = matches === false ? cleanText_(payload.observedPlantType,120) : matches === true ? cleanText_(hs.plant_type) : '';
    assert_(matches !== false || (observedLand && observedPlant), 'VALIDATION_ERROR', 'โปรดระบุประเภทพื้นที่และพืชที่พบจริง');
    const fireState = result === 'burned' ? cleanText_(payload.fireState) || 'unknown' : '';
    assert_(!fireState || ['active','extinguished','unknown'].indexOf(fireState)>=0, 'VALIDATION_ERROR', 'สถานะไฟไม่ถูกต้อง');
    const requestedId = payload.verificationId ? requireUuid_(payload.verificationId, 'verificationId') : '';
    let existing = requestedId ? findOne_(APP.SHEETS.VERIFICATION, 'verification_id', requestedId) : null;
    if (requestedId) assert_(existing, 'NOT_FOUND', 'ไม่พบรายการตรวจสอบ');
    if (existing) {
      assert_(cleanText_(existing.hs_id) === cleanText_(hs.hs_id), 'CONFLICT', 'verificationId ไม่ตรงกับ Hotspot');
      assert_(['admin', 'super_admin'].indexOf(actor.role) >= 0 || cleanText_(existing.inspector_id) === actor.id, 'FORBIDDEN', 'แก้ไขได้เฉพาะรายการของตนเอง');
    }
    const record = {
      verification_id: existing ? cleanText_(existing.verification_id) : uuid_(),
      request_id: requestId,
      hs_id: cleanText_(hs.hs_id),
      status: status,
      result: result,
      notes: cleanText_(payload.notes, 2000),
      action: cleanText_(payload.action, 1000),
      observed_latitude: observedLatitude,
      observed_longitude: observedLongitude,
      gps_accuracy_m: gpsAccuracyM,
      missing_gps_reason: missingGpsReason,
      distance_m: distanceM,
      inspector_id: actor.id,
      inspector_name: actor.displayName,
      verified_at: now,
      source_snapshot_json: cleanText_(hs.source_snapshot_json) || jsonStringifySafe_(publicHs_(hs, null)),
      created_at: existing ? cleanText_(existing.created_at) : now,
      updated_at: now,
      person_category: person.category, person_category_other: person.other, field_inspector_name: fieldInspectorName,
      reported_by_id: actor.id, reported_by_name: actor.displayName, agency: cleanText_(actor.agency,200),
      inspected_at: inspectedAt, inspected_at_source: inspectedAtSource, submitted_at: now,
      observed_land_matches_source: matches, observed_land_type: observedLand, observed_plant_type: observedPlant,
      fire_state: fireState, evidence_required: status === 'verified' || Boolean(existing && (existing.evidence_required === true || existing.evidence_required === 'true')),
      photo_missing_reason: cleanText_(payload.photoMissingReason,500)
    };
    try {
      if (existing) updateObjectRow_(APP.SHEETS.VERIFICATION, existing._row, record);
      else appendObject_(APP.SHEETS.VERIFICATION, record);
      if (person.category && fieldInspectorName === actor.displayName) {
        const profile = findOne_(APP.SHEETS.INSPECTORS, 'inspector_id', actor.id);
        if(profile) { profile.person_category=person.category; profile.person_category_other=person.other; updateObjectRow_(APP.SHEETS.INSPECTORS,profile._row,profile); }
      }
      const verification = publicVerification_(record);
      appendLog_(actor, requestId, 'saveVerification', 'verification', record.verification_id, 'success', {verification: verification});
      return {verification: verification, idempotent: false};
    } catch (error) {
      appendLog_(actor, requestId, 'saveVerification', 'verification', record.verification_id, 'failure', {code: error.code || 'INTERNAL_ERROR', message: error.message});
      throw error;
    }
  });
}

function getPhotoFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = cleanText_(properties.getProperty('PHOTO_FOLDER_ID'));
  if (configuredId) return DriveApp.getFolderById(configuredId);
  const folder = DriveApp.createFolder('HS Verification Photos (Private)');
  try { folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (error) {
    try { folder.setTrashed(true); } catch (ignored) {}
    throw new ApiError('DRIVE_PRIVACY_ERROR', 'ไม่สามารถกำหนดโฟลเดอร์รูปเป็นส่วนตัวได้');
  }
  properties.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function uploadPhoto_(actor, requestId, payload) {
  payload = payload || {};
  return withScriptLock_(function () {
    const verificationId = requireUuid_(payload.verificationId, 'verificationId');
    const verification = findOne_(APP.SHEETS.VERIFICATION, 'verification_id', verificationId);
    assert_(verification, 'NOT_FOUND', 'ไม่พบรายการตรวจสอบ');
    const hs = requireAccessibleHs_(actor, payload.hsId);
    assert_(cleanText_(verification.hs_id) === cleanText_(hs.hs_id), 'CONFLICT', 'รายการตรวจสอบไม่ตรงกับ Hotspot');
    assert_(['admin', 'super_admin'].indexOf(actor.role) >= 0 || cleanText_(verification.inspector_id) === actor.id, 'FORBIDDEN', 'อัปโหลดรูปได้เฉพาะรายการของตนเอง');
    const prior = findOne_(APP.SHEETS.PHOTOS, 'request_id', requestId);
    if (prior) {
      assert_(cleanText_(prior.inspector_id) === actor.id && cleanText_(prior.hs_id) === cleanText_(hs.hs_id) && cleanText_(prior.verification_id) === verificationId, 'CONFLICT', 'requestId ถูกใช้กับรูปอื่นแล้ว');
      return {photo: photoMetadataForHs_(cleanText_(prior.hs_id)).filter(function (item) { return item.photoId === cleanText_(prior.photo_id); })[0], idempotent: true};
    }
    const mimeType = cleanText_(payload.mimeType, 64).toLowerCase();
    assert_(APP.PHOTO_MIME_TYPES.indexOf(mimeType) >= 0, 'UNSUPPORTED_MEDIA_TYPE', 'รองรับเฉพาะ JPEG, PNG และ WebP');
    let base64 = cleanText_(payload.base64);
    const dataUri = base64.match(/^data:([^;]+);base64,(.*)$/s);
    if (dataUri) {
      assert_(dataUri[1].toLowerCase() === mimeType, 'VALIDATION_ERROR', 'MIME type ไม่ตรงกับ data URI');
      base64 = dataUri[2];
    }
    assert_(base64 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length % 4 === 0, 'INVALID_BASE64', 'ข้อมูลรูปไม่ใช่ base64 ที่ถูกต้อง');
    let bytes;
    try { bytes = Utilities.base64Decode(base64); } catch (error) { throw new ApiError('INVALID_BASE64', 'ข้อมูลรูปไม่ใช่ base64 ที่ถูกต้อง'); }
    assert_(bytes.length > 0 && bytes.length <= APP.MAX_PHOTO_BYTES, 'PHOTO_TOO_LARGE', 'รูปต้องมีขนาดไม่เกิน 1 MB', {maxBytes: APP.MAX_PHOTO_BYTES});
    assert_(bytesMatchMime_(bytes, mimeType), 'MEDIA_SIGNATURE_MISMATCH', 'เนื้อหาไฟล์ไม่ตรงกับ MIME type');
    const metadata = HSEvidence.inspectBytes(bytes);
    const attachmentSource = cleanText_(payload.source) || 'import';
    assert_(['camera','import'].indexOf(attachmentSource)>=0, 'VALIDATION_ERROR', 'แหล่งที่มาภาพไม่ถูกต้อง');
    const deviceCapture = {source:'client_reported',captureAt:'',location:null};
    let captureLocation = null;
    if(attachmentSource==='camera' && payload.captureLocation) {
      captureLocation = {
        latitude:parseNumber_(payload.captureLocation.latitude,-90,90,'captureLocation.latitude'),
        longitude:parseNumber_(payload.captureLocation.longitude,-180,180,'captureLocation.longitude'),
        accuracyM: payload.captureLocation.accuracyM == null ? null : parseNumber_(payload.captureLocation.accuracyM,0,100000,'captureLocation.accuracyM')
      };
      deviceCapture.location=captureLocation;
      deviceCapture.captureAt=parseOptionalIsoDate_(payload.captureAt || payload.captureLocation.capturedAt,'captureAt');
    }
    // A resized derivative may lose EXIF. Retain separately reported original EXIF, never label it server-read.
    let reportedOriginal=null;
    if(payload.originalMetadata && typeof payload.originalMetadata==='object'){
      const original=payload.originalMetadata;
      if(original.latitude!=null && original.longitude!=null){reportedOriginal={latitude:parseNumber_(original.latitude,-90,90,'originalMetadata.latitude'),longitude:parseNumber_(original.longitude,-180,180,'originalMetadata.longitude'),accuracyM:null,capturedAt:parseOptionalIsoDate_(original.capturedAt,'originalMetadata.capturedAt'),timeZoneKnown:original.timeZoneKnown===true,source:'client_reported_original_exif'};}
    }
    // Imported photos never inherit the uploader's current device coordinates.
    const evidencePoint = metadata.latitude != null && metadata.longitude != null ? metadata : reportedOriginal || (
      attachmentSource==='camera' && captureLocation && deviceCapture.captureAt ? {
        latitude:captureLocation.latitude,longitude:captureLocation.longitude,accuracyM:captureLocation.accuracyM,
        capturedAt:deviceCapture.captureAt,timeZoneKnown:true,source:'client_reported_camera'
      } : metadata);
    const evidenceQa = HSEvidence.assess({hs:{latitude:Number(hs.latitude),longitude:Number(hs.longitude),acquiredAt:cleanText_(hs.acquired_at)},metadata:evidencePoint,captureLocation:captureLocation,captureAt:deviceCapture.captureAt});
    evidenceQa.coordinateSource=evidencePoint.source;
    if(evidencePoint.source==='client_reported_original_exif'){evidenceQa.status='review';evidenceQa.reasons.push('พิกัดจาก EXIF ภาพต้นฉบับรายงานโดยเครื่องผู้ใช้ ไม่ได้ตรวจจากไฟล์ต้นฉบับบนเซิร์ฟเวอร์');}
    if(metadata.parseStatus==='malformed') { evidenceQa.status='review'; evidenceQa.reasons.push('EXIF เสียหายหรืออ่านไม่ได้'); }
    const derivativeHash=sha256Bytes_(bytes);
    const claimedOriginal=cleanText_(payload.originalSha256,64);
    assert_(!claimedOriginal||/^[a-f0-9]{64}$/i.test(claimedOriginal),'VALIDATION_ERROR','originalSha256 ไม่ถูกต้อง');
    // Original hash is client-reported when the original file was resized before upload.
    const originalHash=claimedOriginal||derivativeHash;
    if(claimedOriginal && claimedOriginal!==derivativeHash){deviceCapture.originalHashSource='client_reported';deviceCapture.originalSha256=claimedOriginal;deviceCapture.originalMetadata=payload.originalMetadata&&typeof payload.originalMetadata==='object'?payload.originalMetadata:null;}
    const duplicates=rowsAsObjects_(APP.SHEETS.PHOTOS).filter(function(p){return (cleanText_(p.original_sha256)||cleanText_(p.sha256))===originalHash;});
    if(duplicates.length) { evidenceQa.status='review'; evidenceQa.reasons.push('พบไฟล์ภาพเดิมในระบบ โปรดสอบทวนการใช้หลักฐานซ้ำ'); }
    const extension = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}[mimeType];
    const photoId = uuid_();
    const rawName = cleanText_(payload.fileName, 160).replace(/[^\p{L}\p{N}._-]+/gu, '_');
    const fileName = (rawName || (cleanText_(hs.hs_id) + '-' + photoId)) + (rawName.toLowerCase().endsWith(extension) ? '' : extension);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    let file;
    try {
      file = getPhotoFolder_().createFile(blob);
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      const uploadedAt = isoNow_();
      const row = {
        photo_id: photoId,
        request_id: requestId,
        verification_id: verificationId,
        hs_id: cleanText_(hs.hs_id),
        drive_file_id: file.getId(),
        mime_type: mimeType,
        size_bytes: bytes.length,
        sha256: sha256Bytes_(bytes),
        caption: cleanText_(payload.caption, 500),
        inspector_id: actor.id,
        client_captured_at: deviceCapture.captureAt,
        uploaded_at: uploadedAt, attachment_source:attachmentSource,
        exif_json:jsonStringifySafe_(metadata), coordinate_source:evidencePoint.latitude != null && evidencePoint.longitude != null ? evidencePoint.source : 'none',
        photo_latitude:evidencePoint.latitude == null ? '' : evidencePoint.latitude,
        photo_longitude:evidencePoint.longitude == null ? '' : evidencePoint.longitude,
        photo_accuracy_m:evidencePoint.accuracyM == null ? '' : evidencePoint.accuracyM,
        photo_taken_at:evidencePoint.capturedAt || '', photo_taken_at_source:evidencePoint.source==='client_reported_original_exif'?'client_reported_original_exif':metadata.timeSource || '',
        device_capture_json:jsonStringifySafe_(deviceCapture), distance_to_hs_m:evidenceQa.distanceM == null ? '' : evidenceQa.distanceM,
        evidence_qa_json:jsonStringifySafe_(evidenceQa), original_sha256:originalHash
      };
      appendObject_(APP.SHEETS.PHOTOS, row);
      const photo = photoMetadataForHs_(cleanText_(hs.hs_id)).filter(function (item) { return item.photoId === photoId; })[0];
      appendLog_(actor, requestId, 'uploadPhoto', 'photo', photoId, 'success', {photo: photo});
      return {photo: photo, idempotent: false};
    } catch (error) {
      if (file) try { file.setTrashed(true); } catch (ignored) {}
      appendLog_(actor, requestId, 'uploadPhoto', 'photo', photoId, 'failure', {code: error.code || 'INTERNAL_ERROR', message: error.message});
      throw error;
    }
  });
}

function getPhoto_(actor, payload) {
  const photo = findOne_(APP.SHEETS.PHOTOS, 'photo_id', payload && payload.photoId);
  assert_(photo, 'NOT_FOUND', 'ไม่พบรูป');
  requireAccessibleHs_(actor, photo.hs_id);
  const verification=findOne_(APP.SHEETS.VERIFICATION,'verification_id',photo.verification_id);
  assert_(verification&&verification.status==='verified'&&cleanText_(verification.hs_id)===cleanText_(photo.hs_id),'FORBIDDEN','แสดงภาพได้เมื่อยืนยันผลตรวจแล้วเท่านั้น');
  const file = DriveApp.getFileById(cleanText_(photo.drive_file_id));
  const blob = file.getBlob(),bytes=blob.getBytes(),mimeType=cleanText_(photo.mime_type);
  assert_(bytes.length<=APP.MAX_READ_PHOTO_BYTES,'PHOTO_TOO_LARGE','ภาพเดิมเกินขนาดที่อนุญาต');
  assert_(APP.PHOTO_MIME_TYPES.indexOf(mimeType)>=0&&bytesMatchMime_(bytes,mimeType),'MEDIA_SIGNATURE_MISMATCH','รูปแบบภาพไม่ถูกต้อง');
  return {photoId:cleanText_(photo.photo_id),mimeType:mimeType,fileName:cleanText_(photo.photo_id)+({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[mimeType]),base64:Utilities.base64Encode(bytes)};
}

function locationValues_(actor, payload, level) {
  const filters = {};
  if (level !== 'district') filters.district = cleanText_(payload && payload.district);
  if (level === 'village') filters.tambon = cleanText_(payload && payload.tambon);
  if (level !== 'district') assert_(filters.district, 'VALIDATION_ERROR', 'ต้องระบุ district');
  if (level === 'village') assert_(filters.tambon, 'VALIDATION_ERROR', 'ต้องระบุ tambon');
  const field = level === 'district' ? 'district' : (level === 'tambon' ? 'tambon' : 'village');
  const seen = {};
  rowsAsObjects_(APP.SHEETS.BASE).forEach(function (row) {
    if (!actorCanAccessHs_(actor, row) || String(row.active).toLowerCase() === 'false') return;
    if (filters.district && cleanText_(row.district) !== filters.district) return;
    if (filters.tambon && cleanText_(row.tambon) !== filters.tambon) return;
    const value = cleanText_(row[field]);
    if (value) seen[value] = true;
  });
  return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'th'); });
}

function summaries_(actor, payload) {
  const latest = latestVerificationMap_();
  const rows = applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE), payload && payload.filters, actor, latest);
  const result = {total: rows.length, byStatus: {}, byResult: {}, byDistrict: {}, byTambon: {}, byVillage: {}, byPlantType: {}, submitted: 0, confirmed: 0, followUpRequired: 0, evidencePending: 0};
  rows.forEach(function (row) {
    const verification = latest[cleanText_(row.hs_id)];
    const status = verification ? cleanText_(verification.status) : 'pending';
    const outcome = verification ? cleanText_(verification.result) : '';
    const district = (typeof nationalCode_==='function'?nationalCode_(row)+'/'+row.province+'/':'')+(cleanText_(row.district) || '(ไม่ระบุ)');
    const tambon = district + '/' + (cleanText_(row.tambon) || '(ไม่ระบุ)');
    const village = tambon + '/' + (cleanText_(row.village) || '(ไม่ระบุ)');
    const plant = cleanText_(row.plant_type) || '(ไม่ระบุ)';
    if(verification && status==='verified') {
      result.submitted += 1;
      if(['not_found','needs_review','inaccessible'].indexOf(outcome)>=0) result.followUpRequired += 1;
      else result.confirmed += 1;
      if(verificationEvidenceState_(verification)==='pending') result.evidencePending += 1;
    }
    result.byStatus[status] = (result.byStatus[status] || 0) + 1;
    if (outcome && status === 'verified') result.byResult[outcome] = (result.byResult[outcome] || 0) + 1;
    result.byDistrict[district] = (result.byDistrict[district] || 0) + 1;
    result.byTambon[tambon] = (result.byTambon[tambon] || 0) + 1;
    result.byVillage[village] = (result.byVillage[village] || 0) + 1;
    result.byPlantType[plant] = (result.byPlantType[plant] || 0) + 1;
  });
  return result;
}

function qa_(actor) {
  requireAdmin_(actor);
  const base = rowsAsObjects_(APP.SHEETS.BASE).filter(function(r){return actorCanAccessHs_(actor,r);});
  const scopeIds={};base.forEach(function(r){scopeIds[r.hs_id]=true;});
  const verifications = rowsAsObjects_(APP.SHEETS.VERIFICATION).filter(function(r){return scopeIds[r.hs_id];});
  const photos = rowsAsObjects_(APP.SHEETS.PHOTOS).filter(function(r){return scopeIds[r.hs_id];});
  const ids = {};
  const verificationIds = {};
  const qa = {baseRows: base.length, duplicateHsIds: [], invalidCoordinates: [], orphanVerifications: [], orphanPhotos: [], byPlantType: {}};
  base.forEach(function (row) {
    const id = cleanText_(row.hs_id);
    if (ids[id]) qa.duplicateHsIds.push(id); else ids[id] = true;
    if (!cleanText_(row.latitude) || !cleanText_(row.longitude) || !Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude)) || Math.abs(Number(row.latitude)) > 90 || Math.abs(Number(row.longitude)) > 180) qa.invalidCoordinates.push(id);
    const plant = cleanText_(row.plant_type);
    qa.byPlantType[plant] = (qa.byPlantType[plant] || 0) + 1;
  });
  verifications.forEach(function (row) {
    verificationIds[cleanText_(row.verification_id)] = true;
    if (!ids[cleanText_(row.hs_id)]) qa.orphanVerifications.push(cleanText_(row.verification_id));
  });
  photos.forEach(function (row) {
    if (!ids[cleanText_(row.hs_id)] || !verificationIds[cleanText_(row.verification_id)]) qa.orphanPhotos.push(cleanText_(row.photo_id));
  });
  qa.ok = !qa.duplicateHsIds.length && !qa.invalidCoordinates.length && !qa.orphanVerifications.length && !qa.orphanPhotos.length;
  return qa;
}

function readLog_(actor, payload) {
  requireAdmin_(actor);
  payload = payload || {};
  const page = Math.max(1, Math.floor(Number(payload.page) || 1));
  const pageSize = Math.min(APP.MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(payload.pageSize) || 100)));
  let rows = rowsAsObjects_(APP.SHEETS.LOG).reverse();
  if(typeof nationalReadActor_==='function'&&actor.role!=='super_admin')rows=rows.filter(function(r){return r.actor_id===actor.id;});
  if (payload.action) rows = rows.filter(function (row) { return cleanText_(row.action) === cleanText_(payload.action); });
  if (payload.actorId) rows = rows.filter(function (row) { return cleanText_(row.actor_id) === cleanText_(payload.actorId); });
  const offset = (page - 1) * pageSize;
  return {
    items: rows.slice(offset, offset + pageSize).map(function (row) {
      let details = {};
      try { details = JSON.parse(cleanText_(row.details_json) || '{}'); } catch (ignored) {}
      return {logId: cleanText_(row.log_id), requestId: cleanText_(row.request_id), timestamp: cleanText_(row.timestamp), actorId: cleanText_(row.actor_id), action: cleanText_(row.action), entityType: cleanText_(row.entity_type), entityId: cleanText_(row.entity_id), status: cleanText_(row.status), details: details};
    }),
    page: page,
    pageSize: pageSize,
    total: rows.length,
    totalPages: Math.ceil(rows.length / pageSize)
  };
}

function exportCsv_(actor, payload) {
  requireAdmin_(actor);
  payload = payload || {};
  const dataset = cleanText_(payload.dataset) || 'verifications';
  const mapping = {
    hotspots: APP.SHEETS.BASE,
    verifications: APP.SHEETS.VERIFICATION,
    photos: APP.SHEETS.PHOTOS,
    log: APP.SHEETS.LOG
  };
  const sheetName = mapping[dataset];
  assert_(sheetName, 'VALIDATION_ERROR', 'dataset ต้องเป็น hotspots, verifications, photos หรือ log');
  const headers = APP.HEADERS[sheetName].slice();
  let rows = rowsAsObjects_(sheetName);
  if(typeof nationalReadActor_==='function'){const latest=latestVerificationMap_(),scoped=applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE),payload.filters,actor,latest),ids={};scoped.forEach(function(r){ids[r.hs_id]=true;});rows=dataset==='log'?rows.filter(function(r){return actor.role==='super_admin'||r.actor_id===actor.id;}):rows.filter(function(r){return !!ids[r.hs_id];});}
  const escapeCsv = function (value) {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const lines = [headers.map(escapeCsv).join(',')];
  rows.forEach(function (row) { lines.push(headers.map(function (header) { return escapeCsv(row[header]); }).join(',')); });
  const csv = '\uFEFF' + lines.join('\r\n');
  const date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
  return {
    fileName: 'hs-verification-' + dataset + '-' + date + '.csv',
    mimeType: 'text/csv;charset=utf-8',
    base64: Utilities.base64Encode(Utilities.newBlob(csv, 'text/csv').getBytes()),
    rowCount: rows.length
  };
}

function getConfig_(actor) {
  const data = {
    national:typeof HSNational!=='undefined',
    authorizedProvinceCodes:typeof nationalAuthorized_==='function'?nationalAuthorized_(actor):[],
    boundaries:typeof getBoundaryConfig_==='function'?getBoundaryConfig_(actor):null,
    version: APP.VERSION,
    province:typeof HSNational!=='undefined'?(actor.role==='admin'?(HSNational.provinces[actor.assignedProvinceCode]||'ยังไม่กำหนดจังหวัด'):'ประเทศไทย'):APP.PROVINCE,
    landType: APP.LAND_TYPE,
    plantTypes: APP.PLANT_TYPES.slice(),
    statuses: ['pending'].concat(APP.STATUSES),
    results: APP.RESULTS.slice(),
    personCategories: APP.PERSON_CATEGORIES.slice(),
    limits: {maxImportRows: APP.MAX_IMPORT_ROWS, maxPageSize: APP.MAX_PAGE_SIZE, maxPhotoBytes: APP.MAX_PHOTO_BYTES, photoMimeTypes: APP.PHOTO_MIME_TYPES.slice()},
    profile: {username:actor.username||'',agencyLevel:actor.agencyLevel||'',phone:actor.phone||'',authMethod:actor.authMethod||'',assignedProvinceCode:actor.assignedProvinceCode||'',inspectorId: actor.id, displayName: actor.displayName, district: actor.district, tambon: actor.tambon, role: actor.role, personCategory: actor.personCategory || '', personCategoryOther: actor.personCategoryOther || '', position: actor.position || '', agency: actor.agency || ''}
  };
  if (['admin', 'super_admin'].indexOf(actor.role) >= 0 && (typeof nationalReadActor_!=='function'||actor.role==='super_admin')) {
    const properties = PropertiesService.getScriptProperties();
    data.admin = {
      sourceSpreadsheetId: cleanText_(properties.getProperty('SOURCE_SPREADSHEET_ID')),
      sourceSheet: cleanText_(properties.getProperty('SOURCE_SHEET')) || APP.DEFAULT_SOURCE_SHEET,
      photoFolderId: cleanText_(properties.getProperty('PHOTO_FOLDER_ID')),
      photoFolderConfigured: Boolean(properties.getProperty('PHOTO_FOLDER_ID'))
    };
  }
  return data;
}

function setConfig_(actor, requestId, payload) {
  requireSuperAdmin_(actor);
  payload = payload || {};
  return withScriptLock_(function () {
    const properties = PropertiesService.getScriptProperties();
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'sourceSpreadsheetId') || Object.prototype.hasOwnProperty.call(payload, 'sourceSpreadsheetUrl')) {
      const id = parseSpreadsheetId_(payload.sourceSpreadsheetUrl || payload.sourceSpreadsheetId);
      if (id) SpreadsheetApp.openById(id);
      updates.SOURCE_SPREADSHEET_ID = id;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'sourceSheet')) {
      const name = cleanText_(payload.sourceSheet, 100) || APP.DEFAULT_SOURCE_SHEET;
      const sourceId = Object.prototype.hasOwnProperty.call(updates, 'SOURCE_SPREADSHEET_ID') ? updates.SOURCE_SPREADSHEET_ID : properties.getProperty('SOURCE_SPREADSHEET_ID');
      const spreadsheet = sourceId ? SpreadsheetApp.openById(sourceId) : getSpreadsheet_();
      assert_(spreadsheet.getSheetByName(name), 'SOURCE_NOT_FOUND', 'ไม่พบชีตต้นทาง ' + name);
      updates.SOURCE_SHEET = name;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'photoFolderId')) {
      const folderId = cleanText_(payload.photoFolderId, 200);
      if (folderId) DriveApp.getFolderById(folderId);
      updates.PHOTO_FOLDER_ID = folderId;
    }
    Object.keys(updates).forEach(function (key) {
      if (updates[key]) properties.setProperty(key, updates[key]); else properties.deleteProperty(key);
    });
    const config = getConfig_(actor);
    appendLog_(actor, requestId, 'setConfig', 'config', 'script-properties', 'success', {changedKeys: Object.keys(payload), config: config.admin});
    return config;
  });
}

function parseStoredJson_(value) { try{return JSON.parse(cleanText_(value)||'{}');}catch(ignored){return {};} }

// ==== NationalService.gs ====
/* National scope is mandatory when this module is installed. Legacy replacement endpoints are disabled. */
/* Metadata only: public display geometry stays on the static site, never in Sheets. */
function getBoundaryConfig_(actor){
 actor=actor||{role:'public'};
 const manager=['admin','super_admin','inspector'].indexOf(actor.role)>=0;
 const selected=actor.role==='public'?publicReadActor_({provinceCode:actor.selectedProvinceCode}).selectedProvinceCode:'';
 const codes=manager?nationalAuthorized_(actor).filter(function(code){return !!HSNational.provinces[code];}):selected?[selected]:[];
 return {apiVersion:APP.VERSION,datasetVersion:'2026-10-v1',visible:codes.length>0,scope:actor.role==='super_admin'?'national':actor.role==='admin'?'assigned_province':actor.role==='inspector'?(actor.agencyLevel==='district'?'assigned_district':'assigned_province'):selected?'selected_province':'none',authorizedProvinceCodes:codes,levels:['province','district','subdistrict'],manifestPath:'data/boundaries/index.json',storage:'public_static_frontend',displayOnly:true,spatialValidationEnabled:false,coverage:{provinces:77,districts:929,subdistricts:7331,partialProvinces:35},minimumZoom:{district:8,subdistrict:10}};
}
/* Read-only deployment diagnostic: no accounts, properties or database rows are changed. */
function checkBoundaryIntegrationReady(){
 const admin=getBoundaryConfig_({role:'admin',assignedProvinceCode:'62'}),superAdmin=getBoundaryConfig_({role:'super_admin'}),inspector=getBoundaryConfig_({role:'inspector',assignedProvinceCode:'62'});
 const result={version:APP.VERSION,datasetVersion:admin.datasetVersion,adminProvinceScope:admin.visible&&admin.authorizedProvinceCodes.length===1&&admin.authorizedProvinceCodes[0]==='62',superAdminProvinceCount:superAdmin.authorizedProvinceCodes.length,inspectorBoundaryScoped:inspector.visible&&inspector.authorizedProvinceCodes.length===1,displayOnly:true,spatialValidationEnabled:false};
 console.log(JSON.stringify(result));return result;
}
function nationalCode_(row){return HSNational.provinceCode(row.province,row.province_code||row.provinceCode);}
function nationalAuthorized_(actor){return HSNational.allowed(actor);}
function nationalManager_(actor){requireAdmin_(actor);assert_(nationalAuthorized_(actor).length,'PROVINCE_UNASSIGNED','บัญชียังไม่ได้รับมอบหมายจังหวัด');}
function nationalGuard_(actor,action){
 if(['syncSource','importSource','importRows','previewImportRows','setConfig'].indexOf(action)>=0)throw new ApiError('PREVIEW_REQUIRED','ใช้ขั้นตอนนำเข้าระดับประเทศ ตรวจ QA และยืนยันจังหวัด/ปีก่อนบันทึก');
 if(actor.role==='admin')assert_(nationalAuthorized_(actor).length,'PROVINCE_UNASSIGNED','Admin ยังไม่กำหนดจังหวัด');
}
function nationalCsrf_(envelope){const actions=['saveVerification','verifyHS','uploadPhoto','saveTeam','nationalCommit','nationalSetSource','assignProvince','approveRegistration','rejectRegistration','createProvincialAdmin','changeOwnCredentials','approveProvincialAdminRequest','rejectProvincialAdminRequest'];if(actions.indexOf(envelope.action)<0)return;const token=cleanText_(envelope.token,256),raw=sessionCache_().get(sessionKey_(token));assert_(raw,'UNAUTHORIZED','การเปลี่ยนข้อมูลต้องใช้ session เข้าสู่ระบบ');const s=JSON.parse(raw);assert_(s.csrf&&secureEquals_(s.csrf,cleanText_(envelope.csrf,128)),'CSRF_INVALID','session หรือ CSRF ไม่ตรง กรุณาเข้าสู่ระบบใหม่');}
function publicReadActor_(payload){
 const code=payload&&typeof payload.provinceCode==='string'?payload.provinceCode.trim():'';
 return {role:'public',id:'public',selectedProvinceCode:/^\d{2}$/.test(code)&&nationalPublicCodes_().indexOf(code)>=0?code:''};
}
function nationalReadActor_(actor,row){const code=nationalCode_(row);if(actor.role==='super_admin')return true;const selected=actor.role==='public'?publicReadActor_({provinceCode:actor.selectedProvinceCode}).selectedProvinceCode:'';const codes=actor.role==='public'?(selected?[selected]:[]):nationalAuthorized_(actor);return codes.indexOf(code)>=0 && !(actor.role==='inspector' && actor.agencyLevel==='district' && (!actor.district || cleanText_(row.district)!==cleanText_(actor.district)));}
function nationalPublicCodes_(){const raw=PropertiesService.getScriptProperties().getProperty('PUBLIC_PROVINCE_CODES');return (raw?raw.split(','):['62']).map(function(c){return c.trim();}).filter(function(c,i,all){return /^\d{2}$/.test(c)&&Object.prototype.hasOwnProperty.call(HSNational.provinces,c)&&all.indexOf(c)===i;});}
function nationalSnapshot_(rows){return sha256_(JSON.stringify(rows.map(function(r){return Object.keys(r).filter(function(k){return k!=='_row';}).sort().map(function(k){return [k,r[k]];});}).sort()));}
function nationalParsed_(actor,payload){nationalManager_(actor);assert_(Array.isArray(payload.rows)&&payload.rows.length>0&&payload.rows.length<=5000,'BATCH_LIMIT','แต่ละส่วนต้องมี 1–5000 แถว');return HSData.normalizeRows(payload.rows,{national:HSNational,yearMode:payload.yearMode||'multi',datasetYearBe:payload.datasetYearBe,sourceName:payload.sourceName,sourceSheet:payload.sourceSheet,authorizedProvinceCodes:nationalAuthorized_(actor),selectedProvinceCodes:payload.provinceCodes||[]});}
function nationalPlan_(actor,payload){const parsed=nationalParsed_(actor,payload),old=rowsAsObjects_(APP.SHEETS.BASE),existing={};old.forEach(function(r){const date=HSData.dateISO(r.acquired_at),time=HSData.timeISO('',r.acquired_at);existing[HSNational.observation({provinceCode:nationalCode_(r),acquiredAt:date,time:time,latitude:r.latitude,longitude:r.longitude})]=r;});
const parts={};parsed.rows.forEach(function(r){const prior=existing[HSNational.observation(r)];if(prior)r.hsId=prior.hs_id;const k=HSNational.key(r);parts[k]=true;});const keys=Object.keys(parts).sort();assert_(keys.length<=1,'PARTITION_REQUIRED','แยกยืนยันทีละจังหวัด/ปี เพื่อกู้คืนและทำต่อได้');
const selected=old.filter(function(r){return parts[nationalCode_(r)+'|'+r.dataset_year_be];});
const qa=parsed.qa;qa.existingObservations=parsed.rows.filter(function(r){return !!existing[HSNational.observation(r)];}).length;
const incomingIds={};parsed.rows.forEach(function(r){incomingIds[r.hsId]=true;});
return {removedEvents:selected.filter(function(r){return !incomingIds[r.hs_id];}).length,verificationHistoryRetained:true,rows:parsed.rows,qa:qa,partitions:keys,previousCount:selected.length,baseFingerprint:nationalSnapshot_(selected),canImport:parsed.rows.length>0&&qa.invalid===0,registryCount:Object.keys(HSNational.provinces).length,boundariesReady:false};}
function nationalPreview_(actor,payload){const plan=nationalPlan_(actor,payload);const ticket=uuid_();const details={actor:actor.id,hash:sha256_(JSON.stringify(payload)),fingerprint:plan.baseFingerprint,expires:Date.now()+600000};CacheService.getScriptCache().put('national-preview:'+ticket,JSON.stringify(details),600);delete plan.rows;return Object.assign(plan,{ticket:ticket,expiresAt:new Date(details.expires).toISOString(),mode:'replace provinceCode + datasetYear only',permissionStatus:'authorized',readStatus:'read_and_validated'});}
function nationalCommit_(actor,requestId,payload){nationalManager_(actor);assert_(payload.confirmed===true,'CONFIRMATION_REQUIRED','ต้องยืนยันผลกระทบจังหวัด/ปี');return withScriptLock_(function(){const prior=findOne_(APP.SHEETS.LOG,'request_id',requestId);if(prior){assert_(prior.actor_id===actor.id&&prior.action==='nationalCommit'&&prior.status==='success','CONFLICT','requestId ถูกใช้แล้ว');return Object.assign(JSON.parse(prior.details_json),{idempotent:true});}
const cached=CacheService.getScriptCache().get('national-preview:'+cleanText_(payload.ticket));assert_(cached,'PREVIEW_EXPIRED','ตรวจ QA ใหม่ก่อนบันทึก');const preview=JSON.parse(cached);const input=payload.input||{};if(input.sourceRevision){const key=nationalSourceKey_(actor,{provinceCode:input.sourceProvinceCode}),cfg=JSON.parse(PropertiesService.getScriptProperties().getProperty(key)||'{}');assert_(cfg.revision===input.sourceRevision,'PREVIEW_CHANGED','แหล่ง Google Sheet เปลี่ยนแล้ว ต้องอ่านใหม่');if(input.sourceFingerprint){const fresh=nationalReadSource_(actor,{provinceCode:input.sourceProvinceCode});assert_(fresh.sourceFingerprint===input.sourceFingerprint,'PREVIEW_CHANGED','ข้อมูลใน Google Sheet เปลี่ยนแล้ว ต้องอ่านและตรวจ QA ใหม่');}}assert_(preview.actor===actor.id&&preview.hash===sha256_(JSON.stringify(input))&&preview.expires>Date.now(),'PREVIEW_CHANGED','ข้อมูลหรือขอบเขตเปลี่ยน ต้องตรวจ QA ใหม่');const plan=nationalPlan_(actor,input);assert_(plan.canImport,'IMPORT_QA_FAILED','ข้อมูลมีข้อผิดพลาดหรือไม่มีแถวผ่าน',plan.qa);assert_(plan.baseFingerprint===preview.fingerprint,'CONFLICT','ฐานจังหวัด/ปีเปลี่ยนแล้ว ต้องตรวจ QA ใหม่');
const old=rowsAsObjects_(APP.SHEETS.BASE),keys=plan.partitions;const retained=old.filter(function(r){return keys.indexOf(nationalCode_(r)+'|'+r.dataset_year_be)<0;});const now=isoNow_();const additions=plan.rows.map(function(r){return {hs_id:r.hsId,acquired_at:r.acquiredAt+'T'+(r.time||'00:00')+':00+07:00',latitude:r.latitude,longitude:r.longitude,province:r.province,district:r.district,tambon:r.tambon,village:r.village,land_type:r.landType,plant_type:normalizePlantType_(r.plantType),source_sheet:r.sourceSheet,source_row:r.sourceRow,source_snapshot_json:JSON.stringify(r),imported_at:now,active:true,dataset_year_be:r.datasetYearBe};});
assert_(retained.length+additions.length<=50000,'CAPACITY_LIMIT','ฐานรุ่นนี้จำกัด 50000 จุด ต้องแบ่งฐาน/ย้าย storage ก่อนขยายเพิ่ม');const ids={};retained.concat(additions).forEach(function(r){assert_(!ids[r.hs_id],'ID_CONFLICT','HS ID ขัดแย้ง ห้ามผูกผลตรวจข้ามเหตุการณ์');ids[r.hs_id]=true;});replaceBaseAtomically_(retained.concat(additions));const result={imported:additions.length,replaced:plan.previousCount,retained:retained.length,partitions:keys,qa:plan.qa,provinceCode:keys[0].split('|')[0]};appendLog_(actor,requestId,'nationalCommit','province-year',keys.join(','),'success',{imported:result.imported,replaced:result.replaced,retained:result.retained,partitions:keys,provinceCode:result.provinceCode});return result;});}
function nationalSourceKey_(actor,payload){nationalManager_(actor);const code=cleanText_(payload.provinceCode||actor.assignedProvinceCode);assert_(nationalAuthorized_(actor).indexOf(code)>=0,'FORBIDDEN','แหล่งข้อมูลอยู่นอกจังหวัดที่มอบหมาย');return 'NATIONAL_SOURCE_'+code;}
function nationalSetSource_(actor,requestId,payload){const key=nationalSourceKey_(actor,payload);const id=parseSpreadsheetId_(payload.url||payload.spreadsheetId);assert_(id,'VALIDATION_ERROR','ต้องระบุ Google Sheet');const data={spreadsheetId:id,revision:uuid_()};PropertiesService.getScriptProperties().setProperty(key,JSON.stringify(data));appendLog_(actor,requestId,'nationalSetSource','province',key,'success',{provinceCode:key.split('_').pop()});return {saved:true,permissionStatus:'not_checked',readStatus:'not_read',message:'บันทึกแหล่งข้อมูลแล้ว ยังไม่ได้ตรวจสิทธิ์ Google หรืออ่านข้อมูล'};}
function nationalReadSource_(actor,payload){const key=nationalSourceKey_(actor,payload),raw=PropertiesService.getScriptProperties().getProperty(key);assert_(raw,'SOURCE_NOT_CONFIGURED','ยังไม่กำหนดแหล่งข้อมูลจังหวัด');const cfg=JSON.parse(raw);let book;try{book=SpreadsheetApp.openById(cfg.spreadsheetId);}catch(e){throw new ApiError('SOURCE_PERMISSION','บัญชี Apps Script ไม่มีสิทธิ์อ่าน Google Sheet หรือหาไฟล์ไม่พบ');}let sheets=book.getSheets();const preferred=book.getSheetByName('AllData');if(preferred)sheets=[preferred];const rows=[];sheets.forEach(function(sheet){const values=sheet.getDataRange().getValues();if(values.length<2)return;const headers=values[0].map(String);const records=values.slice(1).filter(function(r){return r.some(function(v){return v!=='';});}).map(function(r){const o={};headers.forEach(function(h,i){o[h]=r[i] instanceof Date?Utilities.formatDate(r[i],'Asia/Bangkok',/^(time|acq_time|เวลา)$/i.test(h)?'HH:mm':'yyyy-MM-dd HH:mm:ss'):r[i];});return o;});if(!HSNational.detail(records)){assert_(!preferred,'SOURCE_INVALID','AllData ไม่ใช่ข้อมูลรายจุด');return;}Array.prototype.push.apply(rows,records);});assert_(rows.length>0&&rows.length<=50000,'SOURCE_SIZE','ไม่มีข้อมูลรายจุดหรือเกิน 50000 แถว ให้แบ่งแหล่งข้อมูล');return {rows:rows,sourceName:'Google Sheets',sourceRevision:cfg.revision,sourceFingerprint:sha256_(JSON.stringify(rows)),permissionStatus:'read_allowed',readStatus:'read_success'};}
function assignProvince_(actor,requestId,payload){requireSuperAdmin_(actor);return withScriptLock_(function(){const accounts=readAuthAccounts_(),key=normalizeUsername_(payload.username),account=authAccountByKey_(accounts,key),code=cleanText_(payload.assignedProvinceCode);assert_(account&&account.profile.role==='admin','VALIDATION_ERROR','ระบุบัญชี Admin ที่มีอยู่');assert_(HSNational.provinces[code],'VALIDATION_ERROR','รหัสจังหวัดไม่อยู่ในทะเบียน');account.profile.assignedProvinceCode=code;account.sessionVersion=uuid_();PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+key,JSON.stringify(account));appendLog_(actor,requestId,'assignProvince','account',key,'success',{provinceCode:code});return {username:key,assignedProvinceCode:code,sessionsRevoked:true};});}
function nationalPublicRead_(payload){
 const actor=publicReadActor_(payload);
 let rows=[];
 if(actor.selectedProvinceCode){
  const latest=latestVerificationMap_();
  rows=rowsAsObjects_(APP.SHEETS.BASE).filter(function(r){return String(r.active)!=='false'&&nationalReadActor_(actor,r);}).map(function(r){const v=latest[r.hs_id];return {hsId:r.hs_id,acquiredAt:r.acquired_at,latitude:Number(r.latitude),longitude:Number(r.longitude),province:r.province,provinceCode:nationalCode_(r),district:r.district,tambon:r.tambon,village:r.village,landType:r.land_type,plantType:r.plant_type,datasetYearBe:r.dataset_year_be,status:v?v.status:'pending',verification:v?{status:v.status,result:v.result}:null};});
 }
 return {hotspots:{items:rows},config:{version:APP.VERSION,boundaries:getBoundaryConfig_(actor),national:true,profile:{role:'public'},publicProvinceCodes:nationalPublicCodes_(),selectedProvinceCode:actor.selectedProvinceCode}};
}

// ==== TeamService.gs ====
/* Public team directory with server-authorized edits. No credentials or private profile fields. */
function getTeam_(){
  const raw=PropertiesService.getScriptProperties().getProperty('PUBLIC_TEAM_V1');
  if(raw){const value=JSON.parse(raw);assert_(Array.isArray(value.members),'CONFIG_ERROR','ข้อมูลทีมไม่ถูกต้อง');return value;}
  return {revision:0,members:[{id:'developer-kitti',name:'ดร. กิตติ  โพธิ์จวง',position:'ผู้พัฒนาระบบ',agency:'กลุ่มอารักขาพืช สำนักงานเกษตรจังหวัดกำแพงเพชร'}]};
}
function saveTeam_(actor,payload){
  requireSuperAdmin_(actor);
  const member=payload.member||{};
  const entry={id:cleanText_(member.id,80),name:cleanText_(member.name,150),position:cleanText_(member.position,200),agency:cleanText_(member.agency,250)};
  assert_(entry.id && entry.name && entry.position && entry.agency,'VALIDATION_ERROR','กรุณากรอกชื่อ ตำแหน่ง และสังกัดให้ครบ');
  const lock=LockService.getScriptLock();assert_(lock.tryLock(10000),'CONFLICT','มีผู้แก้ไขข้อมูลอยู่ กรุณาลองใหม่');
  try{
    const directory=getTeam_();assert_(Number(payload.revision)===directory.revision,'CONFLICT','ข้อมูลทีมมีการเปลี่ยนแปลง กรุณาเปิดหน้าทีมใหม่แล้วบันทึกอีกครั้ง');
    const index=directory.members.findIndex(function(item){return item.id===entry.id;});
    if(index<0){assert_(directory.members.length<20,'VALIDATION_ERROR','รองรับบุคลากรไม่เกิน20รายการ');directory.members.push(entry);}else directory.members[index]=entry;
    directory.revision+=1;
    const json=JSON.stringify(directory);assert_(Utilities.newBlob(json).getBytes().length<8500,'VALIDATION_ERROR','ข้อมูลทีมมีขนาดใหญ่เกินพื้นที่จัดเก็บ');
    PropertiesService.getScriptProperties().setProperty('PUBLIC_TEAM_V1',json);return directory;
  }finally{lock.releaseLock();}
}

// ==== RegistrationService.gs ====
/* New applicants require approval by an administrator assigned to their province. */
const REGISTRATION_PRIVACY_VERSION_ = '2026-10-v2';
function registerUser_(payload) {
  payload=payload||{};
  assert_(getRegistrationPolicy_().configured,'POLICY_NOT_CONFIGURED','ผู้ดูแลต้องตั้งข้อมูลผู้ควบคุมข้อมูล ช่องทางติดต่อ และระยะเวลาเก็บข้อมูลก่อนเปิดลงทะเบียน');
  assert_(payload.privacyAcknowledged===true && payload.privacyVersion===REGISTRATION_PRIVACY_VERSION_, 'PRIVACY_ACK_REQUIRED','กรุณาอ่านและรับทราบประกาศความเป็นส่วนตัวฉบับปัจจุบัน');
  const phone=cleanText_(payload.phone,20).replace(/[ -]/g,'');
  assert_(/^0[689][0-9]{8}$/.test(phone),'VALIDATION_ERROR','กรุณาระบุหมายเลขโทรศัพท์มือถือไทย 10 หลัก');
  const name=cleanText_(payload.fullName,120),position=cleanText_(payload.position,120),level=cleanText_(payload.agencyLevel,16),code=cleanText_(payload.provinceCode,2),district=cleanText_(payload.district,120);
  assert_(name && position && ['district','province'].indexOf(level)>=0 && HSNational.provinces[code],'VALIDATION_ERROR','กรุณาระบุชื่อ ตำแหน่ง และสังกัดให้ครบ');
  assert_(level!=='district'||district,'VALIDATION_ERROR','กรุณาระบุอำเภอที่สังกัด');
  return withScriptLock_(function(){
    if(typeof ensureRegistrationSheet_==='function')ensureRegistrationSheet_(APP.SHEETS.REGISTRATIONS);else ensureSchema_();
    registrationAdmission_();
    const accounts=readAuthAccounts_();
    const existing=authAccountByKey_(accounts,phone)||Object.keys(accounts).some(function(key){return canonicalStoredPhone_((accounts[key].profile||{}).phone)===phone;});
    assert_(!existing,'ACCOUNT_EXISTS','หมายเลขนี้ลงทะเบียนแล้ว กรุณาติดต่อผู้ดูแลหากเข้าสู่ระบบไม่ได้');
    const id=uuid_(),now=isoNow_(),agency=level==='district'?'สำนักงานเกษตรอำเภอ'+district:'สำนักงานเกษตรจังหวัด'+HSNational.provinces[code];
    const affiliation=cleanText_(payload.affiliationType,32);
    const affiliationLabels={kamnan:'กำนัน',village_head:'ผู้ใหญ่บ้าน',assistant_village_head:'ผู้ช่วยผู้ใหญ่บ้าน',volunteer:'อกม.'};
    const savedAgency=level==='district'&&affiliationLabels[affiliation]?affiliationLabels[affiliation]+' อำเภอ'+district:agency;
    const row={registration_id:id,phone:phone,full_name:name,position:position,agency_level:level,agency:savedAgency,province_code:code,district:level==='district'?district:'',privacy_version:REGISTRATION_PRIVACY_VERSION_,privacy_acknowledged_at:now,status:'pending',created_at:now,reviewed_at:'',reviewed_by:''};
    setupPhoneOnlyInspectorAccount_(phone,{displayName:name,phone:phone,assignedProvinceCode:code,agencyLevel:level,district:row.district,position:position,agency:savedAgency});
    try {appendObject_(APP.SHEETS.REGISTRATIONS,row);} catch(error) {PropertiesService.getScriptProperties().deleteProperty('AUTH_ACCOUNT_V2_'+phone);throw error;}
    return {registrationId:id,status:'pending',message:'ลงทะเบียนสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ'};
  });
}
function registrationCanManage_(actor,row){return actor.role==='super_admin'||actor.role==='admin'&&nationalAuthorized_(actor).indexOf(cleanText_(row.province_code))>=0;}
function publicRegistration_(row){const result={};APP.HEADERS[APP.SHEETS.REGISTRATIONS].forEach(function(k){result[k]=row[k]||'';});return result;}
function listRegistrations_(actor,payload){requireAdmin_(actor);const status=cleanText_(payload&&payload.status,24);return {items:rowsAsObjects_(APP.SHEETS.REGISTRATIONS).filter(function(r){return registrationCanManage_(actor,r)&&(!status||r.status===status);}).map(publicRegistration_)};}
function reviewRegistration_(actor,payload,approve){
 requireAdmin_(actor);
 return withScriptLock_(function(){
  const row=findOne_(APP.SHEETS.REGISTRATIONS,'registration_id',cleanText_(payload&&payload.registrationId,64));
  assert_(row&&registrationCanManage_(actor,row),'FORBIDDEN','ไม่พบรายการในขอบเขตจังหวัดที่รับผิดชอบ');
  assert_(row.status==='pending','CONFLICT','รายการนี้ได้รับการพิจารณาแล้ว');
  const phone=canonicalStoredPhone_(row.phone);
  assert_(rowsAsObjects_(APP.SHEETS.REGISTRATIONS).filter(function(r){return canonicalStoredPhone_(r.phone)===phone;}).length===1,'CONFLICT','พบหมายเลขโทรศัพท์ซ้ำ กรุณาตรวจสอบก่อนอนุมัติ');
  const account=authAccountByKey_(readAuthAccounts_(),phone),profile=account&&account.profile||{};
  assert_(account&&account.active===false&&account.authMethod==='phone_only'&&profile.role==='inspector'&&cleanText_(account.username,64)===canonicalStoredPhone_(row.phone)&&cleanText_(profile.phone,20)===canonicalStoredPhone_(row.phone)&&cleanText_(profile.assignedProvinceCode,2)===cleanText_(row.province_code,2)&&cleanText_(profile.agencyLevel,16)===cleanText_(row.agency_level,16)&&cleanText_(profile.district,120)===cleanText_(row.district,120),'CONFLICT','สถานะบัญชีไม่ตรงกับรายการลงทะเบียน');
  // Approver verifies the declared district/province; applicants never choose roles.
  row.phone=phone;
  row.status=approve?'approved':'rejected';row.reviewed_at=isoNow_();row.reviewed_by=actor.id;
  updateObjectRow_(APP.SHEETS.REGISTRATIONS,row._row,row);
  account.active=approve;account.sessionVersion=uuid_();
  PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+row.phone,JSON.stringify(account));
  appendLog_(actor,uuid_(),approve?'approveRegistration':'rejectRegistration','registration',row.registration_id,'success',{status:row.status});
  return {registrationId:row.registration_id,status:row.status};
 });
}
function getHsPhotos_(actor,payload){const hs=requireAccessibleHs_(actor,payload&&payload.hsId);return {items:photoMetadataForHs_(cleanText_(hs.hs_id)).filter(function(p){const v=findOne_(APP.SHEETS.VERIFICATION,'verification_id',p.verificationId);return v&&v.status==='verified';})};}

function getRegistrationPolicy_(){const props=PropertiesService.getScriptProperties(),controller=cleanText_(props.getProperty('PRIVACY_CONTROLLER'),500),contact=cleanText_(props.getProperty('PRIVACY_CONTACT'),500),retention=cleanText_(props.getProperty('PRIVACY_RETENTION'),1000);return {configured:Boolean(controller&&contact&&retention),version:REGISTRATION_PRIVACY_VERSION_,authMethod:'phone_only',registrationMode:'approval_required',noticeKind:'privacy_acknowledgement',noticeTitle:'เอกสารรับทราบการใช้ข้อมูลส่วนบุคคล',controller:controller,contact:contact,retention:retention,legalBasis:'ภารกิจเพื่อประโยชน์สาธารณะหรือการใช้อำนาจรัฐตามมาตรา 24(4) ซึ่งผู้ควบคุมข้อมูลต้องตรวจสอบว่าใช้กับภารกิจนี้ได้',purpose:'ตรวจสอบสิทธิ์และสังกัด จัดขอบเขตข้อมูล และบันทึกหลักฐานการตรวจสอบจุดความร้อน',dataCategories:'โทรศัพท์ ชื่อ ตำแหน่ง สังกัด พื้นที่รับผิดชอบ ประวัติการใช้งาน และพิกัดหรือภาพหลักฐานที่ส่ง',recipients:'เจ้าหน้าที่และผู้ดูแลที่ได้รับมอบหมายตามขอบเขตหน้าที่ และผู้ให้บริการ Google Workspace/Google Drive ตามการตั้งค่าของหน่วยงาน',rights:'ขอเข้าถึง แก้ไข ลบ จำกัด คัดค้าน หรือร้องเรียนตามเงื่อนไขกฎหมาย โดยติดต่อช่องทางที่ระบุ',acknowledgement:'การรับทราบประกาศความเป็นส่วนตัว ไม่ใช่การให้ความยินยอมแบบครอบคลุมทุกวัตถุประสงค์'};}

/* Bound anonymous registration cost before persistent writes. */
function registrationAdmission_(){
 const props=PropertiesService.getScriptProperties(),all=props.getProperties(),accounts=readAuthAccounts_();
 const configured=Number(props.getProperty('REGISTRATION_MAX_ACCOUNTS')||200),limit=Number.isInteger(configured)&&configured>=1&&configured<=500?configured:200;
 const cache=sessionCache_(),minute=Math.floor(Date.now()/60000),key='registration-rate:'+minute,count=Number(cache.get(key)||0);
 assert_(count<5,'RATE_LIMITED','มีคำขอลงทะเบียนจำนวนมาก กรุณาลองใหม่ภายหลัง');
 cache.put(key,String(count+1),120);
 const records=rowsAsObjects_(APP.SHEETS.REGISTRATIONS);
 assert_(Object.keys(accounts).length<limit&&records.length<limit,'REGISTRATION_CAPACITY','ระบบลงทะเบียนเต็มชั่วคราว กรุณาติดต่อผู้ดูแล');
 // UTF-8 bytes count conservatively; reserve at least 8KB for this account and admin operations.
 const bytes=Object.keys(all).reduce(function(total,k){return total+unescape(encodeURIComponent(k+String(all[k]))).length;},0);
 assert_(bytes+8192<400000,'REGISTRATION_CAPACITY','พื้นที่บัญชีใกล้เต็ม กรุณาติดต่อผู้ดูแล');
}

/** Read-only readiness check. Does not create accounts, change policy or disclose contact details. */
function checkRegistrationPolicyReady() {
  const policy=getRegistrationPolicy_();
  const report={version:policy.version,configured:policy.configured,controllerConfigured:Boolean(policy.controller),contactConfigured:Boolean(policy.contact),retentionConfigured:Boolean(policy.retention),noticeKind:policy.noticeKind};
  console.log(JSON.stringify(report));
  return report;
}
/** Preview/apply only matching registered inspector accounts; never activates or edits admins. */
function previewRegisteredPhoneMigration(){const report=registeredPhoneMigration_(false);console.log(JSON.stringify(report));return report;}
function applyRegisteredPhoneMigration(){return registeredPhoneMigration_(true);}
function registeredPhoneMigration_(apply){return withScriptLock_(function(){
 const accounts=readAuthAccounts_(),rows=rowsAsObjects_(APP.SHEETS.REGISTRATIONS),counts={apply:Boolean(apply),eligible:0,converted:0,skipped:0};
 rows.forEach(function(row){
  const phone=canonicalStoredPhone_(row.phone),account=authAccountByKey_(accounts,phone),profile=account&&account.profile||{};
  const matches=account&&/^0[689][0-9]{8}$/.test(phone)&&profile.role==='inspector'&&account.authMethod!=='phone_only'&&['pending','approved'].indexOf(row.status)>=0&&rows.filter(function(r){return r.phone===row.phone;}).length===1&&cleanText_(account.username,64)===phone&&cleanText_(profile.phone,20)===phone&&cleanText_(profile.assignedProvinceCode,2)===cleanText_(row.province_code,2)&&cleanText_(profile.agencyLevel,16)===cleanText_(row.agency_level,16)&&cleanText_(profile.district,120)===cleanText_(row.district,120)&&account.active===(row.status==='approved');
  if(!matches){counts.skipped++;return;}counts.eligible++;if(!apply)return;
  account.authMethod='phone_only';account.sessionVersion=uuid_();delete account.hash;delete account.salt;delete account.iterations;
  PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+phone,JSON.stringify(account));counts.converted++;
 });return counts;
});}

/* Repairs only registration cells backed by exactly one existing matching inspector account. */
function previewPhoneCellRepair(){const report=repairPhoneCells_(false);console.log(JSON.stringify(report));return report;}
function applyPhoneCellRepair(){const report=repairPhoneCells_(true);console.log(JSON.stringify(report));return report;}
function repairPhoneCells_(apply){return withScriptLock_(function(){
 const rows=rowsAsObjects_(APP.SHEETS.REGISTRATIONS),accounts=readAuthAccounts_();
 const counts={scanned:rows.length,eligible:0,repaired:0,collisions:0,skipped:0};
 rows.forEach(function(row){
  const raw=cleanText_(row.phone,20),phone=canonicalStoredPhone_(row.phone);
  if(!/^[689][0-9]{8}$/.test(raw)){counts.skipped++;return;}
  if(rows.filter(function(r){return canonicalStoredPhone_(r.phone)===phone;}).length!==1){counts.collisions++;return;}
  const account=authAccountByKey_(accounts,phone),profile=account&&account.profile||{};
  if(!account||account.username!==phone||profile.phone!==phone||profile.role!=='inspector'||profile.assignedProvinceCode!==String(row.province_code)||profile.agencyLevel!==row.agency_level||cleanText_(profile.district,120)!==cleanText_(row.district,120)||['approved','pending','rejected'].indexOf(row.status)<0||account.active!==(row.status==='approved')){counts.skipped++;return;}
  counts.eligible++;if(!apply)return;
  row.phone=phone;updateObjectRow_(APP.SHEETS.REGISTRATIONS,row._row,row);counts.repaired++;
 });return counts;
});}

// ==== MetricsService.gs ====
/* Aggregate operational counts only. Cache deduplication is best effort, never an identity log. */
const USAGE_COUNTERS_PROPERTY_ = 'USAGE_COUNTERS_V1';
function metricsDay_(){return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10);}
function readCountersState_(){
  const raw=PropertiesService.getScriptProperties().getProperty(USAGE_COUNTERS_PROPERTY_);
  if(!raw)return {totalVisits:0,totalUserDays:0,daily:{}};
  const state=JSON.parse(raw);
  assert_(state&&typeof state.daily==='object'&&!Array.isArray(state.daily),'CONFIG_ERROR','ข้อมูลสถิติไม่ถูกต้อง');
  return state;
}
function countersView_(state){
  const day=metricsDay_(),today=state.daily[day]||{visits:0,users:0};
  return {timeZone:'Asia/Bangkok',totalVisits:state.totalVisits,totalUserDays:state.totalUserDays,today:{date:day,visits:today.visits,users:today.users},daily:Object.keys(state.daily).sort().map(function(date){return {date:date,visits:state.daily[date].visits,users:state.daily[date].users};}),deduplication:'best_effort'};
}
function getCounters_(){return countersView_(readCountersState_());}
function recordVisit_(payload){
  const visitId=requireUuid_(payload&&payload.visitId,'visitId').toLowerCase();
  return recordCounter_('visits','visit:'+sha256_(visitId));
}
function recordUsage_(actor){
  assert_(actor&&actor.id&&['inspector','admin','super_admin'].indexOf(actor.role)>=0,'UNAUTHORIZED','กรุณาเข้าสู่ระบบ');
  // A secret pepper prevents guessing phone-based account identifiers from cache keys.
  ensureAuthSecrets_();
  return recordCounter_('users','user:'+tokenHash_(String(actor.username||actor.id)));
}
function recordCounter_(kind,identityKey){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return Object.assign(getCounters_(),{counted:false});
  try{
    const state=readCountersState_(),cache=sessionCache_(),day=metricsDay_();
    // Bound anonymous UUID churn to 120 cache writes / minute and 10,000 / day.
    const minuteKey='metrics-rate:'+Math.floor(Date.now()/60000),minuteCount=Number(cache.get(minuteKey)||0);
    const dayKey='metrics-budget:'+day,dayCount=Number(cache.get(dayKey)||0);
    if(minuteCount>=120||dayCount>=10000)return Object.assign(countersView_(state),{counted:false});
    const dedupeKey='metrics:'+day+':'+identityKey;
    if(cache.get(dedupeKey))return Object.assign(countersView_(state),{counted:false});
    const bucket=state.daily[day]||(state.daily[day]={visits:0,users:0});
    bucket[kind]++;
    if(kind==='visits')state.totalVisits++;else state.totalUserDays++;
    Object.keys(state.daily).sort().slice(0,-30).forEach(function(date){delete state.daily[date];});
    PropertiesService.getScriptProperties().setProperty(USAGE_COUNTERS_PROPERTY_,JSON.stringify(state));
    // Apps Script cache maximum is six hours; eviction may cause approximate overcounting.
    cache.put(dedupeKey,'1',21600);
    cache.put(minuteKey,String(minuteCount+1),120);
    cache.put(dayKey,String(dayCount+1),21600);
    return Object.assign(countersView_(state),{counted:true});
  }finally{lock.releaseLock();}
}

// ==== DatasetCacheService.gs ====
function touchHsRevision_(){PropertiesService.getScriptProperties().setProperty('HS_DATA_REVISION',uuid_());}
function getDatasetInfo_(actor){
 if(actor.role==='public')actor=publicReadActor_({provinceCode:actor.selectedProvinceCode});
 const codes=actor.role==='public'?(actor.selectedProvinceCode?[actor.selectedProvinceCode]:[]):nationalAuthorized_(actor);
 const dataset=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')||getSpreadsheet_().getId();
 const scope={dataset:sha256_(dataset),agencyLevel:actor.agencyLevel||'',tambon:actor.tambon||'',role:actor.role,id:actor.role==='public'?'public':actor.id,provinceCodes:codes,district:actor.role==='inspector'?actor.district||'':''};
 const props=PropertiesService.getScriptProperties();
 const revision=[APP.VERSION,props.getProperty('HS_DATA_REVISION')||'legacy',getRequiredSheet_(APP.SHEETS.BASE).getLastRow(),getRequiredSheet_(APP.SHEETS.VERIFICATION).getLastRow(),getRequiredSheet_(APP.SHEETS.PHOTOS).getLastRow()].join(':');
 const config=getConfig_(actor);
 if(actor.role==='public'){
  config.publicProvinceCodes=nationalPublicCodes_();
  config.selectedProvinceCode=actor.selectedProvinceCode;
 }
 return {scopeKey:sha256_(JSON.stringify(scope)),revision:revision,config:config,maxAgeSeconds:600};
}

// ==== AccountManagementService.gs ====
function listAdminAccounts_(actor){requireSuperAdmin_(actor);const accounts=readAuthAccounts_();return {items:Object.keys(accounts).map(function(k){return accounts[k];}).filter(function(a){return a.profile&&a.profile.role==='admin';}).map(function(a){return {username:a.username,displayName:a.profile.displayName,assignedProvinceCode:a.profile.assignedProvinceCode,active:a.active!==false};})};}
function createProvincialAdmin_(actor,payload){
 requireSuperAdmin_(actor);payload=payload||{};
 return withScriptLock_(function(){const key=normalizeUsername_(payload.username),accounts=readAuthAccounts_(),code=cleanText_(payload.assignedProvinceCode,2),name=cleanText_(payload.displayName,120),password=String(payload.password||'');
 assert_(!authAccountByKey_(accounts,key),'ACCOUNT_EXISTS','ชื่อผู้ใช้นี้มีอยู่แล้ว');assert_(HSNational.provinces[code]&&name,'VALIDATION_ERROR','ระบุชื่อและจังหวัดให้ครบ');assert_(password.length>=10&&password.length<=256,'VALIDATION_ERROR','รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร');assert_(Object.keys(accounts).length<500,'REGISTRATION_CAPACITY','พื้นที่บัญชีเต็ม กรุณาติดต่อผู้ดูแลระบบ');
 const result=setupPasswordAccount(key,password,{role:'admin',displayName:name,assignedProvinceCode:code,agencyLevel:'province',agency:'สำนักงานเกษตรจังหวัด'+HSNational.provinces[code]});
 appendLog_(actor,uuid_(),'createProvincialAdmin','account',key,'success',{provinceCode:code});return {created:true,profile:result.profile};});
}
function changeOwnCredentials_(actor,payload){
 requireAdmin_(actor);payload=payload||{};
 return withScriptLock_(function(){const key=normalizeUsername_(actor.username),accounts=readAuthAccounts_(),account=authAccountByKey_(accounts,key);
 assert_(account&&account.active!==false&&account.authMethod!=='phone_only','UNAUTHORIZED','กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน');
 assertLoginAllowed_(key);const candidate=passwordHash_(String(payload.currentPassword||''),account.salt,account.iterations);
 if(!secureEquals_(candidate,account.hash)){recordLoginFailure_(key);throw new ApiError('INVALID_CREDENTIALS','รหัสผ่านปัจจุบันไม่ถูกต้อง');}clearLoginFailures_(key);
 const nextKey=payload.newUsername?normalizeUsername_(payload.newUsername):key,password=String(payload.newPassword||'');
 assert_(['__proto__','prototype','constructor'].indexOf(nextKey)<0,'VALIDATION_ERROR','ชื่อผู้ใช้นี้สงวนไว้');assert_(nextKey===key||!authAccountByKey_(accounts,nextKey),'ACCOUNT_EXISTS','ชื่อผู้ใช้นี้มีอยู่แล้ว');assert_(!password||password.length>=10&&password.length<=256,'VALIDATION_ERROR','รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร');
 if(nextKey===key&&!password)return {changed:false,requiresRelogin:false};
 const updated=JSON.parse(JSON.stringify(account));updated.username=nextKey;updated.sessionVersion=uuid_();
 if(password){updated.salt=(uuid_()+uuid_()).replace(/-/g,'');updated.iterations=APP.AUTH_HASH_ITERATIONS;updated.hash=passwordHash_(password,updated.salt,updated.iterations);}
 const props=PropertiesService.getScriptProperties(),oldProperty='AUTH_ACCOUNT_V2_'+key;
 if(nextKey===key)props.setProperty(oldProperty,JSON.stringify(updated));
 else{const disabled=JSON.parse(JSON.stringify(account));disabled.active=false;disabled.sessionVersion=uuid_();props.setProperty(oldProperty,JSON.stringify(disabled));try{props.setProperty('AUTH_ACCOUNT_V2_'+nextKey,JSON.stringify(updated));}catch(error){props.setProperty(oldProperty,JSON.stringify(account));throw error;}}
 appendLog_(actor,uuid_(),'changeOwnCredentials','account',actor.id,'success',{usernameChanged:nextKey!==key,passwordChanged:Boolean(password)});return {changed:true,requiresRelogin:true};});
}

// ==== ProvincialAdminRegistration.gs ====
/* Applicant-selected password credentials live only in private Script Properties.
 * The request sheet contains declared affiliation and review history, never hashes. */
function provincialAdminPayload_(payload, allowed) {
  assert_(payload && typeof payload==='object' && !Array.isArray(payload), 'VALIDATION_ERROR', 'ข้อมูลคำขอไม่ถูกต้อง');
  assert_(Object.keys(payload).every(function(key){return allowed.indexOf(key)>=0;}), 'VALIDATION_ERROR', 'คำขอมีข้อมูลนอกแบบฟอร์มที่กำหนด');
}

function provincialAdminWorkGroup_(value) {
  const labels={plant_protection:'plant_protection',strategy_info:'strategy_info',production:'production',farmer_development:'farmer_development',other:'other',
    'กลุ่มอารักขาพืช':'plant_protection','กลุ่มยุทธศาสตร์และสารสนเทศ':'strategy_info','กลุ่มส่งเสริมและพัฒนาการผลิต':'production','กลุ่มส่งเสริมและพัฒนาเกษตรกร':'farmer_development','อื่น ๆ':'other','อื่นๆ':'other'};
  const key=cleanText_(value,120);
  return Object.prototype.hasOwnProperty.call(labels,key)?labels[key]:'';
}

function provincialAdminSeal_(row,account) {
  // Bind the whole declared identity, consent and credentials to the pending account.
  // Approval cannot silently adopt a changed request, scope, role or password hash.
  const fields=['registration_id','phone','full_name','position','work_group','work_group_other','agency','province_code','username','privacy_version','privacy_acknowledged_at','created_at'];
  return sha256_(JSON.stringify([fields.map(function(key){return String(row[key]||'');}),account.username,account.authMethod,account.salt,account.iterations,account.hash,account.profile]));
}

function provincialAdminDuplicates_(rows,accounts,phone,username) {
  return rows.some(function(row){return canonicalStoredPhone_(row.phone)===phone || cleanText_(row.username,64).toLowerCase()===username;}) ||
    Object.keys(accounts).some(function(key){const account=accounts[key],profile=account.profile||{};return key===username || canonicalStoredPhone_(key)===phone || canonicalStoredPhone_(profile.phone)===phone;});
}

function registerProvincialAdmin_(payload) {
  payload=payload||{};
  provincialAdminPayload_(payload,['phone','fullName','position','workGroup','workGroupOther','provinceCode','username','password','privacyVersion','privacyAcknowledged']);
  assert_(getRegistrationPolicy_().configured,'POLICY_NOT_CONFIGURED','ผู้ดูแลต้องตั้งข้อมูลประกาศความเป็นส่วนตัวก่อนเปิดลงทะเบียน');
  assert_(payload.privacyAcknowledged===true && payload.privacyVersion===REGISTRATION_PRIVACY_VERSION_,'PRIVACY_ACK_REQUIRED','กรุณาอ่านและรับทราบประกาศความเป็นส่วนตัวฉบับปัจจุบัน');
  const phone=cleanText_(payload.phone,20).replace(/[ -]/g,''),name=cleanText_(payload.fullName,120),position=cleanText_(payload.position,120);
  const code=String(payload.provinceCode||'').trim(),group=provincialAdminWorkGroup_(payload.workGroup),other=group==='other'?cleanText_(payload.workGroupOther,200):'';
  assert_(String(payload.username||'').trim().length<=64,'VALIDATION_ERROR','ชื่อผู้ใช้ต้องไม่เกิน 64 ตัวอักษร');
  const username=normalizeUsername_(payload.username),password=payload.password==null?'':String(payload.password);
  assert_(/^0[689][0-9]{8}$/.test(phone)&&name&&position&&group&&/^\d{2}$/.test(code)&&Object.prototype.hasOwnProperty.call(HSNational.provinces,code),'VALIDATION_ERROR','กรุณาระบุโทรศัพท์ ชื่อ ตำแหน่ง กลุ่มงาน และจังหวัดให้ครบ');
  assert_(group!=='other'||other,'VALIDATION_ERROR','กรุณาระบุกลุ่มงานอื่น');
  assert_(['__proto__','prototype','constructor'].indexOf(username)<0,'VALIDATION_ERROR','ชื่อผู้ใช้นี้สงวนไว้');
  assert_(password.length>=10&&password.length<=256,'VALIDATION_ERROR','รหัสผ่านใหม่ต้องมี 10-256 ตัวอักษร');
  return withScriptLock_(function(){
    if(typeof ensureRegistrationSheet_==='function')ensureRegistrationSheet_(APP.SHEETS.ADMIN_REGISTRATIONS);else ensureSchema_();
    registrationAdmission_();
    const rows=rowsAsObjects_(APP.SHEETS.ADMIN_REGISTRATIONS),accounts=readAuthAccounts_();
    assert_(!provincialAdminDuplicates_(rows,accounts,phone,username) && !rowsAsObjects_(APP.SHEETS.REGISTRATIONS).some(function(row){return canonicalStoredPhone_(row.phone)===phone;}),'ACCOUNT_EXISTS','ชื่อผู้ใช้หรือหมายเลขนี้ลงทะเบียนแล้ว กรุณาติดต่อผู้ดูแล');
    // Account capacity is shared with inspector registration; history also has a bound.
    const configured=Number(PropertiesService.getScriptProperties().getProperty('REGISTRATION_MAX_ACCOUNTS')||200),limit=Number.isInteger(configured)&&configured>=1&&configured<=500?configured:200;
    assert_(rows.length<limit,'REGISTRATION_CAPACITY','ระบบลงทะเบียนเต็มชั่วคราว กรุณาติดต่อผู้ดูแล');
    ensureAuthSecrets_();
    const id=uuid_(),now=isoNow_(),agency='สำนักงานเกษตรจังหวัด'+HSNational.provinces[code];
    const row={registration_id:id,phone:phone,full_name:name,position:position,work_group:group,work_group_other:other,agency:agency,province_code:code,username:username,privacy_version:REGISTRATION_PRIVACY_VERSION_,privacy_acknowledged_at:now,status:'pending',created_at:now,reviewed_at:'',reviewed_by:''};
    const salt=(uuid_()+uuid_()).replace(/-/g,''),account={username:username,authMethod:'password',salt:salt,iterations:APP.AUTH_HASH_ITERATIONS,hash:passwordHash_(password,salt,APP.AUTH_HASH_ITERATIONS),sessionVersion:uuid_(),active:false,
      profile:{inspectorId:'account:'+username,displayName:name,role:'admin',assignedProvinceCode:code,agencyLevel:'province',phone:phone,district:'',tambon:'',personCategory:'',personCategoryOther:'',position:position,agency:agency,workGroup:group,workGroupOther:other}};
    account.adminRegistrationId=id;account.adminRegistrationSeal=provincialAdminSeal_(row,account);
    const props=PropertiesService.getScriptProperties(),key='AUTH_ACCOUNT_V2_'+username;
    props.setProperty(key,JSON.stringify(account));
    try {appendObject_(APP.SHEETS.ADMIN_REGISTRATIONS,row);} catch(error) {props.deleteProperty(key);throw error;}
    return {registrationId:id,status:'pending',message:'ลงทะเบียนสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ (Super Admin)'};
  });
}

function listProvincialAdminRequests_(actor,payload) {
  requireSuperAdmin_(actor);
  if(typeof ensureRegistrationSheet_==='function')ensureRegistrationSheet_(APP.SHEETS.ADMIN_REGISTRATIONS);
  const status=cleanText_(payload&&payload.status,24);
  return {items:rowsAsObjects_(APP.SHEETS.ADMIN_REGISTRATIONS).filter(function(row){return !status||row.status===status;}).map(function(row){
    const result={};APP.HEADERS[APP.SHEETS.ADMIN_REGISTRATIONS].forEach(function(key){result[key]=row[key]||'';});return result;
  })};
}

function reviewProvincialAdminRequest_(actor,payload,approve) {
  requireSuperAdmin_(actor);provincialAdminPayload_(payload,['registrationId']);
  const id=cleanText_(payload.registrationId,64);
  return withScriptLock_(function(){
    const rows=rowsAsObjects_(APP.SHEETS.ADMIN_REGISTRATIONS),matches=rows.filter(function(row){return row.registration_id===id;});
    assert_(matches.length===1,'CONFLICT','ไม่พบคำขอที่ไม่ซ้ำ');
    const row=matches[0],accounts=readAuthAccounts_(),key=normalizeUsername_(row.username),account=authAccountByKey_(accounts,key),profile=account&&account.profile||{},phone=canonicalStoredPhone_(row.phone);
    assert_(row.status==='pending','CONFLICT','รายการนี้ได้รับการพิจารณาแล้ว');
    assert_(rows.filter(function(other){return canonicalStoredPhone_(other.phone)===phone||cleanText_(other.username,64).toLowerCase()===key;}).length===1,'CONFLICT','พบคำขอซ้ำ กรุณาตรวจสอบก่อนอนุมัติ');
    assert_(account&&account.active===false&&account.authMethod==='password'&&profile.role==='admin'&&account.username===key&&account.adminRegistrationId===id&&
      profile.phone===phone&&profile.assignedProvinceCode===String(row.province_code)&&profile.agencyLevel==='province'&&!profile.district&&!profile.tambon&&
      account.adminRegistrationSeal===provincialAdminSeal_(row,account),'CONFLICT','บัญชีหรือข้อมูลคำขอเปลี่ยนแล้ว กรุณาตรวจสอบก่อนอนุมัติ');
    assert_(!Object.keys(accounts).some(function(otherKey){return otherKey!==key&&canonicalStoredPhone_((accounts[otherKey].profile||{}).phone)===phone;}) &&
      !rowsAsObjects_(APP.SHEETS.REGISTRATIONS).some(function(other){return canonicalStoredPhone_(other.phone)===phone;}),'CONFLICT','พบหมายเลขโทรศัพท์ซ้ำกับบัญชีอื่น');
    const before=Object.assign({},row);row.status=approve?'approved':'rejected';row.reviewed_at=isoNow_();row.reviewed_by=actor.id;
    // Persist the reviewed request first. A failed account write must never grant access.
    updateObjectRow_(APP.SHEETS.ADMIN_REGISTRATIONS,row._row,row);
    account.active=approve;account.sessionVersion=uuid_();
    try {PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+key,JSON.stringify(account));}
    catch(error){updateObjectRow_(APP.SHEETS.ADMIN_REGISTRATIONS,before._row,before);throw error;}
    appendLog_(actor,uuid_(),approve?'approveProvincialAdminRequest':'rejectProvincialAdminRequest','admin_registration',id,'success',{status:row.status});
    return {registrationId:id,status:row.status};
  });
}

// ==== Code.gs ====
function doGet() {
  return outputJson_({ok: false, requestId: '', error: {code: 'METHOD_NOT_ALLOWED', message: 'ใช้ POST พร้อม token เท่านั้น'}});
}

function doPost(event) {
  if(typeof beginRepositoryRequest_==='function')beginRepositoryRequest_();
  let requestId = '', requestAction = '';
  try {
    const raw = event && event.postData ? String(event.postData.contents || '') : '';
    assert_(raw.length > 0 && raw.length <= APP.MAX_BODY_CHARS, 'INVALID_REQUEST', 'คำขอว่างหรือมีขนาดใหญ่เกินไป');
    const envelope = parseJsonObject_(raw);
    requestId = cleanText_(envelope.requestId, 64);
    const action = cleanText_(envelope.action, 64);requestAction=action;
    assert_(action, 'INVALID_REQUEST', 'ต้องระบุ action');
    const payload = envelope.payload == null ? {} : envelope.payload;
    assert_(payload && typeof payload === 'object' && !Array.isArray(payload), 'INVALID_REQUEST', 'payload ต้องเป็น object');
    if (action === 'getCounters') return outputJson_({ok:true,requestId:requestId,data:getCounters_()});
    if (action === 'recordVisit') return outputJson_({ok:true,requestId:requestId,data:recordVisit_(payload)});
    if (action === 'getRegistrationPolicy') return outputJson_({ok:true,requestId:requestId,data:getRegistrationPolicy_()});
    if (action === 'register') return outputJson_({ok:true,requestId:requestId,data:registerUser_(payload)});
    if (action === 'registerProvincialAdmin') return outputJson_({ok:true,requestId:requestId,data:registerProvincialAdmin_(payload)});
    if (action === 'getTeam') return outputJson_({ok:true,requestId:requestId,data:getTeam_()});
    if (action === 'login') {
      return outputJson_({ok: true, requestId: requestId, data: login_(payload)});
    }
    if (action === 'loginPhone') {
      return outputJson_({ok: true, requestId: requestId, data: loginPhone_(payload)});
    }
    if(action==='getDatasetInfo'&&!envelope.token)return outputJson_({ok:true,requestId:requestId,data:getDatasetInfo_(publicReadActor_(payload))});
    if(typeof nationalPublicRead_==='function' && action==='bootstrap' && !envelope.token)return outputJson_({ok:true,requestId:requestId,data:nationalPublicRead_(payload)});
    const actor = authenticate_(envelope.token);
    if(typeof nationalCsrf_==='function')nationalCsrf_(envelope);
    if (action === 'recordUsage') return outputJson_({ok:true,requestId:requestId,data:recordUsage_(actor)});
    if (action === 'logout') {
      return outputJson_({ok: true, requestId: requestId, data: logoutSession_(envelope.token)});
    }
    const data = dispatch_(actor, action, requestId, payload);
    return outputJson_({ok: true, requestId: requestId, data: data});
  } catch (error) {
    console.warn(JSON.stringify({event:'api_error',action:requestAction,code:error&&error.code||'INTERNAL_ERROR',version:APP.VERSION}));
    return outputJson_({ok: false, requestId: requestId, error: publicError_(error)});
  }
}

function dispatch_(actor, action, requestId, payload) {
  if(typeof nationalGuard_==='function')nationalGuard_(actor,action);
  const mutationActions = ['saveVerification', 'verifyHS', 'uploadPhoto', 'syncSource', 'importSource', 'setConfig', 'importRows'];
  if (mutationActions.indexOf(action) >= 0) requestId = requireUuid_(requestId, 'requestId');
  switch (action) {
    case 'getDatasetInfo':return getDatasetInfo_(actor);
    case 'listAdminAccounts':return listAdminAccounts_(actor);
    case 'listProvincialAdminRequests':return listProvincialAdminRequests_(actor,payload);
    case 'approveProvincialAdminRequest':return reviewProvincialAdminRequest_(actor,payload,true);
    case 'rejectProvincialAdminRequest':return reviewProvincialAdminRequest_(actor,payload,false);
    case 'createProvincialAdmin':return createProvincialAdmin_(actor,payload);
    case 'changeOwnCredentials':return changeOwnCredentials_(actor,payload);
    case 'getBoundaryConfig':return getBoundaryConfig_(actor);
    case 'getMyProfile':return {profile:actor};
    case 'listRegistrations':return listRegistrations_(actor,payload);
    case 'approveRegistration':return reviewRegistration_(actor,payload,true);
    case 'rejectRegistration':return reviewRegistration_(actor,payload,false);
    case 'getHSPhotos':return getHsPhotos_(actor,payload);
    case 'nationalPreview':return nationalPreview_(actor,payload);
    case 'nationalReadSource':return nationalReadSource_(actor,payload);
    case 'nationalCommit':return nationalCommit_(actor,requireUuid_(requestId,'requestId'),payload);
    case 'nationalSetSource':return nationalSetSource_(actor,requireUuid_(requestId,'requestId'),payload);
    case 'assignProvince':return assignProvince_(actor,requireUuid_(requestId,'requestId'),payload);
    case 'saveTeam':
      requireUuid_(requestId,'requestId');
      return saveTeam_(actor,payload);
    case 'getConfig':
    case 'status':
      return getConfig_(actor);
    case 'bootstrap':
    case 'read':
      return {
        config: getConfig_(actor),
        filters: {
          districts: locationValues_(actor, {}, 'district'),
          tambons: payload.filters && payload.filters.district ? locationValues_(actor, {district: payload.filters.district}, 'tambon') : [],
          villages: payload.filters && payload.filters.district && payload.filters.tambon ? locationValues_(actor, {district: payload.filters.district, tambon: payload.filters.tambon}, 'village') : []
        },
        summary: summaries_(actor, payload),
        hotspots: allHs_(actor, payload)
      };
    case 'listHS':
      return listHs_(actor, payload);
    case 'getHS':
      return getHs_(actor, payload);
    case 'getDistricts':
      return {items: locationValues_(actor, payload, 'district')};
    case 'getTambons':
      return {items: locationValues_(actor, payload, 'tambon')};
    case 'getVillages':
      return {items: locationValues_(actor, payload, 'village')};
    case 'summaries':
      return summaries_(actor, payload);
    case 'saveVerification':
    case 'verifyHS':
      return saveVerification_(actor, requestId, payload);
    case 'uploadPhoto':
      return uploadPhoto_(actor, requestId, payload);
    case 'getPhoto':
      return getPhoto_(actor, payload);
    case 'qa':
      return qa_(actor);
    case 'log':
      return readLog_(actor, payload);
    case 'export':
      return exportCsv_(actor, payload);
    case 'syncSource':
    case 'importSource':
      return syncSource_(actor, requestId);
    case 'previewImportRows':
      return previewImportRows_(actor, payload);
    case 'importRows':
      return importRows_(actor, requestId, payload);
    case 'setConfig':
      return setConfig_(actor, requestId, payload);
    default:
      throw new ApiError('UNKNOWN_ACTION', 'ไม่รู้จัก action: ' + action);
  }
}

// ==== Setup.gs ====
/* Run from the Apps Script editor only. Contains IDs, never passwords. */
function setupDatabaseConnection() {
  const props = PropertiesService.getScriptProperties();
  const expected = {
    SPREADSHEET_ID: '1pUDEiOunwraALqknLUT0VYVVSDmpTSZkS4O-ePA-9WQ',
    PHOTO_FOLDER_ID: '1oUbGXBetamsQH2US9F08Kl1mKOeOg1im'
  };
  Object.keys(expected).forEach(function(key) {
    const old = props.getProperty(key);
    assert_(!old || old === expected[key], 'CONFIG_CONFLICT', 'มีค่า ' + key + ' ของระบบอื่นอยู่แล้ว กรุณาตรวจสอบก่อน');
  });
  const book = SpreadsheetApp.openById(expected.SPREADSHEET_ID);
  DriveApp.getFolderById(expected.PHOTO_FOLDER_ID).getName();
  props.setProperties(expected);
  if (!props.getProperty('PRIVACY_CONTROLLER')) props.setProperty('PRIVACY_CONTROLLER','สำนักงานเกษตรจังหวัด / กรมส่งเสริมการเกษตร');
  book.setSpreadsheetTimeZone('Asia/Bangkok');
  initializeBackend();
  return checkDatabaseReady();
}

function setupInitialLoginAccounts() {
  const result = setupRequestedLoginAccounts();
  const accounts = readAuthAccounts_();
  const key = normalizeUsername_('620000');
  const account = authAccountByKey_(accounts, key);
  account.profile.assignedProvinceCode = '62';
  account.sessionVersion = uuid_();
  PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_' + key, JSON.stringify(account));
  return {configured: result.configured, adminProvinceCode: '62', note: 'ตั้งบัญชีและลบ bootstrap passwords แล้ว ไม่ต้องรันซ้ำ'};
}

function checkDatabaseReady() {
  ensureSchema_();
  const props = PropertiesService.getScriptProperties();
  const counts = {};
  Object.keys(APP.HEADERS).forEach(function(name) {
    counts[name] = Math.max(0, getRequiredSheet_(name).getLastRow() - 1);
  });
  return {
    schemaReady: true,
    rows: counts,
    photoFolderConfigured: Boolean(props.getProperty('PHOTO_FOLDER_ID')),
    loginAccounts: Object.keys(readAuthAccounts_()).length,
    note: 'ผลนี้ตรวจโครงสร้างเท่านั้น ต้อง deploy และทดสอบ API/อัปโหลดภาพจริงก่อนใช้งานภาคสนาม'
  };
}

/** Applies only the privacy settings explicitly supplied by the system owner. */
function setupApprovedPrivacyPolicy() {
  const props=PropertiesService.getScriptProperties();
  props.setProperties({
    PRIVACY_CONTROLLER:'สำนักงานเกษตรจังหวัดกำแพงเพชร / กรมส่งเสริมการเกษตร',
    PRIVACY_CONTACT:'kamphaengphet.doae@gmail.com',
    PRIVACY_RETENTION:'ตามนโยบายและข้อกำหนดของหน่วยงาน สำนักงานเกษตรจังหวัดกำแพงเพชร'
  });
  return checkRegistrationPolicyReady();
}

function backupRegistrationBeforePhoneRepair(){
 const book=getSpreadsheet_(),sheet=getRequiredSheet_(APP.SHEETS.REGISTRATIONS);
 const name='Backup_User_Registration_'+Utilities.formatDate(new Date(),'Asia/Bangkok','yyyyMMdd_HHmmss')+'_'+uuid_().slice(0,4);
 sheet.copyTo(book).setName(name);const result={backupSheet:name,rows:Math.max(0,sheet.getLastRow()-1)};console.log(JSON.stringify(result));return result;
}
function checkRuntimeV26(){
 const policy=getRegistrationPolicy_(),result={version:APP.VERSION,registrationMode:policy.registrationMode,privacyConfigured:policy.configured,cacheScopeValidation:true,personalAdminAccounts:true,phoneRepair:repairPhoneCells_(false)};
 console.log(JSON.stringify(result));return result;
}

/** Adds only the provincial request sheet; does not create/approve accounts or change credentials. */
function setupRuntimeV27(){
 beginRepositoryRequest_();ensureRegistrationSheet_(APP.SHEETS.ADMIN_REGISTRATIONS);
 return checkRuntimeV27();
}
function checkRuntimeV27(){
 beginRepositoryRequest_();const policy=getRegistrationPolicy_();
 const result={version:APP.VERSION,privacyConfigured:policy.configured,registrationMode:policy.registrationMode,provincialAdminApproval:'super_admin_only',adminRequestsSheetReady:Boolean(getSpreadsheet_().getSheetByName(APP.SHEETS.ADMIN_REGISTRATIONS)),requestLocalReadMemo:true};
 console.log(JSON.stringify(result));return result;
}

/** Read-only diagnostic: no schema/account/data mutations. */
function checkRuntimeV28(){
 beginRepositoryRequest_();const policy=getRegistrationPolicy_(),empty=nationalPublicRead_({});
 const result={version:APP.VERSION,privacyConfigured:policy.configured,publicRequiresProvince:true,unselectedPublicHs:empty.hotspots.items.length,teamEditorRole:'super_admin',provinceAdminScope:true};
 console.log(JSON.stringify(result));return result;
}

/** Read-only registration readiness: no identity details, account writes or approvals. */
function diagnoseRegistrationReadinessV29(){
 beginRepositoryRequest_();const p=PropertiesService.getScriptProperties(),a=p.getProperties(),accounts=readAuthAccounts_(),book=getSpreadsheet_();
 const r={version:APP.VERSION,policyReady:getRegistrationPolicy_().configured,accountCount:Object.keys(accounts).length,propertyBytes:Object.keys(a).reduce(function(n,k){return n+unescape(encodeURIComponent(k+String(a[k]))).length;},0),accountLimit:Number(p.getProperty('REGISTRATION_MAX_ACCOUNTS')||200),superAdminApprovalLevels:['inspector','provincial_admin'],sheets:[]};
 [APP.SHEETS.REGISTRATIONS,APP.SHEETS.ADMIN_REGISTRATIONS].forEach(function(name){const sheet=book.getSheetByName(name),head=APP.HEADERS[name];r.sheets.push({name:name,exists:!!sheet,rows:sheet?Math.max(0,sheet.getLastRow()-1):0,headersMatch:!!sheet&&sheet.getRange(1,1,1,head.length).getDisplayValues()[0].join('|')===head.join('|')});});console.log(JSON.stringify(r));return r;
}
