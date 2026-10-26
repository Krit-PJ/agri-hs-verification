'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');
const HSSheetSource = require('../sheet-source.js');
const { bundle, target, ORDER } = require('../scripts/bundle-apps-script.js');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const apiPayload = {
  province: '62', fields: ['hotspotId', 'date', 'time', 'districtCode', 'subdistrictCode', 'districtName', 'subdistrictName', 'village', 'plantType', 'lat', 'lng'],
  rows: [
    ['A', '2025-09-30', '13:20', '6201', '620101', 'เมือง', 'ในเมือง', 'บ้านหนึ่ง', 'นาข้าว', 16.4, 99.5],
    ['B', '2025-10-02', '', '6201', '620102', 'เมือง', 'ไตรตรึงษ์', 'บ้านสอง', 'อ้อย', 16.5, 99.6],
    ['C', '2026-03-15', '', '6204', '620403', 'ขาณุ', 'ยางสูง', 'บ้านสาม', 'นาข้าว', 16.1, 99.8],
    ['D', '2026-08-26', '', '6204', '620403', 'ขาณุ', 'ยางสูง', 'บ้านสาม', '', 16.2, 99.9]
  ],
  status: { B: ['verified', 'burned', '2026-01-01', 2], C: ['verified', 'not_burned', '2026-04-01', 0], D: ['draft', '', '', 0] }
};

test('fromApi merges verification status into source rows', () => {
  const rows = C.fromApi(apiPayload);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.status), ['pending', 'verified', 'verified', 'draft']);
  assert.equal(rows[1].result, 'burned');
  assert.equal(rows[1].photoCount, 2);
  assert.equal(rows[3].plantType, 'ไม่ระบุ');
});

test('fiscal year and default period follow Oct–Sep Thai fiscal year', () => {
  assert.equal(C.fiscalYear('2025-09-30'), 2568);
  assert.equal(C.fiscalYear('2025-10-02'), 2569);
  const rows = C.fromApi(apiPayload);
  assert.deepEqual(C.defaultPeriod(rows), { start: '2025-10', end: '2026-08' });
  assert.equal(C.monthLabel('2025-10'), 'ต.ค. 2568');
  assert.equal(C.thaiDate('2026-03-15'), '15 มี.ค. 2569');
});

test('filters and summaries', () => {
  const rows = C.fromApi(apiPayload);
  const inPeriod = C.applyFilters(rows, { start: '2025-10', end: '2026-08' });
  assert.deepEqual(inPeriod.map(r => r.hsId), ['B', 'C', 'D']);
  assert.deepEqual(C.applyFilters(rows, { district: 'ขาณุ', result: 'not_burned' }).map(r => r.hsId), ['C']);
  assert.deepEqual(C.applyFilters(rows, { search: 'ไตรตรึงษ์' }).map(r => r.hsId), ['B']);
  const t = C.tally(inPeriod);
  assert.equal(t.verified, 2); assert.equal(t.burned, 1); assert.equal(t.draft, 1); assert.equal(t.progress, 66.7);
  const g = C.groupSummary(inPeriod, 'amphoe');
  assert.deepEqual(g.map(x => [x.area, x.total, x.verified]), [['ขาณุ', 2, 1], ['เมือง', 1, 1]]);
});

test('CSV export neutralises spreadsheet formulas and escapes quotes', () => {
  const csv = C.toCsv([{ label: 'a', key: 'a' }, { label: 'b', key: 'b' }], [{ a: '=HYPERLINK("x")', b: '-12.5' }]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.endsWith(',-12.5'));
});

test('phone normalisation matches the backend rule (lost leading zero restored)', () => {
  assert.equal(C.normalizePhone('81-234-5678'), '0812345678');
  assert.equal(C.normalizePhone('+66 81 234 5678'), '0812345678');
  assert.equal(C.validPhone('0812345678'), true);
  assert.equal(C.validPhone('12345'), false);
});

test('UI permission helper mirrors the role definitions', () => {
  const sup = { role: 'superadmin', prov: '*' }, mini = { role: 'minisuper', prov: '62' }, admin = { role: 'admin', prov: '62' };
  assert.equal(C.can(sup, 'record', { province: '51' }), true);
  assert.equal(C.can(mini, 'record', { province: '51' }), false);
  assert.equal(C.can(admin, 'record', { province: '62' }), true);
  assert.equal(C.can(admin, 'manage'), false);
  assert.equal(C.can(mini, 'manage'), true);
  assert.equal(C.can(mini, 'manageMini'), false);
  assert.equal(C.can(admin, 'deleteVerification', { province: '62' }), false);
  assert.equal(C.can(mini, 'deleteVerification', { province: '62' }), true);
  assert.equal(C.can(null, 'record', { province: '62' }), false);
});

test('public fallback reader parses the HS_xx tab of the source sheet', () => {
  const body = { status: 'ok', table: { cols: ['hotspotId', 'date', 'time', 'districtCode', 'subdistrictCode', 'districtName', 'subdistrictName', 'village', 'plantType', 'lat', 'lng'].map(label => ({ label })),
    rows: [{ c: ['X1', '2026-01-02', '', '6201', '620101', 'เมือง', 'ในเมือง', 'บ้าน', 'นาข้าว', 16.4, 99.5].map(v => ({ v })) }] } };
  const res = HSSheetSource.decode('/*O_o*/google.visualization.Query.setResponse(' + JSON.stringify(body) + ');', '62', C.PROVINCES);
  const rows = C.fromSheetSource(res.rows);
  assert.equal(rows[0].hsId, 'X1');
  assert.equal(rows[0].date, '2026-01-02');
  assert.equal(rows[0].status, 'pending');
});

test('index.html wires every script that exists and no removed v2 module', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
  for (const s of scripts) assert.ok(fs.existsSync(path.join(root, s)), 'missing ' + s);
  for (const old of ['national-ui.js', 'registration-ui.js', 'preview-mode.js', 'data-source.js']) assert.ok(!html.includes(old), old);
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate element ids');
  const js = read('app.js') + read('admin.js');
  const used = [...js.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]);
  const dynamic = new Set(['regDays', 'accDetails', 'boundaryDistrictOn', 'boundarySubdistrictOn', 'boundaryFit', 'mapLocate', 'reqStatus', 'accSearch', 'accCancel', 'accountForm', 'accId', 'accPhone', 'accName', 'accPosition', 'accAffiliation', 'accProvince', 'accRole', 'accFormTitle', 'recProv', 'recMine', 'recCache', 'recExport', 'auditFilter', 'auditExport', 'settingsForm']);
  for (const id of used) assert.ok(ids.includes(id) || dynamic.has(id), 'app/admin reference unknown id ' + id);
});

test('site-config contains no credentials', () => {
  const cfg = read('site-config.js');
  assert.ok(!/password|secret|token/i.test(cfg.replace(/รหัสผ่าน/g, '')));
});

test('the single-file Apps Script bundle is up to date', () => {
  assert.equal(fs.readFileSync(target, 'utf8'), bundle(), 'run: npm run bundle');
  for (const f of fs.readdirSync(path.join(root, 'apps-script')).filter(f => f.endsWith('.gs') && f !== 'Secrets.example.gs')) assert.ok(ORDER.includes(f), f + ' missing from bundle order');
});
