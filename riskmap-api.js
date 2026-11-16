/*
 * จุดความร้อนจากระบบ Agri-Risk Map Burning
 *  1) สำเนาที่เผยแพร่พร้อมเว็บ (data/hs/ — GitHub อัปเดตทุกวัน 09:00 และ 12:00 น.) → เปิดเร็ว ไม่เรียก API
 *  2) ปุ่ม "อัปเดตข้อมูล" → อ่านสดจาก API (action=api&fn=hotspots) แล้วจำไว้ในเบราว์เซอร์ (IndexedDB)
 *  3) ไม่มีสำเนาของประเภทนั้น → อ่านสดจาก API อัตโนมัติ
 * ใช้ชุดที่ใหม่กว่าระหว่างสำเนากับที่จำไว้ในเบราว์เซอร์ · API รับครั้งละ 1 ประเภทพื้นที่ จึงขอแยกประเภทแบบขนาน
 */
var HSRiskApi = (() => {
  const TIMEOUT = 90000, INDEX_TTL = 10 * 60 * 1000, DB = 'hsverify-hs', STORE = 'lands';
  const memo = new Map();          // province|land → { at, rows } ในหน้านี้
  let indexMemo = null;

  const lastDay = month => { const [y, m] = month.split('-').map(Number); return month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); };
  const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

  /** แปลง columns + rows (รูปแบบเดียวกับ fn=hotspots) เป็นแถวของหน้าเว็บ */
  function toRows(payload, province) {
    const cols = payload.columns || [];
    const at = name => cols.indexOf(name);
    const pick = (r, name) => (at(name) >= 0 ? r[at(name)] : '');
    const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return (payload.rows || []).map(r => ({
      hsId: txt(pick(r, 'id')), provinceCode: String(province), date: txt(pick(r, 'date')).slice(0, 10), time: txt(pick(r, 'time')),
      districtCode: txt(pick(r, 'districtCode')), subdistrictCode: txt(pick(r, 'subdistrictCode')),
      district: txt(pick(r, 'district')), tambon: txt(pick(r, 'subdistrict')), village: txt(pick(r, 'village')),
      plantType: txt(pick(r, 'plantType')) || 'ไม่ระบุ', landType: txt(pick(r, 'landType')),
      lat: Number(pick(r, 'lat')), lng: Number(pick(r, 'lng')),
      status: 'pending', result: '', inspectedDate: '', photoCount: 0
    })).filter(r => r.hsId && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  }

  async function getJson(url, fetcher, init) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetcher(url, Object.assign({ credentials: 'omit', signal: ctrl.signal }, init || {}));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? 'ตอบช้าเกินไป' : err.message);
    } finally { clearTimeout(timer); }
  }

  /* ---------- IndexedDB (จำข้อมูลที่ผู้ใช้กดอัปเดตไว้ในเครื่อง) — ใช้ไม่ได้ก็ข้ามไป ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(resolve => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    return dbp;
  }
  async function idbGet(key) {
    const d = await db(); if (!d) return null;
    return new Promise(resolve => { try { const r = d.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); } catch (_) { resolve(null); } });
  }
  async function idbPut(key, value) {
    const d = await db(); if (!d) return;
    try { d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key); } catch (_) {}
  }

  /** ดัชนีสำเนา data/hs/index.json (ไม่มี = ใช้ API สด) */
  async function snapshotIndex(base, fetcher) {
    if (indexMemo && Date.now() - indexMemo.t < INDEX_TTL) return indexMemo.v;
    let v = null;
    try { v = await getJson(base + 'index.json', fetcher, { cache: 'no-cache' }); } catch (_) { v = null; }
    indexMemo = { t: Date.now(), v };
    return v;
  }

  /** อ่านสดจาก API ทุกช่วงเวลาของประเภทนั้น แล้วจำไว้ */
  async function live(api, province, land, from, fetcher) {
    if (!api) throw new Error('ยังไม่ได้ตั้งค่า API ระบบ Agri-Risk Map');
    const url = api + '?' + new URLSearchParams({ action: 'api', fn: 'hotspots', province, land, from: from || '2020-01-01', to: today(), format: 'json' });
    let body;
    try { body = await getJson(url, fetcher, { cache: 'no-store' }); }
    catch (err) { throw new Error('อ่าน API ระบบ Agri-Risk Map ไม่สำเร็จ: ' + err.message); }
    if (!body.ok) throw new Error('API ระบบ Agri-Risk Map: ' + (body.error || 'ไม่ทราบสาเหตุ'));
    if (String(body.land || '') !== land) throw new Error('API ไม่รองรับประเภทพื้นที่ “' + land + '”');
    const entry = { at: new Date().toISOString(), rows: toRows(body, province), via: 'live' };
    await idbPut(province + '|' + land, entry);
    return entry;
  }

  /** ข้อมูลทั้งชุดของ 1 จังหวัด × 1 ประเภทพื้นที่ */
  async function landData(o, province, land) {
    const key = province + '|' + land;
    if (!o.force && memo.has(key)) return memo.get(key);
    let entry;
    if (o.force) entry = await live(o.api, province, land, o.from, o.fetcher);
    else {
      const [index, local] = await Promise.all([snapshotIndex(o.snapshotBase, o.fetcher), idbGet(key)]);
      const meta = index && index.provinces && index.provinces[province] && index.provinces[province].lands && index.provinces[province].lands[land];
      if (meta && (!local || String(meta.at) >= String(local.at))) {
        try {
          const body = await getJson(o.snapshotBase + meta.file + '?at=' + encodeURIComponent(meta.at), o.fetcher);
          entry = { at: meta.at, rows: toRows(body, province), via: 'snapshot' };
        } catch (_) { entry = null; }
      }
      if (!entry && local) entry = Object.assign({}, local, { via: 'local' });
      if (!entry) entry = await live(o.api, province, land, o.from, o.fetcher);
    }
    memo.set(key, entry);
    return entry;
  }

  /**
   * จุด HS ของจังหวัด ตามประเภทพื้นที่ (1 ประเภทหรือมากกว่า) และช่วงเดือน YYYY-MM ถึง YYYY-MM
   * opts: { force: อ่านสดจาก API, snapshotBase: 'data/hs/', from: วันแรกของข้อมูลจังหวัด, fetcher }
   * คืนค่า { rows, at: เวลาข้อมูลที่เก่าที่สุดในชุดที่ใช้, via: snapshot | live | local | mixed }
   */
  async function load(api, province, lands, start, end, opts) {
    const o = Object.assign({ snapshotBase: 'data/hs/', fetcher: (u, i) => fetch(u, i) }, opts || {}, { api });
    if (!/^\d{2}$/.test(province)) throw new Error('รหัสจังหวัดไม่ถูกต้อง');
    if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) throw new Error('ช่วงเวลาไม่ถูกต้อง');
    const parts = await Promise.all(lands.map(land => landData(o, province, land)));
    const seen = new Set(), rows = [];
    parts.forEach(p => p.rows.forEach(r => {
      const m = r.date.slice(0, 7);
      if (m < start || m > end || seen.has(r.hsId)) return;
      seen.add(r.hsId);
      rows.push(Object.assign({}, r));
    }));
    const ats = parts.map(p => String(p.at || '')).filter(Boolean).sort();
    const vias = [...new Set(parts.map(p => p.via))];
    return { rows, at: ats[0] || '', via: vias.length === 1 ? vias[0] : 'mixed' };
  }

  return { load, toRows, lastDay, clear: () => { memo.clear(); indexMemo = null; } };
})();
if (typeof module === 'object') module.exports = HSRiskApi;
