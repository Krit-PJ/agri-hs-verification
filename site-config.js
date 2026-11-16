/* ตั้งค่าครั้งเดียวก่อนเผยแพร่ — ใส่เฉพาะ URL สาธารณะ ห้ามใส่รหัสผ่านหรือข้อมูลลับ */
window.HS_SITE_CONFIG = Object.freeze({
  /* URL Web App (ลงท้าย /exec) ของ Apps Script ในฐานข้อมูล "Thailand HS Verification - Database"
     เว้นว่างไว้ = เว็บไซต์อ่านจุด HS จาก Google Sheet ต้นทางโดยตรง (ดูได้อย่างเดียว ยังเข้าสู่ระบบ/บันทึกผลไม่ได้) */
  apiEndpoint: 'https://script.google.com/macros/s/AKfycbwcynTKTIJXHt5UeJ7EH9JBQdUJUvD07uSw7MfAIjWdln3bzPh3lkPsqD8IYZmHnzMR/exec',
  /* API ข้อมูลจุดความร้อนของระบบ Agri-Risk Map Burning (แหล่ง HS ของระบบเดิม: ข้อมูล AGENCY + นโยบายดาวเทียมเดียวกับเว็บ Risk Map)
     ใช้ดึงจุด HS แยกตามประเภทพื้นที่และช่วงเวลา · apiEndpoint ด้านบนยังใช้สำหรับเข้าสู่ระบบ บันทึกผลตรวจ และภาพ */
  riskMapApi: 'https://script.google.com/macros/s/AKfycbzAgSOxgQsaOx9bqBYM53KXFzk1QKsop46HZeINgtUzLXkaZTYYaZH3RZu0l-HDlN8TKA/exec',
  /* แหล่ง HS ต้นทาง (ฐานข้อมูล Agri-Risk Map Burning) ใช้อ่านสาธารณะเมื่อยังไม่ตั้ง apiEndpoint */
  sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A/edit',
  riskMapUrl: 'https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/',
  greenGainHubUrl: 'https://krit-pj.github.io/Green_Gain_Hub-KPP/'
});
