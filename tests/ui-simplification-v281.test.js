const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
test('primary access action changes to Logout for any authenticated role and back after logout',async()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,textContent:'',setAttribute(){},addEventListener(t,f){this[t]=f},contains(){return false}});return nodes.get(id)};
 const c=vm.createContext({document:{getElementById:get,addEventListener(){}}});vm.runInContext(fs.readFileSync('access-navigation.js','utf8'),c);let login=0,logout=0;c.HSAccessNavigation.init({onInspector:()=>login++,onManager(){},onLogout:async()=>logout++});
 assert.equal(get('accessLoginNav').textContent,'เข้าใช้งานระบบ');await get('accessLoginNav').click();assert.equal(login,1);
 for(const role of ['inspector','admin','super_admin']){c.HSAccessNavigation.updateAccess(true);assert.equal(get('accessLoginNav').textContent,'ออกจากระบบ');await get('accessLoginNav').click();}
 assert.equal(logout,3);assert.equal(login,1);c.HSAccessNavigation.updateAccess(false);assert.equal(get('accessLoginNav').textContent,'เข้าใช้งานระบบ');
});
test('quick province mirrors main selection but remains locked for public and Super Admin',()=>{
 const line=app.split('\n').find(x=>x.includes('dom.quickProvinceFilter.innerHTML=source.innerHTML'));
 const fragment=line.slice(line.indexOf('const source='),line.indexOf('dom.summaryDistrict.value'));
 for(const disabled of [false,true]){const source={innerHTML:'province options',value:'62',disabled};const dom={quickProvinceFilter:{}};vm.runInNewContext(fragment,{dom,$:()=>source});assert.equal(dom.quickProvinceFilter.value,'62');assert.equal(dom.quickProvinceFilter.disabled,true);}
});
test('area labels omit province prefix without merging same-named districts across provinces',()=>{
 const rows=[{province:'กำแพงเพชร',district:'เมือง',tambon:'ตำบลหนึ่ง',status:'pending'},{province:'ตาก',district:'เมือง',tambon:'ตำบลหนึ่ง',status:'pending'}];
 const dom={summaryStats:{},summaryBody:{},summaryLevel:{value:'amphoe'},districtFilter:{value:''},summaryYear:{value:''}};
 const c=vm.createContext({dom,nationalMode:true,state:{authValidated:true,token:'t',filtered:rows},updateProvinceGate(){},sessionExpired:()=>false,HSNationUI:{scope:()=>''},document:{getElementById:()=>null},esc:s=>s});
 vm.runInContext(app.slice(app.indexOf('  function renderSummary()'),app.indexOf('  async function reportPhotoData')),c);c.renderSummary();assert.equal((dom.summaryBody.innerHTML.match(/<tr>/g)||[]).length,2);assert.doesNotMatch(dom.summaryBody.innerHTML,/กำแพงเพชร|ตาก/);assert.match(dom.summaryBody.innerHTML,/<strong>เมือง<\/strong>/);
 dom.summaryLevel.value='province';c.renderSummary();assert.match(dom.summaryBody.innerHTML,/กำแพงเพชร/);assert.match(dom.summaryBody.innerHTML,/ตาก/);
});
