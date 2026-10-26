# การเชื่อมฐานข้อมูลจริง 17 ตุลาคม 2569
เว็บไซต์ตั้ง apiEndpoint เป็น URL /exec ที่ผู้ใช้ deploy แล้ว และ previewMode เป็น false
API bootstrap อ่านได้ 593 จุด ID ไม่ซ้ำ พิกัดครบทุกจุด ชุดทดสอบอัตโนมัติผ่าน 106 รายการ
ฐานข้อมูล: https://docs.google.com/spreadsheets/d/1pUDEiOunwraALqknLUT0VYVVSDmpTSZkS4O-ePA-9WQ/edit
ไม่มีการเพิ่มผลตรวจหรือรูปภาพทดสอบลงฐานจริง ยังต้องทดสอบ Login และบันทึกผลตรวจ/อัปโหลดรูปด้วยงานที่ตรวจจริงก่อนใช้งานภาคสนามเต็มรูปแบบ
โค้ด SharedData.gs แก้ logical assignment เป็นรูปแบบที่ Google Apps Script บันทึกได้ โดยคงเหมือน data-source.js
ยังไม่ได้เผยแพร่ Frontend ขึ้น GitHub Pages ในรอบนี้ ใช้ไฟล์ชุดนี้แทนรุ่นก่อน แล้วเผยแพร่ตามคู่มือเดิม
