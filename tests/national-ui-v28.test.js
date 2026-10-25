const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const national=require('../national-core.js');

// The DOM double supplies the browser-only select/event boundary; the selection
// controller and province registry are the actual production modules.
function setup({profile={role:'public'},valid=false,rows=[]}={}){
  class Option {constructor(text,value){this.text=text;this.value=value;this.selected=false;}}
  class Element {
    constructor(){this.value='';this.options=[];this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';}
    addEventListener(name,fn){this.listeners[name]=fn;}
    replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';}
    get selectedOptions(){return this.options.filter(option=>option.selected);}
    change(value){this.value=value;this.listeners.change?.();}
  }
  const elements=new Map(),document={title:'',getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}};
  let actor=profile,authenticated=valid,data=rows,changes=0;
  const context=vm.createContext({document,Option,HSNational:national,HS_PROVINCE_LOGOS:{'62':{path:'62.png',source:'https://example.test/62'}}});
  vm.runInContext(fs.readFileSync(require.resolve('../national-ui.js'),'utf8')+'\nglobalThis.ui=HSNationUI;',context);
  const ui=context.ui;
  ui.init({profile:()=>actor,valid:()=>authenticated,rows:()=>data,change:()=>changes++});
  return {ui,document,element:id=>document.getElementById(id),get changes(){return changes;},setActor(p,v=true){actor=p;authenticated=v;ui.sync();},setRows(rows){data=rows;ui.sync();}};
}
const rows=[{id:'kamphaeng',province:'กำแพงเพชร',provinceCode:'62'},{id:'chiangmai',province:'เชียงใหม่',provinceCode:'50'}];

test('public must explicitly choose a province before rows, scope or province branding appear',()=>{
  const page=setup({rows:[rows[0]]});
  assert.equal(page.ui.selectedProvinceCode,'');
  assert.deepEqual(Array.from(page.ui.filter(rows)),[]);
  assert.deepEqual(Array.from(page.ui.importedProvinceCodes),[]);
  assert.equal(page.element('provinceFilter').value,'');
  assert.equal(page.element('provinceFilter').options[0].value,'');
  assert.equal(page.element('provinceFilter').options[0].text,'เลือกจังหวัดที่ต้องการ');
  assert.equal(page.element('provinceFilter').options.length,78);
  assert.equal(page.element('provinceFilter').disabled,false);
  assert.match(page.document.title,/ประเทศไทย/);
  assert.match(page.element('areaSubtitle').textContent,/ประเทศไทย/);
  assert.match(page.element('areaSubtitle').textContent,/เลือกจังหวัด/);
  assert.doesNotMatch(page.element('areaSubtitle').textContent,/กำแพงเพชร/);
  assert.match(page.ui.scope(),/เลือกจังหวัด/);
  assert.equal(page.element('provinceLogoLink').hidden,true);
  assert.equal(page.element('provinceLogoFallback').textContent,'TH');
});

test('public can choose any registered province and only chosen rows are exposed',()=>{
  const page=setup({rows});
  page.element('provinceFilter').change('50');
  assert.equal(page.ui.selectedProvinceCode,'50');
  assert.deepEqual(Array.from(page.ui.filter(rows)).map(row=>row.id),['chiangmai']);
  assert.deepEqual(Array.from(page.ui.importedProvinceCodes),['50']);
  assert.match(page.element('areaSubtitle').textContent,/เชียงใหม่/);
  assert.equal(page.changes,1);
  page.ui.selectProvince('10');
  assert.equal(page.ui.selectedProvinceCode,'10');
  assert.deepEqual(Array.from(page.ui.filter(rows)),[]);
  assert.deepEqual(Array.from(page.ui.importedProvinceCodes),[]);
});

test('clearing a public choice remains empty through synchronization and later data',()=>{
  const page=setup({rows});
  page.ui.selectProvince('62');
  page.ui.selectProvince('');
  page.ui.sync();
  page.setRows([rows[0]]);
  assert.equal(page.ui.selectedProvinceCode,'');
  assert.equal(page.element('provinceFilter').value,'');
  assert.deepEqual(Array.from(page.ui.filter(rows)),[]);
  assert.deepEqual(Array.from(page.ui.importedProvinceCodes),[]);
  assert.equal(page.changes,2);
});

