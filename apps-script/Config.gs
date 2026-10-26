/**
 * ระบบตรวจสอบจุดความร้อน (Thailand HS Verification) — Backend v3.0
 * -----------------------------------------------------------------
 * แหล่ง HS (อ่านอย่างเดียว) : Google Sheet "TH Agri-Risk Map Burning V3 - Database" แท็บ HS_<รหัสจังหวัด>
 * ฐานข้อมูลระบบนี้           : Google Sheet "Thailand HS Verification - Database"
 *                              ในโฟลเดอร์ Drive "5. Thailand HS Verification"
 * รูปภาพหลักฐาน             : โฟลเดอร์ Drive "HS Verification Photos" (ไฟล์ส่วนตัว อ่านผ่าน API ที่ตรวจสิทธิ์)
 *
 * บทบาท (ระบบเดียวกับ TH-Agri-Risk-Maps-Burning: Admin/Mini Super Admin เข้าด้วยเบอร์โทร, Super Admin ใช้ชื่อผู้ใช้+รหัสผ่าน)
 *   superadmin : จัดการได้ทั้งระบบ
 *   minisuper  : ระดับจังหวัด — อนุมัติ/อนุญาตเจ้าหน้าที่ในจังหวัด, บันทึก แก้ไข เพิ่ม ลบ ข้อมูลระดับจังหวัด
 *   admin      : ผู้บันทึกข้อมูลผลตรวจจุดความร้อน (HS) ในจังหวัดของตน
 */

const APP_VERSION = '3.1.0';
const SETUP_VERSION = '3.1';

/** ฐานข้อมูลของระบบตรวจสอบ (สร้างไว้แล้วในโฟลเดอร์ 5. Thailand HS Verification) */
const DB_ID = '1LOuhCmG8nSS5Si-wHUtgyUtbWYkTw-XKaVjrYBHPxlQ';
/** แหล่ง HS ของระบบ Agri-Risk Map Burning (อ่านอย่างเดียว) — เปลี่ยนได้ที่ Settings key source_sheet_id */
const DEFAULT_SOURCE_ID = '178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A';
/** โฟลเดอร์รูปภาพ — เปลี่ยนได้ที่ Settings key photo_folder_id */
const DEFAULT_PHOTO_FOLDER_ID = '1bo9-9z9M2fb09T51qG2Od0SjZXkUd6vl';

const TOKEN_HOURS = 8;
const HS_CACHE_SECONDS = 600;
const MAX_PHOTOS_PER_HS = 3;
const REGISTER_LIMIT_PER_10_MIN = 30;
const MAX_PHOTO_BYTES = 1000000;
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const PROVINCES = {"10":"กรุงเทพมหานคร","11":"สมุทรปราการ","12":"นนทบุรี","13":"ปทุมธานี","14":"พระนครศรีอยุธยา","15":"อ่างทอง","16":"ลพบุรี","17":"สิงห์บุรี","18":"ชัยนาท","19":"สระบุรี","20":"ชลบุรี","21":"ระยอง","22":"จันทบุรี","23":"ตราด","24":"ฉะเชิงเทรา","25":"ปราจีนบุรี","26":"นครนายก","27":"สระแก้ว","30":"นครราชสีมา","31":"บุรีรัมย์","32":"สุรินทร์","33":"ศรีสะเกษ","34":"อุบลราชธานี","35":"ยโสธร","36":"ชัยภูมิ","37":"อำนาจเจริญ","38":"บึงกาฬ","39":"หนองบัวลำภู","40":"ขอนแก่น","41":"อุดรธานี","42":"เลย","43":"หนองคาย","44":"มหาสารคาม","45":"ร้อยเอ็ด","46":"กาฬสินธุ์","47":"สกลนคร","48":"นครพนม","49":"มุกดาหาร","50":"เชียงใหม่","51":"ลำพูน","52":"ลำปาง","53":"อุตรดิตถ์","54":"แพร่","55":"น่าน","56":"พะเยา","57":"เชียงราย","58":"แม่ฮ่องสอน","60":"นครสวรรค์","61":"อุทัยธานี","62":"กำแพงเพชร","63":"ตาก","64":"สุโขทัย","65":"พิษณุโลก","66":"พิจิตร","67":"เพชรบูรณ์","70":"ราชบุรี","71":"กาญจนบุรี","72":"สุพรรณบุรี","73":"นครปฐม","74":"สมุทรสาคร","75":"สมุทรสงคราม","76":"เพชรบุรี","77":"ประจวบคีรีขันธ์","80":"นครศรีธรรมราช","81":"กระบี่","82":"พังงา","83":"ภูเก็ต","84":"สุราษฎร์ธานี","85":"ระนอง","86":"ชุมพร","90":"สงขลา","91":"สตูล","92":"ตรัง","93":"พัทลุง","94":"ปัตตานี","95":"ยะลา","96":"นราธิวาส"};

