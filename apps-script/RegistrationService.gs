/* New applicants require approval by an administrator assigned to their province. */
const REGISTRATION_PRIVACY_VERSION_ = '2026-10-v2';
function registerUser_(payload) {
  payload=payload||{};
  assert_(getRegistrationPolicy_().configured,'POLICY_NOT_CONFIGURED','ผู้ดูแลต้องตั้งข้อมูลผู้ควบคุมข้อมูล ช่องทางติดต่อ และระยะเวลาเก็บข้อมูลก่อนเปิดลงทะเบียน');
  assert_(payload.privacyAcknowledged===true && payload.privacyVersion===REGISTRATION_PRIVACY_VERSION_, 'PRIVACY_ACK_REQUIRED','กรุณาอ่านและรับทราบประกาศความเป็นส่วนตัวฉบับปัจจุบัน');
  const phone=cleanText_(payload.phone,20).replace(/[ -]/g,'');
  assert_(/^0[689][0-9]{8}$/.test(phone),'VALIDATION_ERROR','กรุณาระบุหมายเลขโทรศัพท์มือถือไทย 10 หลัก');
  const name=cleanText_(payload.fullName,120),position=cleanText_(payload.position,120),level=cleanText_(payload.agencyLevel,16),code=cleanText_(payload.provinceCode,2),district=cleanText_(payload.district,120);
  assert_(name && position && ['district','province'].indexOf(level)>=0 && HSNational.provinces[code],'VALIDATION_ERROR','กรุณาระบุชื่อ ตำแหน่ง และสังกัดให้ครบ');
  assert_(level!=='district'||district,'VALIDATION_ERROR','กรุณาระบุอำเภอที่สังกัด');
  return withScriptLock_(function(){
    if(typeof ensureRegistrationSheet_==='function')ensureRegistrationSheet_(APP.SHEETS.REGISTRATIONS);else ensureSchema_();
    registrationAdmission_();
    const accounts=readAuthAccounts_();
    const existing=authAccountByKey_(accounts,phone)||Object.keys(accounts).some(function(key){return canonicalStoredPhone_((accounts[key].profile||{}).phone)===phone;});
    assert_(!existing,'ACCOUNT_EXISTS','หมายเลขนี้ลงทะเบียนแล้ว กรุณาติดต่อผู้ดูแลหากเข้าสู่ระบบไม่ได้');
    const id=uuid_(),now=isoNow_(),agency=level==='district'?'สำนักงานเกษตรอำเภอ'+district:'สำนักงานเกษตรจังหวัด'+HSNational.provinces[code];
    const affiliation=cleanText_(payload.affiliationType,32);
    const affiliationLabels={kamnan:'กำนัน',village_head:'ผู้ใหญ่บ้าน',assistant_village_head:'ผู้ช่วยผู้ใหญ่บ้าน',volunteer:'อกม.'};
    const savedAgency=level==='district'&&affiliationLabels[affiliation]?affiliationLabels[affiliation]+' อำเภอ'+district:agency;
    const row={registration_id:id,phone:phone,full_name:name,position:position,agency_level:level,agency:savedAgency,province_code:code,district:level==='district'?district:'',privacy_version:REGISTRATION_PRIVACY_VERSION_,privacy_acknowledged_at:now,status:'pending',created_at:now,reviewed_at:'',reviewed_by:''};
    setupPhoneOnlyInspectorAccount_(phone,{displayName:name,phone:phone,assignedProvinceCode:code,agencyLevel:level,district:row.district,position:position,agency:savedAgency});
    try {appendObject_(APP.SHEETS.REGISTRATIONS,row);} catch(error) {PropertiesService.getScriptProperties().deleteProperty('AUTH_ACCOUNT_V2_'+phone);throw error;}
    return {registrationId:id,status:'pending',message:'ลงทะเบียนสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ'};
  });
}
function registrationCanManage_(actor,row){return actor.role==='super_admin'||actor.role==='admin'&&nationalAuthorized_(actor).indexOf(cleanText_(row.province_code))>=0;}
function publicRegistration_(row){const result={};APP.HEADERS[APP.SHEETS.REGISTRATIONS].forEach(function(k){result[k]=row[k]||'';});return result;}
function listRegistrations_(actor,payload){requireAdmin_(actor);const status=cleanText_(payload&&payload.status,24);return {items:rowsAsObjects_(APP.SHEETS.REGISTRATIONS).filter(function(r){return registrationCanManage_(actor,r)&&(!status||r.status===status);}).map(publicRegistration_)};}
function reviewRegistration_(actor,payload,approve){
 requireAdmin_(actor);
 return withScriptLock_(function(){
  const row=findOne_(APP.SHEETS.REGISTRATIONS,'registration_id',cleanText_(payload&&payload.registrationId,64));
  assert_(row&&registrationCanManage_(actor,row),'FORBIDDEN','ไม่พบรายการในขอบเขตจังหวัดที่รับผิดชอบ');
  assert_(row.status==='pending','CONFLICT','รายการนี้ได้รับการพิจารณาแล้ว');
  const phone=canonicalStoredPhone_(row.phone);
  assert_(rowsAsObjects_(APP.SHEETS.REGISTRATIONS).filter(function(r){return canonicalStoredPhone_(r.phone)===phone;}).length===1,'CONFLICT','พบหมายเลขโทรศัพท์ซ้ำ กรุณาตรวจสอบก่อนอนุมัติ');
  const account=authAccountByKey_(readAuthAccounts_(),phone),profile=account&&account.profile||{};
  assert_(account&&account.active===false&&account.authMethod==='phone_only'&&profile.role==='inspector'&&cleanText_(account.username,64)===canonicalStoredPhone_(row.phone)&&cleanText_(profile.phone,20)===canonicalStoredPhone_(row.phone)&&cleanText_(profile.assignedProvinceCode,2)===cleanText_(row.province_code,2)&&cleanText_(profile.agencyLevel,16)===cleanText_(row.agency_level,16)&&cleanText_(profile.district,120)===cleanText_(row.district,120),'CONFLICT','สถานะบัญชีไม่ตรงกับรายการลงทะเบียน');
  // Approver verifies the declared district/province; applicants never choose roles.
  row.phone=phone;
  row.status=approve?'approved':'rejected';row.reviewed_at=isoNow_();row.reviewed_by=actor.id;
  updateObjectRow_(APP.SHEETS.REGISTRATIONS,row._row,row);
  account.active=approve;account.sessionVersion=uuid_();
  PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+row.phone,JSON.stringify(account));
  appendLog_(actor,uuid_(),approve?'approveRegistration':'rejectRegistration','registration',row.registration_id,'success',{status:row.status});
  return {registrationId:row.registration_id,status:row.status};
 });
}
function getHsPhotos_(actor,payload){const hs=requireAccessibleHs_(actor,payload&&payload.hsId);return {items:photoMetadataForHs_(cleanText_(hs.hs_id)).filter(function(p){const v=findOne_(APP.SHEETS.VERIFICATION,'verification_id',p.verificationId);return v&&v.status==='verified';})};}

