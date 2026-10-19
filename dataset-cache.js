/* Scoped HS snapshots only. Never store a profile, session, notes, contact or photos. */
var HSDataCache=(()=>{
 const DB='hsverify-map-cache',STORE='snapshots',MAX_AGE=10*60*1000;
 const keys=['hsId','acquiredAt','latitude','longitude','province','provinceCode','district','tambon','village','landType','plantType','datasetYearBe','status'];
 function sanitize(rows){return rows.map(r=>{const x={};for(const k of keys)if(r[k]!==undefined)x[k]=r[k];if(r.verification){x.verification={status:r.verification.status,result:r.verification.result};if(r.verification.evidenceState!==undefined)x.verification.evidenceState=r.verification.evidenceState;}return x;});}
 function store(mode,key,value){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction(STORE,mode),s=t.objectStore(STORE);let result;const q=mode==='readonly'?s.get(key):key===null?s.clear():s.put(value,key);q.onsuccess=()=>result=q.result;t.oncomplete=()=>{db.close();resolve(result)};t.onerror=()=>{db.close();reject(t.error)};};});}
 async function read(info){try{const saved=await store('readonly',info.scopeKey);if(saved&&saved.revision===info.revision&&Date.now()-saved.savedAt<MAX_AGE&&Date.now()>=saved.savedAt)return saved.rows;}catch(_){}return null;}
 async function write(info,rows){try{await store('readwrite',info.scopeKey,{revision:info.revision,savedAt:Date.now(),rows:sanitize(rows)});}catch(_){}}
 async function clear(){try{await store('readwrite',null);}catch(_){}}
 return {read,write,clear,sanitize};
})();
if(typeof module==='object')module.exports=HSDataCache;
