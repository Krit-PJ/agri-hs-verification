# หลักฐานการออกแบบ UI ภาคสนาม — 13 ตุลาคม 2569

- WCAG 2.2 กำหนดเป้าหมายสัมผัสขั้นต่ำ 24 CSS px (มีข้อยกเว้น); ระบบนี้เลือกปุ่มหลักอย่างน้อย 48 px เพื่อใช้มือถือในภาคสนาม เป็นการตัดสินใจออกแบบ ไม่ใช่ข้อกำหนดขั้นต่ำของ WCAG: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- ข้อความปกติควรมี contrast อย่างน้อย 4.5:1: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
- ใช้พื้นสว่าง ข้อความเข้ม สีเขียวอมฟ้าเป็นสีหลัก ส้มเป็นจุดเน้น และสถานะมีข้อความประกอบ ไม่ใช้สีอย่างเดียว การอ่านกลางแดดยังต้องทดสอบบนอุปกรณ์จริง
- แผนที่คู่กับรายชื่อจุด ช่วยเลือกจุดได้แม้ tile/CDN ล่ม; ตัวกรองลดรายการ ก่อนเข้าสู่ฟอร์มยืนยัน ผลตรวจเป็นสิ่งที่คนต้องตัดสิน ส่วนข้อมูลอ้างอิงมาจาก HS
- Geolocation ต้อง secure context และผู้ใช้อนุญาต จึงใช้ HTTPS บน GitHub Pages หรือ localhost; ปฏิเสธ GPS ได้และต้องระบุเหตุผล ไม่มีการเดาพิกัด: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- Apps Script web app ใช้ doPost และ ContentService; response ถูก redirect จึงต้องตรวจ response JSON ห้ามตีความ opaque/no-cors ว่าบันทึกสำเร็จ: https://developers.google.com/apps-script/guides/web และ https://developers.google.com/apps-script/guides/content
- บันทึกใช้ ScriptLock ป้องกันแข่งกันเขียน: https://developers.google.com/apps-script/reference/lock/lock-service

## ข้อจำกัดการวิจัย
เป็น desk research จากเอกสารต้นทางและข้อเสนอ UX ยังไม่มี usability test กับเจ้าหน้าที่หรือทดสอบกลางแจ้งจริง ต้องทดสอบอย่างน้อยมือถือ Android/iOS ขณะเดินทาง สัญญาณอ่อน GPS ไม่พร้อม และการ retry ภาพก่อนเปิดใช้จริง
