(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HSReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RESULT_LABELS = {
    burned: 'พบการเผา',
    not_burned: 'ไม่พบการเผา',
    not_found: 'ไม่พบจุด',
    needs_review: 'ต้องตรวจซ้ำ'
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? escapeHtml(value)
      : escapeHtml(date.toLocaleString('th-TH', { timeZone:'Asia/Bangkok', dateStyle:'medium', timeStyle:'short' }));
  }

  function safeImageUrl(value) {
    const url = String(value || '');
    return /^(?:https?:|data:image\/|blob:)/i.test(url) && !/[\\'"<>\s]/.test(url) ? url : '';
  }

  function reportModel(rows, filters) {
    const items = Array.isArray(rows) ? rows : [];
    const submitted = items.filter(item => item.status === 'verified');
    const verified = submitted.filter(item => ['burned','not_burned'].includes(item.verification?.result));
    return {
      total: items.length,
      verified: verified.length,
      burned: verified.filter(item => item.verification?.result === 'burned').length,
      notBurned: verified.filter(item => item.verification?.result === 'not_burned').length,
      followup: submitted.filter(item => ['not_found','needs_review'].includes(item.verification?.result)).length,
      pending: items.filter(item => item.status === 'pending').length,
      drafts: items.filter(item=>item.status==='draft').length,
      scope: filters?.scope ? [filters.scope,filters.district,filters.month?'เดือน '+filters.month:''].filter(Boolean).join(' · ') : filters?.district || 'ทั้งจังหวัดกำแพงเพชร',
      year: filters?.year || 'ทุกปีงบประมาณ'
    };
  }

  function rowHtml(item) {
    const verification = item.verification || {};
    const area = [item.village,item.tambon,item.district,item.province].filter(Boolean).join(' · ') || '—';
    const source = [
      `วันที่ HS: ${item.acquiredAt ? escapeHtml(new Date(item.acquiredAt).toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium'})) : '—'} ${escapeHtml(item.time || '')}`,
      `พื้นที่: ${escapeHtml(area)}`,
      `การใช้ที่ดิน/พืช: ${escapeHtml(item.landType || '—')} / ${escapeHtml(item.plantType || '—')}`,
      `พิกัด: ${Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) ? `${Number(item.latitude).toFixed(5)}, ${Number(item.longitude).toFixed(5)}` : '—'}`
    ].join('<br>');
    const inspector = verification.fieldInspectorName || verification.inspectorName || verification.inspectorDisplayName || verification.inspectorId || '—';
    const selectedResult = RESULT_LABELS[verification.result];
    const result = item.status === 'draft' ? `งานร่าง${selectedResult ? ` · เลือกไว้: ${selectedResult}` : ''}` : (selectedResult || 'รอตรวจ');
    return `<tr>
      <td><strong>${escapeHtml(item.hsId || '—')}</strong><br><small>${source}</small></td>
      <td>${escapeHtml(inspector)}</td>
      <td>${formatDateTime(verification.inspectedAt || verification.verifiedAt || verification.updatedAt)}</td>
      <td>${escapeHtml(result)}</td>
      <td>${escapeHtml(verification.notes || '—')}</td>
    </tr>`;
  }

  function buildReportHtml(options) {
    const rows = Array.isArray(options?.rows) ? options.rows : [];
    const model = reportModel(rows, options?.filters);
    const logoDoae = safeImageUrl(options?.logoDoae);
    const logoKpp = safeImageUrl(options?.logoKpp);
    const fontRegular = safeImageUrl(options?.fontRegular);
    const fontBold = safeImageUrl(options?.fontBold);
    const sourceLabel = escapeHtml(options?.sourceLabel || 'ไม่ระบุแหล่งข้อมูล');
    const generatedAt = formatDateTime(options?.generatedAt || new Date().toISOString());
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>รายงานผลการตรวจสอบจุดความร้อน</title>
      <style>
        ${fontRegular ? `@font-face{font-family:HSReport;src:url('${fontRegular}') format('truetype');font-weight:400}` : ''}${fontBold ? `@font-face{font-family:HSReport;src:url('${fontBold}') format('truetype');font-weight:700}` : ''}:root{font-family:HSReport,Tahoma,"Noto Sans Thai",sans-serif;color:#17312e}body{margin:0;background:#eef4f2}.toolbar{position:sticky;top:0;display:flex;justify-content:center;gap:12px;padding:12px;background:#17312e;color:#fff}.toolbar button{border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:700;color:#fff;background:#007f78;cursor:pointer}.sheet{max-width:1120px;margin:20px auto;padding:28px;background:#fff}.report-head{display:flex;align-items:center;gap:18px;border-bottom:3px solid #007f78;padding-bottom:16px}.logos{display:flex;gap:8px}.logos img{width:64px;height:64px;object-fit:contain}.report-head h1{font-size:22px;margin:0 0 4px}.meta{margin:14px 0;line-height:1.7}.stats{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin:16px 0}.stat{padding:12px;border:1px solid #cad9d6;border-radius:8px}.stat strong{display:block;font-size:22px;color:#007f78}.stat span{font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #b9c9c6;padding:7px;text-align:left;vertical-align:top}th{background:#e5f0ee}small{line-height:1.45}.empty{text-align:center;padding:30px}.print-note{font-size:13px;margin:0}@page{size:A4 landscape;margin:10mm}@media print{body{background:#fff}.toolbar{display:none}.sheet{max-width:none;margin:0;padding:0}.report-head h1{font-size:18px}.stats{grid-template-columns:repeat(7,1fr)}thead{display:table-header-group}tr{break-inside:avoid}}
      @media screen and (max-width:700px){*{box-sizing:border-box}.sheet{margin:0;padding:16px;overflow-wrap:anywhere}.toolbar{position:static;flex-wrap:wrap}.toolbar button{min-height:48px}.print-note{flex-basis:100%;order:3}.report-head{flex-wrap:wrap}.report-head h1{font-size:20px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.report-table{overflow-x:auto}table{min-width:680px}}
      </style></head><body>
      <div class="toolbar"><button type="button" onclick="history.back()">กลับหน้าระบบ</button><p class="print-note">กด “พิมพ์” แล้วเลือก “บันทึกเป็น PDF” ในหน้าต่างพิมพ์ของเบราว์เซอร์ หากต้องการไฟล์ PDF</p><button type="button" onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>
      <main class="sheet"><header class="report-head"><div class="logos">${logoDoae ? `<img src="${logoDoae}" alt="ตรากรมส่งเสริมการเกษตร">` : ''}${logoKpp ? `<img src="${logoKpp}" alt="ตราสำนักงานเกษตรจังหวัดกำแพงเพชร">` : ''}</div><div><h1>รายงานผลการตรวจสอบจุดความร้อน</h1><div>${escapeHtml(model.scope)}</div></div></header>
      <section class="meta" aria-label="ขอบเขตรายงาน"><strong>ขอบเขต:</strong> ${escapeHtml(model.scope)} · <strong>ปีงบประมาณ:</strong> ${escapeHtml(model.year)}<br><strong>จัดทำเมื่อ:</strong> ${generatedAt}<br><strong>แหล่งข้อมูล:</strong> ${sourceLabel}</section>
      <section class="stats" aria-label="ยอดรวม"><div class="stat"><strong>${model.total}</strong><span>ทั้งหมด</span></div><div class="stat"><strong>${model.verified}</strong><span>ส่งผลตรวจแล้ว</span></div><div class="stat"><strong>${model.burned}</strong><span>พบการเผา</span></div><div class="stat"><strong>${model.notBurned}</strong><span>ไม่พบการเผา</span></div><div class="stat"><strong>${model.followup}</strong><span>ต้องติดตาม</span></div><div class="stat"><strong>${model.pending}</strong><span>รอตรวจ</span></div><div class="stat"><strong>${model.drafts}</strong><span>งานร่าง</span></div></section>
      <h2>รายการตรวจสอบและข้อมูลต้นทาง</h2><div class="report-table" tabindex="0" role="region" aria-label="ตารางรายงาน เลื่อนซ้ายขวา"><table><thead><tr><th>HS และข้อมูลต้นทาง ณ เวลารายงาน</th><th>ผู้ลงพื้นที่</th><th>วันเวลาตรวจ</th><th>ผลตรวจ</th><th>หมายเหตุ</th></tr></thead><tbody>${rows.length ? rows.map(rowHtml).join('') : '<tr><td class="empty" colspan="5">ไม่มีข้อมูลในขอบเขตที่เลือก</td></tr>'}</tbody></table></div></main></body></html>`;
  }

  function openReport(options) {
    sessionStorage.setItem('hsverify.reportSnapshot',JSON.stringify(options));
    window.location.assign(new URL('report-view.html',window.location.href).href);
  }

  return { escapeHtml, reportModel, buildReportHtml, openReport };
});