test('a previous province logo error cannot restore branding after the public choice is cleared',()=>{
  const page=setup({rows});
  page.ui.selectProvince('62');
  const failedPreviousLogo=page.element('provinceLogo').onerror;
  page.ui.selectProvince('');
  failedPreviousLogo();
  assert.equal(page.element('provinceLogoFallback').textContent,'TH');
  assert.equal(page.element('provinceLogoLink').hidden,true);
});

test('reselecting the same province does not reset filters or reload rows',()=>{
  const page=setup({rows});
  page.ui.selectProvince('50');
  page.ui.selectProvince('50');
  page.element('provinceFilter').change('50');
  assert.equal(page.changes,1);
});

test('leaving any authenticated role starts a new public province choice',()=>{
  for(const role of ['admin','inspector','super_admin']){
    const page=setup({profile:{role,assignedProvinceCode:'62'},valid:true,rows});
    if(role==='super_admin')page.ui.selectProvince('50');
    page.setActor({role:'public'},false);
    assert.equal(page.ui.selectedProvinceCode,'',role);
    assert.deepEqual(Array.from(page.ui.filter(rows)),[],role);
    assert.equal(page.element('provinceFilter').disabled,false,role);
    assert.equal(page.element('provinceLogoLink').hidden,true,role);
  }
});

test('Admin and inspector retain only their assigned province even through programmatic selection',()=>{
  for(const role of ['admin','inspector']){
    const page=setup({profile:{role,assignedProvinceCode:'62'},valid:true,rows});
    assert.equal(page.ui.selectedProvinceCode,'62',role);
    assert.equal(page.element('provinceFilter').disabled,true,role);
    assert.deepEqual(page.element('provinceFilter').options.map(option=>option.value),['62'],role);
    page.ui.selectProvince('50');
    page.ui.selectProvince('');
    assert.equal(page.ui.selectedProvinceCode,'62',role);
    assert.deepEqual(Array.from(page.ui.filter(rows)).map(row=>row.id),['kamphaeng'],role);
    assert.equal(page.changes,0,role);
    page.setActor({role},true);
    assert.equal(page.ui.selectedProvinceCode,'',role);
    assert.deepEqual(Array.from(page.ui.filter(rows)),[],role);
  }
});

test('Super Admin can retain a national overview and clear a province choice',()=>{
  const page=setup({profile:{role:'super_admin'},valid:true,rows});
  assert.equal(page.ui.selectedProvinceCode,'');
  assert.deepEqual(Array.from(page.ui.filter(rows)).map(row=>row.id),['kamphaeng','chiangmai']);
  assert.equal(page.element('provinceFilter').options[0].text,'ภาพรวมข้อมูลที่มี');
  page.ui.selectProvince('62');
  page.ui.selectProvince('');
  assert.equal(page.ui.selectedProvinceCode,'');
  assert.equal(page.element('provinceFilter').value,'');
  assert.deepEqual(Array.from(page.ui.filter(rows)).map(row=>row.id),['kamphaeng','chiangmai']);
});

test('invalid programmatic province values cannot alter a valid choice',()=>{
  const page=setup({rows});
  page.ui.selectProvince('50');
  page.ui.selectProvince('unknown');
  assert.equal(page.ui.selectedProvinceCode,'50');
  assert.equal(page.changes,1);
});

test('Super scope supports one, multiple and all available provinces without granting other roles control',()=>{const p=setup({profile:{role:'super_admin'},valid:true,rows});p.ui.setAvailable(['50','62']);p.ui.setScope('multi',['50','62']);assert.deepEqual(Array.from(p.ui.filter(rows)).map(r=>r.id).sort(),['chiangmai','kamphaeng']);assert.equal(p.ui.selectedProvinceCode,'');p.ui.setScope('multi',['50']);assert.deepEqual(Array.from(p.ui.filter(rows)).map(r=>r.id),['chiangmai']);p.ui.setScope('all');assert.equal(p.ui.filter(rows).length,2);p.ui.selectProvince('62');assert.equal(p.ui.scopeMode,'single');assert.equal(p.ui.filter(rows).length,1);const a=setup({profile:{role:'admin',assignedProvinceCode:'62'},valid:true,rows});assert.equal(a.ui.setScope('all'),false);assert.equal(a.ui.selectedProvinceCode,'62');});
