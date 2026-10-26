# ติดตั้ง Apps Script สำหรับฐานข้อมูลจริง v2.1

## ฐานข้อมูลที่สร้างแล้ว
- Google Sheets: https://docs.google.com/spreadsheets/d/1pUDEiOunwraALqknLUT0VYVVSDmpTSZkS4O-ePA-9WQ/edit
- โฟลเดอร์ภาพ: https://drive.google.com/drive/folders/1oUbGXBetamsQH2US9F08Kl1mKOeOg1im
- HS_Base มี 593 จุด กำแพงเพชร ชุดปี 2569 ส่วนผลตรวจ/ภาพ/ผู้ตรวจ/Log เริ่มว่าง

## 1. สร้างโครงการที่ผูกกับชีต
เปิด Google Sheets ด้านบน → ส่วนขยาย (Extensions) → Apps Script ตั้งชื่อ HS Verification API v2.1

สร้างไฟล์ Script ตามชื่อด้านล่าง แล้วคัดลอกเนื้อหาทั้งไฟล์จากโฟลเดอร์ apps-script ใน ZIP ชื่อใน editor ไม่ต้องพิมพ์นามสกุล .gs ซ้ำ

| ไฟล์ | หน้าที่ |
|---|---|
| Config.gs | ชื่อชีต หัวคอลัมน์ และค่าควบคุม |
| Code.gs | จุดรับ API doGet/doPost และส่งต่อคำสั่ง |
| Auth.gs | Login บัญชี session และสิทธิ์ |
| Repository.gs | อ่านเขียนชีตและ Audit log |
| VerificationService.gs | อ่าน HS บันทึกผลตรวจ และสรุปผล |
| Evidence.gs | ภาพถ่าย metadata พิกัด และการสอบทวนหลักฐาน |
| ImportService.gs | ตรวจและแปลงข้อมูลนำเข้า |
| SharedData.gs | ตัวแปลงข้อมูลเดียวกับ Frontend |
| NationalCore.gs | ทะเบียนจังหวัดและกฎระดับประเทศ |
| NationalService.gs | นำเข้ารายจังหวัด/ปี QA และขอบเขตสิทธิ์ |
| TeamService.gs | ข้อมูลทีมผู้พัฒนาและที่ปรึกษา |
| Utils.gs | ฟังก์ชันช่วย ตรวจข้อมูล ล็อก และข้อผิดพลาด |
| Setup.gs | ตั้งค่า ID ฐานข้อมูลจริงและตรวจความพร้อม |

Code.gs ที่ Google สร้างให้อัตโนมัติให้แทนเนื้อหาด้วย Code.gs ในชุด ห้ามเหลือ doGet/doPost เก่าซ้ำ

Project Settings → เปิด Show appsscript.json manifest file in editor แล้วแทนเนื้อหา appsscript.json ด้วยไฟล์ในชุด ใช้ V8 และ Asia/Bangkok

## 2. เชื่อมฐานข้อมูลและภาพ
เลือกฟังก์ชัน setupDatabaseConnection แล้วกด Run อนุญาตบัญชี Google ที่เป็นเจ้าของฐานข้อมูลและโฟลเดอร์ภาพ ฟังก์ชันตรวจสิทธิ์และ schema โดยไม่ล้าง HS/ผลตรวจเดิม และตั้ง Script Properties:

```text
SPREADSHEET_ID = 1pUDEiOunwraALqknLUT0VYVVSDmpTSZkS4O-ePA-9WQ
PHOTO_FOLDER_ID = 1oUbGXBetamsQH2US9F08Kl1mKOeOg1im
```

ถ้ามี ID ของระบบอื่นอยู่แล้ว ฟังก์ชันจะหยุดให้ตรวจสอบก่อน ไม่เขียนทับโดยเงียบ

## 3. สร้างบัญชีเข้าสู่ระบบ
Project Settings → Script Properties เพิ่ม BOOTSTRAP_ADMIN_PASSWORD และ BOOTSTRAP_SUPER_ADMIN_PASSWORD โดยใส่รหัสผ่านที่ต้องการเอง ไม่วางรหัสผ่านในโค้ดหรือเซลล์

รัน setupInitialLoginAccounts หนึ่งครั้ง สร้างบัญชี 620000 เป็น Admin จังหวัด 62 (กำแพงเพชร) และ Krit เป็น Super Admin จากนั้นลบ bootstrap passwords อัตโนมัติ เก็บเพียง hash และ salt การรันซ้ำเป็นการเปลี่ยนรหัสผ่านบัญชีเดิม จึงไม่ควรรันซ้ำโดยไม่ตั้งใจ