function getRegistrationPolicy_(){const props=PropertiesService.getScriptProperties(),controller=cleanText_(props.getProperty('PRIVACY_CONTROLLER'),500),contact=cleanText_(props.getProperty('PRIVACY_CONTACT'),500),retention=cleanText_(props.getProperty('PRIVACY_RETENTION'),1000);return {configured:Boolean(controller&&contact&&retention),version:REGISTRATION_PRIVACY_VERSION_,authMethod:'phone_only',registrationMode:'approval_required',noticeKind:'privacy_acknowledgement',noticeTitle:'เอกสารรับทราบการใช้ข้อมูลส่วนบุคคล',controller:controller,contact:contact,retention:retention,legalBasis:'ภารกิจเพื่อประโยชน์สาธารณะหรือการใช้อำนาจรัฐตามมาตรา 24(4) ซึ่งผู้ควบคุมข้อมูลต้องตรวจสอบว่าใช้กับภารกิจนี้ได้',purpose:'ตรวจสอบสิทธิ์และสังกัด จัดขอบเขตข้อมูล และบันทึกหลักฐานการตรวจสอบจุดความร้อน',dataCategories:'โทรศัพท์ ชื่อ ตำแหน่ง สังกัด พื้นที่รับผิดชอบ ประวัติการใช้งาน และพิกัดหรือภาพหลักฐานที่ส่ง',recipients:'เจ้าหน้าที่และผู้ดูแลที่ได้รับมอบหมายตามขอบเขตหน้าที่ และผู้ให้บริการ Google Workspace/Google Drive ตามการตั้งค่าของหน่วยงาน',rights:'ขอเข้าถึง แก้ไข ลบ จำกัด คัดค้าน หรือร้องเรียนตามเงื่อนไขกฎหมาย โดยติดต่อช่องทางที่ระบุ',acknowledgement:'การรับทราบประกาศความเป็นส่วนตัว ไม่ใช่การให้ความยินยอมแบบครอบคลุมทุกวัตถุประสงค์'};}

