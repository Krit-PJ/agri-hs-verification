/**
 * คัดลอกไฟล์นี้เป็น "Secrets.gs" ในโครงการ Apps Script แล้วใส่ค่าจริง
 * ไฟล์ Secrets.gs ต้องไม่อยู่ใน GitHub (อยู่ใน .gitignore)
 * ใช้เฉพาะตอนติดตั้งครั้งแรก: ระบบเก็บรหัส Super Admin เป็นค่า Hash ใน Script Properties
 * และสร้าง Mini Super Admin เริ่มต้น 1 บัญชี (ไม่บังคับ)
 * ใส่เบอร์โทรเป็นข้อความในเครื่องหมายคำพูดเสมอ เพื่อคงเลข 0 นำหน้า
 */
var INIT_SUPER_USER = 'ชื่อผู้ใช้';
var INIT_SUPER_PASSWORD = 'รหัสผ่านอย่างน้อย 8 ตัวอักษร';

var INIT_MINISUPER_PHONE = '0xxxxxxxxx';  // ไม่บังคับ — เบอร์โทร Mini Super Admin เริ่มต้น
var INIT_MINISUPER_PROVINCE = '62';        // รหัสจังหวัด (62 = กำแพงเพชร)
var INIT_MINISUPER_NAME = '';              // ชื่อ-สกุล (เว้นว่างได้)
