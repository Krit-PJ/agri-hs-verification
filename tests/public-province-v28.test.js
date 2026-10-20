const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function server() {
  const props = {SPREADSHEET_ID:'book', PUBLIC_PROVINCE_CODES:'62,50'};
  const tables = {HS_Base:[
    {hs_id:'62',province:'กำแพงเพชร',active:true,latitude:16,longitude:99},
    {hs_id:'50',province:'เชียงใหม่',active:true,latitude:18,longitude:99},
    {hs_id:'10',province:'กรุงเทพมหานคร',active:true,latitude:13,longitude:100},
    {hs_id:'inactive',province:'เชียงใหม่',active:false}
  ],HS_Verification:[{hs_id:'50',status:'verified',result:'burned',notes:'private notes',inspector_name:'private name'}],HS_Photos:[]};
  const c = vm.createContext({console,Date,Intl,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},Utilities:{
    DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(String(s)).digest()],
    newBlob:s=>({getBytes:()=>Buffer.from(s)})
  },LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}});
  for (const f of ['Config','Utils','NationalCore','Auth','Repository','Evidence','VerificationService','NationalService','DatasetCacheService','TeamService','Code'])
    vm.runInContext(fs.readFileSync('apps-script/'+f+'.gs','utf8'),c);
  c.rowsAsObjects_ = name=>tables[name]||[];
  c.getRequiredSheet_ = name=>({getLastRow:()=>tables[name].length+1});
  c.outputJson_ = x=>x;
  const post = (action,payload={},extra={})=>c.doPost({postData:{contents:JSON.stringify({action,payload,...extra})}});
  return {c,props,tables,post};
}

test('anonymous bootstrap waits for a province without reading HS or verification rows',()=>{
  const {c,post}=server();
  c.rowsAsObjects_=()=>{throw Error('data must not load before selection');};
  const result=post('bootstrap');
  assert.equal(result.ok,true);
  assert.deepEqual(Array.from(result.data.hotspots.items),[]);
  assert.equal(result.data.config.selectedProvinceCode,'');
  assert.deepEqual(Array.from(result.data.config.publicProvinceCodes),['62','50']);
  assert.equal(result.data.config.boundaries.visible,false);
  assert.deepEqual(Array.from(result.data.config.boundaries.authorizedProvinceCodes),[]);
});

test('anonymous bootstrap returns only the selected published province and redacted verification',()=>{
  const {post}=server();
  const result=post('bootstrap',{provinceCode:'50',role:'super_admin',assignedProvinceCode:'10'});
  assert.equal(result.ok,true);
  assert.deepEqual(Array.from(result.data.hotspots.items,r=>r.hsId),['50']);
  assert.equal(result.data.config.selectedProvinceCode,'50');
  assert.equal(result.data.config.boundaries.visible,true);
  assert.equal(result.data.config.boundaries.scope,'selected_province');
  assert.deepEqual(Array.from(result.data.config.boundaries.authorizedProvinceCodes),['50']);
  assert.equal(result.data.config.boundaries.storage,'public_static_frontend');
  assert.equal(result.data.config.boundaries.spatialValidationEnabled,false);
  assert.doesNotMatch(JSON.stringify(result),/private notes|private name/);
});

test('invalid, malformed and unpublished public selections fail closed for HS and geometry',()=>{
  const {post,props}=server();
  props.PUBLIC_PROVINCE_CODES='62,50,__proto__,toString,99';
  for (const provinceCode of ['10','99','__proto__','toString','500',{},['50'],50]) {
    const result=post('bootstrap',{provinceCode});
    assert.equal(result.ok,true);
    assert.equal(result.data.hotspots.items.length,0,JSON.stringify(provinceCode));
    assert.equal(result.data.config.boundaries.visible,false);
    assert.deepEqual(Array.from(result.data.config.publicProvinceCodes),['62','50']);
  }
});

test('public actor authorization requires selection and cannot expand the publishing allowlist',()=>{
  const {c,props,tables}=server();
  assert.equal(c.nationalReadActor_({role:'public'},tables.HS_Base[0]),false);
  assert.equal(c.nationalReadActor_({role:'public',selectedProvinceCode:'50'},tables.HS_Base[1]),true);
  assert.equal(c.nationalReadActor_({role:'public',selectedProvinceCode:'50'},tables.HS_Base[0]),false);
  props.PUBLIC_PROVINCE_CODES='62';
  assert.equal(c.nationalReadActor_({role:'public',selectedProvinceCode:'50'},tables.HS_Base[1]),false);
  assert.equal(c.getBoundaryConfig_({role:'public',selectedProvinceCode:'50'}).visible,false);
});

test('public dataset metadata separates each selection and offers the publishing allowlist before choice',()=>{
  const {post}=server();
  const none=post('getDatasetInfo'),p62=post('getDatasetInfo',{provinceCode:'62'}),p50=post('getDatasetInfo',{provinceCode:'50'});
  for (const result of [none,p62,p50]) assert.equal(result.ok,true);
  assert.equal(new Set([none.data.scopeKey,p62.data.scopeKey,p50.data.scopeKey]).size,3);
  assert.equal(none.data.config.selectedProvinceCode,'');
  assert.deepEqual(Array.from(none.data.config.publicProvinceCodes),['62','50']);
  assert.equal(none.data.config.boundaries.visible,false);
  assert.equal(p50.data.config.selectedProvinceCode,'50');
  assert.deepEqual(Array.from(p50.data.config.boundaries.authorizedProvinceCodes),['50']);
  assert.equal(post('getDatasetInfo',{provinceCode:'10'}).data.scopeKey,none.data.scopeKey);
});

test('authenticated province and national scopes ignore public province payload tampering',()=>{
  const {c,post}=server();
  c.authenticate_=token=>token==='super'?{id:'super',role:'super_admin'}:{id:'a',role:'admin',assignedProvinceCode:'62'};
  const admin=post('getDatasetInfo',{provinceCode:'50'},{token:'admin'});
  assert.equal(admin.ok,true);
  assert.deepEqual(Array.from(admin.data.config.boundaries.authorizedProvinceCodes),['62']);
  const superAdmin=post('getDatasetInfo',{provinceCode:'50'},{token:'super'});
  assert.equal(superAdmin.ok,true);
  assert.equal(superAdmin.data.config.boundaries.authorizedProvinceCodes.length,77);
});

test('direct team mutation denies provincial Admin before storage changes; Super retains revision checking',()=>{
  const {c,props}=server(),payload={revision:0,member:{id:'new',name:'Name',position:'Position',agency:'Agency'}};
  assert.throws(()=>c.saveTeam_({role:'admin',assignedProvinceCode:'62'},payload),e=>e.code==='FORBIDDEN');
  assert.equal(props.PUBLIC_TEAM_V1,undefined);
  assert.equal(c.saveTeam_({role:'super_admin'},payload).revision,1);
  assert.throws(()=>c.saveTeam_({role:'super_admin'},payload),e=>e.code==='CONFLICT');
});
