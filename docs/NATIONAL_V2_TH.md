# ระบบตรวจสอบจุดความร้อนระดับประเทศ v2.0 — ขอบเขตสามส่วน
วันที่ตรวจ: 16 ตุลาคม 2569

## 1. ผลวิเคราะห์ก่อนแก้
- data-source.js normalizeRows และ ImportService.gs parseDetailSheet_ กรองกำแพงเพชรตายตัว; Excel เดิมเลือกชีตแรกได้ จึงเสี่ยงได้ตารางสรุป
- importRows_/syncSource_ เดิม replaceBaseAtomically_ ทั้ง HS_Base; หากขยายข้อมูลตรง ๆ จะลบจังหวัดและปีอื่น
- Auth.gs มี password session และบทบาทจริง แต่ไม่มี assignedProvinceCode; actorCanAccessHs_ เดิมให้ Admin ทุกจังหวัด; exportCsv_/qa_ เดิมอ่านทุกแถว
- app.js Hero/สรุป/รายงานมีข้อความกำแพงเพชร; ตัวกรองอำเภอชื่อเหมือนกันข้ามจังหวัดอาจรวมผิด
- มีข้อมูลอ้างอิงกำแพงเพชร 593 จุดในชุดปี 2569 และระบบความเสี่ยงเดิม ไม่พบชุดขอบเขตจังหวัด/ทะเบียนอำเภอตำบลทั่วประเทศที่ยืนยันใช้ได้

## 2. การเปลี่ยนแปลงในสามส่วน
### การนำเข้า
- อ่าน AllData ก่อน หากไม่มี อ่านเฉพาะชีตรายจุดที่หัวตารางตรง: วัน, จังหวัด/รหัสจังหวัด, พื้นที่, พืช, พิกัด ไม่ใช้ตารางสรุปสร้างพิกัด
- หลายไฟล์ Excel/CSV/JSON/GeoJSON และ Google Sheet ใช้ national-core.js + data-source.js ชุดเดียวกัน byte-identical กับ NationalCore.gs + SharedData.gs
- เก็บ sourceFields, sourceFile, sourceSheet, sourceRow, sourceHsId, รหัสพื้นที่เป็น string ใน source_snapshot_json; schema เดิมไม่เพิ่ม/ลบคอลัมน์
- พ.ศ./ค.ศ./serial, วันไม่มีจริง, ค่าว่างพิกัด, CRS ที่ไม่รองรับ, ชื่อ–รหัสจังหวัด/parent code ขัดกันถูกแยก QA ไม่แก้เงียบ
- มีรหัส/ชื่อจังหวัด 77 รายการในทะเบียนภายใน ไม่ได้แปลว่า HS/ขอบเขตครบ 77 จังหวัด; ชุดขอบเขตและทะเบียนอำเภอ–ตำบลยังไม่พร้อม จึงแสดง boundaryVerified=false ทุกแถว พร้อม warning ไม่อ้างสอบทวนตำแหน่งแล้ว
- เมื่อมี coordinateProvinceCode จากแหล่งสอบทวน ขัดกับจังหวัดจะปฏิเสธ; ยังไม่มี spatial join สำหรับค้นจังหวัดจาก polygon จริง
- แยกปีปฏิทินจากวันที่เกิดเหตุในหลายปี; ปีชุดข้อมูลเดี่ยวใช้ค่าที่ผู้ดูแลยืนยัน
- QA นับแถวถูกปฏิเสธหนึ่งเหตุผลหลักต่อแถว; warnings ซ้อนกันได้และแยกจากยอด accepted/rejected
- ยืนยันทีละคู่ provinceCode + datasetYear; ตรวจ ticket ผูก actor + payload hash + fingerprint ฐานเดิม อายุ 10 นาที; เปลี่ยนข้อมูล/ขอบเขต/URL หรือต้นทาง Google Sheets เปลี่ยนต้องอ่านใหม่
- แทนเฉพาะจังหวัด/ปีนั้น จังหวัดอื่น/ปีอื่นคงเดิม; ว่าง/ไม่ผ่าน QA ไม่ลบฐาน; ประวัติผลตรวจ/รูปคงอยู่ และ reuse HS ID เดิมเมื่อเหตุการณ์ตรงกันเพื่อไม่ทำลิงก์เดิมหาย
- source ID ซ้ำแต่เหตุการณ์คนละเวลา/ปี ใช้รหัสภายในตาม province/date/time/coordinates ไม่ผูกผลตรวจผิดเหตุการณ์; ถ้าไม่ทราบเวลา QA เตือนความแม่นยำตรวจซ้ำจำกัด
- แสดง progress แยกส่วน และหยุดเมื่อผิดพลาด ไม่รายงานสำเร็จทั้งชุด; กดทำต่อใช้ requestId เดิมในแท็บนั้น หรือเปิดใหม่อ่าน QA ใหม่ได้ การแทนข้อมูลเป็น deterministic ไม่ append จุดซ้ำ
- จำกัด 50,000 แถวต่อชุด/ฐาน และ 5,000 จุดต่อจังหวัด/ปี; ถ้าเกินให้หยุดชัดเจน ต้องแยก storage/ย้ายฐานก่อน ห้ามฝืนว่าเป็นระบบรองรับ volume ทั้งประเทศไม่จำกัด

