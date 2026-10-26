/* In-memory Google Apps Script services for testing apps-script/*.gs in Node. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

class Range {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) {
        const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class Sheet {
  constructor(name, data) { this.name = name; this.data = data || []; }
  set(row, col, v) {
    while (this.data.length < row) this.data.push([]);
    const line = this.data[row - 1];
    while (line.length < col) line.push('');
    // Like the Sheets UI/API, unprefixed text that looks like a date or number is converted;
    // a leading apostrophe forces text and is not stored.
    if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(v)) v = new Date(v.length === 10 ? v + 'T00:00:00+07:00' : v.replace(' ', 'T') + '+07:00');
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    line[col - 1] = v;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length; i > 0; i--) if ((this.data[i - 1] || []).some(v => v !== '' && v != null)) return i;
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, l) => { let w = 0; l.forEach((v, i) => { if (v !== '' && v != null) w = i + 1; }); return Math.max(m, w); }, 0); }
  getMaxRows() { return 1000; }
  getMaxColumns() { return this.maxCols || 26; }
  insertColumnsAfter(after, n) { this.maxCols = (this.maxCols || 26) + n; }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(values) { const row = this.getLastRow() + 1; values.forEach((v, i) => this.set(row, i + 1, v)); }
  deleteRow(row) { this.data.splice(row - 1, 1); }
  setFrozenRows() {}
}

class Spreadsheet {
  constructor(sheets = {}) { this.sheets = Object.entries(sheets).map(([n, d]) => new Sheet(n, d)); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

function bytesToSigned(buf) { return Array.from(buf, b => (b > 127 ? b - 256 : b)); }
function toBuffer(v) { return Array.isArray(v) ? Buffer.from(v.map(b => b & 255)) : Buffer.from(String(v), 'utf8'); }

function createContext({ sources = {}, now = () => new Date() } = {}) {
  const db = new Spreadsheet();
  const books = Object.assign({}, sources);
  const props = {};
  const cache = new Map();
  const files = new Map();
  let fileSeq = 0;
  const folder = name => ({
    name,
    getFoldersByName: n => { let done = false; return { hasNext: () => !done && false, next: () => { done = true; } }; },
    createFolder: n => folder(n),
    createFile: blob => { const id = 'F' + (++fileSeq); files.set(id, { blob, trashed: false }); return { getId: () => id }; }
  });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Logger: { log() {} },
    SpreadsheetApp: {
      openById: id => {
        if (id === ctx.DB_ID_FOR_TEST) return db;
        if (books[id]) return books[id];
        throw new Error('no spreadsheet ' + id);
      },
      getActiveSpreadsheet: () => db
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      setProperties: o => Object.entries(o).forEach(([k, v]) => { props[k] = String(v); })
    }) },
    CacheService: { getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => cache.set(k, String(v)),
      putAll: o => Object.entries(o).forEach(([k, v]) => cache.set(k, String(v))),
      getAll: keys => Object.fromEntries(keys.filter(k => cache.has(k)).map(k => [k, cache.get(k)])),
      remove: k => cache.delete(k)
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      getFolderById: id => folder(id),
      getFileById: id => {
        const f = files.get(id); if (!f) throw new Error('no file');
        return { setTrashed: t => { f.trashed = t; }, getBlob: () => ({ getBytes: () => f.blob.bytes }) };
      }
    },
    ContentService: { createTextOutput: t => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, v) => bytesToSigned(crypto.createHash('sha256').update(toBuffer(v)).digest()),
      computeHmacSha256Signature: (text, key) => bytesToSigned(crypto.createHmac('sha256', String(key)).update(String(text)).digest()),
      base64EncodeWebSafe: v => toBuffer(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: s => bytesToSigned(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      base64Encode: v => toBuffer(v).toString('base64'),
      base64Decode: s => bytesToSigned(Buffer.from(String(s), 'base64')),
      newBlob: (data, mime, name) => Array.isArray(data)
        ? { bytes: data, mime, name, getDataAsString: () => toBuffer(data).toString('utf8') }
        : { bytes: bytesToSigned(Buffer.from(String(data))), getDataAsString: () => String(data) },
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, fmt) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
          .formatToParts(d).map(x => [x.type, x.value]));
        return fmt.replace("'T'", 'T').replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day)
          .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
      }
    }
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', '..', 'apps-script');
  const order = ['Config.gs', 'Utils.gs', 'Db.gs', 'Setup.gs', 'Audit.gs', 'Auth.gs', 'Accounts.gs', 'Hotspots.gs', 'Verification.gs', 'Code.gs'];
  const all = fs.readdirSync(dir).filter(f => f.endsWith('.gs') && f !== 'Secrets.example.gs');
  for (const f of all) if (!order.includes(f)) throw new Error('test loader missing ' + f);
  // Top-level const/let stay in the script scope; expose what tests need.
  const code = order.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n')
    + "\nvar INIT_SUPER_USER='root', INIT_SUPER_PASSWORD='password-123', INIT_MINISUPER_PHONE='0811111111', INIT_MINISUPER_PROVINCE='62', INIT_MINISUPER_NAME='หัวหน้าจังหวัด';"
    + '\nthis.__api={handle_,doGet,doPost,setup,readAll_,resetRequestCache_,publicHotspots_,copyAccountsFromRiskMap,DB_ID,DEFAULT_SOURCE_ID};';
  vm.runInContext(code, ctx, { filename: 'apps-script.gs' });
  ctx.DB_ID_FOR_TEST = ctx.__api.DB_ID;
  return { ctx, db, api: ctx.__api, props, files, cache };
}

module.exports = { createContext, Spreadsheet, Sheet };
