/* ตั้งค่าครั้งเดียวก่อนเผยแพร่ — ใส่เฉพาะ URL สาธารณะ ห้ามใส่รหัสผ่านหรือข้อมูลลับ */
window.HS_SITE_CONFIG = Object.freeze({
  /* URL Web App (ลงท้าย /exec) ของ Apps Script ในฐานข้อมูล "Thailand HS Verification - Database"
     เว้นว่างไว้ = เว็บไซต์อ่านจุด HS จาก Google Sheet ต้นทางโดยตรง (ดูได้อย่างเดียว ยังเข้าสู่ระบบ/บันทึกผลไม่ได้) */
  apiEndpoint: '',
  /* แหล่ง HS ต้นทาง (ฐานข้อมูล Agri-Risk Map Burning) ใช้อ่านสาธารณะเมื่อยังไม่ตั้ง apiEndpoint */
  sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A/edit',
  riskMapUrl: 'https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/',
  greenGainHubUrl: 'https://krit-pj.github.io/Green_Gain_Hub-KPP/'
});
