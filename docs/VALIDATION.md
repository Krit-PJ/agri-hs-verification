# ผลตรวจล่าสุด v1.1 — 15 ตุลาคม 2569

- automated ผ่าน 39/39: backend 14, shared data 11, frontend 7, independent review 7
- ตรวจ syntax หน้าเว็บ โมดูลเชื่อมข้อมูล Apps Script และ JS risk map ผ่าน
- Shared data เทียบ ID/พิกัดกับ risk ปีชุด 2569 ครบ 593 จุด โดยไม่เปลี่ยน ID
- Browser: map แสดงก่อนตัวกรอง, คลิก marker เติมปี/เดือน/อำเภอ/ตำบล/หมู่บ้าน/พืช และเปิดฟอร์ม
- Browser: Import photo แสดงภาพ preview ได้ 1 ภาพจากไฟล์ทดสอบในเครื่อง
- Browser: Summary ทั้งจังหวัด = 593; คลองขลุง = 84 โดยไม่ขึ้นกับ HS ที่เลือกบนแผนที่
- Browser: ปุ่มอัปเดตโหลดข้อมูลล่าสุดและแจ้งปี/แหล่ง/วันที่ล่าสุดได้
- ขั้นตอน preview ของ frontend อ่าน CSV จริง 593 แถวและสร้าง payload พร้อมเวลา HS ผ่านการรันด้วย DOM จำลอง
- CSV/Excel import parser + API ผ่าน automated preview/QA/reconciliation tests; file chooser ของ browser automation ไม่สำเร็จในการทดสอบ CSV จึงยังไม่ยืนยัน end-to-end การเลือกไฟล์ HS ผ่าน browser นี้
- ยังไม่ได้ live Google/Drive/GitHub deployment หรือทดสอบ field GPS/camera บนอุปกรณ์จริง การทดสอบฝั่ง backend จำลองบริการ Google

บันทึกรุ่นก่อนเก็บด้านล่างเพื่ออ้างอิง (ผลล่าสุดให้ยึดส่วนบน)

# ผลตรวจ — 14 ตุลาคม 2569

## Automated
- `node --check app.js`: ผ่าน
- `node --test tests/*.test.*`: ผ่าน 15/15 (backend 8 + frontend 7)
- Apps Script .gs ทุกไฟล์และ JS/inline scripts ของสำเนาระบบเดิม parse ผ่าน 15 scripts
- ตรวจ local href/src ของ HTML ทั้งสองหน้า ไม่พบไฟล์ขาด
- seed 593 HS IDs ไม่ซ้ำ province/land/crops ถูกเงื่อนไข และเก็บ provenance ของระบบเดิม

Backend tests จำลอง Spreadsheet/Drive/Properties/Utilities: scoped reads/replay, idempotent saves, edited latest row, photo signature/replay, header import/GPS/ID validation, admin sync/reconciliation gate, secret config access, config validation rollback, draft exclusion/QA GPS ไม่ใช่การทดสอบ Google services จริง
Frontend tests มี wire-shape execution ของ bootstrap และ Thailand year/month boundary นอกเหนือจากโครงสร้างฟอร์ม/API/session credential

## Browser smoke
- โหลด 593 จุดบน localhost
- คลองขลุง filter = 84 และ tambon/village options เปลี่ยนตามอำเภอ
- เลือก HS แสดงวันที่/เวลา HS, จังหวัด/ที่ตั้ง/พืช/พื้นที่/พิกัด/ผู้ตรวจ
- demo save no-GPS burned → summary 84 total / 1 verified / 1 burned / 83 pending
- UI มือถือ 390×844: dialog กว้างประมาณ 375 px ไม่มี overflow แนวนอนที่ตรวจพบ
- รูปตัวอย่าง docs/summary-preview.jpg และ mobile-form-preview.jpg เป็นโหมดทดลอง ไม่ใช่รายงานผลตรวจจริง

## ข้อจำกัดและงานก่อน production
ยังไม่ได้ deploy หรือใช้ credential จึงยังไม่ได้พิสูจน์ live Google Sheets/Drive permissions, Apps Script redirect/CORS, GitHub Pages, GPS/camera บนอุปกรณ์จริง หรือ upload/retry ภาพผ่านอินเทอร์เน็ต ต้องทำ acceptance test ใน DEPLOYMENT.md
ระบบเดิม risk เป็นสำเนา baseline เชื่อมลิงก์แล้ว ไม่ได้ regression ทุกฟังก์ชัน/สูตรเดิม แผนที่/CDN ใช้อินเทอร์เน็ต
Outbox เก็บผล/รูปใน IndexedDB ของเครื่องผูก endpoint กับ inspector ไม่เก็บ token ข้างใน และไม่ใช่ offline app เต็มรูปแบบ งานค้างจะยังอยู่หลัง logout ให้ส่งให้ครบก่อนเปลี่ยนเครื่อง หรือใช้เครื่องที่ควบคุมสิทธิ์
Demo เก็บผลใน localStorage ส่วนรูปเป็น preview ไม่จัดเก็บ
UI อ้าง WCAG แต่ยังไม่ได้ accessibility audit หรือ field usability test เต็มรูปแบบ
