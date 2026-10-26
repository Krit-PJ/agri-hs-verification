/* ระบบตรวจสอบจุดความร้อน v3 — ฟังก์ชันข้อมูลล้วน (ไม่แตะ DOM) ใช้ได้ทั้งในเบราว์เซอร์และ Node test */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HSCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROVINCES = {"10":"กรุงเทพมหานคร","11":"สมุทรปราการ","12":"นนทบุรี","13":"ปทุมธานี","14":"พระนครศรีอยุธยา","15":"อ่างทอง","16":"ลพบุรี","17":"สิงห์บุรี","18":"ชัยนาท","19":"สระบุรี","20":"ชลบุรี","21":"ระยอง","22":"จันทบุรี","23":"ตราด","24":"ฉะเชิงเทรา","25":"ปราจีนบุรี","26":"นครนายก","27":"สระแก้ว","30":"นครราชสีมา","31":"บุรีรัมย์","32":"สุรินทร์","33":"ศรีสะเกษ","34":"อุบลราชธานี","35":"ยโสธร","36":"ชัยภูมิ","37":"อำนาจเจริญ","38":"บึงกาฬ","39":"หนองบัวลำภู","40":"ขอนแก่น","41":"อุดรธานี","42":"เลย","43":"หนองคาย","44":"มหาสารคาม","45":"ร้อยเอ็ด","46":"กาฬสินธุ์","47":"สกลนคร","48":"นครพนม","49":"มุกดาหาร","50":"เชียงใหม่","51":"ลำพูน","52":"ลำปาง","53":"อุตรดิตถ์","54":"แพร่","55":"น่าน","56":"พะเยา","57":"เชียงราย","58":"แม่ฮ่องสอน","60":"นครสวรรค์","61":"อุทัยธานี","62":"กำแพงเพชร","63":"ตาก","64":"สุโขทัย","65":"พิษณุโลก","66":"พิจิตร","67":"เพชรบูรณ์","70":"ราชบุรี","71":"กาญจนบุรี","72":"สุพรรณบุรี","73":"นครปฐม","74":"สมุทรสาคร","75":"สมุทรสงคราม","76":"เพชรบุรี","77":"ประจวบคีรีขันธ์","80":"นครศรีธรรมราช","81":"กระบี่","82":"พังงา","83":"ภูเก็ต","84":"สุราษฎร์ธานี","85":"ระนอง","86":"ชุมพร","90":"สงขลา","91":"สตูล","92":"ตรัง","93":"พัทลุง","94":"ปัตตานี","95":"ยะลา","96":"นราธิวาส"};
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const RESULT_LABELS = { burned: 'พบการเผา', not_burned: 'ไม่พบการเผา', not_found: 'ไม่พบจุด', needs_review: 'ต้องตรวจซ้ำ', inaccessible: 'เข้าตรวจสอบไม่ได้' };
  const STATUS_LABELS = { pending: 'รอตรวจ', draft: 'งานร่าง', verified: 'ตรวจแล้ว' };
  const ROLE_LABELS = { superadmin: 'Super Admin', minisuper: 'Mini Super Admin', admin: 'Admin', public: 'ผู้ใช้ทั่วไป', system: 'ระบบ' };
  const ROLE_DESCRIPTIONS = {
    superadmin: 'จัดการได้ทั้งระบบ ทุกจังหวัด',
    minisuper: 'อนุมัติ/อนุญาตเจ้าหน้าที่ภายในจังหวัด และบันทึก แก้ไข เพิ่ม ลบ ข้อมูลระดับจังหวัด',
    admin: 'ผู้บันทึกข้อมูลผลตรวจจุดความร้อน (HS) ในจังหวัดของตน'
  };
  const COLORS = { pending: '#e3651d', draft: '#2677ad', burned: '#cb2c29', not_burned: '#18845d', not_found: '#687976', needs_review: '#7a5ab5', inaccessible: '#596579' };
  const PERSON_CATEGORIES = ['นักวิชาการส่งเสริมการเกษตร', 'กำนัน', 'ผู้ใหญ่บ้าน', 'ผู้ช่วยผู้ใหญ่บ้าน', 'อกม.', 'อื่นๆ'];

  const clean = v => String(v == null ? '' : v).trim();

  function normalizePhone(v) {
    let s = String(v == null ? '' : v).replace(/\D/g, '');
    if (s.startsWith('66') && s.length === 11) s = '0' + s.slice(2);
    if (s.length === 9 && s[0] !== '0') s = '0' + s;
    return s;
  }
  const validPhone = s => /^0\d{8,9}$/.test(s);

  /** แปลงข้อมูลจาก API (fields + rows + status) เป็นแถวที่หน้าเว็บใช้ */
  function fromApi(payload) {
    const f = payload.fields || [];
    const idx = name => f.indexOf(name);
    const status = payload.status || {};
    const code = String(payload.province || '');
    return (payload.rows || []).map(r => {
      const id = String(r[idx('hotspotId')]);
      const s = status[id] || [];
      return {
        hsId: id, provinceCode: code, date: String(r[idx('date')] || ''), time: String(r[idx('time')] || ''),
        districtCode: String(r[idx('districtCode')] || ''), subdistrictCode: String(r[idx('subdistrictCode')] || ''),
        district: clean(r[idx('districtName')]), tambon: clean(r[idx('subdistrictName')]), village: clean(r[idx('village')]),
        plantType: clean(r[idx('plantType')]) || 'ไม่ระบุ', lat: Number(r[idx('lat')]), lng: Number(r[idx('lng')]),
        status: s[0] || 'pending', result: s[1] || '', inspectedDate: s[2] || '', photoCount: Number(s[3]) || 0
      };
    });
  }

  /** แปลงจาก HSSheetSource (อ่าน Google Sheet สาธารณะโดยตรง เมื่อยังไม่ตั้งค่า API) */
  function fromSheetSource(rows) {
    return (rows || []).map(r => ({
      hsId: String(r.hsId), provinceCode: String(r.provinceCode || ''), date: String(r.acquiredAt || '').slice(0, 10), time: clean(r.time),
      districtCode: '', subdistrictCode: '', district: clean(r.district), tambon: clean(r.tambon), village: clean(r.village),
      plantType: clean(r.plantType) || 'ไม่ระบุ', lat: Number(r.latitude), lng: Number(r.longitude),
      status: 'pending', result: '', inspectedDate: '', photoCount: 0
    }));
  }

  /** ปีงบประมาณ พ.ศ. (ต.ค.–ก.ย.) */
  function fiscalYear(date) {
    const m = /^(\d{4})-(\d{2})/.exec(String(date || ''));
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]);
    return (mo >= 10 ? y + 1 : y) + 543;
  }
  const monthKey = date => String(date || '').slice(0, 7);
  function monthLabel(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
    return m ? MONTHS_SHORT[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543) : '';
  }
  function thaiDate(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
    return m ? Number(m[3]) + ' ' + MONTHS_SHORT[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543) : '—';
  }
  function thaiDateTime(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
    return m ? thaiDate(value) + ' ' + m[4] + ':' + m[5] + ' น.' : thaiDate(value);
  }

  /** ช่วงข้อมูลเริ่มต้น = ต.ค. ของปีงบประมาณล่าสุดที่มีข้อมูล ถึงเดือนล่าสุดที่มีข้อมูล (เหมือนระบบแผนที่ความเสี่ยง) */
  function defaultPeriod(rows) {
    const months = rows.map(r => monthKey(r.date)).filter(Boolean).sort();
    if (!months.length) return { start: '', end: '' };
    const end = months[months.length - 1];
    const [y, m] = end.split('-').map(Number);
    const startYear = m >= 10 ? y : y - 1;
    const start = startYear + '-10';
    return { start: start < months[0] ? months[0] : start, end };
  }

  function monthsBetween(rows) {
    return Array.from(new Set(rows.map(r => monthKey(r.date)).filter(Boolean))).sort();
  }

  function applyFilters(rows, f) {
    f = f || {};
    const q = clean(f.search).toLowerCase();
    return rows.filter(r => (!f.start || monthKey(r.date) >= f.start)
      && (!f.end || monthKey(r.date) <= f.end)
      && (!f.district || r.district === f.district)
      && (!f.tambon || r.tambon === f.tambon)
      && (!f.village || r.village === f.village)
      && (!f.crop || r.plantType === f.crop)
      && (!f.status || r.status === f.status)
      && (!f.result || r.result === f.result)
      && (!q || [r.hsId, r.district, r.tambon, r.village, r.plantType].join(' ').toLowerCase().includes(q)));
  }

  function distinct(rows, key, where) {
    return Array.from(new Set(rows.filter(r => !where || where(r)).map(r => r[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  }

  function tally(rows) {
    const t = { total: rows.length, pending: 0, draft: 0, verified: 0, burned: 0, not_burned: 0, followup: 0 };
    rows.forEach(r => {
      t[r.status] = (t[r.status] || 0) + 1;
      if (r.status === 'verified') {
        if (r.result === 'burned') t.burned++;
        else if (r.result === 'not_burned') t.not_burned++;
        else t.followup++;
      }
    });
    t.progress = t.total ? Math.round(t.verified / t.total * 1000) / 10 : 0;
    return t;
  }

  /** สรุปแยกตามพื้นที่: level = province | amphoe | tambon | village */
  function groupSummary(rows, level) {
    const keyOf = r => level === 'province' ? (PROVINCES[r.provinceCode] || r.provinceCode || 'ทั้งจังหวัด')
      : level === 'tambon' ? [r.district, r.tambon].filter(Boolean).join(' › ') || 'ไม่ระบุ'
      : level === 'village' ? [r.district, r.tambon, r.village].filter(Boolean).join(' › ') || 'ไม่ระบุ'
      : r.district || 'ไม่ระบุ';
    const groups = new Map();
    rows.forEach(r => { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    return Array.from(groups, ([area, items]) => Object.assign({ area }, tally(items)))
      .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, 'th'));
  }

  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(headers, rows) {
    return '﻿' + [headers.map(h => csvCell(h.label)).join(',')]
      .concat(rows.map(r => headers.map(h => csvCell(typeof h.value === 'function' ? h.value(r) : r[h.key])).join(','))).join('\r\n');
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  }

  function distanceM(lat1, lng1, lat2, lng2) {
    if (![lat1, lng1, lat2, lng2].every(x => Number.isFinite(Number(x)))) return null;
    const R = 6371000, rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  /** เรียงจุดตามระยะจากตำแหน่งผู้ใช้ (ม.) — ใช้กับโหมด “จุดใกล้ฉัน” */
  function byDistance(rows, lat, lng) {
    return rows.map(r => Object.assign({}, r, { distance: distanceM(lat, lng, r.lat, r.lng) }))
      .sort((a, b) => (a.distance == null ? Infinity : a.distance) - (b.distance == null ? Infinity : b.distance));
  }
  function formatDistance(m) {
    if (m == null || !Number.isFinite(m)) return '';
    return m < 1000 ? m.toLocaleString('th-TH') + ' ม.' : (m / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + ' กม.';
  }

  /** จัดกลุ่มเดือนตามปีงบประมาณ (ใหม่ → เก่า) สำหรับ <optgroup> */
  function fiscalGroups(months) {
    const groups = new Map();
    months.slice().sort().reverse().forEach(m => {
      const fy = fiscalYear(m + '-01');
      if (!groups.has(fy)) groups.set(fy, []);
      groups.get(fy).push(m);
    });
    return Array.from(groups, ([year, list]) => ({ year, months: list.sort() }));
  }

  /** สิทธิ์ฝั่งหน้าเว็บ (ใช้แสดง/ซ่อนปุ่มเท่านั้น — เซิร์ฟเวอร์ตรวจสิทธิ์จริงทุกคำสั่ง) */
  function can(user, what, ctx) {
    if (!user) return false;
    const role = user.role, own = p => role === 'superadmin' || String(p) === String(user.prov);
    switch (what) {
      case 'record': return own(ctx && ctx.province);
      case 'manage': return role === 'superadmin' || role === 'minisuper';
      case 'manageMini': return role === 'superadmin';
      case 'settings': return role === 'superadmin';
      case 'chooseProvince': return role === 'superadmin';
      case 'deleteVerification': return role === 'superadmin' || (role === 'minisuper' && own(ctx && ctx.province));
      default: return false;
    }
  }

  function uuid() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    (globalThis.crypto || require('crypto').webcrypto).getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  return {
    PROVINCES, MONTHS, MONTHS_SHORT, RESULT_LABELS, STATUS_LABELS, ROLE_LABELS, ROLE_DESCRIPTIONS, COLORS, PERSON_CATEGORIES,
    normalizePhone, validPhone, fromApi, fromSheetSource, fiscalYear, monthKey, monthLabel, thaiDate, thaiDateTime,
    defaultPeriod, monthsBetween, byDistance, formatDistance, fiscalGroups, applyFilters, distinct, tally, groupSummary, toCsv, csvCell, escapeHtml, distanceM, can, uuid
  };
});
