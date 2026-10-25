import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [html, js] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'app.js'), 'utf8')
]);

test('live requests use the Apps Script JSON envelope over text/plain', () => {
  assert.match(js, /'Content-Type':'text\/plain;charset=UTF-8'/);
  assert.match(js, /JSON\.stringify\(envelope\)/);
  assert.doesNotMatch(js, /no-cors/);
});

test('credentials are session-only while endpoint may persist', () => {
  assert.match(js, /sessionStorage\.setItem\(SESSION_TOKEN/);
  assert.doesNotMatch(js, /localStorage\.setItem\(SESSION_TOKEN/);
});

test('verification covers server results and explicit no-GPS route', () => {
  for (const value of ['burned','not_burned','not_found','needs_review']) assert.match(html, new RegExp(`value="${value}"`));
  assert.match(html, /id="noGps"/);
  assert.match(html, /id="actionInput"/);
  assert.match(js, /missingGpsReason/);
});

test('configured live failures do not silently load the demo seed', () => {
  const liveBranch = js.slice(js.indexOf('async function loadData'), js.indexOf('function extractRows'));
  assert.match(liveBranch, /api\('bootstrap'/);
  assert.match(liveBranch, /else \{[\s\S]*HSData\.loadRiskDataset/);
});

test('navigation points to the official published risk map', () => {
  assert.match(html, /href="https:\/\/krit-pj\.github\.io\/TH-Agri-Risk-Maps-Burning\/"/);
});

// Execute actual pure frontend functions against the backend wire shape.
import vm from 'node:vm';
const sandbox = {document:{addEventListener(){}},localStorage:{getItem(){return null}},sessionStorage:{getItem(){return null}},Intl,crypto:globalThis.crypto};
vm.createContext(sandbox);
vm.runInContext(js.replace(/\}\)\(\);\s*$/, 'globalThis.contract={extractRows,normalizeHS,deriveYear,deriveMonth};})();'), sandbox);
test('bootstrap wire collection is extracted and source names normalize',()=>{
 const rows=sandbox.contract.extractRows({hotspots:{items:[{hsId:'HS-1',acquiredAt:'2026-01-01T00:00:00+07:00',district:'คลองขลุง',latitude:16,longitude:99,plantType:'นาข้าว'}]}});
 assert.equal(rows.length,1); assert.equal(sandbox.contract.normalizeHS(rows[0]).district,'คลองขลุง');
});
test('year/month filters use Thailand date near UTC midnight',()=>{
 assert.equal(sandbox.contract.deriveYear('2025-12-31T18:00:00Z'),'2569');
 assert.equal(sandbox.contract.deriveMonth('2025-12-31T18:00:00Z'),1);
});
