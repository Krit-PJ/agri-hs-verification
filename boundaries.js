/* Public display geometry. HS read/write authorization remains on Apps Script. */
var HSBoundaries = (() => {
  'use strict';
  function scope(profile, valid, selectedProvince) {
    if ((!profile || profile.role === 'public') && /^\d{2}$/.test(selectedProvince || '')) return {role:'public',code:String(selectedProvince)};
    if (!valid || !profile) return null;
    if (profile.role === 'super_admin') return {role: 'super_admin', code: ''};
    if (['admin','inspector'].includes(profile.role) && /^\d{2}$/.test(profile.assignedProvinceCode || '')) return {role:profile.role,code:profile.assignedProvinceCode,...(profile.role==='inspector'&&profile.agencyLevel==='district'?{district:profile.district||''}:{})};
    return null;
  }
  function intersects(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
  const boxes = new WeakMap();
  function featureBounds(feature) {
    if (boxes.has(feature)) return boxes.get(feature);
    const geometry=feature.geometry;
    if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) return null;
    const box=[Infinity,Infinity,-Infinity,-Infinity];
    function visit(coords) {
      if (typeof coords[0] === 'number') {box[0]=Math.min(box[0],coords[0]);box[1]=Math.min(box[1],coords[1]);box[2]=Math.max(box[2],coords[0]);box[3]=Math.max(box[3],coords[1]);}
      else for (const part of coords) visit(part);
    }
    visit(geometry.coordinates);const result=box.every(Number.isFinite)?box:null;boxes.set(feature,result);return result;
  }
  function contains(feature, point) {
    const box=featureBounds(feature);
    if (!box || !point?.every(Number.isFinite) || !intersects(box,[...point,...point])) return false;
    function ringContains(ring) {
      let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
        const a=ring[j],b=ring[i],cross=(point[0]-a[0])*(b[1]-a[1])-(point[1]-a[1])*(b[0]-a[0]);
        if(Math.abs(cross)<1e-10 && point[0]>=Math.min(a[0],b[0]) && point[0]<=Math.max(a[0],b[0]) && point[1]>=Math.min(a[1],b[1]) && point[1]<=Math.max(a[1],b[1])) return true;
        if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
      }
      return inside;
    }
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    return polygons.some(rings=>rings.length && ringContains(rings[0]) && !rings.slice(1).some(ringContains));
  }
  function areaValues(area) {
    return {district:String(area.district || area.hs?.district || '').trim(),tambon:String(area.tambon || area.hs?.tambon || '').trim()};
  }
  function hsPoint(hs) {
    const lat=hs?.latitude??hs?.lat,lng=hs?.longitude??hs?.lng;
    return lat!=='' && lng!=='' && lat!=null && lng!=null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat))<=90 && Math.abs(Number(lng))<=180 ? [Number(lng),Number(lat)] : null;
  }
  function resolveArea(features, area, level='subdistrict') {
    const {district,tambon}=areaValues(area),point=hsPoint(area.hs);
    const matches=f=>(!district || f.properties.__district===district || (level==='district' && f.properties.nameTH===district)) && (!tambon || level==='district' || (f.properties.__tambon || f.properties.__subdistrict || f.properties.nameTH)===tambon);
    if(point) {
      const found=features.filter(f=>contains(f,point));
      return {features:found,source:'coordinates',mismatch:found.some(f=>!matches(f)),reason:found.length?'':'outside'};
    }
    const found=(district || tambon)?features.filter(matches):[];
    if(level==='subdistrict' && tambon && !district && found.length>1) return {features:[],source:'selection',mismatch:false,reason:'ambiguous'};
    return {features:found,source:'selection',mismatch:false,reason:found.length?'':'missing'};
  }
  function plan(catalog, access, selected, bounds, zoom, enabled, scopedCodes) {
    if (!access) return [];
    const codes = access.role !== 'super_admin' ? [access.code] : selected ? [selected] : Array.isArray(scopedCodes)?scopedCodes:catalog.map(p => p.code);
    const candidates = catalog.filter(p => codes.includes(p.code));
    const jobs = enabled.province ? [{level:'province', codes}] : [];
    for (const [level, minimum, limit] of [['district',8,8], ['subdistrict',10,4]]) {
      if (!enabled[level] || zoom < minimum) continue;
      const visible = candidates.filter(p => intersects(p.bbox, bounds));
      if (visible.length <= limit) for (const p of visible) jobs.push({level, code:p.code});
    }
    return jobs;
  }
  function create(env) {
    const map = env.map, L = env.L, panel = env.panel;
    let access = null, catalog = null, catalogPromise = null, revision = 0, key = '', selected = '', controller = null;
    let active = {}, selectionKey = '', selectionRevision = 0, focusPending = false;
    const cache = new Map(), group = L.layerGroup().addTo(map);
    const colors = {province:'#174f38',district:'#75530c',subdistrict:'#6f57a1'};
    panel.innerHTML = '<div class="boundary-heading"><strong>ขอบเขตการปกครอง</strong><button type="button" id="boundaryFit" class="secondary-button">ดูเต็มขอบเขต</button></div><div class="boundary-options"><label id="boundaryProvinceLabel">พื้นที่ขอบเขต<select id="boundaryProvince"></select></label><label><input id="boundaryProvinceOn" type="checkbox" checked><i class="boundary-line province"></i>จังหวัด</label><label><input id="boundaryDistrictOn" type="checkbox"><i class="boundary-line district"></i>อำเภอ</label><label><input id="boundarySubdistrictOn" type="checkbox"><i class="boundary-line subdistrict"></i>ตำบล</label></div><p id="boundaryStatus" role="status" aria-live="polite"></p><details><summary>แหล่งข้อมูลและข้อจำกัด</summary><p>ชุดขอบเขตที่หน่วยงานนำเข้า ครอบคลุม 77 จังหวัด บางพื้นที่มีข้อมูลไม่ครบ เส้นลดรายละเอียดเพื่อแสดงบนเว็บ ไม่ใช่แนวเขตรังวัดหรือหลักฐานรับรองพิกัด HS</p><p>อำเภอแสดงเมื่อซูมระดับ 8 ขึ้นไป ตำบลระดับ 10 ขึ้นไป โดยโหลดเฉพาะจังหวัดที่อยู่ในจอ เพื่อประหยัดข้อมูลมือถือ</p></details>';
    const el = id => panel.querySelector('#'+id), status = value => {el('boundaryStatus').textContent=value;};
    const enabled = () => ({province:el('boundaryProvinceOn').checked,district:el('boundaryDistrictOn').checked,subdistrict:el('boundarySubdistrictOn').checked});
    function reset() { revision++; controller?.abort(); group.clearLayers(); cache.clear(); }
    async function read(path, signal) {
      if (cache.has(path)) return cache.get(path);
      const response = await (env.fetch || fetch)('data/boundaries/'+path,{signal});
      if (!response.ok) throw Error('โหลดขอบเขตไม่สำเร็จ');
      const data = await response.json();
      if (signal.aborted) throw Error('ยกเลิกการโหลด');
      cache.set(path,data); if(cache.size>12)cache.delete(cache.keys().next().value);
      return data;
    }
    async function loadCatalog() { if(catalog)return catalog;if(!catalogPromise)catalogPromise=(env.fetch||fetch)('data/boundaries/index.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(data=>catalog=data.provinces).catch(error=>{catalogPromise=null;throw error;});return catalogPromise; }
    function add(data, level, highlighted=[]) {
      if(!data.features.length)return;
      const layer=L.geoJSON(data,{pane:'boundaryPane',style:f=>({color:highlighted.includes(f)?'#b45309':colors[level],weight:highlighted.includes(f)?3:level==='province'?2.5:level==='district'?1.7:1.1,opacity:.9,fillOpacity:highlighted.includes(f)?.13:0,fillColor:'#f59e0b',dashArray:level==='subdistrict'&&!highlighted.includes(f)?'5 4':null}),onEachFeature:(f,l)=>{const p=f.properties,node=document.createElement('span');node.textContent=(level==='province'?'จังหวัด':level==='district'?'อำเภอ':'ตำบล')+(p.nameTH||'')+' · '+(p.areaCode||'');l.bindTooltip(node,{sticky:true});}});
      group.addLayer(layer);
    }
    function fitBoxes(boxes,maxZoom) {
      if(!boxes.length)return;
      map.fitBounds([[Math.min(...boxes.map(b=>b[1])),Math.min(...boxes.map(b=>b[0]))],[Math.max(...boxes.map(b=>b[3])),Math.max(...boxes.map(b=>b[2]))]],{padding:[20,20],maxZoom});
    }
    function focusLevel() {const values=areaValues(active);return active.hs || values.tambon?'subdistrict':values.district?'district':'';}
    function focusStatus(result) {
      if(!result)return '';
      if(result.reason==='outside')return ' · ไม่พบขอบเขตตำบลที่ครอบพิกัด HS ในชุดข้อมูลนี้';
      if(result.reason==='ambiguous')return ' · ชื่อตำบลซ้ำ กรุณาเลือกอำเภอ';
      if(result.reason==='missing')return ' · ไม่พบขอบเขตพื้นที่ที่เลือกในชุดข้อมูลนี้';
      if(result.source==='coordinates')return ' · เน้นตำบลที่ครอบพิกัด HS'+(result.mismatch?' · พิกัดไม่ตรงกับชื่อพื้นที่ที่ระบุใน HS':'');
      return ' · เน้นขอบเขตตามชื่อพื้นที่ที่เลือก';
    }
    async function draw() {
      const id=++revision;controller?.abort();controller=new AbortController();const signal=controller.signal;
      group.clearLayers();if(!access)return;
      status('กำลังโหลดขอบเขต…');
      try {
        await loadCatalog(signal);if(id!==revision)return;
        if(selected&&!catalog.some(p=>p.code===selected)){access=null;panel.hidden=true;return;}
        const b=map.getBounds(),bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],on=enabled();
        const jobs=plan(catalog,access,selected,bounds,map.getZoom(),on,env.provinceCodes?.()),targetLevel=focusLevel(),code=selected||access.code;
        // A chosen area may be off screen. Resolve only its province before fitting it.
        if(code && targetLevel && on[targetLevel] && !jobs.some(j=>j.level===targetLevel&&j.code===code))jobs.push({level:targetLevel,code,focusOnly:true});
        let features=0,result=null;
        for(const job of jobs){
          const raw=await read(job.level==='province'?(job.codes.length===1?job.codes[0]+'/province.geojson':'provinces.geojson'):job.code+'/'+job.level+'.geojson',signal);
          if(id!==revision)return;
          const scoped=raw.features.filter(f=>(job.level!=='province'||job.codes.includes(f.properties.provinceCode))&&(!access.district||job.level==='province'||f.properties.__district===access.district));
          if(job.level===targetLevel)result=resolveArea(scoped,active,job.level);
          const data={type:'FeatureCollection',features:job.focusOnly?(result?.features||[]):scoped};
          add(data,job.level,job.level===targetLevel?result.features:[]);features+=data.features.length;
        }
        if(id!==revision)return;
        status('แสดงขอบเขต '+features.toLocaleString('th-TH')+' พื้นที่ · '+(access.role==='public'?'จังหวัด'+catalog.find(p=>p.code===access.code)?.name:access.role!=='super_admin'?'จังหวัดที่ได้รับมอบหมาย'+(access.district?' · อำเภอ'+access.district:''):selected?'จังหวัด'+catalog.find(p=>p.code===selected)?.name:'ทั่วประเทศ')+focusStatus(result)+' · ซูมเข้าเพื่อดูรายละเอียดอำเภอ/ตำบล'+(code?(catalog.find(p=>p.code===code)?.partial?' · จังหวัดนี้มีขอบเขตบางส่วนยังไม่ครบ':''):' · 35 จังหวัดมีข้อมูลบางส่วนยังไม่ครบ'));
        if(focusPending){
          focusPending=false;
          const boxes=result?.features.map(featureBounds).filter(Boolean)||[];
          if(boxes.length)fitBoxes(boxes,targetLevel==='subdistrict'?13:11);
          else if(code)fitBoxes(catalog.filter(p=>p.code===code).map(p=>p.bbox),10);
        }
      }catch(error){if(id===revision&&!signal.aborted){group.clearLayers();status('โหลดขอบเขตไม่สำเร็จ กรุณาเลื่อนแผนที่หรือลองใหม่ ข้อมูล HS ยังใช้งานได้');}}
    }
    async function fit(){if(!access)return;const id=++revision;controller?.abort();try{await loadCatalog();if(id!==revision||!access)return;const items=catalog.filter(p=>access.role!=='super_admin'?p.code===access.code:selected?p.code===selected:env.provinceCodes?env.provinceCodes().includes(p.code):true);if(!items.length)return;focusPending=false;fitBoxes(items.map(p=>p.bbox),10);await draw();}catch(_){if(id===revision)status('ยังเปิดขอบเขตไม่ได้ กรุณาลองใหม่');}}
    async function sync(){
      const context=env.activeArea?.()||{},province=String(env.selectedProvince?env.selectedProvince()||'':context.provinceCode||'');
      const next=scope(env.profile(),env.valid(),province),nextKey=next?next.role+':'+next.code+':'+(next.district||''):'';
      const nextSelected=next?.role==='super_admin'?(env.selectedProvince?province:selected):next?.code||'';
      const nextActive=context.provinceCode&&String(context.provinceCode)!==nextSelected?{}:{district:context.district||'',tambon:context.tambon||'',hs:context.hs?{hsId:context.hs.hsId,latitude:context.hs.latitude??context.hs.lat,longitude:context.hs.longitude??context.hs.lng,district:context.hs.district,tambon:context.hs.tambon}:null};
      const nextSelectionKey=JSON.stringify([nextSelected,nextActive,env.provinceCodes?.()]);
      if(nextKey===key&&nextSelectionKey===selectionKey)return;
      const accessChanged=nextKey!==key;key=nextKey;selectionKey=nextSelectionKey;const currentSelection=++selectionRevision;
      if(accessChanged)reset();else{revision++;controller?.abort();group.clearLayers();}
      access=next;selected=nextSelected;active=nextActive;focusPending=Boolean(selected);panel.hidden=!access||env.showControls===false;if(!access)return;
      el('boundarySubdistrictOn').checked=Boolean(selected)||el('boundarySubdistrictOn').checked;
      if(focusLevel())el('boundaryDistrictOn').checked=true;
      status('กำลังอ่านรายการพื้นที่…');
      controller=new AbortController();
      try{await loadCatalog();if(currentSelection!==selectionRevision||!access)return;
        if(selected&&!catalog.some(p=>p.code===selected)){access=null;panel.hidden=true;group.clearLayers();return;}
        const select=el('boundaryProvince');select.replaceChildren();if(access.role==='super_admin')select.add(new Option('ทั่วประเทศ',''));
        for(const p of catalog.filter(p=>access.role==='super_admin'||p.code===access.code))select.add(new Option(p.name+(p.partial?' · ข้อมูลบางส่วน':''),p.code));
        select.value=selected;select.disabled=access.role!=='super_admin';await draw();
      }catch(_){if(currentSelection===selectionRevision)status('อ่านรายการขอบเขตไม่สำเร็จ กดดูเต็มขอบเขตเพื่อลองใหม่');}
    }
    map.createPane('boundaryPane');map.getPane('boundaryPane').style.zIndex=350;
    for(const id of ['boundaryProvinceOn','boundaryDistrictOn','boundarySubdistrictOn'])el(id).onchange=draw;
    el('boundaryProvince').onchange=()=>{selectionRevision++;selected=el('boundaryProvince').value;active={};focusPending=false;return fit();};el('boundaryFit').onclick=fit;
    let timer;map.on('moveend',()=>{clearTimeout(timer);timer=setTimeout(draw,150);});
    return {sync};
  }
  return {scope,intersects,plan,featureBounds,contains,resolveArea,create};
})();
if(typeof module==='object')module.exports=HSBoundaries;
