const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('phone sign-in resolves after verified identity while map loading continues separately',async()=>{
 const text=source.slice(source.indexOf('  async function loginPhoneInspector('),source.indexOf('  async function loginAdmin('));let loading=false,view='';
 const state={endpoint:'https://example.test',token:'',profile:{}};const ctx=vm.createContext({state,phoneDemoMode:false,clearSession(){},api:async()=>({token:'t',csrf:'c',profile:{role:'inspector',displayName:'Tester'}}),sessionStorage:{setItem(){}},SESSION_TOKEN:'token',SESSION_PROFILE:'profile',SESSION_EXPIRES_AT:'expires',applyRoleUI(){},renderAll(){},loadData(){loading=true;return new Promise(()=>{});},switchView(v){view=v;},toast(){},setTimeout});
 vm.runInContext(text,ctx);const done=await Promise.race([ctx.loginPhoneInspector('0899999999').then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),50))]);assert.equal(done,true);assert.equal(loading,true);assert.equal(view,'work');assert.equal(state.authValidated,true);
});
test('a failed map request from a previous identity cannot erase the new identity data',async()=>{
 const text=source.slice(source.indexOf('  async function loadData('),source.indexOf('  function extractRows('));let rejectRead,renders=0;
 const state={token:'old',endpoint:'https://example.test',all:[],filtered:[]};const dom={liveError:{hidden:true}};
 const c=vm.createContext({state,dom,setLoading(){},api:()=>new Promise((resolve,reject)=>{rejectRead=reject;}),renderAll(){renders++;},friendlyError:e=>e.message});vm.runInContext(text,c);
 const pending=c.loadData();state.token='new';state.all=[{hsId:'new-scope'}];rejectRead(Error('old request failed'));await pending;assert.equal(state.all[0]?.hsId,'new-scope');assert.equal(renders,0);
});
