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

/** Applies only the privacy settings explicitly supplied by the system owner. */
function setupApprovedPrivacyPolicy() {
  const props=PropertiesService.getScriptProperties();
  props.setProperties({
    PRIVACY_CONTROLLER:'สำนักงานเกษตรจังหวัดกำแพงเพชร / กรมส่งเสริมการเกษตร',
    PRIVACY_CONTACT:'kamphaengphet.doae@gmail.com',
    PRIVACY_RETENTION:'ตามนโยบายและข้อกำหนดของหน่วยงาน สำนักงานเกษตรจังหวัดกำแพงเพชร'
  });
  return checkRegistrationPolicyReady();
}

function backupRegistrationBeforePhoneRepair(){
 const book=getSpreadsheet_(),sheet=getRequiredSheet_(APP.SHEETS.REGISTRATIONS);
 const name='Backup_User_Registration_'+Utilities.formatDate(new Date(),'Asia/Bangkok','yyyyMMdd_HHmmss')+'_'+uuid_().slice(0,4);
 sheet.copyTo(book).setName(name);const result={backupSheet:name,rows:Math.max(0,sheet.getLastRow()-1)};console.log(JSON.stringify(result));return result;
}
function checkRuntimeV26(){
 const policy=getRegistrationPolicy_(),result={version:APP.VERSION,registrationMode:policy.registrationMode,privacyConfigured:policy.configured,cacheScopeValidation:true,personalAdminAccounts:true,phoneRepair:repairPhoneCells_(false)};
 console.log(JSON.stringify(result));return result;
}

/** Adds only the provincial request sheet; does not create/approve accounts or change credentials. */
function setupRuntimeV27(){
 beginRepositoryRequest_();ensureRegistrationSheet_(APP.SHEETS.ADMIN_REGISTRATIONS);
 return checkRuntimeV27();
}
function checkRuntimeV27(){
 beginRepositoryRequest_();const policy=getRegistrationPolicy_();
 const result={version:APP.VERSION,privacyConfigured:policy.configured,registrationMode:policy.registrationMode,provincialAdminApproval:'super_admin_only',adminRequestsSheetReady:Boolean(getSpreadsheet_().getSheetByName(APP.SHEETS.ADMIN_REGISTRATIONS)),requestLocalReadMemo:true};
 console.log(JSON.stringify(result));return result;
}

/** Read-only diagnostic: no schema/account/data mutations. */
function checkRuntimeV28(){
 beginRepositoryRequest_();const policy=getRegistrationPolicy_(),empty=nationalPublicRead_({});
 const result={version:APP.VERSION,privacyConfigured:policy.configured,publicRequiresProvince:true,unselectedPublicHs:empty.hotspots.items.length,teamEditorRole:'super_admin',provinceAdminScope:true};
 console.log(JSON.stringify(result));return result;
}

/** Read-only registration readiness: no identity details, account writes or approvals. */
function diagnoseRegistrationReadinessV29(){
 beginRepositoryRequest_();const p=PropertiesService.getScriptProperties(),a=p.getProperties(),accounts=readAuthAccounts_(),book=getSpreadsheet_();
 const r={version:APP.VERSION,policyReady:getRegistrationPolicy_().configured,accountCount:Object.keys(accounts).length,propertyBytes:Object.keys(a).reduce(function(n,k){return n+unescape(encodeURIComponent(k+String(a[k]))).length;},0),accountLimit:Number(p.getProperty('REGISTRATION_MAX_ACCOUNTS')||200),superAdminApprovalLevels:['inspector','provincial_admin'],sheets:[]};
 [APP.SHEETS.REGISTRATIONS,APP.SHEETS.ADMIN_REGISTRATIONS].forEach(function(name){const sheet=book.getSheetByName(name),head=APP.HEADERS[name];r.sheets.push({name:name,exists:!!sheet,rows:sheet?Math.max(0,sheet.getLastRow()-1):0,headersMatch:!!sheet&&sheet.getRange(1,1,1,head.length).getDisplayValues()[0].join('|')===head.join('|')});});console.log(JSON.stringify(r));return r;
}
