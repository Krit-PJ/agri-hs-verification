import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const report = require('../report.js');
const [html, js] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8')
]);

test('admin controls are behind a real server login gate', () => {
  assert.match(html, /id="adminLoginGate"/);
  assert.match(html, /id="adminProtected" hidden/);
  assert.doesNotMatch(html, /id="loginEndpoint"/);
  assert.match(html, /id="loginPassword" type="password"[^>]+autocomplete="current-password"/);
  assert.doesNotMatch(html, /id="adminToken"/);
  assert.doesNotMatch(html, /บัญชีตัวอย่าง|รหัสผ่านตัวอย่าง/);
  assert.match(js, /api\('login',\{username,password\}\)/);
  assert.match(js, /api\('logout',\{\}\)/);
  assert.match(js, /dom\.loginPassword\.value=''/);
  assert.doesNotMatch(js, /(?:localStorage|sessionStorage)\.setItem\([^\n]*password/i);
});

test('role-based admin surface separates management from QA and reports', () => {
  assert.match(html, /id="serverSettingsCard"[^>]+data-super-admin-only[^>]+hidden/);
  assert.match(html, /id="workspaceSettingsCard"[^>]+data-super-admin-only[^>]+hidden/);
  assert.match(html, /id="fileImportCard"[^>]+data-super-admin-only[^>]+hidden/);
  assert.match(html, /data-admin-action="sync"[^>]+data-super-admin-only/);
  assert.match(html, /data-admin-action="qa"/);
  assert.match(html, /data-admin-action="export"/);
  assert.match(html, /data-admin-action="print"/);
  assert.doesNotMatch(html, /data-admin-action="import"/);
});

test('agency marks and explicit browser print action are available', () => {
  assert.match(html, /assets\/logo-doae\.png" alt="ตรากรมส่งเสริมการเกษตร"/);
  assert.match(html, /assets\/logo-kpp\.png" alt="ตราประจำจังหวัดกำแพงเพชร"/);
  assert.match(html, /id="printReportButton"[^>]*>พิมพ์รายงาน \/ บันทึก PDF/);
  assert.doesNotMatch(js, /window\.print\(/);
});

test('print report includes scoped totals and escaped verification/source rows', () => {
  const rows = [{
    hsId:'<img src=x onerror=alert(1)>', acquiredAt:'2026-02-01T08:00:00+07:00',
    province:'กำแพงเพชร', district:'คลองขลุง', tambon:'วังแขม', village:'หมู่ 2',
    landType:'เกษตร', plantType:'อ้อย', latitude:16.1, longitude:99.2, status:'verified',
    verification:{result:'burned',fieldInspectorName:'นาย <script>bad()</script>',inspectedAt:'2026-02-02T09:00:00+07:00',notes:'ตรวจแล้ว & ยืนยัน'}
  }];
  const model = report.reportModel(rows,{district:'คลองขลุง',year:'2569'});
  assert.deepEqual(model,{total:1,verified:1,burned:1,notBurned:0,followup:0,pending:0,drafts:0,scope:'คลองขลุง',year:'2569'});
  const output = report.buildReportHtml({rows,filters:{district:'คลองขลุง',year:'2569'},sourceLabel:'ชุดกลาง'});
  assert.match(output,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(output,/นาย &lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(output,/ตรวจแล้ว &amp; ยืนยัน/);
  assert.match(output,/พิมพ์ \/ บันทึก PDF/);
  assert.doesNotMatch(output,/<script>bad\(\)<\/script>/);
});

test('report builder ignores credential-shaped fields outside the allowlist', () => {
  const output = report.buildReportHtml({rows:[{hsId:'HS-1',status:'pending',password:'secret-value',token:'token-value',endpoint:'https://private.example'}]});
  assert.doesNotMatch(output,/secret-value|token-value|private\.example/);
});