const SHEETS = {
  Accounts: ['accountId', 'phone', 'fullName', 'position', 'affiliation', 'provinceCode', 'provinceName', 'role', 'status', 'createdAt', 'approvedAt', 'approvedBy', 'lastLoginAt'],
  Requests: ['requestId', 'phone', 'fullName', 'position', 'affiliation', 'provinceCode', 'provinceName', 'requestedRole', 'note', 'consentAt', 'status', 'createdAt', 'decidedAt', 'decidedBy', 'reason', 'accountId'],
  Verifications: ['verificationId', 'clientRequestId', 'provinceCode', 'provinceName', 'hotspotId', 'hsDate', 'districtName', 'subdistrictName', 'village', 'plantType', 'hsLat', 'hsLng',
    'status', 'result', 'fireState', 'observedMatches', 'observedLandType', 'observedPlantType', 'personCategory', 'personCategoryOther', 'fieldInspectorName', 'inspectedAt',
    'obsLat', 'obsLng', 'gpsAccuracyM', 'missingGpsReason', 'distanceM', 'notes', 'followUpAction', 'photoCount', 'photoMissingReason',
    'recordedById', 'recordedByName', 'recordedByRole', 'createdAt', 'updatedAt', 'updatedById', 'updatedByName'],
  Photos: ['photoId', 'clientRequestId', 'verificationId', 'hotspotId', 'provinceCode', 'driveFileId', 'fileName', 'mimeType', 'sizeBytes', 'sha256', 'photoLat', 'photoLng', 'takenAt', 'uploadedById', 'uploadedByName', 'uploadedAt'],
  AuditLog: ['logId', 'time', 'actorId', 'actorName', 'role', 'provinceCode', 'action', 'target', 'detail'],
  LoginAttempts: ['time', 'role', 'identifier', 'result', 'accountId', 'fullName', 'provinceCode', 'provinceName', 'device'],
  Settings: ['key', 'value'],
  Counter: ['date', 'hits']
};

/** คอลัมน์ที่ต้องเก็บเป็นข้อความ (กัน Google Sheet ตัดเลข 0 นำหน้าหรือแปลงเป็นวันที่) */
const TEXT_COLUMNS = {
  Accounts: ['accountId', 'phone', 'provinceCode', 'createdAt', 'approvedAt', 'lastLoginAt'],
  Requests: ['requestId', 'phone', 'provinceCode', 'consentAt', 'createdAt', 'decidedAt', 'accountId'],
  Verifications: ['verificationId', 'clientRequestId', 'provinceCode', 'hotspotId', 'hsDate', 'inspectedAt', 'recordedById', 'createdAt', 'updatedAt', 'updatedById'],
  Photos: ['photoId', 'clientRequestId', 'verificationId', 'hotspotId', 'provinceCode', 'driveFileId', 'sha256', 'takenAt', 'uploadedById', 'uploadedAt'],
  AuditLog: ['logId', 'time', 'actorId', 'provinceCode'],
  LoginAttempts: ['time', 'identifier', 'accountId', 'provinceCode'],
  Settings: ['key', 'value'],
  Counter: ['date']
};

const ROLE_LABELS = { superadmin: 'Super Admin', minisuper: 'Mini Super Admin', admin: 'Admin' };
const RESULTS = ['burned', 'not_burned', 'not_found', 'needs_review', 'inaccessible'];
const RESULT_LABELS = { burned: 'พบการเผา', not_burned: 'ไม่พบการเผา', not_found: 'ไม่พบจุด', needs_review: 'ต้องตรวจซ้ำ', inaccessible: 'เข้าตรวจสอบไม่ได้' };
const STATUSES = ['draft', 'verified'];
const FIRE_STATES = ['', 'unknown', 'active', 'extinguished'];
const MISSING_GPS_REASONS = ['', 'permission_denied', 'signal_unavailable', 'device_unavailable', 'field_safety', 'other'];
const PHOTO_MISSING_REASONS = ['', 'field_safety', 'device_unavailable', 'retrospective'];
const PERSON_CATEGORIES = ['นักวิชาการส่งเสริมการเกษตร', 'กำนัน', 'ผู้ใหญ่บ้าน', 'ผู้ช่วยผู้ใหญ่บ้าน', 'อกม.', 'อื่นๆ'];
const LOGIN_RESULTS = { success: 'สำเร็จ', not_found: 'ไม่มีหมายเลขในระบบ', pending: 'รออนุมัติ', disabled: 'บัญชีถูกระงับ', invalid: 'รูปแบบไม่ถูกต้อง', wrong_credentials: 'ชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง' };
const AUDIT_LABELS = {
  setup: 'ติดตั้งระบบ', login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', register: 'ลงทะเบียน Admin',
  request_approve: 'อนุมัติคำขอ', request_reject: 'ปฏิเสธคำขอ',
  account_create: 'เพิ่มบัญชี', account_update: 'แก้ไขบัญชี', account_approved: 'เปิดใช้บัญชี', account_disabled: 'ระงับบัญชี', account_delete: 'ลบบัญชี',
  verification_create: 'บันทึกผลตรวจ', verification_update: 'แก้ไขผลตรวจ', verification_delete: 'ลบผลตรวจ',
  photo_upload: 'แนบภาพ', photo_delete: 'ลบภาพ', export: 'ส่งออกข้อมูล', settings_save: 'ตั้งค่าระบบ', cache_clear: 'ล้างแคช HS'
};
