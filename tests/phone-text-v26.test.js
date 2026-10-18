const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('registration phone cells are formatted as text before append and update writes',()=>{
 const events=[],sheet={getLastRow:()=>4,getRange:(r,c,n,w)=>({setNumberFormat:f=>events.push(['format',r,c,f]),setValues:v=>events.push(['write',r,c,v])})};
 const context=vm.createContext({APP:{HEADERS:{User_Registration:['id','phone','name']},SHEETS:{BASE:'HS_Base',VERIFICATION:'HS_Verification'}},safeCell_:x=>x});
 vm.runInContext(fs.readFileSync('apps-script/Repository.gs','utf8'),context);context.getRequiredSheet_=()=>sheet;
 context.appendObject_('User_Registration',{id:'r',phone:'0841157666',name:'Test'});
 context.updateObjectRow_('User_Registration',2,{id:'r',phone:'0841157666',name:'Test'});
 assert.deepEqual(events[0],['format',5,2,'@']);assert.equal(events[1][0],'write');assert.equal(events[1][3][0][1],'0841157666');assert.deepEqual(events[2],['format',2,2,'@']);assert.equal(events[3][0],'write');
});
