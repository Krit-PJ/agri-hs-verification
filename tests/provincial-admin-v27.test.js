const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function setup(){
 const props={PRIVACY_CONTROLLER:'Agency',PRIVACY_CONTACT:'privacy@example.test',PRIVACY_RETENTION:'5 years'},tables={},logs=[],cache=new Map();
 const store={getProperty:k=>props[k]||null,getProperties:()=>({...props}),setProperty:(k,v)=>{props[k]=v;return store;},deleteProperty:k=>delete props[k]};
 const c=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>store},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,v)=>Array.from(crypto.createHash('sha256').update(typeof v==='string'?v:Buffer.from(v)).digest()),base64Encode:b=>Buffer.from(b).toString('base64')}});
 for(const f of ['Config','Utils','NationalCore','Auth','NationalService','RegistrationService','Code','ProvincialAdminRegistration'])if(fs.existsSync('apps-script/'+f+'.gs'))vm.runInContext(fs.readFileSync('apps-script/'+f+'.gs','utf8'),c);
 c.ensureSchema_=()=>{};c.rowsAsObjects_=n=>tables[n]||[];
 c.appendObject_=(n,r)=>{(tables[n]??=[]).push({...r,_row:(tables[n]?.length||0)+2});};
 c.findOne_=(n,k,v)=>(tables[n]||[]).find(r=>String(r[k])===String(v));
 c.updateObjectRow_=(n,row,r)=>{tables[n][row-2]={...r};};c.appendLog_=(...args)=>logs.push(args);c.outputJson_=value=>value;
 return {c,props,tables,logs,store};
}
const input={phone:'0812345678',fullName:'Applicant',position:'Officer',workGroup:'plant_protection',workGroupOther:'',provinceCode:'62',username:'province.applicant',password:'Chosen-password-27!',privacyVersion:'2026-10-v2',privacyAcknowledged:true};
const superAdmin={id:'super',role:'super_admin'},admin={id:'admin',role:'admin',assignedProvinceCode:'62'};
test('provincial applicant remains unable to sign in until Super approval without exposing credentials',()=>{
 const {c,props,tables,logs}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function','provincial registration service must be available');
 const response=c.registerProvincialAdmin_(input),account=JSON.parse(props['AUTH_ACCOUNT_V2_province.applicant']);
 assert.equal(response.status,'pending');assert.equal(account.active,false);assert.equal(account.profile.role,'admin');assert.equal(account.authMethod,'password');assert.ok(account.hash);assert.notEqual(account.hash,input.password);
 assert.equal(tables.Admin_Registration[0].phone,'0812345678');assert.equal(tables.Admin_Registration[0].agency,'สำนักงานเกษตรจังหวัดกำแพงเพชร');
 assert.throws(()=>c.login_({username:input.username,password:input.password}),e=>e.code==='UNAUTHORIZED');
 const publicData=JSON.stringify([response,c.listProvincialAdminRequests_(superAdmin,{}),tables,logs]);
 for(const secret of [input.password,account.hash,account.salt])assert.equal(publicData.includes(secret),false);
 assert.equal(JSON.stringify(props).includes(input.password),false);
});
test('only Super can list or review requests and approval activates only the requested provincial Admin',()=>{
 const {c,props}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');
 c.setupPasswordAccount('existing.admin','Original-password!',{role:'admin',assignedProvinceCode:'50'});const existing=props['AUTH_ACCOUNT_V2_existing.admin'];
 const result=c.registerProvincialAdmin_(input);
 for(const actor of [admin,{role:'inspector'},{role:'public'}]){
  assert.throws(()=>c.listProvincialAdminRequests_(actor,{}),e=>e.code==='FORBIDDEN');
  assert.throws(()=>c.reviewProvincialAdminRequest_(actor,{registrationId:result.registrationId},true),e=>e.code==='FORBIDDEN');
  assert.throws(()=>c.reviewProvincialAdminRequest_(actor,{registrationId:result.registrationId},false),e=>e.code==='FORBIDDEN');
 }
 c.reviewProvincialAdminRequest_(superAdmin,{registrationId:result.registrationId},true);
 const login=c.login_({username:input.username,password:input.password});assert.equal(login.profile.role,'admin');assert.equal(login.profile.assignedProvinceCode,'62');assert.equal(login.profile.agencyLevel,'province');
 assert.deepEqual(Array.from(c.nationalAuthorized_(c.authenticateSession_(login.token))),['62']);assert.equal(props['AUTH_ACCOUNT_V2_existing.admin'],existing);
 assert.throws(()=>c.reviewProvincialAdminRequest_(superAdmin,{registrationId:result.registrationId},true),e=>e.code==='CONFLICT');
});
test('privacy and required provincial applicant fields are validated before creating accounts',()=>{
 const {c,props,tables}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');delete props.PRIVACY_CONTACT;
 assert.throws(()=>c.registerProvincialAdmin_(input),e=>e.code==='POLICY_NOT_CONFIGURED');props.PRIVACY_CONTACT='contact';
 for(const delta of [{privacyAcknowledged:false},{privacyVersion:'old'}])assert.throws(()=>c.registerProvincialAdmin_({...input,...delta}),e=>e.code==='PRIVACY_ACK_REQUIRED');
 for(const delta of [{phone:'123'},{fullName:''},{position:''},{workGroup:'unknown'},{workGroup:'other',workGroupOther:''},{provinceCode:'xx'},{provinceCode:'620'},{password:'short'},{username:'__proto__'},{username:'a'.repeat(65)},{role:'super_admin'},{assignedProvinceCode:'50'}])assert.throws(()=>c.registerProvincialAdmin_({...input,...delta}),e=>e.code==='VALIDATION_ERROR');
 assert.equal(Object.keys(props).some(k=>k.startsWith('AUTH_ACCOUNT_V2_')),false);assert.equal(tables.Admin_Registration,undefined);
});
test('other work group requires and retains its declared label; phone-only login cannot activate Admin',()=>{
 const {c,tables}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');const r=c.registerProvincialAdmin_({...input,workGroup:'other',workGroupOther:'Provincial coordination'});
 assert.equal(tables.Admin_Registration[0].work_group_other,'Provincial coordination');c.reviewProvincialAdminRequest_(superAdmin,{registrationId:r.registrationId},true);
 assert.throws(()=>c.loginPhone_({phone:input.phone}),e=>e.code==='UNAUTHORIZED');
});
test('duplicate usernames or phones are refused without overwriting existing accounts',()=>{
 const {c,props}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');c.registerProvincialAdmin_(input);const before=props['AUTH_ACCOUNT_V2_province.applicant'];
 assert.throws(()=>c.registerProvincialAdmin_({...input,username:'another.user'}),e=>e.code==='ACCOUNT_EXISTS');
 assert.throws(()=>c.registerProvincialAdmin_({...input,phone:'0899999999',username:'PROVINCE.APPLICANT'}),e=>e.code==='ACCOUNT_EXISTS');assert.equal(props['AUTH_ACCOUNT_V2_province.applicant'],before);
 const b=setup();b.c.setupPhoneOnlyInspectorAccount_(input.phone,{phone:input.phone});assert.throws(()=>b.c.registerProvincialAdmin_(input),e=>e.code==='ACCOUNT_EXISTS');
});
test('rejection keeps password login disabled and cannot later be approved or overwritten by reapplication',()=>{
 const {c,props,tables}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');const r=c.registerProvincialAdmin_(input);c.reviewProvincialAdminRequest_(superAdmin,{registrationId:r.registrationId},false);
 assert.equal(tables.Admin_Registration[0].status,'rejected');assert.equal(JSON.parse(props['AUTH_ACCOUNT_V2_province.applicant']).active,false);
 assert.throws(()=>c.login_({username:input.username,password:input.password}),e=>e.code==='UNAUTHORIZED');assert.throws(()=>c.reviewProvincialAdminRequest_(superAdmin,{registrationId:r.registrationId},true),e=>e.code==='CONFLICT');assert.throws(()=>c.registerProvincialAdmin_(input),e=>e.code==='ACCOUNT_EXISTS');
});
test('approval fails closed for changed account role, province, credentials or request metadata',()=>{
 for(const tamper of [({account})=>account.profile.role='super_admin',({account})=>account.profile.assignedProvinceCode='50',({account})=>account.hash='different-hash',({row})=>row.province_code='50',({row})=>row.username='existing.admin',({row})=>row.full_name='Replaced',({row})=>row.privacy_version='old',({row})=>row.work_group='production']){
  const {c,props,tables}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');const r=c.registerProvincialAdmin_(input),account=JSON.parse(props['AUTH_ACCOUNT_V2_province.applicant']);tamper({account,row:tables.Admin_Registration[0]});props['AUTH_ACCOUNT_V2_province.applicant']=JSON.stringify(account);
  assert.throws(()=>c.reviewProvincialAdminRequest_(superAdmin,{registrationId:r.registrationId},true),e=>e.code==='CONFLICT');assert.equal(JSON.parse(props['AUTH_ACCOUNT_V2_province.applicant']).active,false);
 }
});
test('review refuses duplicate request rows and payload scope tampering',()=>{
 const {c,tables}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');const r=c.registerProvincialAdmin_(input);
 assert.throws(()=>c.reviewProvincialAdminRequest_(superAdmin,{registrationId:r.registrationId,assignedProvinceCode:'50'},true),e=>e.code==='VALIDATION_ERROR');
 tables.Admin_Registration.push({...tables.Admin_Registration[0],registration_id:crypto.randomUUID(),_row:3});assert.throws(()=>c.reviewProvincialAdminRequest_(superAdmin,{registrationId:r.registrationId},true),e=>e.code==='CONFLICT');
});
test('anonymous admission limits expensive credential work and reserves account capacity',()=>{
 const {c,props}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');props.REGISTRATION_MAX_ACCOUNTS='1';c.registerProvincialAdmin_(input);
 assert.throws(()=>c.registerProvincialAdmin_({...input,username:'second.applicant',phone:'0899999999'}),e=>e.code==='REGISTRATION_CAPACITY');
 const b=setup();for(let i=0;i<5;i++)b.c.registrationAdmission_();assert.throws(()=>b.c.registerProvincialAdmin_(input),e=>e.code==='RATE_LIMITED');assert.equal(b.props['AUTH_ACCOUNT_V2_province.applicant'],undefined);
});
test('failed request persistence rolls back newly created inactive credentials',()=>{
 const {c,props}=setup();assert.equal(typeof c.registerProvincialAdmin_,'function');c.appendObject_=()=>{throw new Error('sheet unavailable');};assert.throws(()=>c.registerProvincialAdmin_(input),/sheet unavailable/);assert.equal(props['AUTH_ACCOUNT_V2_province.applicant'],undefined);
});
test('inspector registration cannot reuse a phone already reserved by a provincial applicant',()=>{
 const {c,tables}=setup();c.registerProvincialAdmin_(input);
 assert.throws(()=>c.registerUser_({phone:input.phone,fullName:'Another name',position:'Officer',agencyLevel:'province',provinceCode:'62',privacyVersion:input.privacyVersion,privacyAcknowledged:true}),e=>e.code==='ACCOUNT_EXISTS');
 assert.equal(tables.User_Registration,undefined);
});
test('failed credential activation restores pending request and leaves account inactive',()=>{
 const {c,tables,props,store}=setup(),r=c.registerProvincialAdmin_(input),write=store.setProperty;
 store.setProperty=(key,value)=>{if(key==='AUTH_ACCOUNT_V2_province.applicant')throw new Error('private store unavailable');return write(key,value);};
 assert.throws(()=>c.reviewProvincialAdminRequest_(superAdmin,{registrationId:r.registrationId},true),/private store unavailable/);
 assert.equal(tables.Admin_Registration[0].status,'pending');assert.equal(tables.Admin_Registration[0].reviewed_by,'');assert.equal(JSON.parse(props['AUTH_ACCOUNT_V2_province.applicant']).active,false);
});
test('public registration endpoint and authenticated review routes enforce Super and CSRF',()=>{
 const {c}=setup();const post=(action,payload,extra={})=>c.doPost({postData:{contents:JSON.stringify({action,payload,...extra})}});
 const r=post('registerProvincialAdmin',input);assert.equal(r.ok,true,'public registration action must dispatch');
 c.setupPasswordAccount('super.user','Super-password!',{role:'super_admin'});const s=c.login_({username:'super.user',password:'Super-password!'});
 assert.equal(post('listProvincialAdminRequests',{}, {token:s.token}).data.items.length,1);
 assert.equal(post('approveProvincialAdminRequest',{registrationId:r.data.registrationId},{token:s.token}).error.code,'CSRF_INVALID');
 assert.equal(post('approveProvincialAdminRequest',{registrationId:r.data.registrationId},{token:s.token,csrf:s.csrf}).data.status,'approved');
});
function useActualRepository(c){
 const sheets=new Map(),formats=[];const headers=vm.runInContext('APP.HEADERS',c);
 for(const [name,head] of Object.entries(headers))sheets.set(name,{values:[Array.from(head)],width:26});
 const sheet=name=>{const data=sheets.get(name);if(!data)return null;return {getLastRow:()=>data.values.length,getLastColumn:()=>Math.max(...data.values.map(r=>r.length)),getMaxColumns:()=>data.width,insertColumnsAfter:(n,add)=>data.width+=add,setFrozenRows(){},getRange:(r,col,height,width)=>({getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>data.values[r-1+i]?.[col-1+j]??'')),getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(data.values[r-1+i]?.[col-1+j]??''))),setValues(rows){rows.forEach((row,i)=>{data.values[r-1+i]??=[];row.forEach((value,j)=>data.values[r-1+i][col-1+j]=value);});},setNumberFormat(f){formats.push({name,col,format:f});},setFontWeight(){}})};};
 const book={getSheetByName:sheet,insertSheet(name){sheets.set(name,{values:[],width:26});return sheet(name);}};
 c.SpreadsheetApp={openById:()=>book,getActiveSpreadsheet:()=>book};vm.runInContext(fs.readFileSync('apps-script/Repository.gs','utf8'),c);c.beginRepositoryRequest_();return{sheets,formats};
}
test('both registration APIs persist pending requests with actual repository and preserve phone text',()=>{
 const {c}=setup(),repo=useActualRepository(c);const notice='2026-10-v2';
 const inspector=c.doPost({postData:{contents:JSON.stringify({action:'register',payload:{phone:'0841157666',fullName:'Local test',position:'Officer',agencyLevel:'province',provinceCode:'50',privacyVersion:notice,privacyAcknowledged:true}})}});
 assert.equal(inspector.ok,true,JSON.stringify(inspector.error));assert.equal(inspector.data.status,'pending');assert.match(inspector.data.message,/รอการอนุมัติจากผู้ดูแลระบบ/);assert.equal(repo.sheets.get('User_Registration').values[1][1],'0841157666');assert.ok(repo.formats.some(f=>f.name==='User_Registration'&&f.format==='@'));
 const admin=c.doPost({postData:{contents:JSON.stringify({action:'registerProvincialAdmin',payload:input})}});assert.equal(admin.ok,true,JSON.stringify(admin.error));assert.equal(admin.data.status,'pending');assert.match(admin.data.message,/รอการอนุมัติจากผู้ดูแลระบบ/);assert.equal(repo.sheets.get('Admin_Registration').values[1][1],input.phone);
 assert.throws(()=>c.loginPhone_({phone:'0841157666'}),e=>e.code==='UNAUTHORIZED');assert.throws(()=>c.login_({username:input.username,password:input.password}),e=>e.code==='UNAUTHORIZED');
});
test('Super Admin can review inspector and provincial Admin requests in any province; provincial Admin cannot expand scope',()=>{
 const {c}=setup();useActualRepository(c);const superAdmin={id:'test-super',role:'super_admin'};
 for(const [phone,code] of [['0841157666','50'],['0899999999','62']]){const saved=c.registerUser_({phone,fullName:'Local test',position:'Officer',agencyLevel:'province',provinceCode:code,privacyVersion:'2026-10-v2',privacyAcknowledged:true});assert.throws(()=>c.reviewRegistration_({role:'admin',assignedProvinceCode:code==='50'?'62':'50'},{registrationId:saved.registrationId},true),e=>e.code==='FORBIDDEN');c.reviewRegistration_(superAdmin,{registrationId:saved.registrationId},true);assert.equal(c.loginPhone_({phone}).profile.assignedProvinceCode,code);}
 const admin=c.registerProvincialAdmin_(input);assert.throws(()=>c.reviewProvincialAdminRequest_({role:'admin',assignedProvinceCode:'62'},{registrationId:admin.registrationId},true),e=>e.code==='FORBIDDEN');assert.ok(c.listProvincialAdminRequests_(superAdmin,{status:'pending'}).items.length);c.reviewProvincialAdminRequest_(superAdmin,{registrationId:admin.registrationId},true);assert.equal(c.login_({username:input.username,password:input.password}).profile.role,'admin');
});
