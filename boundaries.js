/* Public display geometry. HS read/write authorization remains on Apps Script. */
var HSBoundaries = (() => {
  'use strict';
  function scope(profile, valid) {
    if (!valid || !profile) return null;
    if (profile.role === 'super_admin') return {role: 'super_admin', code: ''};
    if (profile.role === 'admin' && /^\d{2}$/.test(profile.assignedProvinceCode || '')) return {role: 'admin', code: profile.assignedProvinceCode};
    return null;
  }
  function intersects(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
  function plan(catalog, access, selected, bounds, zoom, enabled) {
    if (!access) return [];
    const codes = access.role === 'admin' ? [access.code] : selected ? [selected] : catalog.map(p => p.code);
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
    const cache = new Map(), group = L.layerGroup().addTo(map);
    const colors = {province:'#174f38',district:'#75530c',subdistrict:'#6f57a1'};
    panel.innerHTML = '<div class="boundary-heading"><strong>ขอบเขตการปกครอง</strong><button type="button" id="boundaryFit" class="secondary-button">ดูเต็มขอบเขต</button></div><div class="boundary-options"><label id="boundaryProvinceLabel">พื้นที่ขอบเขต<select id="boundaryProvince"></select></label><label><input id="boundaryProvinceOn" type="checkbox" checked><i class="boundary-line province"></i>จังหวัด</label><label><input id="boundaryDistrictOn" type="checkbox" checked><i class="boundary-line district"></i>อำเภอ</label><label><input id="boundarySubdistrictOn" type="checkbox"><i class="boundary-line subdistrict"></i>ตำบล</label></div><p id="boundaryStatus" role="status" aria-live="polite"></p><details><summary>แหล่งข้อมูลและข้อจำกัด</summary><p>ชุดขอบเขตที่หน่วยงานนำเข้า ครอบคลุม 77 จังหวัด บางพื้นที่มีข้อมูลไม่ครบ เส้นลดรายละเอียดเพื่อแสดงบนเว็บ ไม่ใช่แนวเขตรังวัดหรือหลักฐานรับรองพิกัด HS</p><p>อำเภอแสดงเมื่อซูมระดับ 8 ขึ้นไป ตำบลระดับ 10 ขึ้นไป โดยโหลดเฉพาะจังหวัดที่อยู่ในจอ เพื่อประหยัดข้อมูลมือถือ</p></details>';
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
    function add(data, level) {
      if(!data.features.length)return;
      const layer=L.geoJSON(data,{pane:'boundaryPane',style:{color:colors[level],weight:level==='province'?2.5:level==='district'?1.7:1.1,opacity:.9,fillOpacity:0,dashArray:level==='subdistrict'?'5 4':null},onEachFeature:(f,l)=>{const p=f.properties,node=document.createElement('span');node.textContent=(level==='province'?'จังหวัด':level==='district'?'อำเภอ':'ตำบล')+(p.nameTH||'')+' · '+(p.areaCode||'');l.bindTooltip(node,{sticky:true});}});
      group.addLayer(layer);
    }
    async function draw() {
      const id=++revision;controller?.abort();controller=new AbortController();const signal=controller.signal;
      group.clearLayers();if(!access)return;
      status('กำลังโหลดขอบเขต…');
      try {
        await loadCatalog(signal);if(id!==revision)return;
        const b=map.getBounds(),bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],on=enabled();
        const jobs=plan(catalog,access,selected,bounds,map.getZoom(),on);
        let features=0;
        for(const job of jobs){
          const raw=await read(job.level==='province'?(job.codes.length===1?job.codes[0]+'/province.geojson':'provinces.geojson'):job.code+'/'+job.level+'.geojson',signal);
          if(id!==revision)return;
          const data=job.level==='province'?{type:'FeatureCollection',features:raw.features.filter(f=>job.codes.includes(f.properties.provinceCode))}:raw;
          add(data,job.level);features+=data.features.length;
        }
        if(id!==revision)return;
        status('แสดงขอบเขต '+features.toLocaleString('th-TH')+' พื้นที่ · '+(access.role==='admin'?'ตามจังหวัดที่ได้รับมอบหมาย':selected?'จังหวัด'+catalog.find(p=>p.code===selected)?.name:'ทั่วประเทศ')+' · ซูมเข้าเพื่อดูรายละเอียดอำเภอ/ตำบล'+((selected||access.code)?(catalog.find(p=>p.code===(selected||access.code))?.partial?' · จังหวัดนี้มีขอบเขตบางส่วนยังไม่ครบ':''):' · 35 จังหวัดมีข้อมูลบางส่วนยังไม่ครบ')); 
      }catch(error){if(id===revision&&!signal.aborted){group.clearLayers();status('โหลดขอบเขตไม่สำเร็จ กรุณาเลื่อนแผนที่หรือลองใหม่ ข้อมูล HS ยังใช้งานได้');}}
    }
    async function fit(){if(!access)return;const fitKey=key;try{controller?.abort();controller=new AbortController();await loadCatalog();if(fitKey!==key||!access)return;const items=catalog.filter(p=>access.role==='admin'?p.code===access.code:!selected||p.code===selected);if(!items.length)return;const boxes=items.map(p=>p.bbox);map.fitBounds([[Math.min(...boxes.map(b=>b[1])),Math.min(...boxes.map(b=>b[0]))],[Math.max(...boxes.map(b=>b[3])),Math.max(...boxes.map(b=>b[2]))]],{padding:[20,20],maxZoom:10});draw();}catch(_){status('ยังเปิดขอบเขตไม่ได้ กรุณาลองใหม่');}}
    async function sync(){
      const next=scope(env.profile(),env.valid()),nextKey=next?next.role+':'+next.code:'';
      if(nextKey===key)return;key=nextKey;reset();access=next;panel.hidden=!access;if(!access)return;
      selected=access.code;status('กำลังอ่านรายการพื้นที่…');
      controller=new AbortController();const current=key;
      try{await loadCatalog(controller.signal);if(current!==key)return;
        const select=el('boundaryProvince');select.replaceChildren();if(access.role==='super_admin')select.add(new Option('ทั่วประเทศ',''));
        for(const p of catalog.filter(p=>access.role==='super_admin'||p.code===access.code))select.add(new Option(p.name+(p.partial?' · ข้อมูลบางส่วน':''),p.code));
        select.value=selected;select.disabled=access.role==='admin';await draw();
      }catch(_){if(current===key)status('อ่านรายการขอบเขตไม่สำเร็จ กดดูเต็มขอบเขตเพื่อลองใหม่');}
    }
    map.createPane('boundaryPane');map.getPane('boundaryPane').style.zIndex=350;
    for(const id of ['boundaryProvinceOn','boundaryDistrictOn','boundarySubdistrictOn'])el(id).onchange=draw;
    el('boundaryProvince').onchange=()=>{selected=el('boundaryProvince').value;fit();};el('boundaryFit').onclick=fit;
    let timer;map.on('moveend',()=>{clearTimeout(timer);timer=setTimeout(draw,150);});
    return {sync};
  }
  return {scope,intersects,plan,create};
})();
if(typeof module==='object')module.exports=HSBoundaries;
