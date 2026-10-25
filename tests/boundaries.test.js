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

test('public geometry requires an explicit selected province even without a session',()=>{
 assert.equal(boundary.scope({role:'public'},false,''),null);
 assert.deepEqual(boundary.scope({role:'public'},false,'62'),{role:'public',code:'62'});
 assert.equal(boundary.scope({role:'public'},false,'invalid'),null);
 assert.equal(boundary.scope({role:'admin',assignedProvinceCode:'62'},false,'10'),null);
 const jobs=boundary.plan(index,boundary.scope({role:'public'},false,'62'),'10',[97,5,106,21],12,{province:true,district:true,subdistrict:true});
 assert.deepEqual(jobs.map(j=>j.code||j.codes),[['62'],'62','62']);
});

const square=(west,south,east,north,properties={})=>({type:'Feature',properties,geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]}});
const areas=[square(99,16,100,17,{provinceCode:'62',__district:'อำเภอหนึ่ง',__subdistrict:'บ้านใหม่',nameTH:'บ้านใหม่'}),square(100,16,101,17,{provinceCode:'62',__district:'อำเภอสอง',__subdistrict:'บ้านใหม่',nameTH:'บ้านใหม่'})];

test('coordinate containment respects polygon edges, holes and disconnected multipolygons',()=>{
 const polygon=square(99,16,100,17);polygon.geometry.coordinates.push([[99.3,16.3],[99.7,16.3],[99.7,16.7],[99.3,16.7],[99.3,16.3]]);
 assert.equal(boundary.contains(polygon,[99.1,16.1]),true);
 assert.equal(boundary.contains(polygon,[99,16.5]),true);
 assert.equal(boundary.contains(polygon,[99.5,16.5]),false);
 assert.equal(boundary.contains(polygon,[100.1,16.5]),false);
 const multi={geometry:{type:'MultiPolygon',coordinates:[square(99,16,100,17).geometry.coordinates,square(102,18,103,19).geometry.coordinates]}};
 assert.equal(boundary.contains(multi,[102.5,18.5]),true);
 assert.equal(boundary.contains(multi,[101,17.5]),false);
 assert.deepEqual(boundary.featureBounds(multi),[99,16,103,19]);
});

test('tambon selection disambiguates repeated names using district metadata',()=>{
 assert.deepEqual(boundary.resolveArea(areas,{district:'อำเภอสอง',tambon:'บ้านใหม่'}).features,[areas[1]]);
 assert.deepEqual(boundary.resolveArea(areas,{tambon:'บ้านใหม่'}).features,[]);
 assert.equal(boundary.resolveArea(areas,{tambon:'บ้านใหม่'}).reason,'ambiguous');
});

test('HS focus highlights containing geometry rather than its conflicting declared tambon',()=>{
 const focus=boundary.resolveArea(areas,{hs:{hsId:'HS-1',latitude:16.5,longitude:100.5,district:'อำเภอหนึ่ง',tambon:'บ้านใหม่'}});
 assert.deepEqual(focus.features,[areas[1]]);assert.equal(focus.source,'coordinates');assert.equal(focus.mismatch,true);
 const missing=boundary.resolveArea(areas,{hs:{latitude:18,longitude:104,district:'อำเภอหนึ่ง',tambon:'บ้านใหม่'}});
 assert.deepEqual(missing.features,[]);assert.equal(missing.reason,'outside');
 assert.deepEqual(boundary.resolveArea(areas,{hs:{latitude:null,longitude:null,district:'อำเภอสอง',tambon:'บ้านใหม่'}}).features,[areas[1]]);
});