/* Bound anonymous registration cost before persistent writes. */
function registrationAdmission_(){
 const props=PropertiesService.getScriptProperties(),all=props.getProperties(),accounts=readAuthAccounts_();
 const configured=Number(props.getProperty('REGISTRATION_MAX_ACCOUNTS')||200),limit=Number.isInteger(configured)&&configured>=1&&configured<=500?configured:200;
 const cache=sessionCache_(),minute=Math.floor(Date.now()/60000),key='registration-rate:'+minute,count=Number(cache.get(key)||0);
 assert_(count<5,'RATE_LIMITED','มีคำขอลงทะเบียนจำนวนมาก กรุณาลองใหม่ภายหลัง');
 cache.put(key,String(count+1),120);
 const records=rowsAsObjects_(APP.SHEETS.REGISTRATIONS);
 assert_(Object.keys(accounts).length<limit&&records.length<limit,'REGISTRATION_CAPACITY','ระบบลงทะเบียนเต็มชั่วคราว กรุณาติดต่อผู้ดูแล');
 // UTF-8 bytes count conservatively; reserve at least 8KB for this account and admin operations.
 const bytes=Object.keys(all).reduce(function(total,k){return total+unescape(encodeURIComponent(k+String(all[k]))).length;},0);
 assert_(bytes+8192<400000,'REGISTRATION_CAPACITY','พื้นที่บัญชีใกล้เต็ม กรุณาติดต่อผู้ดูแล');
}

/** Read-only readiness check. Does not create accounts, change policy or disclose contact details. */
function checkRegistrationPolicyReady() {
  const policy=getRegistrationPolicy_();
  const report={version:policy.version,configured:policy.configured,controllerConfigured:Boolean(policy.controller),contactConfigured:Boolean(policy.contact),retentionConfigured:Boolean(policy.retention),noticeKind:policy.noticeKind};
  console.log(JSON.stringify(report));
  return report;
}
/** Preview/apply only matching registered inspector accounts; never activates or edits admins. */
function previewRegisteredPhoneMigration(){const report=registeredPhoneMigration_(false);console.log(JSON.stringify(report));return report;}
function applyRegisteredPhoneMigration(){return registeredPhoneMigration_(true);}
function registeredPhoneMigration_(apply){return withScriptLock_(function(){
 const accounts=readAuthAccounts_(),rows=rowsAsObjects_(APP.SHEETS.REGISTRATIONS),counts={apply:Boolean(apply),eligible:0,converted:0,skipped:0};
 rows.forEach(function(row){
  const phone=canonicalStoredPhone_(row.phone),account=authAccountByKey_(accounts,phone),profile=account&&account.profile||{};
  const matches=account&&/^0[689][0-9]{8}$/.test(phone)&&profile.role==='inspector'&&account.authMethod!=='phone_only'&&['pending','approved'].indexOf(row.status)>=0&&rows.filter(function(r){return r.phone===row.phone;}).length===1&&cleanText_(account.username,64)===phone&&cleanText_(profile.phone,20)===phone&&cleanText_(profile.assignedProvinceCode,2)===cleanText_(row.province_code,2)&&cleanText_(profile.agencyLevel,16)===cleanText_(row.agency_level,16)&&cleanText_(profile.district,120)===cleanText_(row.district,120)&&account.active===(row.status==='approved');
  if(!matches){counts.skipped++;return;}counts.eligible++;if(!apply)return;
  account.authMethod='phone_only';account.sessionVersion=uuid_();delete account.hash;delete account.salt;delete account.iterations;
  PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+phone,JSON.stringify(account));counts.converted++;
 });return counts;
});}

/* Repairs only registration cells backed by exactly one existing matching inspector account. */
function previewPhoneCellRepair(){const report=repairPhoneCells_(false);console.log(JSON.stringify(report));return report;}
function applyPhoneCellRepair(){const report=repairPhoneCells_(true);console.log(JSON.stringify(report));return report;}
function repairPhoneCells_(apply){return withScriptLock_(function(){
 const rows=rowsAsObjects_(APP.SHEETS.REGISTRATIONS),accounts=readAuthAccounts_();
 const counts={scanned:rows.length,eligible:0,repaired:0,collisions:0,skipped:0};
 rows.forEach(function(row){
  const raw=cleanText_(row.phone,20),phone=canonicalStoredPhone_(row.phone);
  if(!/^[689][0-9]{8}$/.test(raw)){counts.skipped++;return;}
  if(rows.filter(function(r){return canonicalStoredPhone_(r.phone)===phone;}).length!==1){counts.collisions++;return;}
  const account=authAccountByKey_(accounts,phone),profile=account&&account.profile||{};
  if(!account||account.username!==phone||profile.phone!==phone||profile.role!=='inspector'||profile.assignedProvinceCode!==String(row.province_code)||profile.agencyLevel!==row.agency_level||cleanText_(profile.district,120)!==cleanText_(row.district,120)||['approved','pending','rejected'].indexOf(row.status)<0||account.active!==(row.status==='approved')){counts.skipped++;return;}
  counts.eligible++;if(!apply)return;
  row.phone=phone;updateObjectRow_(APP.SHEETS.REGISTRATIONS,row._row,row);counts.repaired++;
 });return counts;
});}
