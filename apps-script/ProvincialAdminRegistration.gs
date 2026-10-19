/* Applicant-selected password credentials live only in private Script Properties.
 * The request sheet contains declared affiliation and review history, never hashes. */
function provincialAdminPayload_(payload, allowed) {
  assert_(payload && typeof payload==='object' && !Array.isArray(payload), 'VALIDATION_ERROR', 'ข้อมูลคำขอไม่ถูกต้อง');
  assert_(Object.keys(payload).every(function(key){return allowed.indexOf(key)>=0;}), 'VALIDATION_ERROR', 'คำขอมีข้อมูลนอกแบบฟอร์มที่กำหนด');
}

function provincialAdminWorkGroup_(value) {
  const labels={plant_protection:'plant_protection',strategy_info:'strategy_info',production:'production',farmer_development:'farmer_development',other:'other',
    'กลุ่มอารักขาพืช':'plant_protection','กลุ่มยุทธศาสตร์และสารสนเทศ':'strategy_info','กลุ่มส่งเสริมและพัฒนาการผลิต':'production','กลุ่มส่งเสริมและพัฒนาเกษตรกร':'farmer_development','อื่น ๆ':'other','อื่นๆ':'other'};
  const key=cleanText_(value,120);
  return Object.prototype.hasOwnProperty.call(labels,key)?labels[key]:'';
}

function provincialAdminSeal_(row,account) {
  // Bind the whole declared identity, consent and credentials to the pending account.
  // Approval cannot silently adopt a changed request, scope, role or password hash.
  const fields=['registration_id','phone','full_name','position','work_group','work_group_other','agency','province_code','username','privacy_version','privacy_acknowledged_at','created_at'];
  return sha256_(JSON.stringify([fields.map(function(key){return String(row[key]||'');}),account.username,account.authMethod,account.salt,account.iterations,account.hash,account.profile]));
}

function provincialAdminDuplicates_(rows,accounts,phone,username) {
  return rows.some(function(row){return canonicalStoredPhone_(row.phone)===phone || cleanText_(row.username,64).toLowerCase()===username;}) ||
    Object.keys(accounts).some(function(key){const account=accounts[key],profile=account.profile||{};return key===username || canonicalStoredPhone_(key)===phone || canonicalStoredPhone_(profile.phone)===phone;});
}

function registerProvincialAdmin_(payload) {
  payload=payload||{};
  provincialAdminPayload_(payload,['phone','fullName','position','workGroup','workGroupOther','provinceCode','username','password','privacyVersion','privacyAcknowledged']);
  assert_(getRegistrationPolicy_().configured,'POLICY_NOT_CONFIGURED','ผู้ดูแลต้องตั้งข้อมูลประกาศความเป็นส่วนตัวก่อนเปิดลงทะเบียน');
  assert_(payload.privacyAcknowledged===true && payload.privacyVersion===REGISTRATION_PRIVACY_VERSION_,'PRIVACY_ACK_REQUIRED','กรุณาอ่านและรับทราบประกาศความเป็นส่วนตัวฉบับปัจจุบัน');
  const phone=cleanText_(payload.phone,20).replace(/[ -]/g,''),name=cleanText_(payload.fullName,120),position=cleanText_(payload.position,120);
  const code=String(payload.provinceCode||'').trim(),group=provincialAdminWorkGroup_(payload.workGroup),other=group==='other'?cleanText_(payload.workGroupOther,200):'';
  assert_(String(payload.username||'').trim().length<=64,'VALIDATION_ERROR','ชื่อผู้ใช้ต้องไม่เกิน 64 ตัวอักษร');
  const username=normalizeUsername_(payload.username),password=payload.password==null?'':String(payload.password);
  assert_(/^0[689][0-9]{8}$/.test(phone)&&name&&position&&group&&/^\d{2}$/.test(code)&&Object.prototype.hasOwnProperty.call(HSNational.provinces,code),'VALIDATION_ERROR','กรุณาระบุโทรศัพท์ ชื่อ ตำแหน่ง กลุ่มงาน และจังหวัดให้ครบ');
  assert_(group!=='other'||other,'VALIDATION_ERROR','กรุณาระบุกลุ่มงานอื่น');
  assert_(['__proto__','prototype','constructor'].indexOf(username)<0,'VALIDATION_ERROR','ชื่อผู้ใช้นี้สงวนไว้');
  assert_(password.length>=10&&password.length<=256,'VALIDATION_ERROR','รหัสผ่านใหม่ต้องมี 10-256 ตัวอักษร');
  return withScriptLock_(function(){
    if(typeof ensureRegistrationSheet_==='function')ensureRegistrationSheet_(APP.SHEETS.ADMIN_REGISTRATIONS);else ensureSchema_();
    registrationAdmission_();
    const rows=rowsAsObjects_(APP.SHEETS.ADMIN_REGISTRATIONS),accounts=readAuthAccounts_();
    assert_(!provincialAdminDuplicates_(rows,accounts,phone,username) && !rowsAsObjects_(APP.SHEETS.REGISTRATIONS).some(function(row){return canonicalStoredPhone_(row.phone)===phone;}),'ACCOUNT_EXISTS','ชื่อผู้ใช้หรือหมายเลขนี้ลงทะเบียนแล้ว กรุณาติดต่อผู้ดูแล');
    // Account capacity is shared with inspector registration; history also has a bound.
    const configured=Number(PropertiesService.getScriptProperties().getProperty('REGISTRATION_MAX_ACCOUNTS')||200),limit=Number.isInteger(configured)&&configured>=1&&configured<=500?configured:200;
    assert_(rows.length<limit,'REGISTRATION_CAPACITY','ระบบลงทะเบียนเต็มชั่วคราว กรุณาติดต่อผู้ดูแล');
    ensureAuthSecrets_();
    const id=uuid_(),now=isoNow_(),agency='สำนักงานเกษตรจังหวัด'+HSNational.provinces[code];
    const row={registration_id:id,phone:phone,full_name:name,position:position,work_group:group,work_group_other:other,agency:agency,province_code:code,username:username,privacy_version:REGISTRATION_PRIVACY_VERSION_,privacy_acknowledged_at:now,status:'pending',created_at:now,reviewed_at:'',reviewed_by:''};
    const salt=(uuid_()+uuid_()).replace(/-/g,''),account={username:username,authMethod:'password',salt:salt,iterations:APP.AUTH_HASH_ITERATIONS,hash:passwordHash_(password,salt,APP.AUTH_HASH_ITERATIONS),sessionVersion:uuid_(),active:false,
      profile:{inspectorId:'account:'+username,displayName:name,role:'admin',assignedProvinceCode:code,agencyLevel:'province',phone:phone,district:'',tambon:'',personCategory:'',personCategoryOther:'',position:position,agency:agency,workGroup:group,workGroupOther:other}};
    account.adminRegistrationId=id;account.adminRegistrationSeal=provincialAdminSeal_(row,account);
    const props=PropertiesService.getScriptProperties(),key='AUTH_ACCOUNT_V2_'+username;
    props.setProperty(key,JSON.stringify(account));
    try {appendObject_(APP.SHEETS.ADMIN_REGISTRATIONS,row);} catch(error) {props.deleteProperty(key);throw error;}
    return {registrationId:id,status:'pending',message:'ส่งคำขอแล้ว รอ Super Admin อนุมัติก่อนเข้าสู่ระบบ'};
  });
}

