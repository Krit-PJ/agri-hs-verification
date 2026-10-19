const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('request-local repository memo reads a table once, returns independent rows and invalidates after write',()=>{
 let opens=0,reads=0;const values=[['a','0841157666']];
 const sheet={getLastRow:()=>2,getRange:(r,c,n,w)=>({getValues(){reads++;return values.map(x=>x.slice());},setValues(v){values[0]=v[0];},setNumberFormat(){}})};
 const book={getSheetByName:()=>sheet};
 const c=vm.createContext({APP:{HEADERS:{User_Registration:['id','phone']},SHEETS:{}},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'sheet'})},SpreadsheetApp:{openById:()=>{opens++;return book;}},assert_:(x)=>{if(!x)throw Error('assert');},safeCell_:x=>x});
 vm.runInContext(fs.readFileSync('apps-script/Repository.gs','utf8'),c);
 c.beginRepositoryRequest_();const first=c.rowsAsObjects_('User_Registration');first[0].phone='changed';assert.equal(c.rowsAsObjects_('User_Registration')[0].phone,'0841157666');assert.equal(reads,1);assert.equal(opens,1);
 c.updateObjectRow_('User_Registration',2,{id:'a',phone:'0899999999'});assert.equal(c.rowsAsObjects_('User_Registration')[0].phone,'0899999999');assert.equal(reads,2);
 c.beginRepositoryRequest_();c.rowsAsObjects_('User_Registration');assert.equal(reads,3);
});
test('registration schema checks only target sheet and does not restyle existing sheets',()=>{
 const checked=[];const sheet={getLastRow:()=>1,getLastColumn:()=>2,getMaxColumns:()=>2,getRange:()=>({getDisplayValues:()=>[['id','phone']]})};
 const c=vm.createContext({APP:{HEADERS:{User_Registration:['id','phone'],HS_Base:['hs_id']}},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'sheet'})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>{checked.push(n);return sheet;}})},assert_:(x)=>{if(!x)throw Error('assert');}});
 vm.runInContext(fs.readFileSync('apps-script/Repository.gs','utf8'),c);c.ensureRegistrationSheet_('User_Registration');assert.deepEqual(checked,['User_Registration']);
});