### สิทธิ์
- Admin ต้องมี assignedProvinceCode จากบัญชีบนเซิร์ฟเวอร์; แก้ UI/request/localStorage ไม่เพิ่มสิทธิ์; ไม่ได้รับมอบหมายจะจัดการไม่ได้
- Super Admin มอบหมายได้เฉพาะบัญชี Admin ที่มีอยู่; เปลี่ยนแล้ว sessionVersion หมุนและ session เดิมของบัญชีนั้นหมดสิทธิ์
- บัญชีใหม่/แก้บัญชีเก็บแยก AUTH_ACCOUNT_V2_<username> ป้องกัน JSON รวมเกินขนาด property; อ่าน legacy AUTH_ACCOUNTS_V1 ต่อได้ ไม่ลบรหัสผ่านเดิม
- ทุก mutation ใช้ session + CSRF nonce; legacy bearer token ใช้เปลี่ยนข้อมูลผ่าน API รุ่นประเทศไม่ได้ ต้อง password login เพื่อรับ CSRF
- Backend actorCanAccessHs_ ตรวจจังหวัดก่อนอ่าน/ผลตรวจ/รูป/รายงาน/ส่งออก; QA และ log จำกัดสิทธิ์; legacy replace-all API ถูกปิดและให้ใช้ preview/commit เท่านั้น
- ผู้ใช้ไม่ Login อ่านเฉพาะข้อมูลที่กำหนดเผยแพร่ผ่าน bootstrap; ไม่ส่งชื่อผู้ตรวจ หมายเหตุ หรือพิกัดโทรศัพท์/ภาพออกสาธารณะ; ไม่มีสิทธิ์บันทึก
- หน้า Header ใช้บัญชีที่ session ยังผ่านตรวจ ไม่ใช้ localStorage ยืนยันบทบาท; หมดอายุล้างข้อมูลและโหลดมุมมองเผยแพร่ใหม่

### จังหวัดและข้อความ
- HSNationUI แยก authorizedProvinceCodes / importedProvinceCodes / selectedProvinceCode; HSNational.context เป็นจุดกลางของข้อความชื่อระบบและพื้นที่
- Admin แสดงชื่อจังหวัดที่ได้รับมอบหมาย; Super Admin คงชื่อประเทศไทย + subtitle จังหวัดที่ดูหรือ coverage จริง
- แผนที่ สรุป และรายงานใช้ state.filtered ชุดเดียวกันในโหมดประเทศ; export ส่งขอบเขตเดียวกันให้ backend ตรวจซ้ำ
- ภาพรวมหลายจังหวัดไม่เปิดตัวกรองชื่ออำเภอ/ตำบลจนเลือกจังหวัด ป้องกันชื่อซ้ำข้ามจังหวัด; ตารางรวมใช้จังหวัดเป็นส่วนของ key
- จังหวัดไม่มี HS แสดงรายการว่าง ไม่ยืมจุดจังหวัดอื่น; coverage หมายถึงจังหวัดที่อ่านได้ในขอบเขตบัญชีปัจจุบัน ไม่ใช่ทะเบียนทั้งหมดหรือขอบเขต GIS พร้อมแล้ว

## 3. ไฟล์/config
เพิ่ม national-core.js, national-ui.js, apps-script/NationalCore.gs, SharedData.gs, NationalService.gs และ tests/national-v2.test.js
แก้ data-source.js, app.js, index.html, styles.css, report.js, apps-script/Auth.gs, Code.gs, Config.gs, Repository.gs, VerificationService.gs
ไม่แก้ไฟล์ risk/ สูตรความเสี่ยง แผนที่ฐาน โครงสร้าง Dashboard และไม่เพิ่ม installer/GitHub automation

