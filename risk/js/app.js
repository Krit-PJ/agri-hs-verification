const App=(()=>{
  let subdistrictFeatures=[];
  let lastImported=null;
  let appliedPeriodRange=null;
  const ADMIN_SESSION_KEY='agri-risk-admin-session';
  const ADMIN_CREDENTIAL_HASH='c8e1f70c7abe021cf605303463b617d548d63e251f3fb1d9ae566470086b7603';
  const ADMIN_SESSION_MINUTES=30;
  const GUIDE_VISIBLE_KEY='agri-risk-guide-visible';

  async function init(){
    const loaded=await MapModule.init();
    subdistrictFeatures=loaded.subdistrict?.features||[];
    populateDistricts();
    try{Dashboard.init();Dashboard.setData(loaded.hotspot);}catch(err){console.error('[Dashboard] initialization failed:',err);showRuntimeWarning('กราฟโหลดไม่สำเร็จ แต่แผนที่และตัวกรองยังใช้งานได้');}
    bindFilters();bindPrint();initAdminAccess();bindExcelImport();initVisitorCounter();initDesktopSidebarToggle();initMobilePanels();initTimeline();syncYearSelector();populateDayOptions();syncTimelineUI();applyCurrent();
  }
  function showRuntimeWarning(message){let el=document.getElementById('runtime-warning');if(!el){el=document.createElement('div');el.id='runtime-warning';el.style.cssText='position:fixed;left:50%;top:86px;transform:translateX(-50%);z-index:9999;background:#7f1d1d;color:white;padding:8px 14px;border-radius:6px;font-size:14px;box-shadow:0 4px 15px rgba(0,0,0,.35)';document.body.appendChild(el);}el.textContent=message;}
  function populateDistricts(){const sel=document.getElementById('filter-district'),current=sel.value;const districts=[...new Set(subdistrictFeatures.map(f=>MapModule.helpers.districtOf(f.properties)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));sel.innerHTML='<option value="">-- ทั้งหมด --</option>'+districts.map(x=>`<option value="${x}">${x}</option>`).join('');sel.value=current;}
  function populateSubdistricts(){const d=document.getElementById('filter-district').value,sel=document.getElementById('filter-subdistrict');const names=[...new Set(subdistrictFeatures.filter(f=>MapModule.helpers.districtOf(f.properties)===d).map(f=>MapModule.helpers.subdistrictOf(f.properties)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));sel.innerHTML=d?'<option value="">-- ทุกตำบล --</option>'+names.map(x=>`<option value="${x}">${x}</option>`).join(''):'<option value="">-- เลือกอำเภอก่อน --</option>';sel.disabled=!d;}
  const MONTH_SHORT=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const MONTH_FULL=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const ymIndex=(year,month)=>Number(year)*12+Number(month);
  const ymFromIndex=i=>({year:Math.floor((Number(i)-1)/12),month:((Number(i)-1)%12)+1});
  function availableYears(){
    const fromConfig=(document.getElementById('timeline-year')?.dataset.years||'2566,2567,2568,2569').split(',').map(x=>Number(x.trim())).filter(Number.isFinite);
    const fromData=Object.keys(MapModule.getData?.().hotspot||{}).map(Number).filter(Number.isFinite);
    return [...new Set([...fromConfig,...fromData])].sort((a,b)=>a-b);
  }
  function fillPeriodSelects(){
    const years=availableYears();
    const months=Array.from({length:12},(_,i)=>i+1);
    ['range-start-month','range-end-month'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.options.length)el.innerHTML=months.map(m=>`<option value="${m}">${MONTH_SHORT[m]}</option>`).join('');});
    ['range-start-year','range-end-year'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.options.length)el.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');});
  }
  function latestYM(){
    let max=-Infinity;
    const raw=MapModule.getData?.().hotspot||{};
    Object.entries(raw).forEach(([year,fc])=>(fc.features||[]).forEach(f=>{const d=MapModule.helpers.datePartsOf(f);const y=Number(f.properties?.year_be||year);if(y&&d.month)max=Math.max(max,ymIndex(y,d.month));}));
    if(Number.isFinite(max))return ymFromIndex(max);
    return {year:Number(CONFIG.CURRENT_YEAR_BE||2569),month:12};
  }
  function setPeriodRange(startYear,startMonth,endYear,endMonth){
    fillPeriodSelects();
    const sm=document.getElementById('range-start-month'),sy=document.getElementById('range-start-year'),em=document.getElementById('range-end-month'),ey=document.getElementById('range-end-year');
    if(sy)sy.value=String(startYear); if(sm)sm.value=String(startMonth); if(ey)ey.value=String(endYear); if(em)em.value=String(endMonth);
    normalizePeriodRange();
    syncYearSelector();syncTimelineUI();
  }
  function setLatestPeriod(){
    const latest=latestYM();
    // Default cumulative HS period: October of the previous year through the latest available data month.
    // Example: latest data May 2569 => default range Oct 2568–May 2569.
    const startYear=Number(latest.year)-1;
    setPeriodRange(startYear,10,latest.year,latest.month);
  }
  function selectedRange(){
    fillPeriodSelects();
    const sy=Number(document.getElementById('range-start-year')?.value||CONFIG.CURRENT_YEAR_BE||2569);
    const sm=Number(document.getElementById('range-start-month')?.value||1);
    const ey=Number(document.getElementById('range-end-year')?.value||sy);
    const em=Number(document.getElementById('range-end-month')?.value||sm);
    let startYM=ymIndex(sy,sm),endYM=ymIndex(ey,em);
    if(startYM>endYM){const tmp=startYM;startYM=endYM;endYM=tmp;}
    const a=ymFromIndex(startYM),b=ymFromIndex(endYM);
    return {startYear:a.year,startMonth:a.month,endYear:b.year,endMonth:b.month,startYM,endYM};
  }
  function cloneRange(r){return r?{startYear:r.startYear,startMonth:r.startMonth,endYear:r.endYear,endMonth:r.endMonth,startYM:r.startYM,endYM:r.endYM}:null;}
  function activeRange(){return cloneRange(appliedPeriodRange)||selectedRange();}
  function normalizePeriodRange(){
    const r=selectedRange();
    const sy=document.getElementById('range-start-year'),sm=document.getElementById('range-start-month'),ey=document.getElementById('range-end-year'),em=document.getElementById('range-end-month');
    if(sy)sy.value=String(r.startYear);if(sm)sm.value=String(r.startMonth);if(ey)ey.value=String(r.endYear);if(em)em.value=String(r.endMonth);
  }
  function selectedMonths(){
    const r=selectedRange();
    if(r.startYear===r.endYear){const out=[];for(let m=r.startMonth;m<=r.endMonth;m++)out.push(m);return out;}
    return [];
  }
  function current(){const r=activeRange();return{
    district:document.getElementById('filter-district').value,
    subdistrict:document.getElementById('filter-subdistrict').value,
    crop:document.getElementById('filter-crop').value,
    months:selectedMonths(),
    day:document.getElementById('filter-day')?.value||'',
    startYear:r.startYear,startMonth:r.startMonth,endYear:r.endYear,endMonth:r.endMonth,startYM:r.startYM,endYM:r.endYM
  };}
  function selectedYear(){return String(activeRange().endYear||CONFIG.CURRENT_YEAR_BE||2569);}
  function ensureYearDropdown(){fillPeriodSelects();}
  function activeRangeYears(){const r=activeRange(),out=[];for(let y=r.startYear;y<=r.endYear;y++)out.push(y);return out;}
  function syncYearSelector(){
    ensureYearDropdown();
    const r=activeRange();
    const active=new Set(activeRangeYears().map(String));
    const hidden=document.getElementById('filter-year');if(hidden)hidden.value=String(r.endYear);
    const timelineYear=document.getElementById('timeline-year');if(timelineYear)timelineYear.value=String(r.endYear);
    document.querySelectorAll('.hs-layer').forEach(cb=>{cb.checked=active.has(String(cb.dataset.year));});
    const chip=document.getElementById('selected-year-display');if(chip)chip.textContent=`ช่วงข้อมูล ${periodText(r)}`;
  }
  function applyYearSelector(){
    normalizePeriodRange();
    const pending=selectedRange();
    const btn=document.getElementById('btn-latest-period');
    if(btn)btn.classList.add('period-pending');
    const status=document.getElementById('timeline-status');
    if(status)status.textContent=`เลือกช่วง ${periodText(pending)} แล้ว · กดแสดงข้อมูลเพื่อใช้ช่วงนี้`;
  }
  function populateDayOptions(){
    const daySel=document.getElementById('filter-day');if(!daySel)return;
    daySel.innerHTML='<option value="">-- ไม่ใช้ตัวกรองวันที่ --</option>';daySel.disabled=true;daySel.value='';
  }
  function initTimeline(){
    fillPeriodSelects();setLatestPeriod();appliedPeriodRange=selectedRange();syncYearSelector();
    ['range-start-month','range-start-year','range-end-month','range-end-year'].forEach(id=>document.getElementById(id)?.addEventListener('change',applyYearSelector));
    document.getElementById('btn-latest-period')?.addEventListener('click',()=>{normalizePeriodRange();appliedPeriodRange=selectedRange();const btn=document.getElementById('btn-latest-period');if(btn)btn.classList.remove('period-pending');syncYearSelector();populateDayOptions();syncTimelineUI();applyCurrent();document.dispatchEvent(new CustomEvent('agri-risk:years-changed',{detail:{years:MapModule.activeYears(),source:'apply-period-range'}}));});
  }
  function periodText(r=activeRange()){
    const a=`${MONTH_SHORT[r.startMonth]} ${r.startYear}`;
    const b=`${MONTH_SHORT[r.endMonth]} ${r.endYear}`;
    return r.startYM===r.endYM?a:`${a} ถึง ${b}`;
  }
  function monthText(){return periodText();}
  function syncTimelineUI(){
    const r=activeRange();syncYearSelector();
    const status=document.getElementById('timeline-status');if(status)status.textContent=`จุดความร้อนสะสม: ${periodText(r)}`;
    const chip=document.getElementById('selected-year-display');if(chip)chip.textContent=`ช่วงข้อมูล ${periodText(r)}`;
    updatePrintMeta();
  }
  function scopeText(){
    const d=document.getElementById('filter-district')?.value||'';
    const t=document.getElementById('filter-subdistrict')?.value||'';
    if(t&&d)return `ตำบล${t} อำเภอ${d}`;
    if(d)return `อำเภอ${d}`;
    return 'จังหวัดกำแพงเพชร';
  }
  function updatePrintMeta(){
    const r=activeRange();
    const period=`ช่วงข้อมูลจุดความร้อนสะสม: ${periodText(r)}`;
    const printSummary=document.getElementById('print-filter-summary');if(printSummary)printSummary.textContent=period;
    const printScope=document.getElementById('print-scope');if(printScope)printScope.textContent=`ขอบเขต: ${scopeText()}`;
    const printDate=document.getElementById('print-date');if(printDate)printDate.textContent='วันที่พิมพ์รายงาน: '+new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
    const updated=document.getElementById('last-updated')?.textContent||'';
    const printUpdated=document.getElementById('print-data-updated');if(printUpdated)printUpdated.textContent=updated||'ข้อมูลล่าสุด: -';
  }
  function applyCurrent(){const s=current();syncTimelineUI();MapModule.applyFilter(s);try{Dashboard.applyFilter(s);}catch(err){console.warn('[Dashboard] filter skipped:',err.message);}}
  function bindFilters(){
    const d=document.getElementById('filter-district'),t=document.getElementById('filter-subdistrict'),c=document.getElementById('filter-crop'),cropLayer=document.getElementById('lyr-crop');
    const day=document.getElementById('filter-day');
    d.addEventListener('change',()=>{populateSubdistricts();applyCurrent();});t.addEventListener('change',applyCurrent);c.addEventListener('change',applyCurrent);
    day?.addEventListener('change',()=>{syncTimelineUI();applyCurrent();});
    document.addEventListener('change',e=>{if(e.target?.classList?.contains('hs-layer')){syncYearSelector();populateDayOptions();}});
    cropLayer.addEventListener('change',()=>{c.disabled=!cropLayer.checked;if(!cropLayer.checked)c.value='';applyCurrent();});
    document.getElementById('btn-apply-filter').addEventListener('click',applyCurrent);
    document.getElementById('btn-reset-filter')?.addEventListener('click',()=>resetFilters());
  }
  function resetFilters(){
    const d=document.getElementById('filter-district'),t=document.getElementById('filter-subdistrict'),c=document.getElementById('filter-crop');
    if(d)d.value='';populateSubdistricts();
    if(t){t.value='';t.disabled=true;t.innerHTML='<option value="">-- เลือกอำเภอก่อน --</option>';}
    if(c)c.value='';
    const cropLayer=document.getElementById('lyr-crop');
    if(cropLayer&&!cropLayer.checked&&c)c.disabled=true;
    setLatestPeriod();
    const day=document.getElementById('filter-day');
    if(day){day.value='';day.disabled=true;day.innerHTML='<option value="">-- ไม่ใช้ตัวกรองวันที่ --</option>';}
    syncYearSelector();syncTimelineUI();applyCurrent();
    document.dispatchEvent(new CustomEvent('agri-risk:years-changed',{detail:{years:MapModule.activeYears(),source:'reset'}}));
    document.dispatchEvent(new CustomEvent('agri-risk:filter-change',{detail:{source:'reset'}}));
  }

  function bindPrint(){
    const prepare=()=>{
      updatePrintMeta();
      document.body.classList.add('print-preparing');
      try{Dashboard.setPrintMode?.(true);}catch(err){console.warn('[Print] chart contrast:',err.message);}
      const refit=()=>{
        const map=MapModule.map?.();
        if(!map)return;
        map.invalidateSize({pan:false});
        // Fit the selected province/district/subdistrict after the print-sized map container is applied.
        // Larger padding prevents the selected boundary from being clipped in A4 landscape output.
        MapModule.focusSelection?.({padding:[70,70],maxZoom:10});
      };
      requestAnimationFrame(refit);
      [180,420,850,1200].forEach(ms=>setTimeout(refit,ms));
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
    document.getElementById('toggle-risk-guide')?.addEventListener('change',event=>setGuideVisible(Boolean(event.target.checked)));
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
  function isGuideVisible(){
    try{return localStorage.getItem(GUIDE_VISIBLE_KEY)==='1';}catch{return false;}
  }
  function setGuideVisible(visible){
    try{localStorage.setItem(GUIDE_VISIBLE_KEY,visible?'1':'0');}catch{}
    updateGuideVisibility();
  }
  function updateGuideVisibility(){
    const visible=isGuideVisible();
    const link=document.getElementById('risk-guide-drive-link');
    const toggle=document.getElementById('toggle-risk-guide');
    link?.classList.toggle('hidden',!visible);
    link?.setAttribute('aria-hidden',String(!visible));
    if(toggle)toggle.checked=visible;
  }
  function updateAdminUI(){
    const authenticated=isAdminAuthenticated();
    const section=document.getElementById('excel-import-section');
    const guideSection=document.getElementById('guide-visibility-section');
    const loginBtn=document.getElementById('btn-admin-login');
    const logoutBtn=document.getElementById('btn-admin-logout');
    section?.classList.toggle('hidden',!authenticated);
    section?.setAttribute('aria-hidden',String(!authenticated));
    guideSection?.classList.toggle('hidden',!authenticated);
    guideSection?.setAttribute('aria-hidden',String(!authenticated));
    loginBtn?.classList.toggle('hidden',authenticated);
    logoutBtn?.classList.toggle('hidden',!authenticated);
    updateGuideVisibility();
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
      const hsPlantReference=readHsPlant2026Reference(wb);
      const result=rowsToGeoJSON(detail.rows,detail.headers,yearBE,hsPlantReference,detail.sheet);
      if(!result.features.length)throw new Error(`ไม่พบข้อมูลจังหวัดกำแพงเพชร พื้นที่เกษตร ปี ${yearBE}`);
      if(result.metadata?.qa?.referenceMatch===false)throw new Error(`ผลกรอง ${result.features.length.toLocaleString('th-TH')} จุด ไม่ตรงกับ hsPlant2026 ${Number(result.metadata.qa.referenceTotal).toLocaleString('th-TH')} จุด จึงยกเลิกการนำเข้า`);
      const checkbox=ensureYearCheckbox(yearBE);
      checkbox.checked=true;
      MapModule.importHotspots(yearBE,result);
      Dashboard.setYearData(yearBE,result);
      document.dispatchEvent(new CustomEvent('agri-risk:years-changed',{detail:{years:MapModule.activeYears()}}));
      lastImported={year:yearBE,geojson:result,fileName:`hotspot_${yearBE}.geojson`};
      document.getElementById('btn-download-import').disabled=false;
      const qa=result.metadata?.qa||{};
      const referenceText=qa.referenceTotal===null?'':` | hsPlant2026 ${qa.referenceMatch?'✓ ตรง':'⚠ ไม่ตรง'} ${Number(qa.referenceTotal).toLocaleString('th-TH')} จุด`;
      setStatus(`นำเข้าสำเร็จ ${result.features.length.toLocaleString('th-TH')} จุด${referenceText} | ซ้ำที่ตัดออก ${qa.duplicates||0} | ไม่มีพิกัด ${qa.noCoordinates||0}`,qa.referenceMatch===false?'warning':'success');
    }catch(err){console.error(err);setStatus(`นำเข้าไม่สำเร็จ: ${err.message}`,'error');}
  }
  function findDetailTable(wb){
    for(const name of wb.SheetNames){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:false,dateNF:'yyyy-mm-dd'});
      for(let i=0;i<rows.length;i++){
        const headers=(rows[i]||[]).map(v=>String(v??'').trim());
        const required=['hsID','Province','LandType','PlantType'];
        const hasDate=headers.includes('Date')||headers.includes('YYYY-MM-DD');
        if(required.every(k=>headers.includes(k))&&hasDate)return{sheet:name,headers,rows:rows.slice(i+1)};
      }
    }
    return null;
  }
  function readHsPlant2026Reference(wb){
    const sheetName=wb.SheetNames.find(name=>String(name).trim().toLowerCase()==='hsplant2026');
    if(!sheetName)return null;
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:true});
    const compact=v=>String(v??'').replace(/\s+/g,'').trim();
    const headerIndex=rows.findIndex(row=>compact(row?.[0])==='จังหวัด'&&row.some(v=>compact(v)==='นาข้าว'));
    if(headerIndex<0)return null;
    const headers=rows[headerIndex].map(compact);
    const provinceRow=rows.slice(headerIndex+1).find(row=>compact(row?.[0])==='กำแพงเพชร');
    if(!provinceRow)return null;
    const wanted=[['นาข้าว','นาข้าว'],['อ้อย','อ้อย'],['เกษตรอื่น ๆ','เกษตรอื่นๆ'],['อื่น ๆ','อื่นๆ']];
    const byPlantType={};
    for(const [plant,header] of wanted){const i=headers.indexOf(header);byPlantType[plant]=i>=0?Number(provinceRow[i]||0):0;}
    return{sheet:sheetName,province:'กำแพงเพชร',byPlantType,total:Object.values(byPlantType).reduce((sum,n)=>sum+n,0)};
  }
  function rowsToGeoJSON(rows,headers,yearBE,hsPlantReference=null,sourceSheet=''){
    const idx=Object.fromEntries(headers.map((h,i)=>[h,i])), seen=new Set();
    const allowedPlantTypes=new Set(['นาข้าว','อ้อย','เกษตรอื่น ๆ','อื่น ๆ']);
    let duplicates=0,noCoordinates=0,wrongProvince=0,wrongLand=0,wrongDate=0,wrongPlantType=0;
    const features=[], byPlant={}, byDistrict={}, byMonth={};
    for(const row of rows){
      if(!row||row.every(v=>v===null||v===''))continue;
      const get=k=>row[idx[k]];
      // Strict source-table filter sequence:
      // Province -> Amphoe -> Tambon -> BaanN, then LandType and PlantType.
      const province=String(get('Province')??'').trim();
      if(province!=='กำแพงเพชร'){wrongProvince++;continue;}
      if(String(get('LandType')??'').trim()!=='พื้นที่เกษตร'){wrongLand++;continue;}
      const plantRaw=String(get('PlantType')??'').trim();
      const plantType=plantRaw?MapModule.helpers.normalizeCrop(plantRaw):'';
      if(!allowedPlantTypes.has(plantType)){wrongPlantType++;continue;}
      const dt=parseExcelDate(get('Date')??get('YYYY-MM-DD'));
      if(!dt){wrongDate++;continue;}
      const hsId=String(get('hsID')??'').trim();
      if(hsId&&seen.has(hsId)){duplicates++;continue;} if(hsId)seen.add(hsId);
      const coord=extractCoordinates(get('Maps'),get('X'),get('Y'),get('Q'));
      if(!coord){noCoordinates++;continue;}
      const dateIso=dt.toISOString().slice(0,10);
      const dateYearBE=dt.getFullYear()+543;
      const district=String(get('Amphoe')??'').trim();
      const subdistrict=String(get('Tambon')??'').trim();
      const village=String(get('BaanN')??'').trim();
      byPlant[plantType]=(byPlant[plantType]||0)+1;
      byDistrict[district]=(byDistrict[district]||0)+1;
      const ym=`${dateYearBE}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      byMonth[ym]=(byMonth[ym]||0)+1;
      const point={type:'Feature',geometry:{type:'Point',coordinates:coord},properties:{
        hs_id:hsId,hsID:hsId,
        acq_date:dateIso,Date:dateIso,
        time:String(get('Time')??''),acq_time:String(get('Time')??''),
        year_be:dateYearBE,
        season_be:yearBE,
        dataset_year_be:yearBE,
        province,Province:province,__province:province,
        district,Amphoe:district,__district:district,
        subdistrict,Tambon:subdistrict,__subdistrict:subdistrict,
        village,BaanN:village,__village:village,
        land_type:'พื้นที่เกษตร',LandType:'พื้นที่เกษตร',
        plant_type:plantType,PlantType:plantType,crop_type:plantType,crop_type_raw:plantRaw,__plant_type:plantType,__crop:plantType,
        confidence:Number(get('Q'))||null,Q:get('Q'),
        source:'NASA FIRMS VIIRS / Excel import',
        source_sheet:sourceSheet,
        filter_rule:'Province=กำแพงเพชร; LandType=พื้นที่เกษตร; PlantType in [นาข้าว, อ้อย, เกษตรอื่น ๆ, อื่น ๆ]'
      }};
      // Do not spatially overwrite Amphoe/Tambon from the source table; only use
      // geometry as a fallback when the source table has missing names.
      if((!district||!subdistrict) && window.turf){
        const hit=(MapModule.getData().subdistrict?.features||[]).find(poly=>{try{return turf.booleanPointInPolygon(point,poly);}catch{return false;}});
        if(hit){
          if(!point.properties.district){point.properties.district=MapModule.helpers.districtOf(hit.properties);point.properties.__district=point.properties.district;}
          if(!point.properties.subdistrict){point.properties.subdistrict=MapModule.helpers.subdistrictOf(hit.properties);point.properties.__subdistrict=point.properties.subdistrict;}
        }
      }
      features.push(point);
    }
    const dates=features.map(f=>f.properties.acq_date).sort();
    return{type:'FeatureCollection',name:`hotspot_${yearBE}_imported`,metadata:{
      province:'กำแพงเพชร',
      scope:'พื้นที่เกษตร',
      source_sheet:sourceSheet,
      reference_sheet:hsPlantReference?.sheet||null,
      filter_order:['Province','Amphoe','Tambon','BaanN','LandType','PlantType'],
      plant_types:[...allowedPlantTypes],
      period:dates.length?`${dates[0]}/${dates[dates.length-1]}`:'',
      counts:{byPlantType:byPlant,byDistrict,byMonth},
      qa:{inputRows:rows.length,accepted:features.length,duplicates,noCoordinates,wrongProvince,wrongLand,wrongDate,wrongPlantType,referenceTotal:hsPlantReference?.total??null,referenceMatch:hsPlantReference?features.length===hsPlantReference.total&&[...allowedPlantTypes].every(plant=>(byPlant[plant]||0)===(hsPlantReference.byPlantType[plant]||0)):null,referenceByPlantType:hsPlantReference?.byPlantType||null}
    },features};
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




  function initDesktopSidebarToggle(){
    const btn=document.getElementById('sidebar-toggle');
    const left=document.getElementById('left-panel');
    if(!btn||!left)return;
    const key='agri-risk-left-panel-collapsed';
    const apply=(collapsed)=>{
      document.body.classList.toggle('left-panel-collapsed',collapsed);
      btn.setAttribute('aria-expanded',String(!collapsed));
      btn.innerHTML=collapsed?'☰ แสดงเมนู':'☰ ซ่อนเมนู';
      btn.title=collapsed?'แสดงเมนูด้านซ้าย':'ซ่อนเมนูด้านซ้าย';
      try{localStorage.setItem(key,collapsed?'1':'0');}catch{}
      setTimeout(()=>{MapModule.map?.()?.invalidateSize?.({pan:false});MapModule.focusSelection?.({padding:[24,24]});},260);
    };
    let initial=false;
    try{initial=localStorage.getItem(key)==='1';}catch{}
    apply(initial);
    btn.addEventListener('click',()=>apply(!document.body.classList.contains('left-panel-collapsed')));
  }

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

  async function initVisitorCounter(){
    const fallback=document.getElementById('visitor-counter-fallback');
    const box=document.getElementById('external-counter-box');
    if(!fallback)return;
    const key='agri-risk-pageviews-fallback';
    const local=Number(localStorage.getItem(key)||0)+1;
    localStorage.setItem(key,String(local));
    const fallbackText=local.toLocaleString('th-TH');
    fallback.textContent=fallbackText;
    fallback.classList.add('is-fallback');
    const checkExternal=()=>{
      const raw=String(box?.textContent||'').replace(String(fallback.textContent||''),'').trim();
      const hasExternal=!!(box?.querySelector('img')) || /\d/.test(raw);
      /* Keep the local fallback visible even when the external script is blocked or renders as an image.
         This avoids an empty counter card in privacy-restricted browsers. */
      if(!hasExternal){fallback.textContent=fallbackText;fallback.classList.add('is-fallback');}
    };
    setTimeout(checkExternal,1200);
    setTimeout(checkExternal,3500);
  }
  return{init};
})();
document.addEventListener('DOMContentLoaded',()=>App.init().catch(err=>{console.error('[App] fatal error:',err);const el=document.createElement('div');el.style.cssText='position:fixed;inset:auto 20px 20px 20px;z-index:10000;background:#991b1b;color:#fff;padding:12px;border-radius:8px;font:14px sans-serif';el.textContent='โหลดระบบไม่สำเร็จ: '+err.message;document.body.appendChild(el);}));
