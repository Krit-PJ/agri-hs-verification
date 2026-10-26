# ระบบตรวจสอบจุดความร้อน (Agri Hot Spot Verification) v3.3

ระบบบันทึกผลการลงพื้นที่ตรวจสอบจุดความร้อน (HS) ในพื้นที่การเกษตรของประเทศไทย
ใช้ข้อมูล HS ชุดเดียวกับระบบ [Agri-Risk Map Burning](https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/)
และใช้ระบบผู้ดูแล Admin / Mini Super Admin / Super Admin แบบเดียวกัน

เว็บไซต์: https://krit-pj.github.io/agri-hs-verification/

© copyright By Dr. Kitti PhoJuang กรมส่งเสริมการเกษตร

> รุ่น 3.x แทนที่ระบบรุ่น 2.x ทั้งหมด — [v3.3 หน้าจอกระชับ แผนที่อยู่ในจอแรก](docs/RELEASE_V33_TH.md) · [v3.2 ดูทุกจังหวัด · Mini Super Admin ระดับประเทศ · ประวัติการเข้าใช้งาน](docs/RELEASE_V32_TH.md) · [v3.1 ลงทะเบียนใช้งานทันที งานภาคสนาม และมือถือ](docs/RELEASE_V31_TH.md) · [v3.0](docs/RELEASE_V30_TH.md) · เอกสารรุ่นเก่าอยู่ใน `docs/archive-v2/`

---

## ฐานข้อมูล

