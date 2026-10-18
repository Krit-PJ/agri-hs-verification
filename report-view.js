(async () => {
  'use strict';
  async function preparePrint() {
    const button = document.getElementById('reportPrintButton');
    const images = Array.from(document.images);
    await Promise.all(images.map(async image => {
      try {
        if (!image.complete) await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, {once:true});
          image.addEventListener('error', reject, {once:true});
        });
        if (typeof image.decode === 'function') await image.decode();
        if (!image.naturalWidth) throw Error('Image unavailable');
      } catch (_) {
        const warning = document.createElement('p');
        warning.className = 'photo-status';
        warning.textContent = 'แสดงภาพไม่ได้ กรุณากลับไปสร้างรายงานใหม่';
        image.replaceWith(warning);
      }
    }));
    if (document.fonts?.ready) await document.fonts.ready;
    button.disabled = false;
    button.addEventListener('click', () => window.print());
  }
  try {
    const raw=sessionStorage.getItem('hsverify.reportSnapshot');
    if(!raw)throw Error('ไม่มีชุดข้อมูลรายงาน กรุณากลับไปหน้าสรุปผลแล้วเลือกพิมพ์รายงาน');
    const html=HSReport.buildReportHtml(await HSReport.readReportSnapshot(raw));
    document.documentElement.innerHTML=html;
    await preparePrint();
  }catch(error){document.getElementById('reportError').textContent=error.message;}
})();
