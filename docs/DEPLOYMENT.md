## อัปเกรด v1.0 → v1.1
สำรองฐานก่อน จากนั้นคัดลอก Apps Script ทุกไฟล์รุ่นใหม่และเรียก `migrateSchemaV11()` ใน editor เพื่อเพิ่ม dataset_year_be แบบรักษาข้อมูลเดิม ตรวจปีชุดข้อมูลของแถวเก่าก่อนเปิดใช้งาน แล้ว deploy version ใหม่และใช้ frontend รุ่นเดียวกัน
Master admin token เดิมได้รับ role super_admin ส่วน Inspector_Profile role admin จะใช้ได้เฉพาะงานปฏิบัติการ/QA/export ไม่มีสิทธิ์เปลี่ยนฐานข้อมูล
Google Sheet URL ใส่หน้า Admin ได้โดยตรง แต่บัญชีผู้ deploy Apps Script ต้องมีสิทธิ์อ่าน Spreadsheet นั้น เมื่อตั้งค่าต้นทางเสร็จให้ sync แล้วตรวจยอดก่อนใช้

# Deployment — Google Apps Script + GitHub Pages

## 1. เตรียมข้อมูลและสิทธิ์
สร้าง Spreadsheet สำหรับระบบตรวจสอบแยกจาก workbook ต้นทาง และโฟลเดอร์ Drive สำหรับภาพโดยจำกัดผู้เข้าถึง ตั้งชื่อ HS_Base, HS_Verification, HS_Photos, Inspector_Profile, Verification_Log ตาม schema ใน templates (หรือให้ initializeBackend สร้าง) อย่าแชร์ token_hash/ข้อมูลผู้ตรวจเป็นสาธารณะ

นำ workbook ต้นทางเข้า Google Sheets รักษา hsPlant2026 และ hsAll ไว้ Sheet ID คือส่วนระหว่าง /d/ กับ /edit; Drive folder ID คือส่วนท้าย /folders/...

seed CSV ใช้ฝึก/อ้างอิงเท่านั้น: header แบบนำเข้าต้นทางต่างจาก HS_Base schema อย่าวาง CSV ลง HS_Base โดยตรง ให้สร้างแท็บ hsAll ต้นทางด้วย CSV นี้ แล้วตั้ง SOURCE_SHEET = hsAll และ sync ผ่าน Admin เพื่อให้ server normalize

## 2. Apps Script
สร้าง Apps Script project คัดลอก .gs ทุกไฟล์จาก apps-script และ manifest appsscript.json (เปิด Show appsscript.json ใน Project Settings) ตั้ง timezone Asia/Bangkok

ตั้ง Script Properties ตามชื่อจริงใน apps-script/README.md ได้แก่ SPREADSHEET_ID (ปลายทาง), SOURCE_SPREADSHEET_ID (ต้นทาง), SOURCE_SHEET (hsPlant2026) และ PHOTO_FOLDER_ID (ภาพ) ห้ามใส่ token ลง JavaScript/commit

เรียก initializeBackend ใน editor ผ่านฟังก์ชัน wrapper ที่บันทึก return ลง console เพื่อรับ adminToken ครั้งเดียว เก็บ token ในที่ปลอดภัย จากนั้นสร้างผู้ตรวจด้วย createInspector({displayName: "ชื่อผู้ตรวจ", district: "อำเภอ", tambon: "ตำบล"}) ผ่าน wrapper ใน editor และส่ง token ให้ผู้ตรวจแต่ละคนเฉพาะช่องทางที่เหมาะสม ไม่คัดลอก token_hash ให้ผู้ตรวจใช้แทน token

Deploy > New deployment > Web app เลือก execute as owner และการเข้าถึงตามนโยบายองค์กร สำหรับ frontend static ที่ใช้ API token ต้องให้ request เข้าถึง doPost ได้ หากเลือก Google-account-only อาจเกิดหน้า login/CORS ให้ทดสอบก่อนใช้ อย่าใช้ no-cors เพราะตรวจไม่ได้ว่าบันทึกสำเร็จ

การเปิด endpoint แก่ Anyone ยังมีการตรวจ application token ทุกคำขอ แต่ token เป็น bearer credential ไม่ใช่ Google SSO และ quota อาจถูกใช้โดย request ที่ไม่ผ่านสิทธิ์ หากนโยบายองค์กรห้าม public endpoint ต้องเพิ่ม authenticated proxy/ใช้ hosting ที่รองรับ Google identity ก่อนใช้จริง

คัดลอก URL ลงท้าย /exec ไปหน้า Admin ของ frontend ตั้ง ID และเชื่อมต่อด้วย admin token ทดลอง sync ต้นทาง อ่าน QA และตรวจยอด 593 เฉพาะเมื่อใช้ workbook รุ่นเดียวกับ seed หาก source เปลี่ยนยอดย่อมต่างได้

## 3. GitHub
สร้าง repository ใหม่ คัดลอกเนื้อหา HS-Verification-v1.0 เป็น root ของ repository (ไม่ต้องอัปโหลด zip ซ้อนอีกชั้น) ตรวจว่าไม่มี credential/ข้อมูลบุคคลที่ไม่ควรเปิดเผย commit แล้ว push

Settings > Pages > Build and deployment > Source: GitHub Actions จากนั้น Actions > Publish static site > Run workflow ยังไม่มีการรัน workflow ในงานนี้

เปิด https://USERNAME.github.io/REPOSITORY/; โฟลเดอร์ risk เป็นระบบเดิมที่เชื่อมเมนูแล้ว หากนำ module เข้า repo เดิมแทน ให้ปรับลิงก์ risk/index.html ให้ชี้ระบบเดิม และเพิ่มลิงก์กลับในเมนูเดิม

## 4. Acceptance test ก่อนเปิดใช้จริง
- อ่าน HS ผ่านบัญชีผู้ตรวจและ admin; token ผิด/ปิด active ต้องถูกปฏิเสธ
- ผู้ตรวจเข้าถึง API admin ไม่ได้
- click HS ยืนยันข้อมูลผลตรวจ รูป GPS timestamp และ inspector ว่าถูกสร้างฝั่ง server
- กดส่งซ้ำด้วย request ID เดิมต้องไม่เพิ่มรายงานซ้ำ
- ภาพเข้าถึงผ่าน Drive เฉพาะผู้มีสิทธิ์; ตรวจ metadata size/hash/id
- ปฏิเสธ GPS และ upload ภาพผิดชนิด/เกินขนาด ตรวจว่าแจ้งเหตุผล
- เปลี่ยนตัวกรองทั้ง 7 และเทียบ summary/QA/export กับ Sheet
- ทดสอบ Chrome Android และ Safari iPhone บน HTTPS สัญญาณอ่อนและกลางแจ้ง

## การสำรองและเปลี่ยนรุ่น
สำรอง Spreadsheet และ Drive ก่อนเปลี่ยน schema; API และ frontend ควรเผยแพร่รุ่นเดียวกัน Apps Script ต้องสร้าง deployment version ใหม่หลังแก้โค้ด ไม่ใช้ /dev ในภาคสนาม Export เป็นข้อมูลตรวจสอบ ไม่ใช่ backup ภาพ binary ทั้งโฟลเดอร์

แหล่งอ้างอิง: https://developers.google.com/apps-script/guides/web และ https://developers.google.com/apps-script/guides/content
