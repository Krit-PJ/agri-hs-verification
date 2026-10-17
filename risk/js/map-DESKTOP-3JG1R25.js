const MapModule = (() => {
  let map, currentBasemap = 'satellite';
  const base = {};
  const raw = {
    district:null, subdistrict:null, hotspot:{}, crop:null, burnscar:null,
    risk:null, riskDistrict:null, riskSubdistrict:null
  };
  const shown = { province:null, district:null, subdistrict:null, hotspot:{}, crop:null, burnscar:null, risk:null };
  let state = { district:'', subdistrict:'', crop:'', month:'', day:'' };

  const clean = v => String(v || '').replace(/^(อ\.|อำเภอ|ต\.|ตำบล|จ\.|จังหวัด)\s*/, '').trim();
  const districtOf = p => clean(p?.__district || p?.district || p?.Amphoe || p?.AmphoeN || p?.AMP_NAMT || p?.AMP_NAM_T || p?.AMPHOE_T || p?.AMPHOE || p?.NAME_2);
  const subdistrictOf = p => clean(p?.__subdistrict || p?.subdistrict || p?.Tambon || p?.TambonN || p?.TAM_NAMT || p?.TAM_NAM_T || p?.TAMBON_T || p?.NAME_3);
  const normalizeCrop = v => {
    const s = String(v || '').trim();
    if (['นาข้าว','ข้าว'].includes(s)) return 'ข้าว';
    if (s.includes('ข้าวโพด')) return 'ข้าวโพด';
    if (s.includes('อ้อย')) return 'อ้อย';
    if (s.includes('มันสำปะหลัง')) return 'มันสำปะหลัง';
    if (['เกษตรอื่น ๆ','อื่น ๆ','อื่น',''].includes(s)) return 'อื่นๆ';
    return s;
  };
  const cropOf = p => normalizeCrop(p?.__crop || p?.crop_type || p?.PlantType || p?.crop || p?.LU_HP_Name);
  const provinceOf = p => clean(p?.__province || p?.province || p?.Province || p?.ProvinceN || p?.PROV_NAMT || p?.PROV_NAM_T || p?.Prov || p?.NAME_1);
  function excelSerialToDate(value){
    const n=Number(value); if(!Number.isFinite(n)||n<1)return null;
    const d=new Date(Math.round((n-25569)*86400*1000));
    return Number.isNaN(d.getTime())?null:d;
  }
  function parseHotspotDate(properties,fallbackYearBE){
    const p=properties||{};
    for(const value of [p.__date,p.acq_date,p.ACQ_DATE,p.Date,p.date,p.th_date]){
      if(value===null||value===undefined||value==='')continue;
      if(typeof value==='number'||/^\d{5}(?:\.\d+)?$/.test(String(value).trim())){const d=excelSerialToDate(value);if(d)return d;}
      const text=String(value).trim();
      let m=text.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)$/);
      if(m){let y=Number(m[1]);if(y>2400)y-=543;const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[3])));if(!Number.isNaN(d.getTime()))return d;}
      m=text.match(/^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})$/);
      if(m){let y=Number(m[3]);if(y>2400)y-=543;const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[1])));if(!Number.isNaN(d.getTime()))return d;}
      const d=new Date(text);if(!Number.isNaN(d.getTime()))return d;
    }
    const y=Number(fallbackYearBE||p.year_be||p.season_be);return Number.isFinite(y)?new Date(Date.UTC(y-543,0,1)):null;
  }
  function datePartsOf(feature){
    const p=feature?.properties||{};
    if(Number.isFinite(Number(p.__month))&&Number.isFinite(Number(p.__day)))return{month:Number(p.__month),day:Number(p.__day),date:p.__date||''};
    const d=parseHotspotDate(p,p.year_be);return d?{month:d.getUTCMonth()+1,day:d.getUTCDate(),date:d.toISOString().slice(0,10)}:{month:0,day:0,date:''};
  }
  function matchesDate(feature){
    const parts=datePartsOf(feature),month=Number(state.month||0),day=Number(state.day||0);
    return(!month||parts.month===month)&&(!day||parts.day===day);
  }
  async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); }
  function remove(layer){ if(layer && map.hasLayer(layer)) map.removeLayer(layer); }
  function hotspotEnabled(){ return document.getElementById('lyr-hotspot')?.checked !== false; }
  function activeYears(){
    if(!hotspotEnabled()) return [];
    return [...document.querySelectorAll('.hs-layer:checked')]
      .map(el => Number(el.dataset.year)).filter(Number.isFinite).sort((a,b)=>a-b);
  }

  function asPointFeature(feature){
    if(!feature?.geometry) return feature;
    if(feature.geometry.type==='Point') return feature;
    if(feature.geometry.type==='MultiPoint' && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length===1){
      return {...feature,geometry:{type:'Point',coordinates:feature.geometry.coordinates[0]}};
    }
    return feature;
  }

  function annualEvidenceScore(count, cropScore, areaScore){
    const exposure=Math.max(0,Math.min(100,(Number(cropScore||0)+Number(areaScore||0))/2));
    let score=0;
    if(count<=0) score=0;
    else if(count<=2) score=5+(count-1)*10+exposure*0.09;          // remains 5-24.99
    else if(count<=5) score=25+((count-3)/2)*15+exposure*0.09;    // remains 25-49.99
    else if(count<=10) score=50+((count-6)/4)*15+exposure*0.09;   // remains 50-74.99
    else score=75+Math.min(20,Math.log1p(count-10)*7)+exposure*0.05;
    const cap=count<=2?24.99:count<=5?49.99:count<=10?74.99:100;
    const floor=count<=0?0:count<=2?0:count<=5?25:count<=10?50:75;
    return Math.max(floor,Math.min(cap,score));
  }

  async function init(){
    map = L.map('map',{ center:CONFIG.MAP_CENTER, zoom:CONFIG.MAP_ZOOM, minZoom:CONFIG.MAP_MIN_ZOOM, maxZoom:CONFIG.MAP_MAX_ZOOM, zoomControl:false });
    L.control.zoom({position:'bottomright'}).addTo(map);
    Object.entries(CONFIG.BASEMAPS).forEach(([k,u]) => base[k] = L.tileLayer(u,{ maxZoom:19, attribution:k==='satellite'?'Tiles © Esri':k==='topo'?'© OpenTopoMap':'© OpenStreetMap contributors' }));
    base.satellite.addTo(map);

    document.querySelectorAll('input[name="basemap"]').forEach(el => el.addEventListener('change',()=>{ remove(base[currentBasemap]); currentBasemap=el.value; base[currentBasemap].addTo(map); }));
    ['lyr-district','lyr-subdistrict','lyr-province'].forEach(id => document.getElementById(id)?.addEventListener('change',renderBoundaries));
    document.getElementById('lyr-crop')?.addEventListener('change',renderCrop);
    document.getElementById('lyr-burnscar')?.addEventListener('change',()=>renderAux('burnscar'));
    document.getElementById('lyr-risk')?.addEventListener('change',()=>renderAux('risk'));
    document.addEventListener('change',e=>{
      const isYear=e.target?.classList?.contains('hs-layer');
      const isMaster=e.target?.id==='lyr-hotspot';
      if(!isYear&&!isMaster) return;
      computeDynamicRisk();
      renderHotspots();
      renderAux('risk');
      document.dispatchEvent(new CustomEvent('agri-risk:years-changed',{detail:{years:activeYears(),hotspotEnabled:hotspotEnabled()}}));
    });

    [raw.district,raw.subdistrict] = await Promise.all([fetchJSON(CONFIG.DATA.district_kpt),fetchJSON(CONFIG.DATA.subdistrict_kpt)]);
    await Promise.all(Object.entries(CONFIG.DATA.hotspot).map(async([y,u])=>{
      try {
        const fc=await fetchJSON(u);
        raw.hotspot[y]={...fc,features:(fc.features||[]).map(asPointFeature)};
      }
      catch(err){ console.warn(err.message); raw.hotspot[y]={type:'FeatureCollection',features:[]}; }
    }));
    enrichHotspots();
    computeDynamicRisk();
    renderBoundaries(); renderHotspots(); renderAux('risk'); zoomToKPT();
    return { district:raw.district, subdistrict:raw.subdistrict, hotspot:raw.hotspot, risk:raw.risk };
  }

  function enrichFeature(input,fallbackYearBE){
    const f=asPointFeature(input);
    const p=f.properties||(f.properties={});
    let d=districtOf(p), t=subdistrictOf(p), prov=provinceOf(p);
    if(window.turf && f.geometry?.type==='Point'){
      const hit=(raw.subdistrict?.features||[]).find(poly=>{ try{return turf.booleanPointInPolygon(f,poly);}catch{return false;} });
      if(hit){ d=districtOf(hit.properties); t=subdistrictOf(hit.properties); prov='กำแพงเพชร'; }
    }
    p.__district=d; p.__subdistrict=t; p.__crop=cropOf(p); p.__province=prov||'กำแพงเพชร';
    const dt=parseHotspotDate(p,fallbackYearBE||p.year_be);if(dt){p.__date=dt.toISOString().slice(0,10);p.__month=dt.getUTCMonth()+1;p.__day=dt.getUTCDate();}p.year_be=Number(p.year_be||fallbackYearBE)||fallbackYearBE;
    return f;
  }
  function enrichHotspots(){ Object.entries(raw.hotspot).forEach(([year,fc])=>{fc.features=(fc.features||[]).map(f=>enrichFeature(f,Number(year))).filter(f=>f.properties?.__province==='กำแพงเพชร');}); }

  function selectedYearWeights(years){
    if(!years.length) return {};
    const configured=CONFIG.RISK_MODEL.yearWeights||{};
    const vals=years.map((y,i)=>Number(configured[y] ?? (i+1)));
    const total=vals.reduce((a,b)=>a+b,0)||1;
    return Object.fromEntries(years.map((y,i)=>[y,vals[i]/total]));
  }

  function hotspotRowsFor(level, years, yearWeights){
    const boundaries = level==='district' ? (raw.district?.features||[]) : (raw.subdistrict?.features||[]);
    const areaByDistrict = {};
    (raw.subdistrict?.features||[]).forEach(f=>{
      const d=districtOf(f.properties), a=Number(f.properties?.AREA_RAI||f.properties?.area_rai||0);
      areaByDistrict[d]=(areaByDistrict[d]||0)+a;
    });
    return boundaries.map(feature=>{
      const p=feature.properties||{}, d=districtOf(p), t=level==='subdistrict'?subdistrictOf(p):'';
      const counts={}; let cropSum=0,cropN=0;
      years.forEach(y=>{
        const fs=(raw.hotspot[y]?.features||[]).filter(h=>{
          const hp=h.properties||{};
          return hp.__province==='กำแพงเพชร' && hp.__district===d && (level==='district'||hp.__subdistrict===t) && (!state.crop||hp.__crop===state.crop) && matchesDate(h);
        });
        counts[y]=fs.length;
        fs.forEach(h=>{cropSum+=CONFIG.CROP_RISK[h.properties.__crop]??50;cropN++;});
      });
      const weighted=years.reduce((s,y)=>s+(counts[y]||0)*(yearWeights[y]||0),0);
      let trend=0;
      if(years.length>=2){
        const prev=counts[years[years.length-2]]||0, cur=counts[years[years.length-1]]||0;
        trend=prev===0?(cur>0?100:0):Math.max(0,Math.min(100,50+((cur-prev)/prev)*100));
      }
      const area=level==='district' ? (areaByDistrict[d]||0) : Number(p.AREA_RAI||p.area_rai||0);
      return {feature,d,t,counts,weighted,trend,crop:cropN?cropSum/cropN:0,area};
    });
  }

  function scopeBoundaries(level){
    const source = level==='district' ? (raw.district?.features||[]) : (raw.subdistrict?.features||[]);
    return source.filter(feature=>{
      const d=districtOf(feature.properties), t=subdistrictOf(feature.properties);
      if(level==='district') return !state.district || d===state.district;
      return (!state.district || d===state.district) && (!state.subdistrict || t===state.subdistrict);
    });
  }

  function historicalReferenceMax(level){
    const boundaries=scopeBoundaries(level);
    const allYears=Object.keys(raw.hotspot).map(Number).filter(Number.isFinite);
    let maxCount=1;
    boundaries.forEach(feature=>{
      const d=districtOf(feature.properties), t=level==='subdistrict'?subdistrictOf(feature.properties):'';
      allYears.forEach(y=>{
        const count=(raw.hotspot[y]?.features||[]).filter(h=>{
          const hp=h.properties||{};
          return hp.__province==='กำแพงเพชร' && hp.__district===d && (level==='district'||hp.__subdistrict===t) && (!state.crop||hp.__crop===state.crop) && matchesDate(h);
        }).length;
        if(count>maxCount) maxCount=count;
      });
    });
    return maxCount;
  }

  function buildRiskCollection(level, years, yearWeights){
    const factors=CONFIG.RISK_MODEL.weights;
    const allowed=new Set(scopeBoundaries(level).map(f=>{
      const d=districtOf(f.properties),t=level==='subdistrict'?subdistrictOf(f.properties):'';
      return `${d}||${t}`;
    }));
    const rows=hotspotRowsFor(level,years,yearWeights).filter(r=>allowed.has(`${r.d}||${r.t}`));
    const referenceMax=historicalReferenceMax(level);
    const logs=rows.map(r=>Math.log1p(r.area));
    const minL=logs.length?Math.min(...logs):0, maxL=logs.length?Math.max(...logs):0;

    return {
      type:'FeatureCollection', name:`risk_${level}_${years.join('_')||'none'}`,
      features:rows.map((r,i)=>{
        const hs=years.length?Math.max(0,Math.min(100,r.weighted/referenceMax*100)):0;
        const trend=years.length>=2?r.trend:0;
        const area=maxL===minL?(rows.length===1?50:0):(logs[i]-minL)/(maxL-minL)*100;
        const selectedCount=years.reduce((sum,y)=>sum+(r.counts[y]||0),0);
        let score=0, method='No hotspot year selected';
        if(years.length===1){
          // One common annual method for every year and every administrative level.
          score=annualEvidenceScore(selectedCount,r.crop,area);
          method='Unified annual evidence-gate model';
        }else if(years.length>=2){
          score=hs*factors.hotspot+trend*factors.trend+r.crop*factors.crop+area*factors.area;
          method='Multi-year Model A';
        }
        const hsFields=Object.fromEntries(years.map(y=>[`hs_${y}`,r.counts[y]||0]));
        return {
          type:'Feature', geometry:r.feature.geometry,
          properties:{
            ...r.feature.properties,
            district:r.d,subdistrict:r.t,risk_level_scope:level,
            risk_score:+score.toFixed(2),
            risk_raw_score:+score.toFixed(2),
            hotspot_score:+hs.toFixed(2),trend_score:+trend.toFixed(2),
            crop_score:+r.crop.toFixed(2),area_score:+area.toFixed(2),
            risk_years:years.join(','),
            risk_month:state.month||'',risk_day:state.day||'',
            risk_period:[state.day?`วันที่ ${state.day}`:'',state.month?`เดือน ${state.month}`:''].filter(Boolean).join(' ')||'ทุกเดือน',
            risk_method:method,
            selected_hotspot_count:selectedCount,
            risk_reference_max:referenceMax,
            ...hsFields
          }
        };
      })
    };
  }

  function computeDynamicRisk(){
    const years=activeYears();
    const yw=selectedYearWeights(years);
    raw.riskDistrict=buildRiskCollection('district',years,yw);
    raw.riskSubdistrict=buildRiskCollection('subdistrict',years,yw);
    raw.risk=state.district?raw.riskSubdistrict:raw.riskDistrict;
    return raw.risk;
  }

  function matchesFeature(f){ const p=f.properties||{}; return p.__province==='กำแพงเพชร'&&(!state.district||p.__district===state.district)&&(!state.subdistrict||p.__subdistrict===state.subdistrict)&&(!state.crop||p.__crop===state.crop)&&matchesDate(f); }
  function matchesBoundary(f,level){ const d=districtOf(f.properties),t=subdistrictOf(f.properties); return(!state.district||d===state.district)&&(!state.subdistrict||level!=='subdistrict'||t===state.subdistrict); }

  function renderBoundaries(){
    remove(shown.province); remove(shown.district); remove(shown.subdistrict);
    const showProv=document.getElementById('lyr-province')?.checked, showDist=document.getElementById('lyr-district')?.checked||!!state.district, showSub=document.getElementById('lyr-subdistrict')?.checked||!!state.subdistrict;
    if(showProv&&raw.district){ let fc=raw.district; try{if(window.turf?.dissolve)fc=turf.dissolve(raw.district);}catch{} shown.province=L.geoJSON(fc,{style:{color:'#f8fafc',weight:3,fillOpacity:0,opacity:1},interactive:false}).addTo(map); }
    if(showDist&&raw.district) shown.district=L.geoJSON({type:'FeatureCollection',features:raw.district.features.filter(f=>matchesBoundary(f,'district'))},{style:{color:'#22d3ee',weight:2.2,fillOpacity:.03},onEachFeature:(f,l)=>l.bindTooltip(`อ.${districtOf(f.properties)}`)}).addTo(map);
    if(showSub&&raw.subdistrict) shown.subdistrict=L.geoJSON({type:'FeatureCollection',features:raw.subdistrict.features.filter(f=>matchesBoundary(f,'subdistrict'))},{style:{color:'#e2e8f0',weight:1.1,fillOpacity:.02},onEachFeature:(f,l)=>l.bindTooltip(`ต.${subdistrictOf(f.properties)}`)}).addTo(map);
  }

  function renderHotspots(){
    Object.values(shown.hotspot).forEach(remove); shown.hotspot={};
    if(!hotspotEnabled()) return;
    Object.entries(raw.hotspot).forEach(([year,fc])=>{
      const cb=document.querySelector(`.hs-layer[data-year="${year}"]`); if(cb&&!cb.checked)return;
      const filtered=(fc.features||[]).filter(matchesFeature), group=L.markerClusterGroup({disableClusteringAtZoom:11});
      L.geoJSON({type:'FeatureCollection',features:filtered},{pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:5.5,fillColor:CONFIG.YEAR_COLORS[year]||'#ef4444',color:'#ffffff',weight:1.4,fillOpacity:.96}),onEachFeature:(f,l)=>l.bindPopup(`<b>Hotspot ปี ${year}</b><br>วันที่ ${f.properties.__date||'-'}<br>อ.${f.properties.__district||'-'} ต.${f.properties.__subdistrict||'-'}<br>พืช: ${f.properties.__crop||'-'}`)}).addTo(group);
      group.addTo(map); shown.hotspot[year]=group;
    });
  }

  async function ensureAux(type){ if(raw[type])return; const url=type==='crop'?CONFIG.DATA.crop_kpt:CONFIG.DATA.burnscar_kpt; try{raw[type]=await fetchJSON(url);}catch(err){console.warn(err.message);raw[type]={type:'FeatureCollection',features:[]};} }
  async function renderCrop(){ remove(shown.crop); if(!document.getElementById('lyr-crop')?.checked)return; await ensureAux('crop'); const fs=(raw.crop.features||[]).filter(f=>{const p=f.properties||{};return(!state.district||districtOf(p)===state.district)&&(!state.subdistrict||subdistrictOf(p)===state.subdistrict)&&(!state.crop||cropOf(p)===state.crop);}); shown.crop=L.geoJSON({type:'FeatureCollection',features:fs},{style:{color:'#16a34a',fillColor:'#22c55e',weight:.6,fillOpacity:.35},onEachFeature:(f,l)=>l.bindTooltip(cropOf(f.properties))}).addTo(map); }
  async function renderAux(type){
    remove(shown[type]);
    const checked=document.getElementById(type==='burnscar'?'lyr-burnscar':'lyr-risk')?.checked; if(!checked)return;
    if(type==='burnscar')await ensureAux(type);
    let collection, level='subdistrict';
    if(type==='risk'){
      level=state.district?'subdistrict':'district';
      collection=level==='district'?raw.riskDistrict:raw.riskSubdistrict;
    }else collection=raw[type];
    const fs=(collection?.features||[]).filter(f=>matchesBoundary(f,level));
    shown[type]=L.geoJSON({type:'FeatureCollection',features:fs},{
      style:type==='burnscar'?{color:'#dc2626',fillColor:'#ef4444',weight:.8,fillOpacity:.4}:f=>{const l=getRiskLevel(Number(f.properties?.risk_score||0));return{color:l.color,fillColor:l.color,weight:1.4,fillOpacity:.62};},
      onEachFeature:type==='risk'?(f,l)=>{
        const p=f.properties||{}, score=Number(p.risk_score||0), name=level==='district'?`อ.${districtOf(p)}`:`ต.${subdistrictOf(p)}`;
        l.bindTooltip(`${name}<br>คะแนน ${score.toFixed(1)} (${getRiskLevel(score).label})<br>ปี ${p.risk_years||'-'} | ${p.risk_period||'ทุกเดือน'}`);
      }:undefined
    }).addTo(map);
  }

  function applyFilter(next){
    state={district:clean(next.district),subdistrict:clean(next.subdistrict),crop:next.crop||'',month:String(next.month||''),day:String(next.day||'')};
    computeDynamicRisk();
    raw.risk=state.district?raw.riskSubdistrict:raw.riskDistrict;
    renderBoundaries();renderHotspots();renderCrop();renderAux('burnscar');renderAux('risk');focusSelection();
  }
  function focusSelection(options={}){
    let src=null;
    if(state.subdistrict) src=raw.subdistrict.features.filter(f=>districtOf(f.properties)===state.district&&subdistrictOf(f.properties)===state.subdistrict);
    else if(state.district) src=raw.district.features.filter(f=>districtOf(f.properties)===state.district);
    const fitOptions={padding:options.padding||[20,20],animate:false};
    if(Number.isFinite(options.maxZoom)) fitOptions.maxZoom=options.maxZoom;
    if(src?.length) map.fitBounds(L.geoJSON({type:'FeatureCollection',features:src}).getBounds(),fitOptions);
    else zoomToKPT(options);
  }
  function zoomToKPT(options={}){
    const fitOptions={padding:options.padding||[20,20],animate:false};
    if(Number.isFinite(options.maxZoom)) fitOptions.maxZoom=options.maxZoom;
    if(raw.district?.features?.length) map.fitBounds(L.geoJSON(raw.district).getBounds(),fitOptions);
    else map.setView(CONFIG.MAP_CENTER,CONFIG.MAP_ZOOM,{animate:false});
  }
  function getRiskLevel(score){ return CONFIG.RISK_LEVELS.find(x=>score>=x.min&&score<x.max)||CONFIG.RISK_LEVELS[0]; }
  function getRiskForScope(level){ return level==='district'?raw.riskDistrict:raw.riskSubdistrict; }

  function importHotspots(year,fc){
    const y=String(year);
    raw.hotspot[y]={type:'FeatureCollection',features:(fc?.features||[]).map(asPointFeature).map(f=>enrichFeature(f,Number(year))).filter(f=>f.properties?.__province==='กำแพงเพชร')};
    computeDynamicRisk(); renderHotspots(); renderAux('risk');
    return raw.hotspot[y];
  }

  function availableMonths(years=activeYears()){
    const set=new Set();years.forEach(y=>(raw.hotspot[y]?.features||[]).forEach(f=>{const m=datePartsOf(f).month;if(m)set.add(m);}));return[...set].sort((a,b)=>a-b);
  }
  function availableDays(years=activeYears(),month=state.month){
    const target=Number(month||0),set=new Set();if(!target)return[];years.forEach(y=>(raw.hotspot[y]?.features||[]).forEach(f=>{const d=datePartsOf(f);if(d.month===target&&d.day)set.add(d.day);}));return[...set].sort((a,b)=>a-b);
  }
  function temporalState(){return{month:String(state.month||''),day:String(state.day||'')};}
  return { init,applyFilter,focusSelection,zoomToKPT,getRiskLevel,getRiskForScope,getData:()=>raw,map:()=>map,activeYears,computeDynamicRisk,importHotspots,availableMonths,availableDays,temporalState,helpers:{districtOf,subdistrictOf,cropOf,provinceOf,clean,normalizeCrop,annualEvidenceScore,datePartsOf,matchesDate} };
})();
