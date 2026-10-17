const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function backend() {
  const db = {}, properties = {};
  const context = vm.createContext({console, Date, Utilities: {
    getUuid: () => crypto.randomUUID(),
    formatDate: (date, zone, pattern) => {
      const local = new Date(date.getTime() + 7 * 3600000);
      return pattern === 'yyyy' ? String(local.getUTCFullYear()) : pattern === 'M' ? String(local.getUTCMonth()+1) : local.toISOString().slice(0,10);
    },
    base64Decode: value => [...Buffer.from(value,'base64')],
  }, PropertiesService: {getScriptProperties: () => ({getProperty: k => properties[k], setProperty: (k,v) => properties[k]=v, deleteProperty: k => delete properties[k]})}});
  for (const name of ['Config','Utils','Repository','Auth','Evidence','VerificationService','ImportService']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps-script',name+'.gs'),'utf8'),context);
  vm.runInContext('globalThis.APP_TEST = APP',context);
  const app = context.APP_TEST;
  Object.values(app.SHEETS).forEach(name => db[name]=[]);
  context.rowsAsObjects_ = name => db[name];
  context.appendObject_ = (name,row) => { db[name].push({...row,_row:db[name].length+2}); };
  context.updateObjectRow_ = (name,index,row) => { db[name][index-2]={...row,_row:index}; };
  context.withScriptLock_ = fn => fn();
  return {c:context,db,app,properties};
}
const actor = {id:'one',displayName:'เจ้าหน้าที่',role:'inspector',district:'เมือง',tambon:''};
const admin = {...actor,id:'admin',role:'admin'};
const superAdmin = {...admin,role:'super_admin'};
const hs = {hs_id:'HS1',district:'เมือง',tambon:'คลอง',village:'1',plant_type:'นาข้าว',latitude:16,longitude:99,acquired_at:'2026-01-01T01:00:00+07:00',active:true};
const id = 'c1b9eb03-ff34-4a5b-a465-24996d3e1021';
const fail = (fn,code) => assert.throws(fn,error => error.code === code);

test('scope enforced for reads and verification replay, same actor replay writes once',()=>{
  const {c,db,app}=backend(); db[app.SHEETS.BASE].push(hs);
  const payload={hsId:'HS1',result:'burned',location:{latitude:16,longitude:99}};
  const first=c.saveVerification_(actor,'request',payload);
  assert.equal(c.saveVerification_(actor,'request',payload).idempotent,true);
  assert.equal(db[app.SHEETS.VERIFICATION].length,1);
  assert.equal(first.verification.distanceM,0);
  fail(()=>c.saveVerification_({...actor,id:'two'},'request',payload),'CONFLICT');
  fail(()=>c.saveVerification_({...actor,district:'อื่น'},'request',payload),'FORBIDDEN');
  assert.equal(c.listHs_({...actor,district:'อื่น'},{}).total,0);
  fail(()=>c.saveVerification_(actor,'bad',{...payload,location:{latitude:'',longitude:99}}),'VALIDATION_ERROR');
});

test('edited older row drives status filters and geographic summaries',()=>{
  const {c,db,app}=backend(); db[app.SHEETS.BASE].push(hs);
  db[app.SHEETS.VERIFICATION].push({hs_id:'HS1',status:'verified',result:'burned',updated_at:'2026-03-01'}, {hs_id:'HS1',status:'draft',updated_at:'2026-02-01'});
  assert.equal(c.summaries_(actor,{}).byStatus.verified,1);
  assert.equal(c.summaries_(actor,{}).byVillage['เมือง/คลอง/1'],1);
  assert.equal(c.listHs_(actor,{filters:{year:2569,month:1,status:'verified'}}).total,1);
});

test('photo replay checks owner, HS and verification; signatures reject forged media',()=>{
  const {c,db,app}=backend(); db[app.SHEETS.BASE].push(hs);
  db[app.SHEETS.VERIFICATION].push({verification_id:id,hs_id:'HS1',inspector_id:'one'});
  db[app.SHEETS.PHOTOS].push({request_id:'photo-request',photo_id:'photo',verification_id:id,hs_id:'HS1',inspector_id:'one'});
  const payload={hsId:'HS1',verificationId:id,mimeType:'image/png',base64:'YWJj'};
  assert.equal(c.uploadPhoto_(actor,'photo-request',payload).idempotent,true);
  fail(()=>c.uploadPhoto_({...actor,id:'two'},'photo-request',payload),'FORBIDDEN');
  fail(()=>c.uploadPhoto_(admin,'photo-request',payload),'CONFLICT');
  fail(()=>c.uploadPhoto_(actor,'new-photo',payload),'MEDIA_SIGNATURE_MISMATCH');
  assert.equal(db[app.SHEETS.PHOTOS].length,1);
});

test('source headers remain intact; filters exclude foreign crops and empty coordinates or IDs',()=>{
  const {c}=backend();
  const headers=['hsID','YYYY-MM-DD','Time','Province','Amphoe','Tambon','LandType','PlantType','latitude','longitude'];
  const row=['HS1','2026-01-01','10:30','กำแพงเพชร','เมือง','คลอง','พื้นที่เกษตร','นาข้าว',16,99];
  const values=[headers,row,['HS2',...row.slice(1,8),'',99],['',...row.slice(1)],[...row.slice(0,3),'เชียงใหม่',...row.slice(4)], [...row.slice(0,7),'ป่า',16,99]];
  const parsed=c.parseDetailSheet_({getName:()=> 'hsPlant2026',getDataRange:()=>({getValues:()=>values})});
  assert.equal(parsed.rows.length,1); assert.equal(parsed.qa.missingCoordinates,1); assert.equal(parsed.qa.missingId,1); assert.equal(parsed.qa.wrongProvince,1); assert.equal(parsed.qa.wrongPlantType,1);
  assert.equal(parsed.rows[0].acquired_at,'2026-01-01T10:30:00+07:00');
});

test('sync is admin-only and reconciliation failure does not replace base',()=>{
  const {c}=backend(); fail(()=>c.syncSource_(actor,'sync'),'FORBIDDEN');
  let replaced=false; c.replaceBaseAtomically_=()=>replaced=true;
  c.resolveSource_=()=>({reference:{sheet:'hsPlant2026',total:9,byPlantType:{'นาข้าว':9}},detailSheet:{}});
  c.parseDetailSheet_=()=>({rows:[hs],qa:{accepted:1,duplicateHsId:0,missingDate:0,missingId:0,missingCoordinates:0,byPlantType:{'นาข้าว':1}}});
  fail(()=>c.syncSource_(superAdmin,'sync'),'RECONCILIATION_FAILED'); assert.equal(replaced,false);
});

test('config never exposes administrative IDs to inspectors; mutations require admin',()=>{
  const {c,properties}=backend(); properties.PHOTO_FOLDER_ID='private-folder';
  assert.equal(c.getConfig_(actor).admin,undefined);
  assert.equal(c.getConfig_(admin).admin.photoFolderId,'private-folder');
  fail(()=>c.setConfig_(actor,'config',{}),'FORBIDDEN');
  fail(()=>c.qa_(actor),'FORBIDDEN');
});

test('config validation failure leaves prior properties intact',()=>{
  const {c,properties}=backend(); properties.SOURCE_SPREADSHEET_ID='old';
  c.SpreadsheetApp={openById:()=>({getSheetByName:()=>null})};
  fail(()=>c.setConfig_(superAdmin,'config',{sourceSpreadsheetId:'new',sourceSheet:'missing'}),'SOURCE_NOT_FOUND');
  assert.equal(properties.SOURCE_SPREADSHEET_ID,'old');
});

test('draft result is excluded from confirmed burn totals and QA flags malformed GPS',()=>{
  const {c,db,app}=backend(); db[app.SHEETS.BASE].push({...hs,latitude:''});
  db[app.SHEETS.VERIFICATION].push({hs_id:'HS1',status:'draft',result:'burned',updated_at:'2026-03-01'});
  assert.equal(c.summaries_(actor,{}).byResult.burned,undefined);
  assert.equal(c.qa_(admin).invalidCoordinates.length,1);
});

const canonical = {hsId:'HS1',acquiredAt:'2025-12-01T10:00:00+07:00',province:'กำแพงเพชร',district:'เมือง',tambon:'คลอง',village:'1',landType:'พื้นที่เกษตร',plantType:'นาข้าว',latitude:16,longitude:99};
test('v1.1 separates admin operations from super admin data replacement',()=>{
  const {c}=backend();
  fail(()=>c.previewImportRows_(admin,{rows:[canonical]}),'FORBIDDEN');
  fail(()=>c.importRows_(admin,id,{rows:[canonical],confirmed:true}),'FORBIDDEN');
  fail(()=>c.syncSource_(admin,id),'FORBIDDEN');
  fail(()=>c.setConfig_(admin,id,{}),'FORBIDDEN');
  assert.doesNotThrow(()=>c.requireAdmin_(superAdmin));
  assert.equal(c.actorCanAccessHs_(superAdmin,{district:'อื่น'}),true);
});
test('canonical import previews QA then replaces only base preserving history and cohort year',()=>{
  const {c,db,app}=backend();
  db[app.SHEETS.VERIFICATION].push({hs_id:'HS1',status:'verified'});
  db[app.SHEETS.PHOTOS].push({hs_id:'HS1',photo_id:'P1'});
  c.replaceBaseAtomically_=rows=>db[app.SHEETS.BASE]=rows;
  const payload={rows:[canonical,{...canonical,hsId:'foreign',province:'เชียงใหม่'}],sourceName:'hsPlant2026.csv',datasetYearBe:2569};
  const preview=c.previewImportRows_(superAdmin,payload);
  assert.equal(preview.imported,1); assert.equal(preview.qa.wrongProvince,1); assert.equal(preview.canImport,true);
  fail(()=>c.importRows_(superAdmin,id,payload),'CONFIRMATION_REQUIRED');
  c.importRows_(superAdmin,id,{...payload,confirmed:true});
  assert.equal(db[app.SHEETS.BASE][0].dataset_year_be,2569);
  assert.equal(c.listHs_(superAdmin,{filters:{year:2569}}).total,1);
  assert.equal(c.listHs_(superAdmin,{filters:{year:2568}}).total,0);
  assert.equal(db[app.SHEETS.VERIFICATION].length,1); assert.equal(db[app.SHEETS.PHOTOS].length,1);
  assert.equal(c.importRows_(superAdmin,id,{...payload,confirmed:true}).idempotent,true);
});
test('invalid import cohorts cannot replace base; malicious or empty source rejects',()=>{
  const {c}=backend();let replaced=false;c.replaceBaseAtomically_=()=>replaced=true;
  const payload={rows:[canonical,{...canonical,hsId:'HS2',latitude:''}],confirmed:true};
  assert.equal(c.previewImportRows_(superAdmin,payload).canImport,false);
  fail(()=>c.importRows_(superAdmin,id,payload),'IMPORT_QA_FAILED');assert.equal(replaced,false);
  fail(()=>c.previewImportRows_(superAdmin,{rows:[]}),'VALIDATION_ERROR');
  fail(()=>c.previewImportRows_(superAdmin,{rows:Array(5001).fill(canonical)}),'VALIDATION_ERROR');
  fail(()=>c.previewImportRows_(superAdmin,{rows:[{...canonical,province:'อื่น'}]}),'SOURCE_EMPTY');
  assert.equal(c.parseSpreadsheetId_('https://docs.google.com/spreadsheets/d/abc_123/edit#gid=0'),'abc_123');
  fail(()=>c.parseSpreadsheetId_('https://evil.example/spreadsheets/d/abc'),'VALIDATION_ERROR');
});
test('summary mismatch rejects file import before any write',()=>{
  const {c}=backend();
  fail(()=>c.previewImportRows_(superAdmin,{rows:[canonical],summary:{total:2,byPlantType:{'นาข้าว':2,'อ้อย':0,'เกษตรอื่น ๆ':0,'อื่น ๆ':0}}}),'RECONCILIATION_FAILED');
});
test('additive migration appends cohort column and preserves legacy cells',()=>{
  const {c,app}=backend();
  let headers=Array.from(app.HEADERS.HS_Base).slice(0,-1), cohort=[];
  const old=['HS1','2025-12-01T10:00:00+07:00',16,99,'กำแพงเพชร','เมือง','คลอง','1','พื้นที่เกษตร','นาข้าว','hsPlant2026',2,'{}','2026-01-01',true];
  const sheet={getLastColumn:()=>headers.length,getLastRow:()=>2,getRange:(r,col,n,w)=>({getDisplayValues:()=>[headers],getValues:()=>[old],setValue:v=>headers.push(v),setValues:v=>cohort=v})};
  c.getRequiredSheet_=()=>sheet; c.ensureSchema_=()=>{};
  assert.equal(c.migrateSchemaV11().migrated,true);
  assert.equal(headers.at(-1),'dataset_year_be');assert.equal(cohort[0][0],2569);assert.equal(old.length,15);
  assert.equal(c.migrateSchemaV11().migrated,false);
});

test('file import preserves explicit acquisition time from canonical adapter',()=>{
 const {c}=backend();const result=c.canonicalImport_({sourceName:'test.csv',datasetYearBe:2569,rows:[{hsId:'T1',acquiredAt:'2026-03-27',time:'14:07',province:'กำแพงเพชร',district:'คลองขลุง',tambon:'แม่ลาด',landType:'พื้นที่เกษตร',plantType:'นาข้าว',latitude:16.1,longitude:99.7}]});
 assert.equal(result.rows[0].acquired_at,'2026-03-27T14:07:00+07:00');
});

test('v1.2 person category and field observation snapshots cannot grant privileges or overwrite HS',()=>{
 const {c,db,app}=backend();db[app.SHEETS.BASE].push({...hs,land_type:'พื้นที่เกษตร',source_snapshot_json:'{"original":true}'});
 db[app.SHEETS.INSPECTORS].push({inspector_id:'one',role:'inspector',_row:2,display_name:actor.displayName});
 const payload={hsId:'HS1',result:'burned',location:{latitude:16,longitude:99},personCategory:'ผู้ใหญ่บ้าน',role:'super_admin',observedLandMatchesSource:false,observedLandType:'พื้นที่นอกเกษตร',observedPlantType:'ข้าวโพด',fireState:'extinguished',evidenceRequired:true};
 const v=c.saveVerification_(actor,'v12',payload).verification;
 assert.equal(v.personCategory,'ผู้ใหญ่บ้าน');assert.equal(v.reportedById,'one');assert.equal(v.fieldInspectorName,actor.displayName);
 assert.equal(v.observedPlantType,'ข้าวโพด');assert.equal(v.evidenceState,'pending');assert.equal(v.fireState,'extinguished');
 assert.equal(db[app.SHEETS.BASE][0].plant_type,'นาข้าว');assert.equal(db[app.SHEETS.INSPECTORS][0].role,'inspector');
 assert.equal(db[app.SHEETS.INSPECTORS][0].person_category,'ผู้ใหญ่บ้าน');
 fail(()=>c.saveVerification_(actor,'badcategory',{...payload,personCategory:'อื่นๆ'}),'VALIDATION_ERROR');
 fail(()=>c.saveVerification_(actor,'badland',{...payload,observedLandType:''}),'VALIDATION_ERROR');
});
test('v1.2 follow-up, inspection times, and photo evidence remain distinct from submission success',()=>{
 const {c,db,app}=backend();db[app.SHEETS.BASE].push(hs);
 const v=c.saveVerification_(actor,'follow',{hsId:'HS1',result:'needs_review',missingGpsReason:'เข้าไม่ถึง',inspectedAt:'2026-01-02T01:00:00Z',inspectedAtSource:'user_confirmed',evidenceRequired:true,photoMissingReason:'ไม่ปลอดภัย'}).verification;
 assert.equal(v.followUpRequired,true);assert.equal(v.evidenceState,'exception');assert.equal(v.inspectedAt,'2026-01-02T01:00:00.000Z');assert.notEqual(v.inspectedAt,v.submittedAt);
 assert.equal(c.summaries_(actor,{}).confirmed,0);assert.equal(c.summaries_(actor,{}).followUpRequired,1);
 db[app.SHEETS.PHOTOS].push({verification_id:v.verificationId});assert.equal(c.getHs_(actor,{hsId:'HS1'}).verification.evidenceState,'provided');
 fail(()=>c.saveVerification_(actor,'future',{hsId:'HS1',result:'not_burned',missingGpsReason:'ไม่ได้เปิด GPS',inspectedAt:'2999-01-01T00:00:00Z'}),'VALIDATION_ERROR');
});

test('v1.2 migration validates all existing headers before append and is idempotent',()=>{
 const {c,app}=backend();const sheets={};
 for(const [name,expected] of Object.entries(app.HEADERS)){
  let headers=Array.from(expected).slice(0,name==='HS_Verification'?18:name==='HS_Photos'?12:name==='Inspector_Profile'?9:expected.length);
  sheets[name]={getLastRow:()=>2,getLastColumn:()=>headers.length,getRange:(r,col,n,w)=>({getDisplayValues:()=>[headers],setValues:values=>{headers.splice(col-1,values[0].length,...values[0]);}}),get headers(){return headers;}};
 }
 c.getSpreadsheet_=()=>({getSheetByName:n=>sheets[n]});c.ensureSchema_=()=>{};
 const original=sheets.HS_Verification.headers.length;sheets.Verification_Log.headers[0]='wrong';
 fail(()=>c.migrateSchemaV12(),'SCHEMA_MISMATCH');assert.equal(sheets.HS_Verification.headers.length,original);
 sheets.Verification_Log.headers[0]='log_id';assert.equal(c.migrateSchemaV12().migrated,true);
 assert.equal(sheets.HS_Verification.headers.length,app.HEADERS.HS_Verification.length);assert.equal(c.migrateSchemaV12().migrated,false);
});

test('v1.2 upload preserves original bytes and does not transplant import device location',()=>{
 const {c,db,app}=backend();db[app.SHEETS.BASE].push(hs);db[app.SHEETS.VERIFICATION].push({verification_id:id,hs_id:'HS1',inspector_id:'one'});
 let stored;
 c.Utilities.newBlob=(bytes,mime,name)=>({bytes,mime,name});c.sha256Bytes_=bytes=>crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
 c.DriveApp={Access:{PRIVATE:'private'},Permission:{NONE:'none'}};c.getPhotoFolder_=()=>({createFile:blob=>{stored=blob;return {setSharing:()=>{},getId:()=> 'private-photo'};}});
 const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
 const photo=c.uploadPhoto_(actor,'upload-v12',{verificationId:id,hsId:'HS1',mimeType:'image/png',base64:bytes.toString('base64'),source:'import',captureAt:'2026-01-02T00:00:00Z',captureLocation:{latitude:16,longitude:99}}).photo;
 assert.deepEqual(Buffer.from(stored.bytes),bytes);assert.equal(photo.latitude,null);assert.equal(photo.capturedAt,'');
 assert.equal(photo.coordinateSource,'none');assert.equal(photo.evidenceQa.status,'insufficient');assert.equal(photo.deviceCapture.location,null);
 assert.equal(photo.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 const repeat=c.uploadPhoto_(actor,'upload-other',{verificationId:id,hsId:'HS1',mimeType:'image/png',base64:bytes.toString('base64'),source:'camera',captureAt:'2026-01-02T00:00:00Z',captureLocation:{latitude:16,longitude:99,accuracyM:12}}).photo;
 assert.equal(repeat.coordinateSource,'client_reported_camera');assert.equal(repeat.evidenceQa.status,'review');assert.equal(repeat.distanceToHsM,0);
});

test('v1.2 server cannot be tricked into marking a new submission evidence-free',()=>{
 const {c,db,app}=backend();db[app.SHEETS.BASE].push(hs);
 const v=c.saveVerification_(actor,'no-evidence-flag',{hsId:'HS1',result:'not_burned',missingGpsReason:'GPS unavailable',evidenceRequired:false}).verification;
 assert.equal(v.evidenceRequired,true);assert.equal(v.evidenceState,'pending');
 assert.equal(c.summaries_(actor,{}).evidencePending,1);
 const legacy=c.publicVerification_({verification_id:'legacy',status:'verified',result:'burned'});
 assert.equal(legacy.evidenceRequired,false);assert.equal(legacy.evidenceState,'not_required');
});
