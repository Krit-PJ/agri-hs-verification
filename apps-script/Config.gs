const APP = Object.freeze({
  VERSION: '2.6.0',
  PROVINCE: 'กำแพงเพชร',
  LAND_TYPE: 'พื้นที่เกษตร',
  PLANT_TYPES: Object.freeze(['นาข้าว', 'อ้อย', 'เกษตรอื่น ๆ', 'อื่น ๆ']),
  PERSON_CATEGORIES: Object.freeze(['นักวิชาการส่งเสริมการเกษตร', 'กำนัน', 'ผู้ใหญ่บ้าน', 'ผู้ช่วยผู้ใหญ่บ้าน', 'อกม.', 'อื่นๆ']),
  RESULTS: Object.freeze(['burned', 'not_burned', 'not_found', 'needs_review', 'inaccessible']),
  STATUSES: Object.freeze(['draft', 'verified']),
  DEFAULT_SOURCE_SHEET: 'hsPlant2026',
  DETAIL_FALLBACK_SHEET: 'hsAll',
  PIVOT_REFERENCE_SHEET: 'hsPlant2026',
  MAX_PAGE_SIZE: 500,
  MAX_IMPORT_ROWS: 5000,
  MAX_BODY_CHARS: 7500000,
  MAX_PHOTO_BYTES: 1000000,
  MAX_READ_PHOTO_BYTES: 5 * 1024 * 1024,
  PHOTO_MIME_TYPES: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  TOKEN_MIN_LENGTH: 24,
  AUTH_SESSION_SECONDS: 4 * 60 * 60,
  AUTH_HASH_ITERATIONS: 20000,
  AUTH_MAX_FAILURES: 5,
  AUTH_FAILURE_WINDOW_SECONDS: 15 * 60,
  SHEETS: Object.freeze({
    BASE: 'HS_Base',
    VERIFICATION: 'HS_Verification',
    PHOTOS: 'HS_Photos',
    INSPECTORS: 'Inspector_Profile',
    LOG: 'Verification_Log',
    REGISTRATIONS: 'User_Registration'
  }),
  HEADERS: Object.freeze({
    User_Registration: Object.freeze(['registration_id','phone','full_name','position','agency_level','agency','province_code','district','privacy_version','privacy_acknowledged_at','status','created_at','reviewed_at','reviewed_by']),
    HS_Base: Object.freeze([
      'hs_id', 'acquired_at', 'latitude', 'longitude', 'province', 'district',
      'tambon', 'village', 'land_type', 'plant_type', 'source_sheet',
      'source_row', 'source_snapshot_json', 'imported_at', 'active', 'dataset_year_be'
    ]),
    HS_Verification: Object.freeze([
      'verification_id', 'request_id', 'hs_id', 'status', 'result', 'notes', 'action',
      'observed_latitude', 'observed_longitude', 'gps_accuracy_m', 'missing_gps_reason',
      'distance_m', 'inspector_id', 'inspector_name', 'verified_at',
      'source_snapshot_json', 'created_at', 'updated_at',
      'person_category', 'person_category_other', 'field_inspector_name', 'reported_by_id', 'reported_by_name', 'agency',
      'inspected_at', 'inspected_at_source', 'submitted_at', 'observed_land_matches_source', 'observed_land_type',
      'observed_plant_type', 'fire_state', 'evidence_required', 'photo_missing_reason'
    ]),
    HS_Photos: Object.freeze([
      'photo_id', 'request_id', 'verification_id', 'hs_id', 'drive_file_id',
      'mime_type', 'size_bytes', 'sha256', 'caption', 'inspector_id',
      'client_captured_at', 'uploaded_at', 'attachment_source', 'exif_json', 'coordinate_source',
      'photo_latitude', 'photo_longitude', 'photo_accuracy_m', 'photo_taken_at', 'photo_taken_at_source',
      'device_capture_json', 'distance_to_hs_m', 'evidence_qa_json', 'original_sha256'
    ]),
    Inspector_Profile: Object.freeze([
      'inspector_id', 'display_name', 'district', 'tambon', 'role', 'token_hash',
      'active', 'created_at', 'last_seen_at', 'person_category', 'person_category_other', 'position', 'agency'
    ]),
    Verification_Log: Object.freeze([
      'log_id', 'request_id', 'timestamp', 'actor_id', 'action', 'entity_type',
      'entity_id', 'status', 'details_json'
    ])
  })
});

const SOURCE_ALIASES = Object.freeze({
  hsId: ['hsid', 'hs_id', 'hotspotid', 'hotspot_id', 'id'],
  acquiredAt: ['date', 'yyyy-mm-dd', 'acq_date', 'acquired_at', 'วันที่'],
  time: ['time', 'acq_time', 'เวลา'],
  latitude: ['latitude', 'lat', 'y', 'ละติจูด'],
  longitude: ['longitude', 'lon', 'lng', 'long', 'x', 'ลองจิจูด'],
  maps: ['maps', 'map', 'googlemaps', 'พิกัด'],
  province: ['province', 'province_n', 'provincen', 'จังหวัด'],
  district: ['amphoe', 'amphoen', 'district', 'อำเภอ'],
  tambon: ['tambon', 'tambonn', 'subdistrict', 'ตำบล'],
  village: ['baann', 'village', 'หมู่บ้าน'],
  landType: ['landtype', 'land_type', 'ประเภทพื้นที่'],
  plantType: ['planttype', 'plant_type', 'crop', 'crop_type', 'ชนิดพืช']
});
