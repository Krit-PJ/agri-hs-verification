# ฐานข้อมูล v3.0 — Thailand HS Verification - Database

Google Sheet: https://docs.google.com/spreadsheets/d/1LOuhCmG8nSS5Si-wHUtgyUtbWYkTw-XKaVjrYBHPxlQ/edit
อยู่ในโฟลเดอร์ Drive **5. Thailand HS Verification** · หัวคอลัมน์กำหนดใน `apps-script/Config.gs` (`SHEETS`) ห้ามสลับลำดับคอลัมน์เอง

## แหล่ง HS (อ่านอย่างเดียว)

ฐานข้อมูล **TH Agri-Risk Map Burning V3 - Database** แท็บ `HS_<รหัสจังหวัด>`
หัวตาราง `hotspotId, date, time, districtCode, subdistrictCode, districtName, subdistrictName, village, plantType, lat, lng, batchId, importedAt`
รายชื่อจังหวัดอ่านจากแท็บ `ProvinceSummary` · ระบบตัดแถวที่ไม่มีพิกัด/วันที่ หรือ hotspotId ซ้ำ · แคช 10 นาที (Mini Super Admin/Super Admin กด “ดึง HS ต้นทางใหม่” ได้)

## ชีตในฐานข้อมูลระบบนี้

| ชีต | ใช้ทำอะไร | คอลัมน์สำคัญ |
|---|---|---|
| `Accounts` | บัญชี Admin / Mini Super Admin (Super Admin ไม่อยู่ในชีต) | accountId (A-จังหวัด-ลำดับ), phone (ข้อความ), provinceCode, role = `admin`/`minisuper`, status = `approved`/`disabled` |
| `Requests` | คำขอใช้งาน | requestedRole, consentAt, status = `pending`/`approved`/`rejected`, decidedBy, reason |
| `Verifications` | ผลตรวจปัจจุบัน 1 แถวต่อ 1 จุด HS | provinceCode + hotspotId, สำเนาข้อมูล HS ณ เวลาบันทึก, status = `draft`/`verified`, result, พิกัดหน้างาน + ระยะห่าง (ม.), recordedBy*, updatedBy* |
| `Photos` | ภาพหลักฐาน (สูงสุด 3 ภาพต่อจุด) | verificationId, driveFileId, sha256, sizeBytes, พิกัด/เวลาจาก EXIF (ข้อมูลจากอุปกรณ์) |
| `AuditLog` | บันทึกการใช้งานทุกการกระทำ | time, actorId, actorName, role, provinceCode, action, target, detail |
| `LoginAttempts` | ทุกการพยายามเข้าสู่ระบบ (ไม่เก็บรหัสผ่าน) | role, identifier (เบอร์/ชื่อผู้ใช้), result, device |
| `Settings` | ค่าระบบ | source_sheet_id, photo_folder_id, risk_url, hub_url, counter_total |
| `Counter` | ผู้เข้าชมรายวัน | date, hits |

ค่า `result`: `burned` พบการเผา · `not_burned` ไม่พบการเผา · `not_found` ไม่พบจุด · `needs_review` ต้องตรวจซ้ำ · `inaccessible` เข้าตรวจสอบไม่ได้

ค่า `action` ใน AuditLog: `login, logout, register, request_approve, request_reject, account_create, account_update, account_approved, account_disabled, account_delete, verification_create, verification_update, verification_delete, photo_upload, photo_delete, export, settings_save, cache_clear, setup`

## ความถูกต้องของข้อมูล

* ทุกคำสั่งเขียนอยู่ภายใต้ `LockService` · ผลตรวจและภาพมีรหัสคำขอ (UUID) จากอุปกรณ์ ส่งซ้ำได้โดยไม่บันทึกซ้ำ
* ค่าที่ขึ้นต้นด้วย `= + - @` ถูกบันทึกเป็นข้อความ กันสูตรแฝง
* ลบผลตรวจ: ลบแถวใน `Verifications` และ `Photos` ย้ายไฟล์ภาพไปถังขยะ Drive (กู้คืนได้ 30 วัน) และเก็บสำเนาข้อมูลเดิมไว้ใน `AuditLog.detail`
* ประวัติการแก้ไขทุกครั้งอยู่ใน `AuditLog`