// Browser/Leaflet are external dependencies; retain actual boundary selection and loading behavior.
async function inBrowser(run) {
 const previous={Option:global.Option,document:global.document};
 global.Option=function(text,value){this.text=text;this.value=value;};global.document={createElement:()=>({textContent:''})};
 try {await run();} finally {global.Option=previous.Option;global.document=previous.document;}
}
function boundaryMap(options={}) {
 const state={province:options.province??'62',area:options.area||{},profile:options.profile||{role:'public'},valid:!!options.valid};
 const fields={};for(const id of ['boundaryStatus','boundaryProvince','boundaryProvinceOn','boundaryDistrictOn','boundarySubdistrictOn','boundaryFit'])fields[id]={checked:id==='boundaryProvinceOn',replaceChildren(){},add(){}};
 const panel={hidden:true,querySelector:id=>fields[id.slice(1)]},layers=[],fits=[],requests=[],events={};
 const group={addTo(){return this},clearLayers(){layers.length=0;},addLayer(layer){layers.push(layer);}};
 let viewport=[97,5,106,21],zoom=6;
 const map={createPane(){},getPane:()=>({style:{}}),on(name,handler){events[name]=handler;},getZoom:()=>zoom,getBounds:()=>({getWest:()=>viewport[0],getSouth:()=>viewport[1],getEast:()=>viewport[2],getNorth:()=>viewport[3]}),fitBounds(box,opts){fits.push(box);viewport=[box[0][1],box[0][0],box[1][1],box[1][0]];zoom=opts.maxZoom;}};
 const fetch=async(path,opts)=>{
  requests.push(path);if(options.fetch){const pending=options.fetch(path,opts);if(pending)return pending;}
  const code=path.split('/')[2];let data;
  if(path.endsWith('index.json'))data={provinces:index};
  else if(path.endsWith('/subdistrict.geojson'))data={type:'FeatureCollection',features:code==='62'?areas:[square(104,18,105,19,{provinceCode:'10',__district:'ที่สอง',__subdistrict:'ตำบลสอง'})]};
  else data={type:'FeatureCollection',features:[square(code==='62'?99:104,code==='62'?16:18,code==='62'?101:105,code==='62'?17:19,{provinceCode:code,__district:'อำเภอหนึ่ง',nameTH:'อำเภอหนึ่ง'})]};
  return {ok:true,json:async()=>data};
 };
 const L={layerGroup:()=>group,geoJSON:(data,opts)=>({features:data.features.map(feature=>({feature,style:typeof opts.style==='function'?opts.style(feature):opts.style}))})};
 const control=boundary.create({map,L,panel,fetch,showControls:options.showControls,profile:()=>state.profile,valid:()=>state.valid,selectedProvince:()=>state.province,activeArea:()=>state.area});
 return {state,fields,panel,layers,fits,requests,events,control};
}

test('selected public tambon enables and fits geometry once, while manual toggles persist',()=>inBrowser(async()=>{
 const h=boundaryMap({area:{provinceCode:'62',district:'อำเภอสอง',tambon:'บ้านใหม่'}});
 await h.control.sync();assert.equal(h.panel.hidden,false);assert.equal(h.fields.boundarySubdistrictOn.checked,true);
 assert.deepEqual(h.fits,[[[16,100],[17,101]]]);assert.ok(h.requests.includes('data/boundaries/62/subdistrict.geojson'));
 const highlighted=h.layers.flatMap(l=>l.features).filter(f=>f.style.fillOpacity>0);
 assert.deepEqual(highlighted.map(f=>f.feature),[areas[1]]);
 h.fields.boundarySubdistrictOn.checked=false;await h.fields.boundarySubdistrictOn.onchange();await h.control.sync();
 assert.equal(h.fields.boundarySubdistrictOn.checked,false);assert.equal(h.fits.length,1);
 assert.ok(h.requests.every(p=>!p.endsWith('provinces.geojson')&&!p.includes('/10/')));
}));

test('public selection clears and aborts prior geometry before another province can finish',()=>inBrowser(async()=>{
 let release,started;const waiting=new Promise(resolve=>started=resolve);
 const h=boundaryMap({area:{provinceCode:'62',hs:{hsId:'old',latitude:16.5,longitude:99.5}},fetch:(path)=>path==='data/boundaries/62/subdistrict.geojson'?new Promise(resolve=>{release=resolve;started();}):null});
 const old=h.control.sync();await Promise.race([waiting,new Promise((_,reject)=>setTimeout(()=>reject(Error('selected province never requested geometry')),500))]);
 h.state.province='10';h.state.area={provinceCode:'10',hs:{hsId:'new',latitude:18.5,longitude:104.5}};await h.control.sync();
 release({ok:true,json:async()=>({type:'FeatureCollection',features:areas})});await old;
 assert.ok(h.layers.flatMap(l=>l.features).every(f=>f.feature.properties.provinceCode==='10'));
 assert.deepEqual(h.fits,[[[18,104],[19,105]]]);
 h.state.province='';h.state.area={};await h.control.sync();assert.equal(h.panel.hidden,true);assert.equal(h.layers.length,0);
}));