รัน checkDatabaseReady เพื่อตรวจ schema จำนวนแถว และจำนวนบัญชี ฟังก์ชันไม่แสดงรหัสผ่านหรือ token ผลตรวจโครงสร้างไม่ใช่หลักฐานว่า API deploy แล้ว

## 4. Deploy Web App
Deploy → New deployment → Web app เลือก Execute as เป็นบัญชีผู้ติดตั้ง และ Who has access เป็น Anyone เพื่อให้ Static web เรียก API ได้ จุดรับนี้ใช้การ Login/session/CSRF และตรวจจังหวัดในโค้ด ไม่ใช่เปิดสิทธิ์อ่าน Google Sheets หรือ Drive ต่อสาธารณะ บัญชีองค์กรอาจจำกัดการ deploy แบบนี้ ต้องให้ผู้ดูแล Workspace ตรวจนโยบายก่อน

คัดลอก URL ที่ลงท้าย /exec ห้ามใช้ /dev หรือลิงก์หน้า editor หลังแก้โค้ดให้ Manage deployments → Edit → New version → Deploy

## 5. เชื่อม Frontend
แก้ site-config.js ในเว็บไซต์จริง:

```javascript
window.HS_SITE_CONFIG = Object.freeze({
  previewMode: false,
  apiEndpoint: 'ใส่ URL /exec ที่ได้รับจริง'
});
```

ห้ามใส่รหัสผ่านในไฟล์นี้ เมื่อชี้ endpoint จริงจะไม่ข้าม Login ทดสอบผู้ใช้ทั่วไป → Login Admin → Login Super Admin → อ่าน 593 จุด → บันทึกผลตรวจหนึ่งจุดที่ยืนยันได้ → แนบภาพ → ตรวจแถวใน HS_Verification/HS_Photos/Verification_Log และไฟล์ใน Drive → ตรวจรายงาน/ส่งออก

อย่าสร้างผลตรวจสมมติในฐานจริง หากต้องการทดสอบเขียนโดยไม่ปะปน ให้ทำสำเนาฐานข้อมูลและโฟลเดอร์ภาพสำหรับทดสอบ แล้วกำหนด ID ของสำเนาใน Script Properties ด้วยตนเองแทนการรัน setupDatabaseConnection

## 6. ข้อควรทราบ
- ไม่ต้องสร้างชีตใหม่เพิ่มเอง ชื่อและหัวคอลัมน์ต้องตรง Config.gs ทุกตัว
- ยังไม่มีการติดตั้ง/รัน/deploy Apps Script ให้บัญชี Google จากเครื่องมือนี้ ZIP เป็นโค้ดพร้อมติดตั้ง ไม่ใช่บริการที่ deploy แล้ว
- ไม่ต้องตั้ง SOURCE_SPREADSHEET_ID เพื่ออ่าน HS_Base ที่มีแล้ว แหล่งข้อมูลนำเข้าเพิ่มเติมให้ตั้ง Google Sheets รายจังหวัดผ่านหน้า Super Admin โดยใช้ชีตรายจุด ไม่ใช่ Pivot
- สิทธิ์บัญชีแบบรหัสผ่านอยู่ใน Script Properties ไม่ใช่การพิมพ์ role ลง Inspector_Profile เพื่อข้าม Login
- PUBLIC_PROVINCE_CODES ถ้าไม่ตั้ง ใช้ 62 เป็นค่าเริ่มต้น ข้อมูล HS และสถานะย่อจังหวัดนี้เปิดอ่านผ่าน public bootstrap โดยไม่ส่งชื่อผู้ตรวจหรือหมายเหตุ หากต้องการไม่เผยแพร่จังหวัดใด ให้ตั้งค่านี้เป็น none ก่อน deploy
- ไม่แชร์ฐานข้อมูลและโฟลเดอร์ภาพเป็น Anyone with link ผู้ใช้ภาคสนามเข้าผ่านเว็บไซต์/API
- การนำเข้าระดับประเทศยืนยันทีละจังหวัด/ปี รักษาประวัติผลตรวจ และไม่เปลี่ยนสูตรแผนที่ความเสี่ยงเดิม

## การตรวจโค้ดก่อนส่งมอบ
ชุดทดสอบเดิม 106 รายการผ่าน และ Apps Script 13 ไฟล์ผ่าน syntax ส่วน Setup.gs เป็นตัวช่วยใหม่ที่ยังไม่ได้รันบนบัญชี Google ต้องตรวจผล Run และทดสอบ API จริงตามขั้นตอนข้างต้น
