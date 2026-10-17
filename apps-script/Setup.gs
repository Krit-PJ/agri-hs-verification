/* Run from the Apps Script editor only. Contains IDs, never passwords. */
function setupDatabaseConnection() {
  const props = PropertiesService.getScriptProperties();
  const expected = {
    SPREADSHEET_ID: '1pUDEiOunwraALqknLUT0VYVVSDmpTSZkS4O-ePA-9WQ',
    PHOTO_FOLDER_ID: '1oUbGXBetamsQH2US9F08Kl1mKOeOg1im'
  };
  Object.keys(expected).forEach(function(key) {
    const old = props.getProperty(key);
    assert_(!old || old === expected[key], 'CONFIG_CONFLICT', 'มีค่า ' + key + ' ของระบบอื่นอยู่แล้ว กรุณาตรวจสอบก่อน');
  });
  const book = SpreadsheetApp.openById(expected.SPREADSHEET_ID);
  DriveApp.getFolderById(expected.PHOTO_FOLDER_ID).getName();
  props.setProperties(expected);
  if (!props.getProperty('PRIVACY_CONTROLLER')) props.setProperty('PRIVACY_CONTROLLER','สำนักงานเกษตรจังหวัด / กรมส่งเสริมการเกษตร');
  book.setSpreadsheetTimeZone('Asia/Bangkok');
  initializeBackend();
  return checkDatabaseReady();
}

function setupInitialLoginAccounts() {
  const result = setupRequestedLoginAccounts();
  const accounts = readAuthAccounts_();
  const key = normalizeUsername_('620000');
  const account = authAccountByKey_(accounts, key);
  account.profile.assignedProvinceCode = '62';
  account.sessionVersion = uuid_();
  PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_' + key, JSON.stringify(account));
  return {configured: result.configured, adminProvinceCode: '62', note: 'ตั้งบัญชีและลบ bootstrap passwords แล้ว ไม่ต้องรันซ้ำ'};
}

function checkDatabaseReady() {
  ensureSchema_();
  const props = PropertiesService.getScriptProperties();
  const counts = {};
  Object.keys(APP.HEADERS).forEach(function(name) {
    counts[name] = Math.max(0, getRequiredSheet_(name).getLastRow() - 1);
  });
  return {
    schemaReady: true,
    rows: counts,
    photoFolderConfigured: Boolean(props.getProperty('PHOTO_FOLDER_ID')),
    loginAccounts: Object.keys(readAuthAccounts_()).length,
    note: 'ผลนี้ตรวจโครงสร้างเท่านั้น ต้อง deploy และทดสอบ API/อัปโหลดภาพจริงก่อนใช้งานภาคสนาม'
  };
}
