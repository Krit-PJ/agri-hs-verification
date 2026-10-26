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
  const current = sh.getLastColumn() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), width)).getValues()[0].map(String) : [];
  // เพิ่มเฉพาะหัวคอลัมน์ที่ขาด ไม่สลับลำดับคอลัมน์เดิม
  if (!current.filter(String).length) sh.getRange(1, 1, 1, width).setValues([headers]);
  else headers.forEach(h => { if (current.indexOf(h) < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue(h); });
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
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
  return String(v);
}

function findRow_(name, fn) { return readAll_(name).find(fn) || null; }

function appendObj_(name, obj) {
  const sh = sheet_(name);
  const header = headerOf_(sh);
  sh.appendRow(header.map(h => safeCell_(obj[h])));
  delete ROWS_CACHE_[name];
}

function updateRow_(name, rowNum, patch) {
  const sh = sheet_(name);
  const header = headerOf_(sh);
  const range = sh.getRange(rowNum, 1, 1, header.length);
  const row = range.getValues()[0];
  header.forEach((h, i) => { if (Object.prototype.hasOwnProperty.call(patch, h)) row[i] = safeCell_(patch[h]); });
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
