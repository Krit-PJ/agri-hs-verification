const App=(()=>{
  let subdistrictFeatures=[];
  let lastImported=null;
  const ADMIN_SESSION_KEY='agri-risk-admin-session';
  const ADMIN_CREDENTIAL_HASH='c8e1f70c7abe021cf605303463b617d548d63e251f3fb1d9ae566470086b7603';
  const ADMIN_SESSION_MINUTES=30;

  async function init(){
    const loaded=await MapModule.init();
    subdistrictFeatures=loaded.subdistrict?.features||[];
    populateDistricts();
    try{Dashboard.init();Dashboard.setData(loaded.hotspot);}catch(err){console.error('[Dashboard] initialization failed:',err);showRuntimeWarning('กราฟโหลดไม่สำเร็จ แต่แผนที่และตัวกรองยังใช้งานได้');}
    bindFilters();bindPrint();initAdminAccess();bindExcelImport();initVisitorCounter();initMobilePanels();initTimeline();syncYearSelector();populateDayOptions();syncTimelineUI();applyCurrent();
  }
  function showRuntimeWarning(message){let el=document.getElementById('runtime-warning');if(!el){el=document.createElement('div');el.id='runtime-warning';el.style.cssText='position:fixed;left:50%;top:86px;transform:translateX(-50%);z-index:9999;background:#7f1d1d;color:white;padding:8px 14px;border-radius:6px;font-size:14px;box-shadow:0 4px 15px rgba(0,0,0,.35)';document.body.appendChild(el);}el.textContent=message;}
  function populateDistricts(){const sel=document.getElementById('filter-district'),current=sel.value;const districts=[...new Set(subdistrictFeatures.map(f=>MapModule.helpers.districtOf(f.properties)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));sel.innerHTML='<option value="">-- ทั้งหมด --</option>'+districts.map(x=>`<option value="${x}">${x}</option>`).join('');sel.value=current;}
  function populateSubdistricts(){const d=document.getElementById('filter-district').value,sel=document.getElementById('filter-subdistrict');const names=[...new Set(subdistrictFeatures.filter(f=>MapModule.helpers.districtOf(f.properties)===d).map(f=>MapModule.helpers.subdistrictOf(f.properties)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));sel.innerHTML=d?'<option value="">-- ทุกตำบล --</option>'+names.map(x=>`<option value="${x}">${x}</option>`).join(''):'<option value="">-- เลือกอำเภอก่อน --</option>';sel.disabled=!d;}
  function current(){return{
    district:document.getElementById('filter-district').value,
    subdistrict:document.getElementById('filter-subdistrict').value,
    crop:document.getElementById('filter-crop').value,
    month:document.getElementById('filter-month')?.value||'',
    day:document.getElementById('filter-day')?.value||''
  };}
  function syncYearSelector(){
    const sel=document.getElementById('filter-year');if(!sel)return;
    const years=MapModule.activeYears();sel.value=years.length===1?String(years[0]):'';syncTimelineUI();
  }
  function applyYearSelector(){
    const value=document.getElementById('filter-year')?.value||'';
    const boxes=[...document.querySelectorAll('.hs-layer')];
    if(value) boxes.forEach(cb=>cb.checked=String(cb.dataset.year)===value);
    else boxes.forEach(cb=>cb.checked=true);
    populateDayOptions();applyCurrent();
    document.dispatchEvent(new CustomEvent('agri-risk:years-changed',{detail:{years:MapModule.activeYears(),source:'year-filter'}}));
  }
  function populateDayOptions(){
    const monthSel=document.getElementById('filter-month'),daySel=document.getElementById('filter-day');if(!monthSel||!daySel)return;
    const currentDay=daySel.value,month=monthSel.value;
    if(!month){daySel.innerHTML='<option value="">-- เลือกเดือนก่อน --</option>';daySel.disabled=true;return;}
    const days=MapModule.availableDays(MapModule.activeYears(),month);
    daySel.innerHTML='<option value="">-- ทุกวันที่ --</option>'+days.map(d=>`<option value="${d}">${d}</option>`).join('');
    daySel.disabled=false;if(days.includes(Number(currentDay)))daySel.value=currentDay;
  }
  function initTimeline(){
    const year=document.getElementById('timeline-year');
    const month=document.getElementById('filter-month');
    year?.addEventListener('change',()=>{
      const filterYear=document.getElementById('filter-year');
      if(filterYear)filterYear.value=year.value;
      applyYearSelector();syncTimelineUI();
    });
    document.querySelectorAll('#hotspot-timeline [data-month]').forEach(btn=>btn.addEventListener('click',()=>{
      if(month)month.value=btn.dataset.month||'';
      const day=document.getElementById('filter-day');if(day)day.value='';
      populateDayOptions();syncTimelineUI();applyCurrent();
    }));
  }
  function syncTimelineUI(){
    const selectedYear=document.getElementById('filter-year')?.value||String(MapModule.activeYears().slice(-1)[0]||'');
    const timelineYear=document.getElementById('timeline-year');if(timelineYear&&selectedYear)timelineYear.value=selectedYear;
    const month=String(document.getElementById('filter-month')?.value||'');
    document.querySelectorAll('#hotspot-timeline [data-month]').forEach(btn=>{
      const active=String(btn.dataset.month||'')===month;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
    });
    const names=['ทุกเดือน','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const status=document.getElementById('timeline-status');if(status)status.textContent=`ปี ${selectedYear||'-'} · ${names[Number(month)||0]}`;
  }
  function applyCurrent(){const s=current();syncTimelineUI();MapModule.applyFilter(s);try{Dashboard.applyFilter(s);}catch(err){console.warn('[Dashboard] filter skipped:',err.message);}}
  function bindFilters(){
    const d=document.getElementById('filter-district'),t=document.getElementById('filter-subdistrict'),c=document.getElementById('filter-crop'),cropLayer=document.getElementById('lyr-crop');
    const year=document.getElementById('filter-year'),month=document.getElementById('filter-month'),day=document.getElementById('filter-day');
    d.addEventListener('change',()=>{populateSubdistricts();applyCurrent();});t.addEventListener('change',applyCurrent);c.addEventListener('change',applyCurrent);
    year?.addEventListener('change',applyYearSelector);
    month?.addEventListener('change',()=>{if(day)day.value='';populateDayOptions();syncTimelineUI();applyCurrent();});
    day?.addEventListener('change',applyCurrent);
    document.addEventListener('change',e=>{if(e.target?.classList?.contains('hs-layer')){syncYearSelector();populateDayOptions();}});
    cropLayer.addEventListener('change',()=>{c.disabled=!cropLayer.checked;if(!cropLayer.checked)c.value='';applyCurrent();});
    document.getElementById('btn-apply-filter').addEventListener('click',applyCurrent);
    document.getElementById('btn-reset-filter').addEventListener('click',()=>{
      d.value='';populateSubdistricts();t.value='';c.value='';
      if(year)year.value=String(CONFIG.CURRENT_YEAR_BE||2569);
      document.querySelectorAll('.hs-layer').forEach(cb=>cb.checked=String(cb.dataset.year)===year.value);
      if(month)month.value='';if(day){day.value='';day.disabled=true;day.innerHTML='<option value="">-- เลือกเดือนก่อน --</option>';}
      applyCurrent();document.dispatchEvent(new CustomEvent('agri-risk:years-changed',{detail:{years:MapModule.activeYears(),source:'reset'}}));
    });
  }
  function bindPrint(){
    const prepare=()=>{
      document.body.classList.add('print-preparing');
      try{Dashboard.setPrintMode?.(true);}catch(err){console.warn('[Print] chart contrast:',err.message);}
      const refit=()=>{
        const map=MapModule.map?.();
        if(!map)return;
        map.invalidateSize({pan:false});
        MapModule.focusSelection?.({padding:[10,10],maxZoom:12});
      };
      refit();
      [120,320,650].forEach(ms=>setTimeout(refit,ms));
    };
    const restore=()=>{
      document.body.classList.remove('print-preparing');
      try{Dashboard.setPrintMode?.(false);}catch(err){console.warn('[Print] chart restore:',err.message);}
      setTimeout(()=>{MapModule.map()?.invalidateSize({pan:false});MapModule.focusSelection?.({padding:[20,20]});},180);
    };
    window.addEventListener('beforeprint',prepare);
    window.addEventListener('afterprint',restore);
    document.getElementById('btn-print')?.addEventListener('click',()=>{prepare();setTimeout(()=>window.print(),850);});
  }

  function initAdminAccess(){
    const loginBtn=document.getElementById('btn-admin-login');
    const logoutBtn=document.getElementById('btn-admin-logout');
    const modal=document.getElementById('admin-modal');
    const closeBtn=document.getElementById('admin-modal-close');
    const cancelBtn=document.getElementById('admin-cancel');
    const form=document.getElementById('admin-login-form');
    loginBtn?.addEventListener('click',()=>openAdminModal());
    logoutBtn?.addEventListener('click',adminLogout);
    closeBtn?.addEventListener('click',closeAdminModal);
    cancelBtn?.addEventListener('click',closeAdminModal);
    modal?.addEventListener('click',event=>{if(event.target===modal)closeAdminModal();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAdminModal();});
    form?.addEventListener('submit',adminLogin);
    updateAdminUI();
  }
  function isAdminAuthenticated(){
    try{
      const raw=sessionStorage.getItem(ADMIN_SESSION_KEY);if(!raw)return false;
      const session=JSON.parse(raw);if(!session?.expiresAt||Date.now()>session.expiresAt){sessionStorage.removeItem(ADMIN_SESSION_KEY);return false;}
      return session.role==='admin';
    }catch{return false;}
  }
  function touchAdminSession(){
    if(!isAdminAuthenticated())return;
    sessionStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({role:'admin',expiresAt:Date.now()+ADMIN_SESSION_MINUTES*60*1000}));
  }
  async function adminLogin(event){
    event.preventDefault();
    const username=String(document.getElementById('admin-username')?.value||'').trim().toLowerCase();
    const password=String(document.getElementById('admin-password')?.value||'');
    const status=document.getElementById('admin-login-status');
    if(status){status.textContent='กำลังตรวจสอบ…';status.className='admin-login-status working';}
    const hash=await sha256(`${username}:${password}`);
    if(hash!==ADMIN_CREDENTIAL_HASH){
      if(status){status.textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';status.className='admin-login-status error';}
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({role:'admin',expiresAt:Date.now()+ADMIN_SESSION_MINUTES*60*1000}));
    if(status){status.textContent='เข้าสู่ระบบสำเร็จ';status.className='admin-login-status success';}
    document.getElementById('admin-login-form')?.reset();
    updateAdminUI();
    setTimeout(closeAdminModal,350);
  }
  function adminLogout(){
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    lastImported=null;
    const dl=document.getElementById('btn-download-import');if(dl)dl.disabled=true;
    updateAdminUI();
  }
  function updateAdminUI(){
    const authenticated=isAdminAuthenticated();
    const section=document.getElementById('excel-import-section');
    const loginBtn=document.getElementById('btn-admin-login');
    const logoutBtn=document.getElementById('btn-admin-logout');
    section?.classList.toggle('hidden',!authenticated);
    section?.setAttribute('aria-hidden',String(!authenticated));
    loginBtn?.classList.toggle('hidden',authenticated);
    logoutBtn?.classList.toggle('hidden',!authenticated);
    if(authenticated)touchAdminSession();
  }
  function openAdminModal(message=''){
    const modal=document.getElementById('admin-modal');
    const status=document.getElementById('admin-login-status');
    if(status){status.textContent=message;status.className='admin-login-status';}
    modal?.classList.remove('hidden');
    setTimeout(()=>document.getElementById('admin-username')?.focus(),0);
  }
  function closeAdminModal(){document.getElementById('admin-modal')?.classList.add('hidden');}
  async function sha256(text){
    const data=new TextEncoder().encode(text);
    const digest=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  function bindExcelImport(){
    const btn=document.getElementById('btn-import-excel'), dl=document.getElementById('btn-download-import');
    btn?.addEventListener('click',importExcel);
    dl?.addEventListener('click',downloadImportedGeoJSON);
  }
  async function importExcel(){
    if(!isAdminAuthenticated()){openAdminModal('กรุณาเข้าสู่ระบบผู้ดูแลก่อนนำเข้าข้อมูล');return;}
    touchAdminSession();
    const file=document.getElementById('import-excel')?.files?.[0], yearBE=Number(document.getElementById('import-year')?.value), status=document.getElementById('import-status');
    if(!file){setStatus('กรุณาเลือกไฟล์ Excel','error');return;}
    if(!Number.isInteger(yearBE)||yearBE<2566){setStatus('กรุณาระบุปี พ.ศ. ให้ถูกต้อง','error');return;}
    if(!window.XLSX){setStatus('ไม่สามารถโหลดไลบรารีอ่าน Excel ได้','error');return;}
    setStatus('กำลังอ่านและตรวจสอบข้อมูล…','working');
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      const detail=findDetailTable(wb);
      if(!detail)throw new Error('ไม่พบตารางรายละเอียดที่มีคอลัมน์ hsID, Date, Province และ LandType');
      const result=rowsToGeoJSON(detail.rows,detail.headers,yearBE);
      if(!result.features.length)throw new Error(`ไม่พบข้อมูลจังหวัดกำแพงเพชร พื้นที่เกษตร ช่วง ม.ค.–พ.ค. ${yearBE}`);
      const checkbox=ensureYearCheckbox(yearBE);
      checkbox.checked=true;
      MapModule.importHotspots(yearBE,result);
      Dashboard.setYearData(yearBE,result);
      document.dispatchEvent(new CustomEvent('agri-risk:years-changed',{detail:{years:MapModule.activeYears()}}));
      lastImported={year:yearBE,geojson:result,fileName:`hotspot_${yearBE}.geojson`};
      document.getElementById('btn-download-import').disabled=false;
      const qa=result.metadata?.qa||{};
      setStatus(`นำเข้าสำเร็จ ${result.features.length.toLocaleString('th-TH')} จุด | ซ้ำที่ตัดออก ${qa.duplicates||0} | ไม่มีพิกัด ${qa.noCoordinates||0}`,'success');
    }catch(err){console.error(err);setStatus(`นำเข้าไม่สำเร็จ: ${err.message}`,'error');}
  }
  function findDetailTable(wb){
    for(const name of wb.SheetNames){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:false,dateNF:'yyyy-mm-dd'});
      for(let i=0;i<rows.length;i++){
        const headers=(rows[i]||[]).map(v=>String(v??'').trim());
        const required=['hsID','Date','Province','LandType'];
        if(required.every(k=>headers.includes(k)))return{sheet:name,headers,rows:rows.slice(i+1)};
      }
    }
    return null;
  }
  function rowsToGeoJSON(rows,headers,yearBE){
    const idx=Object.fromEntries(headers.map((h,i)=>[h,i])), yearAD=yearBE-543, seen=new Set();
    let duplicates=0,noCoordinates=0,wrongProvince=0,wrongLand=0,wrongDate=0;
    const features=[];
    for(const row of rows){
      if(!row||row.every(v=>v===null||v===''))continue;
      const get=k=>row[idx[k]];
      const province=String(get('Province')??get('ProvinceN')??'').trim();
      if(province!=='กำแพงเพชร'){wrongProvince++;continue;}
      if(String(get('LandType')??'').trim()!=='พื้นที่เกษตร'){wrongLand++;continue;}
      const dt=parseExcelDate(get('Date'));
      if(!dt||dt.getFullYear()!==yearAD||dt.getMonth()<0||dt.getMonth()>4){wrongDate++;continue;}
      const hsId=String(get('hsID')??'').trim();
      if(hsId&&seen.has(hsId)){duplicates++;continue;} if(hsId)seen.add(hsId);
      const coord=extractCoordinates(get('Maps'),get('X'),get('Y'),get('Q'));
      if(!coord){noCoordinates++;continue;}
      const point={type:'Feature',geometry:{type:'Point',coordinates:coord},properties:{hs_id:hsId,year_be:yearBE,date:dt.toISOString().slice(0,10),time:String(get('Time')??''),province:'กำแพงเพชร',district:String(get('Amphoe')??get('AmphoeN')??'').trim(),subdistrict:String(get('Tambon')??get('TambonN')??'').trim(),land_type:'พื้นที่เกษตร',crop_type:MapModule.helpers.normalizeCrop(get('PlantType')),confidence:Number(get('Q'))||null,source:'NASA FIRMS VIIRS / Excel import'}};
      const hit=(MapModule.getData().subdistrict?.features||[]).find(poly=>{try{return turf.booleanPointInPolygon(point,poly);}catch{return false;}});
      if(hit){point.properties.district=MapModule.helpers.districtOf(hit.properties);point.properties.subdistrict=MapModule.helpers.subdistrictOf(hit.properties);}
      features.push(point);
    }
    return{type:'FeatureCollection',name:`hotspot_${yearBE}_imported`,metadata:{province:'กำแพงเพชร',scope:'พื้นที่เกษตร',period:`${yearAD}-01-01/${yearAD}-05-31`,qa:{inputRows:rows.length,accepted:features.length,duplicates,noCoordinates,wrongProvince,wrongLand,wrongDate}},features};
  }
  function parseExcelDate(v){
    if(v instanceof Date&&!Number.isNaN(v))return v;
    if(typeof v==='number'&&window.XLSX?.SSF){const p=XLSX.SSF.parse_date_code(v);if(p)return new Date(p.y,p.m-1,p.d);}
    if(typeof v==='string'){
      const s=v.trim(); let d=new Date(s); if(!Number.isNaN(d))return d;
      const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(m){let y=Number(m[3]);if(y>2400)y-=543;return new Date(y,Number(m[2])-1,Number(m[1]));}
    }
    return null;
  }
  function extractCoordinates(maps,x,y,zone){
    const m=String(maps||'').match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
    if(m)return[Number(m[2]),Number(m[1])];
    const east=Number(x),north=Number(y),z=Number(zone)||47;
    if(Number.isFinite(east)&&Number.isFinite(north)&&window.proj4){try{return proj4(`+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`,'EPSG:4326',[east,north]);}catch{}}
    return null;
  }
  function ensureYearCheckbox(year){
    let cb=document.querySelector(`.hs-layer[data-year="${year}"]`);if(cb)return cb;
    const yearSelect=document.getElementById('filter-year');if(yearSelect&&!yearSelect.querySelector(`option[value="${year}"]`)){const opt=document.createElement('option');opt.value=String(year);opt.textContent=`${year} (${year-543})`;yearSelect.appendChild(opt);}
    const group=document.querySelector('.hs-layer')?.closest('.layer-group');
    const label=document.createElement('label');label.className=`toggle-row hs-${year}`;label.style.borderLeft=`3px solid ${CONFIG.YEAR_COLORS[year]||'#14b8a6'}`;
    label.innerHTML=`<input type="checkbox" class="hs-layer" data-year="${year}"> ปี ${year} (${year-543})`;
    group?.appendChild(label);cb=label.querySelector('input');
    if(!CONFIG.YEAR_COLORS[year]){const d=Math.max(0,(CONFIG.CURRENT_YEAR_BE||year)-year);CONFIG.YEAR_COLORS[year]=(CONFIG.YEAR_COLOR_FALLBACK||[])[d]||'#14b8a6';label.style.borderLeft=`3px solid ${CONFIG.YEAR_COLORS[year]}`;}
    return cb;
  }
  function downloadImportedGeoJSON(){if(!lastImported)return;const blob=new Blob([JSON.stringify(lastImported.geojson,null,2)],{type:'application/geo+json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=lastImported.fileName;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function setStatus(text,type){const el=document.getElementById('import-status');if(!el)return;el.textContent=text;el.className=`import-status ${type||''}`;}



  function initMobilePanels(){
    const left=document.getElementById('left-panel');
    const right=document.getElementById('right-panel');
    const overlay=document.getElementById('mobile-overlay');
    const btnLeft=document.getElementById('mobile-toggle-layers');
    const btnRight=document.getElementById('mobile-toggle-dashboard');
    if(!left||!right||!overlay||!btnLeft||!btnRight)return;
    const closeAll=()=>{
      left.classList.remove('mobile-open');right.classList.remove('mobile-open');overlay.hidden=true;
      btnLeft.setAttribute('aria-expanded','false');btnRight.setAttribute('aria-expanded','false');
      setTimeout(()=>MapModule.map()?.invalidateSize?.(),260);
    };
    const openPanel=(panel,button)=>{
      const wasOpen=panel.classList.contains('mobile-open');closeAll();
      if(!wasOpen){panel.classList.add('mobile-open');overlay.hidden=false;button.setAttribute('aria-expanded','true');}
    };
    btnLeft.addEventListener('click',()=>openPanel(left,btnLeft));
    btnRight.addEventListener('click',()=>openPanel(right,btnRight));
    overlay.addEventListener('click',closeAll);
    window.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll();});
    window.addEventListener('resize',()=>{if(window.innerWidth>768)closeAll();setTimeout(()=>MapModule.map()?.invalidateSize?.(),120);});
    document.addEventListener('agri-risk:filter-change',()=>{if(window.innerWidth<=768)closeAll();});
  }

  async function initVisitorCounter(){const el=document.getElementById('visitor-count');if(!el)return;const key='agri-risk-pageviews';let local=Number(localStorage.getItem(key)||0)+1;localStorage.setItem(key,String(local));const endpoint=CONFIG.VISITOR_COUNTER?.endpoint;if(endpoint){try{const r=await fetch(endpoint,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();el.textContent=Number(j.count??j.value??local).toLocaleString('th-TH');return;}catch(e){console.warn('[Counter]',e.message);}}el.textContent=local.toLocaleString('th-TH');}
  return{init};
})();
document.addEventListener('DOMContentLoaded',()=>App.init().catch(err=>{console.error('[App] fatal error:',err);const el=document.createElement('div');el.style.cssText='position:fixed;inset:auto 20px 20px 20px;z-index:10000;background:#991b1b;color:#fff;padding:12px;border-radius:8px;font:14px sans-serif';el.textContent='โหลดระบบไม่สำเร็จ: '+err.message;document.body.appendChild(el);}));
