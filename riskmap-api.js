/*
 * อ่านจุดความร้อนจาก API ระบบ Agri-Risk Map Burning (action=api&fn=hotspots)
 * — แหล่ง HS เดียวกับเว็บ Risk Map: ข้อมูล AGENCY, ประเภทพื้นที่ (landType) และนโยบายดาวเทียมเดียวกัน
 * API รับประเภทพื้นที่ครั้งละ 1 ประเภท จึงขอแยกทีละประเภทแบบขนาน (ขอ "all" ทีเดียวช้ากว่ามาก)
 */
var HSRiskApi = (() => {
  const TIMEOUT = 60000, TTL = 5 * 60 * 1000;
  const memo = new Map();

  const lastDay = month => { const [y, m] = month.split('-').map(Number); return month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); };

  /** แปลงผลลัพธ์ fn=hotspots (columns + rows) เป็นแถวของหน้าเว็บ */
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

  async function fetchOne(base, province, land, start, end, force, fetcher) {
    const url = base + '?' + new URLSearchParams({ action: 'api', fn: 'hotspots', province, land, from: start + '-01', to: lastDay(end), format: 'json' });
    const hit = memo.get(url);
    if (!force && hit && Date.now() - hit.at < TTL) return hit.rows;
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetcher(url, { cache: 'no-store', credentials: 'omit', signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'ไม่ทราบสาเหตุ');
      if (String(body.land || '') !== land) throw new Error('API ไม่รองรับประเภทพื้นที่ “' + land + '”');
      const rows = toRows(body, province);
      memo.set(url, { at: Date.now(), rows });
      return rows;
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? 'API ระบบ Agri-Risk Map ตอบช้าเกินไป' : 'อ่าน API ระบบ Agri-Risk Map ไม่สำเร็จ: ' + err.message);
    } finally { clearTimeout(timer); }
  }

  /** จุด HS ของจังหวัด ตามประเภทพื้นที่ (1 ประเภทหรือมากกว่า) และช่วงเดือน YYYY-MM ถึง YYYY-MM */
  async function load(base, province, lands, start, end, opts) {
    opts = opts || {};
    if (!base) throw new Error('ยังไม่ได้ตั้งค่า API ระบบ Agri-Risk Map');
    if (!/^\d{2}$/.test(province)) throw new Error('รหัสจังหวัดไม่ถูกต้อง');
    if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) throw new Error('ช่วงเวลาไม่ถูกต้อง');
    const parts = await Promise.all(lands.map(land => fetchOne(base, province, land, start, end, opts.force, opts.fetcher || fetch)));
    const seen = new Set(), rows = [];
    parts.flat().forEach(r => { if (!seen.has(r.hsId)) { seen.add(r.hsId); rows.push(r); } });
    return rows;
  }

  return { load, toRows, lastDay, clear: () => memo.clear() };
})();
if (typeof module === 'object') module.exports = HSRiskApi;
