# ติดตั้งระบบตรวจสอบจุดความร้อน v3.1

ฐานข้อมูลและโฟลเดอร์ถูกสร้างไว้แล้วในโฟลเดอร์ Google Drive **5. Thailand HS Verification**

| รายการ | ID |
|---|---|
| Google Sheet `Thailand HS Verification - Database` | `1LOuhCmG8nSS5Si-wHUtgyUtbWYkTw-XKaVjrYBHPxlQ` |
| โฟลเดอร์ `HS Verification Photos` | `1bo9-9z9M2fb09T51qG2Od0SjZXkUd6vl` |
| แหล่ง HS (Agri-Risk Map Burning V3 - Database) | `178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A` |

ชีตทั้ง 8 แท็บพร้อมหัวคอลัมน์และค่า Settings เริ่มต้นสร้างไว้แล้ว ระบบตรวจและเติมส่วนที่ขาดให้อัตโนมัติเมื่อเรียก API ครั้งแรก

## 1. วาง Backend

1. เปิด Google Sheet **Thailand HS Verification - Database** → **ส่วนขยาย → Apps Script**
2. ลบโค้ดตัวอย่าง แล้วเลือกอย่างใดอย่างหนึ่ง
   * วางเนื้อหา `docs/AppsScript-v30-All.gs` เป็นไฟล์ `Code.gs` ไฟล์เดียว หรือ
   * สร้างไฟล์ตาม `apps-script/*.gs` ทีละไฟล์ (Config, Utils, Db, Setup, Audit, Auth, Accounts, Hotspots, Verification, Code)
3. เพิ่มไฟล์ **Secrets.gs** ตามแบบ `apps-script/Secrets.example.gs`
   * `INIT_SUPER_USER` / `INIT_SUPER_PASSWORD` — บัญชี Super Admin (รหัสผ่านอย่างน้อย 8 ตัวอักษร)
   * `INIT_MINISUPER_PHONE` / `INIT_MINISUPER_PROVINCE` — (ไม่บังคับ) Mini Super Admin เริ่มต้น 1 คน
   * ไฟล์นี้ห้ามนำขึ้น GitHub
4. (ไม่บังคับ) **การตั้งค่าโปรเจ็กต์ → แสดงไฟล์ appsscript.json** แล้ววางเนื้อหา `apps-script/appsscript.json`
5. เลือกฟังก์ชัน **setup** → **เรียกใช้** → อนุญาตสิทธิ์ (Google Sheets, Google Drive)
   * บัญชีที่ติดตั้งต้องเปิดอ่าน Google Sheet แหล่ง HS ได้ และแก้ไขโฟลเดอร์ภาพได้
6. (ไม่บังคับ) นำบัญชีจากระบบ Agri-Risk Map Burning มาใช้: เลือกฟังก์ชัน `copyAccountsFromRiskMap` → เรียกใช้
   * คัดลอกเฉพาะบัญชีที่อนุมัติแล้ว ข้ามเบอร์ที่มีอยู่ · Mini Super Admin ของระบบแผนที่จะมีสิทธิ์ระดับจังหวัดของตนในระบบนี้
   * จำกัดจังหวัดได้ เช่น เพิ่มฟังก์ชันชั่วคราว `function run(){ copyAccountsFromRiskMap(['62','60']); }`

## 2. Deploy เป็นเว็บแอป

1. **ทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → ประเภท: เว็บแอป**
2. ดำเนินการในฐานะ: **ฉัน** · ผู้ที่มีสิทธิ์เข้าถึง: **ทุกคน**
3. คัดลอก URL ที่ลงท้าย `/exec`
4. ทดสอบเปิด `URL?action=ping` ต้องได้ `{"ok":true,"version":"3.1.0",...}` และ `URL?action=provinces` ต้องเห็นรายชื่อจังหวัด

แก้ไขโค้ดภายหลัง: **จัดการการทำให้ใช้งานได้ → แก้ไข → เวอร์ชันใหม่** (URL เดิมใช้ต่อได้)

## 3. ตั้งค่าหน้าเว็บ

แก้ `site-config.js`

```js
apiEndpoint: 'https://script.google.com/macros/s/xxxxxxxx/exec',
```

push ไปที่ `main` — GitHub Actions รัน `npm test` แล้วเผยแพร่ GitHub Pages อัตโนมัติ

## 4. ตรวจหลังติดตั้ง

1. เปิดเว็บไซต์ → เลือกจังหวัด → เห็นจุด HS และป้าย “ข้อมูลสาธารณะ”
2. **เข้าใช้งานระบบ → Super Admin** → เข้าสู่ระบบ → **ผู้ดูแลระบบ → บัญชีผู้ใช้** เพิ่ม Mini Super Admin ของแต่ละจังหวัด
3. เปิดเว็บด้วยมือถือ → **เข้าใช้งานระบบ → ลงทะเบียน Admin** → ใช้งานได้ทันที · Mini Super Admin เห็นรายชื่อในแท็บ **ผู้ลงทะเบียน**
4. Admin เข้าด้วยเบอร์โทร → เปิดจุด HS → บันทึกผล → ตรวจชีต `Verifications`, `Photos`, `AuditLog`

## เปลี่ยนรหัส Super Admin

ใน Apps Script Editor สร้างฟังก์ชันชั่วคราว `function run(){ setSuperAdmin('ชื่อใหม่','รหัสใหม่อย่างน้อย8ตัว'); }` → เรียกใช้ → ลบฟังก์ชันชั่วคราวออก