| ส่วน | ที่เก็บ | การใช้งาน |
|---|---|---|
| ข้อมูล HS ต้นทาง | Google Sheet **TH Agri-Risk Map Burning V3 - Database** แท็บ `HS_<รหัสจังหวัด>` (เช่น `HS_62`) | อ่านอย่างเดียว ไม่แก้ไขต้นทาง |
| ฐานข้อมูลระบบนี้ | Google Sheet **[Thailand HS Verification - Database](https://docs.google.com/spreadsheets/d/1LOuhCmG8nSS5Si-wHUtgyUtbWYkTw-XKaVjrYBHPxlQ/edit)** ในโฟลเดอร์ Drive **5. Thailand HS Verification** | บัญชี คำขอ ผลตรวจ ภาพ บันทึกการใช้งาน |
| ภาพหลักฐาน | โฟลเดอร์ Drive **HS Verification Photos** (แยกโฟลเดอร์ย่อยรายจังหวัด) | ไฟล์ส่วนตัว อ่านผ่าน API ที่ตรวจสิทธิ์เท่านั้น |

โครงสร้างชีตทั้งหมด: [docs/DATABASE.md](docs/DATABASE.md)

## บทบาทและสิทธิ์

| บทบาท | เข้าสู่ระบบ | ขอบเขต | ทำได้ |
|---|---|---|---|
| ผู้ใช้ทั่วไป | ไม่ต้อง | ทุกจังหวัดที่มีข้อมูล HS | ดูแผนที่ สถานะ/ผลตรวจ สรุปผล พิมพ์รายงาน |
| **Admin** (ผู้บันทึกข้อมูล HS) | เบอร์โทรศัพท์ (ลงทะเบียนเองแล้วใช้งานได้ทันที) | จังหวัดที่ลงทะเบียน | บันทึกผลตรวจ แนบภาพ แก้ไขรายการที่ตนบันทึก ส่งออก CSV ดูบันทึกการใช้งานของตนเอง |
| **Mini Super Admin** (ผู้ดูแลจังหวัด) | เบอร์โทรศัพท์ · แต่งตั้งโดย Super Admin เท่านั้น | จังหวัดของตน | ตรวจรายชื่อผู้ลงทะเบียน และเพิ่ม แก้ไข ระงับ ลบ บัญชี Admin ในจังหวัด · บันทึก แก้ไข เพิ่ม ลบ ผลตรวจทุกรายการในจังหวัด · ดูบันทึกการใช้งานและการเข้าใช้ของจังหวัด |
| **Mini Super Admin ระดับประเทศ** | เบอร์โทรศัพท์ · แต่งตั้งโดย Super Admin | ทุกจังหวัด | จัดการระบบได้เหมือน Super Admin ยกเว้นบัญชี Super Admin / Mini Super Admin และการตั้งค่าระบบ |
| **Super Admin** | ชื่อผู้ใช้ + รหัสผ่าน | ทั้งระบบ | ทุกอย่าง รวมถึงแต่งตั้ง/ระงับ/ลบ Mini Super Admin, ดูบันทึกทั้งหมด, ตั้งค่าแหล่งข้อมูลและโฟลเดอร์ภาพ |

* เจ้าหน้าที่ใหม่: **เข้าใช้งานระบบ → ลงทะเบียน Admin** กรอกจังหวัด ชื่อ ตำแหน่ง สังกัด เบอร์โทร → เข้าใช้งานได้ทันที ครั้งต่อไปเข้าด้วยเบอร์โทร
* Mini Super Admin เห็นผู้ลงทะเบียนใหม่ของจังหวัดในแท็บ **บัญชีผู้ใช้ → ลงทะเบียนใหม่ 7 วัน** และระงับได้ทันทีหากไม่ใช่เจ้าหน้าที่ · ระบบจำกัดการลงทะเบียนไม่เกิน 30 ครั้ง/10 นาที
* ระบบตรวจสถานะบัญชีทุกคำสั่ง ระงับสิทธิ์มีผลทันที · รหัสผ่าน Super Admin เก็บเป็นค่า Hash ใน Script Properties
* นำบัญชีที่อนุมัติแล้วจากระบบ Agri-Risk Map Burning มาใช้ได้ด้วย `copyAccountsFromRiskMap()` (รันใน Apps Script Editor)

## บันทึกการใช้งาน

ทุกการกระทำของ Admin / Mini Super Admin / Super Admin บันทึกในชีต `AuditLog` (เวลา ผู้ใช้ บทบาท จังหวัด การกระทำ รายการ รายละเอียด) ได้แก่ เข้า/ออกระบบ บันทึก-แก้ไข-ลบผลตรวจ แนบ/ลบภาพ อนุมัติคำขอ จัดการบัญชี ส่งออกข้อมูล และตั้งค่าระบบ
ทุกการพยายามเข้าสู่ระบบบันทึกในชีต `LoginAttempts` (ไม่บันทึกรหัสผ่าน)

ดูได้ที่ **ผู้ดูแลระบบ → ประวัติการใช้งาน** (สลับ การเข้าใช้งานระบบ / การบันทึก-แก้ไขข้อมูล) (กราฟรายวัน สรุปรายบุคคล อุปกรณ์ล่าสุด) พร้อมตัวกรองช่วงวันที่ บทบาท การกระทำ คำค้น สรุปรายบุคคล และส่งออก CSV
— Super Admin เห็นทั้งหมด · Mini Super Admin เห็นเฉพาะจังหวัดของตน (ไม่รวม Super Admin) · Admin เห็นเฉพาะของตนเอง

## โครงสร้างไฟล์

```
index.html            หน้าเว็บ (โครงและรูปแบบเดิม: แผนที่ / รายการ / ตัวกรอง / สรุปผล / ผู้ดูแล)
styles.css, design-tokens.css, registration.css, boundaries.css   สไตล์เดิม
layout-v3.css         การจัดวางรุ่น 3 (แถบเครื่องมือ ชิปตัวกรอง แผนที่เต็มจอ มือถือ แผงผู้ดูแล)
site-config.js        URL ของ Apps Script (apiEndpoint) — ตั้งครั้งเดียว
core.js               ฟังก์ชันข้อมูล (ตัวกรอง ปีงบประมาณ สรุปผล CSV สิทธิ์)
api.js                ติดต่อ Backend + Session
app.js                แผนที่ รายการ ฟอร์มบันทึกผล สรุปผล รายงานพิมพ์
admin.js              เข้าสู่ระบบ ขออนุญาต และแผงผู้ดูแล
outbox.js             เก็บงานค้างเมื่อไม่มีสัญญาณแล้วส่งซ้ำ
sheet-source.js       อ่าน HS จาก Google Sheet ต้นทางโดยตรง (ใช้เมื่อยังไม่ตั้ง API)
evidence.js, image-compression.js, province-logos.js   อ่าน EXIF ย่อภาพ ตราจังหวัด
apps-script/*.gs      Backend (Google Apps Script)
docs/AppsScript-v30-All.gs   Backend รวมไฟล์เดียว สำหรับคัดลอกไปวาง
data/boundaries/      ขอบเขต จังหวัด/อำเภอ/ตำบล รายจังหวัด
tests/                ทดสอบ Backend (จำลอง Apps Script) และฟังก์ชันหน้าเว็บ
scripts/dev-server.js เปิดทดลองในเครื่องพร้อม Backend จำลอง
```

## ติดตั้ง

ขั้นตอนเต็ม: [docs/INSTALL_V30_TH.md](docs/INSTALL_V30_TH.md)

1. เปิด Google Sheet **Thailand HS Verification - Database** → ส่วนขยาย → Apps Script
2. วางไฟล์ใน `apps-script/` (หรือ `docs/AppsScript-v30-All.gs` ไฟล์เดียว) และ `appsscript.json` · สร้าง `Secrets.gs` จาก `apps-script/Secrets.example.gs`
3. ทำให้ใช้งานได้ → เว็บแอป · ดำเนินการในฐานะ **ฉัน** · ผู้มีสิทธิ์เข้าถึง **ทุกคน**
4. ใส่ URL `/exec` ใน `site-config.js` ช่อง `apiEndpoint` แล้ว push — GitHub Actions ทดสอบและเผยแพร่ให้อัตโนมัติ

ก่อนตั้ง `apiEndpoint` เว็บไซต์ยังใช้ดูจุด HS ได้ (อ่านจาก Google Sheet ต้นทางโดยตรง) แต่เข้าสู่ระบบและบันทึกผลไม่ได้

## ทดลองในเครื่อง

```bash
npm test                     # ทดสอบทั้งหมด (Backend จำลอง + หน้าเว็บ)
node scripts/dev-server.js   # http://127.0.0.1:8085  Super Admin: root / password-123 · Mini Super Admin: 0811111111 · ลงทะเบียน Admin ใหม่ได้จากหน้าเว็บ
npm run bundle               # สร้าง docs/AppsScript-v30-All.gs ใหม่หลังแก้ apps-script/
```

## ที่มาของข้อมูล

* จุดความร้อน: NASA FIRMS VIIRS ผ่านฐานข้อมูล Agri-Risk Map Burning (นำเข้าโดยผู้ดูแลจังหวัด)
* ขอบเขตการปกครอง: [OpenGISData-Thailand](https://github.com/chingchai/OpenGISData-Thailand) (CC BY 4.0) ข้อมูลต้นทาง กรมการปกครอง
* แผนที่ฐาน: © OpenStreetMap contributors, Esri · ตราจังหวัด: ดู [credits.html](credits.html)