function listProvincialAdminRequests_(actor,payload) {
  requireSuperAdmin_(actor);
  if(typeof ensureRegistrationSheet_==='function')ensureRegistrationSheet_(APP.SHEETS.ADMIN_REGISTRATIONS);
  const status=cleanText_(payload&&payload.status,24);
  return {items:rowsAsObjects_(APP.SHEETS.ADMIN_REGISTRATIONS).filter(function(row){return !status||row.status===status;}).map(function(row){
    const result={};APP.HEADERS[APP.SHEETS.ADMIN_REGISTRATIONS].forEach(function(key){result[key]=row[key]||'';});return result;
  })};
}

function reviewProvincialAdminRequest_(actor,payload,approve) {
  requireSuperAdmin_(actor);provincialAdminPayload_(payload,['registrationId']);
  const id=cleanText_(payload.registrationId,64);
  return withScriptLock_(function(){
    const rows=rowsAsObjects_(APP.SHEETS.ADMIN_REGISTRATIONS),matches=rows.filter(function(row){return row.registration_id===id;});
    assert_(matches.length===1,'CONFLICT','ไม่พบคำขอที่ไม่ซ้ำ');
    const row=matches[0],accounts=readAuthAccounts_(),key=normalizeUsername_(row.username),account=authAccountByKey_(accounts,key),profile=account&&account.profile||{},phone=canonicalStoredPhone_(row.phone);
    assert_(row.status==='pending','CONFLICT','รายการนี้ได้รับการพิจารณาแล้ว');
    assert_(rows.filter(function(other){return canonicalStoredPhone_(other.phone)===phone||cleanText_(other.username,64).toLowerCase()===key;}).length===1,'CONFLICT','พบคำขอซ้ำ กรุณาตรวจสอบก่อนอนุมัติ');
    assert_(account&&account.active===false&&account.authMethod==='password'&&profile.role==='admin'&&account.username===key&&account.adminRegistrationId===id&&
      profile.phone===phone&&profile.assignedProvinceCode===String(row.province_code)&&profile.agencyLevel==='province'&&!profile.district&&!profile.tambon&&
      account.adminRegistrationSeal===provincialAdminSeal_(row,account),'CONFLICT','บัญชีหรือข้อมูลคำขอเปลี่ยนแล้ว กรุณาตรวจสอบก่อนอนุมัติ');
    assert_(!Object.keys(accounts).some(function(otherKey){return otherKey!==key&&canonicalStoredPhone_((accounts[otherKey].profile||{}).phone)===phone;}) &&
      !rowsAsObjects_(APP.SHEETS.REGISTRATIONS).some(function(other){return canonicalStoredPhone_(other.phone)===phone;}),'CONFLICT','พบหมายเลขโทรศัพท์ซ้ำกับบัญชีอื่น');
    const before=Object.assign({},row);row.status=approve?'approved':'rejected';row.reviewed_at=isoNow_();row.reviewed_by=actor.id;
    // Persist the reviewed request first. A failed account write must never grant access.
    updateObjectRow_(APP.SHEETS.ADMIN_REGISTRATIONS,row._row,row);
    account.active=approve;account.sessionVersion=uuid_();
    try {PropertiesService.getScriptProperties().setProperty('AUTH_ACCOUNT_V2_'+key,JSON.stringify(account));}
    catch(error){updateObjectRow_(APP.SHEETS.ADMIN_REGISTRATIONS,before._row,before);throw error;}
    appendLog_(actor,uuid_(),approve?'approveProvincialAdminRequest':'rejectProvincialAdminRequest','admin_registration',id,'success',{status:row.status});
    return {registrationId:id,status:row.status};
  });
}
