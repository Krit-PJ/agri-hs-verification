(() => {
  'use strict';
  try {
    const raw=sessionStorage.getItem('hsverify.reportSnapshot');
    if(!raw)throw Error('ไม่มีชุดข้อมูลรายงาน กรุณากลับไปหน้าสรุปผลแล้วเลือกพิมพ์รายงาน');
    const html=HSReport.buildReportHtml(JSON.parse(raw));
    document.documentElement.innerHTML=html;
  }catch(error){document.getElementById('reportError').textContent=error.message;}
})();
