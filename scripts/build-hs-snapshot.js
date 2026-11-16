#!/usr/bin/env node
/*
 * สร้างสำเนาจุดความร้อน (snapshot) จาก API ระบบ Agri-Risk Map Burning ไว้กับหน้าเว็บ
 *   node scripts/build-hs-snapshot.js <โฟลเดอร์ปลายทาง เช่น _site/data/hs>
 *
 * - ขอข้อมูลทีละจังหวัด × ประเภทพื้นที่ (API รับครั้งละ 1 ประเภท) ทุกเดือนที่มีข้อมูล
 * - จังหวัดที่ต้นทางไม่เปลี่ยน (updatedAt เท่าเดิม) ใช้ไฟล์ชุดที่เผยแพร่อยู่แล้ว ไม่เรียก API ซ้ำ
 * - ขอไม่สำเร็จ: ลองใหม่ 3 ครั้ง แล้วใช้ไฟล์ชุดเดิม · ไม่มีชุดเดิม → ไม่สร้างไฟล์นั้น (หน้าเว็บอ่าน API สดแทน)
 * ข้อมูลเป็นข้อมูลสาธารณะชุดเดียวกับที่ API เปิดอยู่ (ไม่มีผลตรวจ ชื่อผู้ใช้ หรือภาพ)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const API = process.env.RISK_API || 'https://script.google.com/macros/s/AKfycbzAgSOxgQsaOx9bqBYM53KXFzk1QKsop46HZeINgtUzLXkaZTYYaZH3RZu0l-HDlN8TKA/exec';
const SITE = process.env.SITE_URL || 'https://krit-pj.github.io/agri-hs-verification/';
const LAND_TYPES = ['พื้นที่เกษตร', 'เขต สปก.', 'ป่าสงวนแห่งชาติ', 'ป่าอนุรักษ์', 'ชุมชนและอื่น ๆ', 'พื้นที่ริมทางหลวง'];
const CONCURRENCY = 3, TIMEOUT = 180000, RETRIES = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fileOf = (code, i) => code + '/' + i + '.json';

async function getJson(url, fetcher) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetcher(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function withRetry(fn, label, log) {
  let last;
  for (let i = 0; i < RETRIES; i++) {
    try { return await fn(); } catch (err) { last = err; log('  ! ' + label + ' ครั้งที่ ' + (i + 1) + ': ' + err.message); await sleep(4000 * (i + 1)); }
  }
  throw last;
}

/** สร้าง snapshot — คืนค่า index ที่เขียน (ใช้ใน test ผ่าน fetcher จำลอง) */
async function build(outDir, opts = {}) {
  const fetcher = opts.fetcher || fetch, log = opts.log || console.log;
  const api = opts.api || API, site = opts.site || SITE;
  fs.mkdirSync(outDir, { recursive: true });
  const prov = await withRetry(() => getJson(api + '?action=api&fn=provinces&format=json', fetcher), 'provinces', log);
  const list = Array.isArray(prov.rows) ? prov.rows : prov.provinces;
  if (!prov.ok || !Array.isArray(list)) throw new Error('API provinces ไม่ถูกต้อง');
  let prev = null;
  try { prev = await getJson(site + 'data/hs/index.json?ts=' + Date.now(), fetcher); } catch (_) { prev = null; }
  const index = { generatedAt: new Date().toISOString(), source: 'API ระบบ Agri-Risk Map Burning (fn=hotspots)', landTypes: LAND_TYPES, provinces: {} };
  const jobs = [];
  for (const p of list) {
    const code = String(p.code);
    if (!/^\d{2}$/.test(code)) continue;
    const before = prev && prev.provinces && prev.provinces[code];
    const same = before && before.updatedAt && before.updatedAt === p.updatedAt;
    index.provinces[code] = { name: p.name, first: p.first, last: p.last, updatedAt: p.updatedAt, lands: {} };
    LAND_TYPES.forEach((land, i) => jobs.push({ code, land, i, p, reuse: same && before.lands && before.lands[land] }));
  }
  let next = 0, fetched = 0, reused = 0, missing = 0;
  const writeFile = (job, body, at) => {
    const rel = fileOf(job.code, job.i);
    fs.mkdirSync(path.join(outDir, job.code), { recursive: true });
    // ตัดคอลัมน์ importedAt (หน้าเว็บไม่ใช้) ให้ไฟล์เล็กลง
    const drop = (body.columns || []).indexOf('importedAt');
    const columns = drop < 0 ? body.columns : body.columns.filter((_, k) => k !== drop);
    const rows = drop < 0 ? body.rows : body.rows.map(r => r.filter((_, k) => k !== drop));
    fs.writeFileSync(path.join(outDir, rel), JSON.stringify({ province: job.code, land: job.land, at, columns, rows }));
    index.provinces[job.code].lands[job.land] = { file: rel, count: body.rows.length, at };
  };
  const fromPrevious = async job => {
    const old = prev && prev.provinces && prev.provinces[job.code] && prev.provinces[job.code].lands && prev.provinces[job.code].lands[job.land];
    if (!old) return false;
    const body = await getJson(site + 'data/hs/' + old.file + '?ts=' + Date.now(), fetcher);
    writeFile(job, body, old.at || body.at);
    return true;
  };
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        if (job.reuse && await fromPrevious(job).catch(() => false)) { reused++; continue; }
        const from = String(job.p.first || '2020-01-01').slice(0, 10), to = String(job.p.last || new Date().toISOString()).slice(0, 10);
        const url = api + '?' + new URLSearchParams({ action: 'api', fn: 'hotspots', province: job.code, land: job.land, from, to, format: 'json' });
        const body = await withRetry(async () => {
          const b = await getJson(url, fetcher);
          if (!b.ok) throw new Error(b.error || 'API ตอบไม่สำเร็จ');
          if (String(b.land) !== job.land) throw new Error('API ไม่รองรับประเภท ' + job.land);
          return b;
        }, 'HS_' + job.code + ' ' + job.land, log);
        writeFile(job, body, new Date().toISOString());
        fetched++;
        log('  ✓ HS_' + job.code + ' ' + job.land + ' ' + body.rows.length + ' จุด');
      } catch (err) {
        const ok = await fromPrevious(job).catch(() => false);
        if (ok) { reused++; log('  ↺ HS_' + job.code + ' ' + job.land + ' ใช้ชุดเดิม (' + err.message + ')'); }
        else { missing++; log('  ✗ HS_' + job.code + ' ' + job.land + ' ไม่มีข้อมูล (หน้าเว็บจะอ่าน API สด): ' + err.message); }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  index.stats = { fetched, reused, missing };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  log('snapshot: ดึงใหม่ ' + fetched + ' · ใช้ชุดเดิม ' + reused + ' · ขาด ' + missing + ' ไฟล์');
  return index;
}

module.exports = { build, LAND_TYPES, fileOf };
if (require.main === module) {
  build(process.argv[2] || '_site/data/hs').catch(err => {
    // ไม่ให้การสร้าง snapshot ล้มเหลวแล้วหยุดการเผยแพร่เว็บ: เขียน index ว่าง หน้าเว็บจะอ่าน API สด
    console.error('snapshot ล้มเหลว: ' + err.message);
    const out = process.argv[2] || '_site/data/hs';
    fs.mkdirSync(out, { recursive: true });
    if (!fs.existsSync(path.join(out, 'index.json'))) fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ generatedAt: null, error: err.message, provinces: {} }));
  });
}
