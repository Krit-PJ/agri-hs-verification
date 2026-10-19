const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const boundary=require('../boundaries.js');
const index=JSON.parse(fs.readFileSync('data/boundaries/index.json')).provinces;
test('boundary visibility requires validated admin/super admin and assigned province',()=>{
 for(const role of ['public','inspector','admin','super_admin'])assert.equal(boundary.scope({role,assignedProvinceCode:'62'},false),null);
 assert.deepEqual(boundary.scope({role:'inspector',assignedProvinceCode:'62'},true),{role:'inspector',code:'62'});
 assert.equal(boundary.scope({role:'admin'},true),null);
 assert.deepEqual(boundary.scope({role:'admin',assignedProvinceCode:'62'},true),{role:'admin',code:'62'});
 assert.deepEqual(boundary.scope({role:'super_admin'},true),{role:'super_admin',code:''});
});
test('admin cannot request another province through selected value or viewport',()=>{
 const jobs=boundary.plan(index,{role:'admin',code:'62'},'10',[97,5,106,21],12,{province:true,district:true,subdistrict:true});
 assert.deepEqual(jobs[0].codes,['62']);assert.ok(jobs.slice(1).every(x=>x.code==='62'));assert.equal(jobs.length,3);
 assert.deepEqual(boundary.plan(index,null,'62',[0,0,180,90],12,{province:true}),[]);
});
test('country overview is available without bulk fetching district/tambon data',()=>{
 const jobs=boundary.plan(index,{role:'super_admin',code:''},'',[90,0,110,25],6,{province:true,district:true,subdistrict:true});
 assert.equal(jobs.length,1);assert.equal(jobs[0].codes.length,77);
 const zoomed=boundary.plan(index,{role:'super_admin',code:''},'62',index.find(p=>p.code==='62').bbox,10,{province:true,district:true,subdistrict:true});assert.equal(zoomed.length,3);
});
test('display package has 77 province geometries and parent codes consistent with partitions',()=>{
 assert.equal(index.length,77);assert.equal(new Set(index.map(p=>p.code)).size,77);
 let districts=0,tambons=0;
 for(const p of index){assert.equal(p.bbox.length,4);for(const [level,v] of Object.entries(p.levels)){
  const d=JSON.parse(fs.readFileSync('data/boundaries/'+v.path));assert.equal(d.features.length,v.count);
  for(const f of d.features){assert.equal(f.properties.provinceCode,p.code);assert.ok(f.properties.areaCode.startsWith(p.code));assert.ok(['Polygon','MultiPolygon'].includes(f.geometry.type));}
  if(level==='district')districts+=v.count;if(level==='subdistrict')tambons+=v.count;
 }}
 assert.equal(districts,929);assert.equal(tambons,7331);
 assert.equal(JSON.parse(fs.readFileSync('data/boundaries/provinces.geojson')).features.length,77);
});
test('logout during a pending boundary request cannot restore old admin geometry',async()=>{
 let profile={role:'admin',assignedProvinceCode:'62'},resolveIndex,added=0;
 const fields={};for(const id of ['boundaryStatus','boundaryProvince','boundaryProvinceOn','boundaryDistrictOn','boundarySubdistrictOn','boundaryFit'])fields[id]={checked:id!=='boundarySubdistrictOn',replaceChildren(){},add(){}};
 const panel={hidden:true,querySelector:id=>fields[id.slice(1)]};
 const group={addTo(){return this},clearLayers(){},addLayer(){added++}};
 const map={createPane(){},getPane:()=>({style:{}}),on(){},getZoom:()=>9,getBounds:()=>({getWest:()=>99,getEast:()=>100,getSouth:()=>15,getNorth:()=>17})};
 const control=boundary.create({map,L:{layerGroup:()=>group},panel,profile:()=>profile,valid:()=>Boolean(profile),fetch:()=>new Promise(resolve=>resolveIndex=resolve)});
 const pending=control.sync();assert.equal(panel.hidden,false);profile=null;await control.sync();assert.equal(panel.hidden,true);
 resolveIndex({ok:true,json:async()=>({provinces:index})});await pending;
 assert.equal(added,0);assert.equal(panel.hidden,true);
});