## 4. ตั้งค่าโดยผู้ดูแลระบบเดิม
1. สำรอง Google Spreadsheet/Script Properties เดิมตามงานดูแลปกติก่อนอัปเดต; ไม่มีการ deploy อัตโนมัติในงานนี้
2. อัปเดต .gs ทุกไฟล์จาก apps-script รวมไฟล์ใหม่ทั้งสามไฟล์ในโปรเจ็กต์เดิม และ Deploy เวอร์ชัน Apps Script ใหม่ด้วยสิทธิ์/ปลายทางเดิม ไม่ต้องย้าย schema
3. กำหนด apiEndpoint ใน site-config.js ตามเดิม; copy static files รุ่นนี้ทั้งหมด; เข้าสู่ระบบใหม่เพื่อรับ CSRF
4. ใช้บัญชี Super Admin เดิม เข้า ผู้ดูแลระบบ → มอบหมายจังหวัดให้ Admin → ใส่ username เดิม → เลือกรหัสจังหวัด (กำแพงเพชร 62) → บันทึก ผู้ใช้ Admin ต้อง login ใหม่
5. หากสร้างบัญชีจาก Apps Script editor ให้ใช้ setupPasswordAccount ที่มีอยู่ โดยส่ง profile {role:'admin', assignedProvinceCode:'62', displayName:'...'}; ห้ามใส่รหัสผ่านในไฟล์เว็บ/commit
6. Script Property PUBLIC_PROVINCE_CODES เป็นรหัสคั่นจุลภาค เช่น 62 (ค่าเริ่มต้นเพื่อรักษาการเผยแพร่เดิมเฉพาะกำแพงเพชร) เพิ่มจังหวัดเฉพาะที่อนุญาตเผยแพร่แล้ว ไม่สัมพันธ์กับสิทธิ์จัดการของบัญชี
7. แหล่ง Google Sheet: เลือกจังหวัดของแหล่งข้อมูล → URL → บันทึก (ยังไม่ตรวจสิทธิ์อ่าน) → ให้บัญชีผู้รัน Apps Script มีสิทธิ์อ่านไฟล์ → กดอ่าน/ตรวจ QA แยกต่างหาก ข้อผิดพลาด Google access แสดงว่าไม่มีสิทธิ์/ไม่พบไฟล์ ไม่ใช่บันทึก URL แล้วเชื่อมสำเร็จ
8. เลือกจังหวัด/โหมดปี → อ่านไฟล์หรือ Sheets → ตรวจ QA/ยอดเก่า–ใหม่/เหตุการณ์ที่จะนำออก → ยืนยันแต่ละส่วน ต้องมีจังหวัดอย่างน้อยหนึ่งจังหวัดในตัวเลือกนำเข้า
9. หากส่วนใดล้มเหลว ไม่แก้ส่วนที่สำเร็จแล้วโดยอัตโนมัติ; ตรวจ progress และอ่าน QA อีกครั้งก่อนทำต่อเมื่อ ticket หมดอายุ

## 5. หลักฐานทดสอบ
- tests/national-v2.test.js เป็นข้อมูลจำลอง: แยกสิทธิ์, หลายจังหวัด/หลายปี, tamper, preview/cancel, replace เฉพาะ partition, replay, stale ticket, CSRF, public privacy, AllData/Excel-Sheets equivalent, source permission status, assignment, synthetic 77 จังหวัด
- tests เดิมตรวจข้อมูลกำแพงเพชร 593 จุดจากไฟล์อ้างอิงจริงและความเข้ากันได้เดิม ไม่ใช่ข้อมูล HS ปัจจุบันทั้งประเทศ
- browser preview ใช้ไฟล์กำแพงเพชรในเครื่อง ไม่ได้เชื่อม Google จริง
- ยังไม่ทดสอบ Google authorization/deployment, workbook Excel จริงหลายจังหวัด, โหลดจริงระดับประเทศ, devices จริง, restore จากเหตุขัดข้องระหว่างเปลี่ยนชื่อ staging sheet

## 6. งานที่ยังเหลือก่อน Production ระดับประเทศ
- ยืนยันทะเบียนจังหวัดกับเจ้าของข้อมูลและเพิ่มทะเบียน parent/name/code อำเภอ–ตำบลที่มีเวอร์ชัน; ตอนนี้ตรวจโครงสร้างรหัสและ parent ได้ แต่ยังยืนยันว่ารหัสนั้นมีจริงหรือชื่อสัมพันธ์จริงไม่ได้
- จัดหาขอบเขต GIS ที่ได้รับอนุญาต พร้อม CRS/เวอร์ชันและทดสอบ point-in-polygon; ตอนนี้ warning และ coverage ไม่อ้างผลสอบทวนเชิงพื้นที่
- ทดสอบ Google Sheets/Apps Script จริง ภาระโหลด/โควตา/ข้อมูลจริง 77 จังหวัด; เมื่อเกินเพดานรุ่นนี้ต้องขยาย storage ก่อนใช้จริง
- ไม่ใช้ชื่อระบบประเทศไทยหรือผลทดสอบจำลองเป็นหลักฐานว่ามีข้อมูลครบทั้งประเทศ