test('HS focus changes in the same province use actual polygon and disclose missing coverage',()=>inBrowser(async()=>{
 const h=boundaryMap({area:{provinceCode:'62',hs:{hsId:'a',latitude:16.5,longitude:99.5,district:'อำเภอสอง',tambon:'บ้านใหม่'}}});
 await h.control.sync();assert.deepEqual(h.fits,[[[16,99],[17,100]]]);assert.match(h.fields.boundaryStatus.textContent,/ไม่ตรง/);
 h.state.area={provinceCode:'62',hs:{hsId:'b',latitude:16.5,longitude:100.5}};await h.control.sync();
 assert.deepEqual(h.fits[1],[[16,100],[17,101]]);
 h.state.area={provinceCode:'62',hs:{hsId:'outside',latitude:18,longitude:104,district:'อำเภอหนึ่ง',tambon:'บ้านใหม่'}};await h.control.sync();
 assert.equal(h.layers.flatMap(l=>l.features).filter(f=>f.style.fillOpacity>0).length,0);
 assert.match(h.fields.boundaryStatus.textContent,/ไม่พบ.*พิกัด/);
}));

test('unknown public province fails closed without fetching its geometry',()=>inBrowser(async()=>{
 const h=boundaryMap({province:'99'});await h.control.sync();assert.equal(h.panel.hidden,true);assert.equal(h.layers.length,0);assert.deepEqual(h.requests,['data/boundaries/index.json']);
}));

test('map movement while the catalog loads does not discard province selector setup',()=>inBrowser(async()=>{
 let release;const h=boundaryMap({fetch:path=>path.endsWith('index.json')?new Promise(resolve=>release=resolve):null});
 const pending=h.control.sync();h.events.moveend();await new Promise(resolve=>setTimeout(resolve,175));
 release({ok:true,json:async()=>({provinces:index})});await pending;
 assert.equal(h.fields.boundaryProvince.value,'62');assert.equal(h.fields.boundaryProvince.disabled,true);
}));

test('district inspector geometry and HS highlighting remain confined to the assigned district',()=>inBrowser(async()=>{
 const h=boundaryMap({profile:{role:'inspector',assignedProvinceCode:'62',agencyLevel:'district',district:'อำเภอหนึ่ง'},valid:true,province:'10',area:{provinceCode:'62',hs:{latitude:16.5,longitude:100.5}}});
 await h.control.sync();assert.equal(h.fields.boundaryProvince.value,'62');
 const rendered=h.layers.flatMap(l=>l.features);assert.equal(rendered.filter(f=>f.style.fillOpacity>0).length,0);
 assert.ok(rendered.every(f=>!f.feature.properties.__subdistrict||f.feature.properties.__district==='อำเภอหนึ่ง'));
 assert.ok(h.requests.every(p=>!p.includes('/10/')));
}));

test('production polygon locates a known point inside Nai Mueang and excludes a nearby point outside it',()=>{
 const feature=JSON.parse(fs.readFileSync('data/boundaries/62/subdistrict.geojson')).features.find(f=>f.properties.areaCode==='620101');
 assert.equal(boundary.contains(feature,[99.53,16.46]),true);assert.equal(boundary.contains(feature,[99.6,16.46]),false);
});

 test('automatic tambon geometry remains active when boundary controls are removed from view',()=>inBrowser(async()=>{
 const h=boundaryMap({showControls:false,area:{provinceCode:'62',hs:{latitude:16.5,longitude:100.5}}});await h.control.sync();assert.equal(h.panel.hidden,true);assert.ok(h.layers.flatMap(l=>l.features).some(f=>f.style.fillOpacity>0));assert.equal(h.fields.boundarySubdistrictOn.checked,true);
 }));

test('multi-province display plans only selected provinces without broadening Admin scope',()=>{const visible={province:true,district:true,subdistrict:true};const jobs=boundary.plan(index,{role:'super_admin',code:''},'',[90,0,110,25],6,visible,['56','62']);assert.deepEqual(jobs[0].codes,['56','62']);const admin=boundary.plan(index,{role:'admin',code:'62'},'',[90,0,110,25],6,visible,['56','62']);assert.deepEqual(admin[0].codes,['62']);});
