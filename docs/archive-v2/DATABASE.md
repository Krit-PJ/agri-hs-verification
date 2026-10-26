# Database v1

HS_Base เป็นข้อมูลอ้างอิงรายจุด key hs_id ไม่ให้ผู้ตรวจแก้ค่าวัน พื้นที่ พืช หรือพิกัด HS จากฟอร์ม
HS_Verification มี verification_id และ request_id UUID; อ้าง hs_id เก็บผล status/result, action/notes, GPS และความแม่นยำ/เหตุผลไม่มี GPS, ระยะเมตร, ผู้ตรวจและเวลา server, snapshot ต้นทาง ข้อมูลปัจจุบันของ HS เลือก updated_at ล่าสุด
HS_Photos มี photo_id/request_id, verification_id และ hs_id; Drive file ID, MIME, size, SHA-256, caption, uploader และเวลารับ server เวลา capturedAt เป็นข้อมูล client ไม่ใช่หลักฐานเวลาถ่ายที่รับรอง
Inspector_Profile มี inspector_id และ display_name/พื้นที่รับผิดชอบ/role/active/token_hash ใช้ token แยกแต่ละคน ไม่เก็บ plaintext
Verification_Log เป็นประวัติ mutation/sync/QA พร้อม actor/action/entity/time/status/details ไม่เก็บ token หรือ base64 ภาพ

## ตั้ง template
CSV ใน templates มี header ตรง schema ตามลำดับ ให้ import แต่ละไฟล์เป็นแท็บชื่อเดียวกัน หรือ initializeBackend สร้างแท็บให้ ห้ามปรับลำดับคอลัมน์โดยไม่ migrate schema

## ความสัมพันธ์และ QA
HS_Base 1 → หลาย HS_Verification → หลาย HS_Photos; Inspector_Profile 1 → หลายผลตรวจ; Log อ้าง entity ID ทุก mutation ฝั่ง server ใช้ ScriptLock และ UUID ป้องกัน replay รูปเป็น Drive private พร้อม API authenticated getPhoto ไม่ใช้ URL แชร์สาธารณะ

Apps Script/Sheets/Drive ไม่ใช่ฐานข้อมูล transaction ข้ามบริการเต็มรูปแบบ การส่งผลตรวจและรูปเป็นขั้นตอนแยกกัน ฝั่ง client จึงเก็บงานค้างพร้อม ID เดิมเพื่อ retry และไม่แจ้งว่าครบก่อนส่งทุกภาพ หาก log เขียนไม่ได้ backend บันทึก console error; ต้องตรวจ execution logs และ backup ด้วย

ข้อมูล 593 จุดมี hs_id ต้นทาง ไม่มี ID แปลงที่ยืนยันได้ จึงไม่สร้าง ID แปลงสมมุติ ฟอร์มเวอร์ชันนี้ยึด HS เป็นหน่วยตรวจ เมื่อมีทะเบียนแปลงจริงจึงเพิ่ม foreign key parcel_id และ spatial join ที่ตรวจสอบแล้ว
