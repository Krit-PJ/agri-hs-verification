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
