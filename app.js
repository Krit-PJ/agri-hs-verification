(() => {
  'use strict';

  const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const RESULT_LABELS = { burned:'พบการเผา', not_burned:'ไม่พบการเผา', not_found:'ไม่พบจุด', needs_review:'ต้องตรวจซ้ำ', inaccessible:'เข้าตรวจสอบไม่ได้' };
  const STATUS_LABELS = { pending:'รอตรวจ', draft:'งานร่าง', verified:'ตรวจแล้ว' };
  const COLORS = { pending:'#e3651d', draft:'#2677ad', burned:'#cb2c29', not_burned:'#18845d', not_found:'#687976', needs_review:'#7a5ab5', inaccessible:'#596579' };
  const STORE_ENDPOINT = 'hsverify.apiEndpoint';
  const previewMode=typeof HSPreview!=='undefined'&&HSPreview.enabled;
  const phoneDemoMode=Boolean(globalThis.HS_SITE_CONFIG?.phoneDemoMode)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&!globalThis.HS_SITE_CONFIG?.apiEndpoint;
  const STORE_DEMO = previewMode?'hsverify.preview.results':'hsverify.demoResults';
  const SESSION_TOKEN = 'hsverify.sessionToken';
  const SESSION_PROFILE = 'hsverify.sessionProfile';
  const SESSION_EXPIRES_AT = 'hsverify.sessionExpiresAt';
  const DB_NAME = 'hsverify-outbox';
  const DB_STORE = 'jobs';
  const PAGE_SIZE = 80;
  const nationalMode=typeof HSNationUI!=='undefined';
  const scopedRows=()=>{const rows=nationalMode?HSNationUI.filter(state.all):state.all;return state.authValidated&&state.profile?.role==='inspector'?rows.filter(r=>r.provinceCode===state.profile.assignedProvinceCode&&(!state.profile.district||r.district===state.profile.district)):rows;};

  const $ = id => document.getElementById(id);
  const dom = {};
  const state = {
    all: [], filtered: [], visible: PAGE_SIZE, selected: null, map: null,
    markers: null, mapFailed: false, photos: [], location: null,
    endpoint: (previewMode||phoneDemoMode)?'':localStorage.getItem(STORE_ENDPOINT) || globalThis.HS_SITE_CONFIG?.apiEndpoint || '', token: phoneDemoMode?'':sessionStorage.getItem(SESSION_TOKEN) || '',
    profile: phoneDemoMode?null:readSessionProfile(), expiresAt:phoneDemoMode?'':sessionStorage.getItem(SESSION_EXPIRES_AT) || '',
    csrf:phoneDemoMode?'':sessionStorage.getItem('hsverify.csrf')||'',authValidated:false, serverConfig: null, busy: false, dataLoaded:false, importCandidate:null, sourceName:"", latestYear:null
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    ['startMonthFilter','endMonthFilter','quickProvinceFilter','resetPeriod','inspectorAccount','refreshDataButton','dataSourceLabel','selectionContext','summaryDistrict','summaryTambon','summaryYear','summaryReset','printReportButton','roleLabel','adminLoginGate','adminLoginForm','loginUsername','loginPassword','loginButton','loginMessage','adminProtected','adminDisplayName','adminRoleDescription','logoutButton','serverSettingsCard','workspaceSettingsCard','hsImportFile','importDatasetYear','importPreview','confirmFileImport','importMessage','importPhotoInput','modeBadge','demoNotice','liveError','yearFilter','monthFilter','districtFilter','tambonFilter','villageFilter','cropFilter','statusFilter','resultFilter','searchFilter','resetFilters','allHotspotsButton','resultCount','selectedCount','hotspotList','loadMore','mapLayout','mapFallback','summaryStats','summaryLevel','summaryBody','verifyDialog','verifyForm','verifyTitle','selectedMeta','navigateLink','locateButton','locationPanel','noGps','noGpsReasonWrap','noGpsReason','photoInput','photoPreview','noteInput','noteCount','actionInput','verifyMessage','saveDraftButton','reviewSubmitButton','confirmDialog','confirmSummary','confirmSubmit','cancelConfirm','closeDialog','retryButton','retryCount','toastRegion','menuButton','mainNav','apiEndpoint','connectButton','connectionDot','connectionMessage','sheetId','sourceSheet','driveId','saveConfigButton','configMessage','adminResult'].forEach(id => dom[id] = $(id));
    if (sessionExpired()) clearSession();
    if(state.token&&(sessionStorage.getItem('hsverify.sessionEndpoint')||globalThis.HS_SITE_CONFIG?.apiEndpoint)!==state.endpoint)clearSession();
    dom.apiEndpoint.value = state.endpoint;
    initSiteSettings();
    bindEvents();
    if(nationalMode){HSNationUI.init({api,rows:()=>state.all,profile:()=>state.profile,valid:()=>Boolean(state.authValidated&&state.token&&!sessionExpired()),reload:loadData,change:provinceChanged});setInterval(()=>{if(state.token&&sessionExpired()){clearSession();state.all=[];state.filtered=[];applyRoleUI();renderAll();loadData();}},15000);}
    HSField.init();
    if(typeof HSRegistration!=='undefined')HSRegistration.init({api,profile:()=>state.profile,valid:()=>Boolean(state.authValidated&&state.token&&!sessionExpired()),rows:()=>state.all,onLogin:()=>switchView('admin'),onPhoneLogin:loginPhoneInspector,onManagerLogin:loginManagerCredentials,onLogout:logoutAdmin,reload:loadData});
    if(typeof HSAccessNavigation!=='undefined')HSAccessNavigation.init({onLogout:logoutAdmin,onInspector:()=>{if(state.authValidated&&state.token&&!sessionExpired())switchView('work');else HSRegistration.openAccess('inspector');},onManager:()=>{if(state.authValidated&&state.token&&!sessionExpired()&&['admin','super_admin'].includes(state.profile?.role))switchView('admin');else HSRegistration.openAccess('manager');}});
    HSTeam.init({preview:previewMode,api,getEndpoint:()=>previewMode?'local-preview':state.endpoint,canEdit:()=>Boolean(state.authValidated && state.token && !sessionExpired() && state.profile?.role==='super_admin')});
    if(previewMode)HSPreview.connect({filtered:()=>state.filtered,rows:()=>state.all,profile:()=>state.profile,role:p=>{state.profile=p;state.token=p.role==='public'?'':'LOCAL-PREVIEW-NO-NETWORK';state.authValidated=p.role!=='public';state.expiresAt='';applyRoleUI();if(state.dataLoaded){populateFilters();applyFilters();}}});
    if(typeof HSUsageUI!=='undefined')HSUsageUI.init({api,live:()=>Boolean(state.endpoint&&!phoneDemoMode&&!previewMode)});
    updateModeUI();
    updateProvinceGate();
    if(typeof HSAdminAccounts!=='undefined')HSAdminAccounts.init({api,profile:()=>state.profile,valid:()=>Boolean(state.authValidated&&state.token&&!sessionExpired()),onChanged:logoutAdmin});
    initMap();
    if(typeof HSThaiPeriod!=='undefined')HSThaiPeriod.init();
    await loadData();
    if(state.authValidated&&typeof HSUsageUI!=='undefined')HSUsageUI.user();
    await refreshOutboxCount();
  }

  function bindEvents() {
    document.querySelectorAll('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));

    document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => setLayout(button.dataset.layout)));
    ['yearFilter','monthFilter','districtFilter','tambonFilter','villageFilter','cropFilter','statusFilter','resultFilter'].forEach(id => dom[id].addEventListener('change', () => {
      state.boundaryHS=null;
      if (id === 'yearFilter') populateFiscalMonths();
      if (id === 'districtFilter'){dom.tambonFilter.value='';dom.villageFilter.value='';repopulateLocationFilters('district');}
      if (id === 'tambonFilter'){dom.villageFilter.value='';repopulateLocationFilters('tambon');}
      applyFilters();
    }));
    dom.searchFilter.addEventListener('input', debounce(applyFilters, 180));
    dom.resetFilters.addEventListener('click', resetFilters);
    dom.allHotspotsButton.addEventListener('click', resetFilters);
    dom.hotspotList.addEventListener('click', event => { const card=event.target.closest('[data-hs-id]'); if(!card)return; const item=state.all.find(x=>x.hsId===card.dataset.hsId);if(item){try{openVerify(item);}catch(error){console.error(error);toast('เปิดฟอร์มไม่สำเร็จ: '+friendlyError(error),true);}} });
    dom.loadMore.addEventListener('click', () => { state.visible += PAGE_SIZE; renderList(); });
    dom.summaryLevel.addEventListener('change', renderSummary);
    if(dom.startMonthFilter){[dom.startMonthFilter,dom.endMonthFilter].forEach(input=>input.addEventListener('change',()=>{syncPeriodLegacy();applyFilters();}));dom.resetPeriod.onclick=()=>{const period=HSPeriod.defaults(scopedRows());dom.startMonthFilter.value=period.startMonth;dom.endMonthFilter.value=period.endMonth;syncPeriodLegacy();applyFilters();};dom.quickProvinceFilter.onchange=()=>{const source=$('provinceFilter');source.value=dom.quickProvinceFilter.value;source.dispatchEvent(new Event('change'));};}
    dom.summaryDistrict.addEventListener('change',()=>{if(nationalMode){state.boundaryHS=null;dom.districtFilter.value=dom.summaryDistrict.value;dom.tambonFilter.value='';dom.villageFilter.value='';repopulateLocationFilters('district');if(dom.summaryTambon)dom.summaryTambon.value='';applyFilters();}else renderSummary();}); dom.summaryYear.addEventListener('change',()=>{if(nationalMode){dom.yearFilter.value=dom.summaryYear.value;populateFiscalMonths();if(dom.startMonthFilter){dom.startMonthFilter.value=dom.summaryYear.value?HSFiscal.start(dom.summaryYear.value):'';dom.endMonthFilter.value=dom.summaryYear.value?HSFiscal.months(dom.summaryYear.value).at(-1):'';}applyFilters();}else renderSummary();});
    if(dom.summaryTambon)dom.summaryTambon.addEventListener('change',()=>{state.boundaryHS=null;dom.tambonFilter.value=dom.summaryTambon.value;dom.villageFilter.value='';repopulateLocationFilters('tambon');applyFilters();});
    dom.summaryReset.addEventListener('click',()=>{dom.summaryDistrict.value='';dom.summaryLevel.value='province';if(nationalMode)resetFilters();else renderSummary();});
    dom.printReportButton.addEventListener('click',openSummaryReport);
    dom.refreshDataButton.addEventListener('click',refreshSharedData);
    dom.hsImportFile.addEventListener('change',previewFileImport);
    dom.importDatasetYear.addEventListener('change',()=>{state.importCandidate=null;dom.confirmFileImport.disabled=true;dom.importMessage.textContent='ปีชุดข้อมูลเปลี่ยน กรุณาเลือกไฟล์ใหม่เพื่อทบทวน';});
    dom.confirmFileImport.addEventListener('click',confirmFileImport);
    dom.closeDialog.addEventListener('click', closeVerify);
    dom.verifyDialog.addEventListener('click', event => { if (event.target === dom.verifyDialog) closeVerify(); });
    dom.verifyForm.addEventListener('submit', reviewSubmission);
    dom.cancelConfirm.addEventListener('click', () => dom.confirmDialog.close());
    dom.confirmSubmit.addEventListener('click', () => submitVerification('verified'));
    dom.saveDraftButton.addEventListener('click', () => submitVerification('draft'));
    dom.locateButton.addEventListener('click', captureLocation);
    dom.noGps.addEventListener('change', () => {
      dom.noGpsReasonWrap.hidden = !dom.noGps.checked;
      if (dom.noGps.checked) { state.location = null; renderLocation(); dom.noGpsReason.focus(); }
      else dom.noGpsReason.value = '';
    });
    dom.photoInput.addEventListener('change', addPhotos); dom.importPhotoInput.addEventListener('change',addPhotos);
    dom.noteInput.addEventListener('input', () => dom.noteCount.textContent = `${dom.noteInput.value.length}/500`);
    dom.retryButton.addEventListener('click', retryOutbox);
    dom.adminLoginForm.addEventListener('submit',loginAdmin);
    dom.logoutButton.addEventListener('click',logoutAdmin);
    dom.connectButton.addEventListener('click', connectServer);
    dom.saveConfigButton.addEventListener('click', saveServerConfig);
    document.querySelectorAll('[data-admin-action]').forEach(button => button.addEventListener('click', () => runAdminAction(button.dataset.adminAction, button)));
    window.addEventListener('online', () => { toast('กลับมาออนไลน์แล้ว'); refreshOutboxCount(); });
    window.addEventListener('offline', () => toast('ออฟไลน์ — งานที่ส่งไม่สำเร็จจะเก็บไว้', true));
  }

  function provinceChanged(){
    state.boundaryHS=null;state.selected=null;state.detailRequest=(state.detailRequest||0)+1;
    dom.districtFilter.value='';dom.tambonFilter.value='';dom.villageFilter.value='';if(dom.summaryTambon)dom.summaryTambon.value='';
    if(!state.authValidated||!state.token||sessionExpired()){state.loadRevision=(state.loadRevision||0)+1;state.all=[];state.filtered=[];state.dataLoaded=false;state.periodInitialized=false;populateFilters();applyFilters();applyRoleUI();void loadData();}
    else{populateFilters();applyFilters();}
  }
  function updateProvinceGate(){
    if(!nationalMode)return;const publicView=!(state.authValidated&&state.token&&!sessionExpired()),pending=publicView&&!HSNationUI.selectedProvinceCode;
    const gate=$('publicProvinceGate'),slot=$('publicProvinceSlot'),context=$('managerProvinceContext');
    if(gate)gate.hidden=!publicView;
    if(context){if(publicView&&slot&&context.parentElement!==slot)slot.append(context);else if(!publicView&&dom.adminProtected&&context.parentElement!==dom.adminProtected)dom.adminProtected.prepend(context);context.hidden=!(publicView||['admin','super_admin'].includes(state.profile?.role));}
    const content=$('summaryContent'),prompt=$('summaryProvincePrompt');if(content)content.hidden=pending;if(prompt)prompt.hidden=!pending;
    if(dom.printReportButton)dom.printReportButton.disabled=pending;
    const message=$('provinceSelectionMessage');if(message)message.textContent=pending?'เลือกจังหวัดก่อน ระบบจะแสดงจุดความร้อนและสรุปผลเฉพาะจังหวัดที่เลือก':'กำลังแสดงข้อมูลเฉพาะจังหวัด'+(HSNational.provinces[HSNationUI.selectedProvinceCode]||'ที่เลือก');
  }

  function switchView(name) {
    if(typeof HSAccessNavigation!=='undefined')HSAccessNavigation.close();
    if(name==='admin'&&!(state.authValidated&&state.token&&!sessionExpired()&&['admin','super_admin'].includes(state.profile?.role))&&typeof HSRegistration!=='undefined'){HSRegistration.openAccess('manager');return;}
    document.querySelectorAll('.view').forEach(view => { const active = view.id === `${name}View`; view.classList.toggle('active', active); view.hidden = !active; });
    document.querySelectorAll('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === name));
    dom.mainNav.classList.remove('open'); dom.menuButton.setAttribute('aria-expanded','false');
    if (name === 'summary') renderSummary();
    if (name === 'admin') applyRoleUI();
    if(name==='team')HSTeam.refresh();
    if (name === 'work' && state.map) setTimeout(() => state.map.invalidateSize(), 30);
  }

  function setLayout(layout) {
    document.querySelectorAll('[data-layout]').forEach(button => button.classList.toggle('active', button.dataset.layout === layout));
    const wrap = document.querySelector('.map-wrap');
    wrap.hidden = layout === 'list';
    dom.mapLayout.style.gridTemplateColumns = layout === 'list' ? '1fr' : '';
    if (layout === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 30);
  }

  function updateModeUI() {
    const live = Boolean(state.endpoint);
    dom.modeBadge.className = `mode-badge ${live ? 'live' : 'demo'}`;
    dom.modeBadge.textContent = live ? 'เชื่อมระบบกลาง' : 'ตัวอย่างในเครื่อง';
    dom.demoNotice.hidden = live;
    if(phoneDemoMode){dom.demoNotice.innerHTML='<strong>ตัวอย่างเบอร์โทร · ดูข้อมูลเท่านั้น</strong><span>ไม่ยืนยันตัวตน ไม่ให้สิทธิ์บันทึก และไม่เชื่อม Google จริง · ข้อมูลบัญชีตัวอย่างหายเมื่อปิดหรือโหลดหน้าใหม่</span>';dom.saveDraftButton.disabled=true;dom.reviewSubmitButton.disabled=true;dom.confirmSubmit.disabled=true;}
    dom.connectionDot.className = `connection-dot ${live ? 'offline' : 'offline'}`;
  }

  function initMap() {
    if (!window.L) return showMapFallback('โหลดระบบแผนที่ไม่สำเร็จ');
    try {
      state.map = L.map('map', { zoomControl:true,preferCanvas:true }).setView([16.4, 99.52], 9);
      const streets=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
      const satellite=L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri, Maxar, Earthstar Geographics and contributors'});
      const terrain=L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri and contributors'});
      if(L.control?.layers)L.control.layers({'ถนน':streets,'ดาวเทียม':satellite,'ภูมิประเทศ':terrain},{},{collapsed:true}).addTo(state.map);
      state.markers = L.layerGroup().addTo(state.map);
      if(typeof HSBoundaries!=='undefined' && $('boundaryPanel')){state.boundaries=HSBoundaries.create({map:state.map,L,panel:$('boundaryPanel'),showControls:false,profile:()=>state.profile,valid:()=>Boolean(state.authValidated&&state.token&&!sessionExpired()),selectedProvince:()=>nationalMode?HSNationUI.selectedProvinceCode:'62',activeArea:()=>({provinceCode:nationalMode?HSNationUI.selectedProvinceCode:'62',district:dom.districtFilter.value,tambon:dom.tambonFilter.value,hs:state.boundaryHS||null})});state.boundaries.sync();}
    } catch (error) { showMapFallback('เบราว์เซอร์นี้เปิดแผนที่ไม่ได้'); }
  }

  function showMapFallback(message) {
    state.mapFailed = true; dom.mapFallback.hidden = false;
    dom.mapFallback.querySelector('strong').textContent = message;
  }

  async function loadData(force = false) {
    const loadToken=state.token,loadRevision=state.loadRevision=(state.loadRevision||0)+1;
    setLoading(true);
    dom.liveError.hidden = true;
    try {
      if(typeof HSNationUI!=='undefined'&&(!state.token||sessionExpired())&&!HSNationUI.selectedProvinceCode){state.all=[];state.filtered=[];state.dataLoaded=false;state.boundaryHS=null;HSNationUI.sync();populateFilters();applyRoleUI();if(typeof applyFilters==='function')applyFilters();else renderAll();dom.dataSourceLabel.textContent='กรุณาเลือกจังหวัดก่อนแสดงจุดความร้อน';return;}
      if (state.endpoint) {
        let info=null,data=null;state.usedCache=false;
        if(typeof HSDataCache!=='undefined'){try{info=await api('getDatasetInfo',{provinceCode:typeof HSNationUI!=='undefined'?HSNationUI.selectedProvinceCode:''});if(!force){const rows=await HSDataCache.read(info);if(rows){data={hotspots:{items:rows},config:info.config};state.usedCache=true;}}}catch(error){if(error.code==='UNAUTHORIZED'||error.code==='PROVINCE_UNASSIGNED')throw error;}}
        if(!data){data=await api('bootstrap',{provinceCode:typeof HSNationUI!=='undefined'?HSNationUI.selectedProvinceCode:'',filters:{}});if(loadToken!==state.token||loadRevision!==state.loadRevision)return;if(info&&typeof HSDataCache!=='undefined')await HSDataCache.write(info,extractRows(data)||[]);}
        if(loadToken!==state.token||loadRevision!==state.loadRevision)return;
        const rows = extractRows(data);
        if (!Array.isArray(rows)) throw new Error('เซิร์ฟเวอร์ส่งรูปแบบรายการ HS ไม่ถูกต้อง');
        state.all = rows.map(normalizeHS).filter(validHS);
        state.authValidated=Boolean(state.token);
        state.profile = data?.profile || data?.config?.profile || state.profile;
        state.serverConfig = data && !Array.isArray(data) ? (data.config ? { ...data.config,profile:state.profile } : { ...data,profile:state.profile }) : { profile:state.profile };
        applyConfigToForm(state.serverConfig);
        dom.connectionDot.className = 'connection-dot online';
      } else {
        const shared = JSON.parse(localStorage.getItem(previewMode?'hsverify.previewDataset':'hsverify.sharedDataset') || 'null');
        let rows;
        if (shared) { rows=shared.rows; state.sourceName=`ไฟล์ร่วมในเครื่อง: ${shared.sourceName}`; }
        else { const source=await HSData.loadRiskDataset({yearBe:dom.yearFilter.value || undefined}); rows=source.rows; state.sourceName=`Agri-Risk Map · ชุดปี ${source.yearBe}`; }
        const demoResults = JSON.parse(localStorage.getItem(STORE_DEMO) || '{}');
        state.all = rows.map(normalizeHS).filter(validHS).map(item => demoResults[item.hsId] ? { ...item,status:demoResults[item.hsId].status,verification:demoResults[item.hsId] } : item);
      }
      if(nationalMode)HSNationUI.sync();
      const oldFilters=filters();

      populateFilters();
      state.latestYear=Math.max(...state.all.map(x=>Number(x.datasetYearBe)||Number(x.yearBe)).filter(Number.isFinite));
      if (!state.dataLoaded) { if(dom.startMonthFilter){const range=HSPeriod.defaults(scopedRows());if(!state.periodInitialized){dom.startMonthFilter.value=range.startMonth;dom.endMonthFilter.value=range.endMonth;state.periodInitialized=true;}}const period=HSFiscal.defaults(scopedRows());dom.yearFilter.value=String(period.year);populateFiscalMonths(period.endMonth);dom.summaryYear.value=String(period.year); }
      else { Object.entries({yearFilter:oldFilters.year,monthFilter:oldFilters.month,districtFilter:oldFilters.district,cropFilter:oldFilters.crop,statusFilter:oldFilters.status,resultFilter:oldFilters.result,searchFilter:oldFilters.search}).forEach(([id,v])=>{dom[id].value=v;});repopulateLocationFilters('district');dom.tambonFilter.value=oldFilters.tambon;repopulateLocationFilters('tambon');dom.villageFilter.value=oldFilters.village; }
      if(dom.startMonthFilter)syncPeriodLegacy();state.dataLoaded=true; applyFilters(); applyRoleUI();
      const times=state.all.map(x=>x.acquiredAt).filter(Boolean).sort();
      dom.dataSourceLabel.textContent=`${state.endpoint ? 'ฐาน HS กลางที่เชื่อมกับระบบความเสี่ยง' : state.sourceName} · ${state.all.length.toLocaleString('th-TH')} จุด · ล่าสุด ${times.length?formatDate(times.at(-1)):'ไม่ระบุ'} · ${state.usedCache?'สำเนาในเครื่องที่ตรวจสิทธิ์แล้ว · ':''}อัปเดต ${new Date().toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok'})}`;
    } catch (error) {
      if(loadToken!==state.token||loadRevision!==state.loadRevision)return;
      state.all = []; state.filtered = []; renderAll();
      const prefix = state.endpoint ? 'เชื่อมระบบกลางไม่สำเร็จ ข้อมูลตัวอย่างไม่ได้ถูกนำมาใช้: ' : 'เปิดข้อมูลในเครื่องไม่สำเร็จ: ';
      dom.liveError.textContent = prefix + friendlyError(error); dom.liveError.hidden = false;
    } finally { if(loadToken===state.token&&loadRevision===state.loadRevision)setLoading(false); }
  }

  function extractRows(data) {
    if (Array.isArray(data)) return data;
    return data?.hotspots?.items || data?.hotspots || data?.items || data?.rows || data?.hs || data?.data;
  }

  function normalizeHS(raw) {
    const verification = raw.verification || null;
    const acquired = raw.acquiredAt || raw.acquired_at || raw.hs_date || raw.date || '';
    return {
      ...raw,
      hsId: String(raw.hsId ?? raw.hs_id ?? raw.id ?? '').trim(),
      acquiredAt: acquired, time:cleanTime(raw.time ?? raw.hs_time,acquired),
      datasetYearBe: Number(raw.datasetYearBe ?? raw.dataset_year_be ?? raw.season_be ?? raw.yearBe ?? raw.year_be ?? deriveYear(acquired)),
      yearBe: String(raw.yearBe ?? raw.year_be ?? deriveYear(acquired)),
      month: Number(raw.month ?? deriveMonth(acquired)) || '',
      province: raw.province || (nationalMode?'ไม่ระบุ':'กำแพงเพชร'),
      provinceCode:raw.provinceCode || (nationalMode?HSNational.provinceCode(raw.province,raw.province_code):'62'),
      district: clean(raw.district ?? raw.amphoe), tambon:clean(raw.tambon), village:clean(raw.village),
      landType:clean(raw.landType ?? raw.land_type), plantType:clean(raw.plantType ?? raw.plant_type),
      latitude:Number(raw.latitude ?? raw.lat), longitude:Number(raw.longitude ?? raw.lng),
      status: verification?.status || raw.status || 'pending', verification
    };
  }

  function clean(value) { return value == null || String(value).trim() === '' ? 'ไม่ระบุ' : String(value).trim(); }
  function cleanTime(value,acquired) { if (value != null && String(value).trim()) return String(value).trim(); const d=new Date(acquired); return Number.isNaN(d.getTime()) ? 'ไม่ระบุ' : d.toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}); }
  function validHS(item) { return item.hsId && Number.isFinite(item.latitude) && Number.isFinite(item.longitude); }
  function deriveYear(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : String(Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',year:'numeric'}).format(d)) + 543); }
  function deriveMonth(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',month:'numeric'}).format(d)); }

  function populateFilters() {
    const fiscalYears=unique([HSFiscal.defaults(state.all).year,...state.all.map(x=>HSFiscal.year(x.acquiredAt))]).sort((a,b)=>b-a);
    fillSelect(dom.yearFilter,fiscalYears,'ทุกปีงบประมาณ');populateFiscalMonths();
    fillSelect(dom.districtFilter, unique(scopedRows().map(x => x.district)).sort(locale), 'ทุกอำเภอ');
    fillSelect(dom.cropFilter, unique(state.all.map(x => x.plantType)).filter(x => x !== 'ไม่ระบุ').sort(locale), 'ทุกชนิดพืช');
    fillSelect(dom.summaryYear,fiscalYears,'ทุกปีงบประมาณ');
    fillSelect(dom.summaryDistrict,unique(scopedRows().map(x=>x.district)).sort(locale),'ทั้งจังหวัด · ทุกอำเภอ');
    repopulateLocationFilters('district');
    if(nationalMode){const overview=!HSNationUI.selectedProvinceCode;[dom.districtFilter,dom.tambonFilter,dom.villageFilter,dom.summaryDistrict,dom.summaryTambon].filter(Boolean).forEach(e=>{e.disabled=overview;if(overview)e.value='';});}
  }

  function populateFiscalMonths(preferred) {
    const fy=dom.yearFilter.value,old=preferred||dom.monthFilter.value;
    const values=fy?HSFiscal.months(fy):[];fillSelect(dom.monthFilter,values,'ถึงสิ้นปีงบประมาณ',m=>MONTHS[Number(m.slice(5))-1]+' '+(Number(m.slice(0,4))+543));
    dom.monthFilter.value=values.includes(old)?old:(values.filter(m=>scopedRows().some(r=>HSFiscal.date(r.acquiredAt).startsWith(m))).at(-1)||values[0]||'');
  }

  function repopulateLocationFilters(changed) {
    const district = dom.districtFilter.value, oldTambon = dom.tambonFilter.value, oldVillage = dom.villageFilter.value;
    const atDistrict = scopedRows().filter(x => !district || x.district === district);
    fillSelect(dom.tambonFilter, unique(atDistrict.map(x => x.tambon)).sort(locale), 'ทุกตำบล');
    if (changed !== 'district' && [...dom.tambonFilter.options].some(o => o.value === oldTambon)) dom.tambonFilter.value = oldTambon;
    const tambon = dom.tambonFilter.value;
    fillSelect(dom.villageFilter, unique(atDistrict.filter(x => !tambon || x.tambon === tambon).map(x => x.village)).sort(locale), 'ทุกหมู่บ้าน');
    if (changed !== 'district' && [...dom.villageFilter.options].some(o => o.value === oldVillage)) dom.villageFilter.value = oldVillage;
  }

  function fillSelect(select, values, first, label = x => x) {
    const old = select.value;
    select.replaceChildren(new Option(first,''), ...values.map(value => new Option(label(value), value)));
    if ([...select.options].some(o => o.value === old)) select.value = old;
  }

  function filters() {
    return {
      startMonth:dom.startMonthFilter?.value||'',endMonth:dom.endMonthFilter?.value||'',year:dom.yearFilter.value, month:dom.monthFilter.value, district:dom.districtFilter.value,
      tambon:dom.tambonFilter.value, village:dom.villageFilter.value, crop:dom.cropFilter.value,
      status:dom.statusFilter.value, result:dom.resultFilter.value, search:dom.searchFilter.value.trim().toLocaleLowerCase('th')
    };
  }

  function syncPeriodLegacy(){if(!dom.startMonthFilter)return;if(typeof HSThaiPeriod!=='undefined')HSThaiPeriod.sync(state.all);const start=dom.startMonthFilter.value;dom.yearFilter.value=HSPeriod.valid(start)?String(Number(start.slice(0,4))+543+(Number(start.slice(5))>=10?1:0)):'';populateFiscalMonths(dom.endMonthFilter.value);}

  function applyFilters() {
    const f = filters(); state.visible = PAGE_SIZE;
    dom.allHotspotsButton.setAttribute('aria-pressed', String(!Object.values(f).some(Boolean)));
    state.filtered = scopedRows().filter(x => {
      const result = x.verification?.result || x.result || '';
      const haystack = `${x.hsId} ${x.district} ${x.tambon} ${x.village} ${x.plantType} ${x.landType}`.toLocaleLowerCase('th');
      return (dom.startMonthFilter?(!HSPeriod.error(f.startMonth,f.endMonth)&&HSPeriod.matches(x,f.startMonth,f.endMonth)):HSFiscal.matches(x,f.year,f.month || (f.year?HSFiscal.months(f.year).at(-1):''))) &&
        (!f.district || x.district === f.district) && (!f.tambon || x.tambon === f.tambon) && (!f.village || x.village === f.village) &&
        (!f.crop || x.plantType === f.crop) && (!f.status || x.status === f.status) &&
        (!f.result || result === f.result) && (!f.search || haystack.includes(f.search));
    });
    if(nationalMode){const source=$('provinceFilter');if(dom.quickProvinceFilter&&source){dom.quickProvinceFilter.innerHTML=source.innerHTML;dom.quickProvinceFilter.value=source.value;dom.quickProvinceFilter.disabled=true;}dom.summaryDistrict.value=dom.districtFilter.value;if(dom.summaryTambon){fillSelect(dom.summaryTambon,unique(scopedRows().filter(x=>!dom.districtFilter.value||x.district===dom.districtFilter.value).map(x=>x.tambon)).sort(locale),'ทุกตำบล');dom.summaryTambon.value=dom.tambonFilter.value;}dom.summaryYear.value=dom.yearFilter.value;}
    const hint=$('fiscalPeriodHint');if(hint)hint.textContent=f.year?`ปีงบประมาณ ${f.year} · ตั้งแต่ตุลาคม ${Number(f.year)-1} ถึง ${f.month?MONTHS[Number(f.month.slice(5))-1]+' '+(Number(f.month.slice(0,4))+543):'กันยายน '+f.year}${state.filtered.length?'':' · ยังไม่มีข้อมูลในช่วงและขอบเขตนี้'}`:'แสดงข้อมูลทุกปีงบประมาณ';
    if(dom.startMonthFilter){const periodHint=$('periodRangeHint');if(periodHint)periodHint.textContent=HSPeriod.error(f.startMonth,f.endMonth)||HSPeriod.label(f.startMonth,f.endMonth)+(state.filtered.length?'':' · ไม่พบข้อมูลในช่วงที่เลือก');}
    state.boundaries?.sync();renderAll();
  }

  function resetFilters() {
    state.boundaryHS=null;
    ['yearFilter','monthFilter','districtFilter','tambonFilter','villageFilter','cropFilter','statusFilter','resultFilter','searchFilter'].forEach(id => dom[id].value = '');
    if(dom.startMonthFilter){dom.startMonthFilter.value='';dom.endMonthFilter.value='';}
    dom.selectionContext.hidden=true; repopulateLocationFilters('district'); applyFilters();
  }

  function renderAll() { dom.resultCount.textContent = state.filtered.length.toLocaleString('th-TH'); renderList(); renderMarkers(); renderSummary(); }

  function renderList() {
    const items = state.filtered.slice(0,state.visible);
    if (!items.length) dom.hotspotList.innerHTML = nationalMode&&!HSNationUI.selectedProvinceCode&&(!state.authValidated||!state.token)?'<div class="empty-state">กรุณาเลือกจังหวัดก่อนแสดงจุดความร้อน</div>':nationalMode&&!scopedRows().length ? '<div class="empty-state"><strong>ยังไม่มีข้อมูล HS ที่อ่านได้ในจังหวัดนี้</strong><br>จังหวัดนี้อาจยังไม่นำเข้าหรือยังไม่เผยแพร่ · ไม่แสดงจุดจากจังหวัดอื่นแทน</div>' : '<div class="empty-state"><strong>ไม่พบจุดที่ตรงกับตัวกรอง</strong><br>ลองล้างหรือเปลี่ยนตัวกรอง</div>';
    else dom.hotspotList.replaceChildren(...items.map(hotspotCard));
    dom.loadMore.hidden = state.visible >= state.filtered.length;
    if (!dom.loadMore.hidden) dom.loadMore.textContent = `แสดงเพิ่ม (เหลือ ${(state.filtered.length-state.visible).toLocaleString('th-TH')})`;
  }

  function hotspotCard(item) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'hotspot-card';
    const status = displayStatus(item), statusClass = item.verification?.result || item.status;
    button.innerHTML = `<div class="row"><span class="hotspot-id">${esc(item.hsId)}</span><span class="status-pill ${esc(statusClass)}">${esc(status)}</span></div><h3>${esc(areaLabel(item))}</h3><p>${esc(item.plantType !== 'ไม่ระบุ' ? item.plantType : item.landType)} · ${formatDate(item.acquiredAt)}</p>`;
    button.dataset.hsId=item.hsId; return button;
  }

  function displayStatus(item) { return item.verification?.result ? RESULT_LABELS[item.verification.result] || item.verification.result : STATUS_LABELS[item.status] || 'รอตรวจ'; }
  function areaLabel(item) { return [item.village,item.tambon,item.district].filter(x => x && x !== 'ไม่ระบุ').join(' · ') || 'ไม่ระบุพื้นที่'; }

  function renderMarkers() {
    if (!state.map || !state.markers) return;
    state.markers.clearLayers();
    const bounds = [];
    state.filtered.forEach(item => {
      const result = item.verification?.result; const color = typeof HSMapStatus!=='undefined'?HSMapStatus.color(item):(COLORS[result] || COLORS[item.status] || COLORS.pending);
      const marker = L.circleMarker([item.latitude,item.longitude], { radius:7,weight:2,color:'#fff',fillColor:color,fillOpacity:.95 });
      marker.bindTooltip(`<strong>${esc(item.hsId)}</strong><br>${esc(areaLabel(item))}<br>${esc(typeof HSMapStatus!=='undefined'?HSMapStatus.label(item):(RESULT_LABELS[result]||STATUS_LABELS[item.status]))}`);
      marker.on('click', () => openVerify(item)); marker.addTo(state.markers); bounds.push([item.latitude,item.longitude]);
    });
    if (bounds.length) state.map.fitBounds(bounds, { padding:[25,25],maxZoom:14 });
  }

  function renderSummary() {
    if (!dom.summaryStats) return;
    if(nationalMode)updateProvinceGate();
    if(nationalMode&&(!state.authValidated||!state.token||sessionExpired())&&!HSNationUI.selectedProvinceCode){dom.summaryStats.innerHTML='';dom.summaryBody.innerHTML='';return;}
    if(nationalMode){const hint=document.getElementById('summaryScopeHint');if(hint)hint.textContent=[HSNationUI.scope(),dom.startMonthFilter?HSPeriod.label(dom.startMonthFilter.value,dom.endMonthFilter.value):'ปีงบประมาณ '+(dom.yearFilter.value||'ทุกปี'),dom.monthFilter.value?'ถึงเดือน '+dom.monthFilter.value:'ถึงสิ้นปีงบประมาณ',dom.districtFilter.value,dom.tambonFilter.value,dom.villageFilter.value,dom.cropFilter.value,dom.statusFilter.value,dom.resultFilter.value].filter(Boolean).join(' · ');}
    const summaryRows = nationalMode?state.filtered:state.all.filter(x=>(!dom.summaryDistrict.value || x.district===dom.summaryDistrict.value)&&(!dom.summaryYear.value || String(x.datasetYearBe)===dom.summaryYear.value));
    const isConfirmed=x=>x.status==='verified' && ['burned','not_burned'].includes(x.verification?.result);
    const total = summaryRows.length, verified = summaryRows.filter(isConfirmed).length;
    const followup=summaryRows.filter(x=>x.status==='verified'&&!isConfirmed(x)).length;
    const evidencePending=summaryRows.filter(x=>x.verification?.evidenceState==='pending').length;
    const burned = summaryRows.filter(x => x.status === 'verified' && x.verification?.result === 'burned').length;
    const pending = summaryRows.filter(x => x.status === 'pending').length;
    const stats = [[total,'จุดทั้งหมด','#007f78'],[verified,'ตรวจแล้ว','#18845d'],[burned,'พบการเผา','#cb2c29'],[pending,'รอตรวจ','#e3651d'],[followup,'ต้องติดตามผล','#80500a'],[evidencePending,'รอหลักฐาน','#175b87']];
    dom.summaryStats.innerHTML = stats.map(([value,label,color]) => `<article class="stat-card" style="--accent:${color}"><strong>${Number(value).toLocaleString('th-TH')}</strong><span>${label}</span></article>`).join('');
    const level = dom.summaryLevel.value;
    const grouped = new Map();
    summaryRows.forEach(item => {
      const key = nationalMode ? [item.province,level==='province'?'':item.district,['tambon','village'].includes(level)?item.tambon:'',level==='village'?item.village:''].filter(Boolean).join(' · ') : level === 'province' ? `กำแพงเพชร · ${dom.summaryDistrict.value || 'ทั้งจังหวัด'}` : level === 'amphoe' ? item.district : level === 'tambon' ? `${item.tambon} · ${item.district}` : `${item.village} · ${item.tambon} · ${item.district}`;
      const row = grouped.get(key) || { total:0,verified:0,burned:0 }; row.total++;
      if (isConfirmed(item)) row.verified++;
      if (item.status === 'verified' && item.verification?.result === 'burned') row.burned++;
      grouped.set(key,row);
    });
    const rows = [...grouped.entries()].sort((a,b) => b[1].total-a[1].total);
    dom.summaryBody.innerHTML = rows.length ? rows.map(([name,row]) => { const pct = row.total ? Math.round(row.verified/row.total*100) : 0; return `<tr><td><strong>${esc(nationalMode&&level!=='province'?name.split(' · ').slice(1).join(' · '):name)}</strong></td><td>${row.total.toLocaleString('th-TH')}</td><td>${row.verified.toLocaleString('th-TH')}</td><td>${row.burned.toLocaleString('th-TH')}</td><td><span class="progress"><i style="width:${pct}%"></i></span>${pct}%</td></tr>`; }).join('') : '<tr><td colspan="5">ไม่มีข้อมูล</td></tr>';
  }

  async function reportPhotoData(photo){
    if(!['image/jpeg','image/png','image/webp'].includes(photo.mimeType)||!photo.base64||photo.base64.length>7100000)throw new Error('ข้อมูลภาพไม่ถูกต้อง');
    const image=new Image();image.src='data:'+photo.mimeType+';base64,'+photo.base64;await image.decode();const scale=Math.min(1,640/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.72);
  }
  async function enrichReportRows(rows){
    const result=[];
    for(const original of rows){const row={...original,reportPhotos:[],reportPhotoStatus:'unavailable'};
      if(row.status!=='verified'){row.reportPhotoStatus='empty';result.push(row);continue;}
      if(!state.endpoint||!state.authValidated){result.push(row);continue;}
      try{const details=await api('getHS',{hsId:row.hsId});const source=details?.hotspot||details?.item||details;row.verification=source.verification||row.verification;const id=row.verification?.verificationId;const photos=(source.photos||[]).filter(p=>id&&p.verificationId===id);row.reportPhotoStatus=photos.length?'loaded':'empty';
        for(const meta of photos){try{const data=await api('getPhoto',{photoId:meta.photoId});row.reportPhotos.push({dataUrl:await reportPhotoData(data),caption:meta.caption||'ภาพหลักฐานผลตรวจ'});}catch(_){row.reportPhotoStatus=row.reportPhotos.length?'partial':'error';}}
      }catch(_){row.reportPhotoStatus='error';}result.push(row);
    }return result;
  }

  async function openSummaryReport() {
    if (!window.HSReport) return toast('เปิดตัวสร้างรายงานไม่สำเร็จ กรุณาโหลดหน้าใหม่',true);
    const rows=nationalMode?state.filtered:state.all.filter(item=>(!dom.summaryDistrict.value || item.district===dom.summaryDistrict.value)&&(!dom.summaryYear.value || String(item.datasetYearBe)===dom.summaryYear.value));
    try {
      dom.printReportButton.disabled=true;dom.printReportButton.textContent='กำลังเตรียมภาพและรายงาน…';
      const reportRows=await enrichReportRows(rows);
      await HSReport.openReport({
        rows:reportRows,
        filters:{startMonth:dom.startMonthFilter?.value||'',endMonth:dom.endMonthFilter?.value||'',district:dom.summaryDistrict.value,year:dom.startMonthFilter?'':dom.summaryYear.value,scope:nationalMode?[HSNationUI.scope(),dom.tambonFilter.value,dom.villageFilter.value].filter(Boolean).join(' · '):'',provinceCode:nationalMode?HSNationUI.selectedProvinceCode:'',month:dom.startMonthFilter?'':dom.monthFilter.value},
        sourceLabel:state.endpoint ? 'ฐานข้อมูล HS กลาง ณ เวลาที่เปิดรายงาน' : (state.sourceName || 'ชุดข้อมูลอ้างอิงในเครื่อง'),
        generatedAt:new Date().toISOString(),
        logoDoae:new URL('assets/logo-doae.png',location.href).href,
        logoKpp:new URL('assets/logo-kpp.png',location.href).href,
        fontRegular:new URL('assets/fonts/Sarabun-Regular.ttf',location.href).href,
        fontBold:new URL('assets/fonts/Sarabun-Bold.ttf',location.href).href
      });
    } catch(error){toast(friendlyError(error),true);}finally{dom.printReportButton.disabled=false;dom.printReportButton.textContent='พิมพ์รายงาน / บันทึก PDF';}
  }

  function openVerify(item) {
    if(nationalMode)HSNationUI.selectProvince(item.provinceCode);
    state.boundaryHS=item;state.boundaries?.sync();
    if(state.usedCache&&state.endpoint&&state.authValidated&&!item.detailsLoaded){const token=state.token,request=state.detailRequest=(state.detailRequest||0)+1;toast('กำลังอ่านรายละเอียดจุดความร้อน…');api('getHS',{hsId:item.hsId}).then(data=>{if(token!==state.token||request!==state.detailRequest)return;const full=normalizeHS(data?.hotspot||data?.item||data);full.detailsLoaded=true;const index=state.all.findIndex(x=>x.hsId===full.hsId);if(index>=0)state.all[index]=full;openVerify(full);}).catch(error=>toast('ยังเปิดบันทึกไม่ได้: '+friendlyError(error),true));return;}

    if(nationalMode&&(!state.authValidated||!state.token||sessionExpired())){syncFiltersFromHs(item);return toast('การดูข้อมูลไม่ต้องเข้าสู่ระบบ การบันทึกผลต้องเข้าสู่ระบบก่อน',true);}
    syncFiltersFromHs(item);
    state.selected = item; state.photos = []; state.location = null; dom.importPhotoInput.value="";
    dom.verifyForm.reset(); dom.noteCount.textContent = '0/500'; dom.verifyMessage.textContent = '';
    dom.noGpsReasonWrap.hidden = true;
    dom.verifyTitle.textContent = item.hsId;
    const verifiedTime = item.verification?.verifiedAt || item.verification?.updatedAt;
    dom.selectedMeta.innerHTML = `<div class="meta-grid">
      <span><small>วันที่ · เวลา HS</small><strong>${formatDate(item.acquiredAt)} · ${esc(item.time)}</strong></span>
      <span><small>จังหวัด</small><strong>${esc(item.province)}</strong></span>
      <span><small>อำเภอ · ตำบล · หมู่บ้าน</small><strong>${esc(areaLabel(item))}</strong></span>
      <span><small>ประเภทพื้นที่ · ชนิดพืช</small><strong>${esc(item.landType)} · ${esc(item.plantType)}</strong></span>
      <span><small>พิกัด HS</small><strong>${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}</strong></span>
      <span><small>ผู้ตรวจ</small><strong>${esc(inspectorLabel())}</strong></span>
      <span class="meta-wide"><small>เวลาบันทึกผล</small><strong>${verifiedTime ? formatDateTime(verifiedTime) : `${new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} (เวลาบนอุปกรณ์ · เซิร์ฟเวอร์จะประทับเวลาเมื่อส่ง)`}</strong></span>
    </div>`;
    dom.navigateLink.href = `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`;
    if (item.verification) {
      const radio = dom.verifyForm.querySelector(`[name=outcome][value="${cssEscape(item.verification.result || '')}"]`);
      if (radio) radio.checked = true;
      dom.noteInput.value = item.verification.notes || ''; dom.noteCount.textContent = `${dom.noteInput.value.length}/500`;
      dom.actionInput.value = item.verification.action || '';
    }
    HSField.reset(state.selected,state.serverConfig?.profile); renderLocation(); renderPhotos(); dom.verifyDialog.showModal();renderSavedPhotos(item);const canRecord=!state.endpoint||Boolean(state.authValidated&&state.token);dom.reviewSubmitButton.disabled=!canRecord;dom.saveDraftButton.disabled=!canRecord;if(!canRecord)setMessage(dom.verifyMessage,'กรุณาลงทะเบียนและเข้าสู่ระบบก่อนบันทึกผลตรวจ','error');
  }

  async function renderSavedPhotos(item) {
    let box=$('savedHSPhotos');if(!box){box=document.createElement('section');box.id='savedHSPhotos';box.className='saved-hs-photos';dom.selectedMeta.after(box);}box.replaceChildren();
    if(!state.endpoint||!state.authValidated){box.textContent='ภาพหลักฐานเปิดให้ผู้ใช้งานที่เข้าสู่ระบบและมีสิทธิ์ในพื้นที่';return;}
    box.textContent='กำลังอ่านภาพหลักฐานที่ยืนยันแล้ว…';
    try{const result=await api('getHSPhotos',{hsId:item.hsId});if(state.selected?.hsId!==item.hsId)return;box.replaceChildren();const title=document.createElement('h3');title.textContent='ภาพหลักฐานที่ยืนยันแล้ว';box.append(title);for(const photo of result.items||[]){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='ดูภาพหลักฐาน';button.onclick=async()=>{button.disabled=true;try{const r=await api('getPhoto',{photoId:photo.photoId});if(state.selected?.hsId!==item.hsId)return;if(!['image/jpeg','image/png','image/webp'].includes(r.mimeType)||!r.base64||r.base64.length>7100000)throw Error('ข้อมูลภาพไม่ถูกต้อง');const img=document.createElement('img');img.alt='หลักฐานผลตรวจ '+item.hsId;img.loading='lazy';img.src=`data:${r.mimeType};base64,${r.base64}`;img.style.maxWidth='100%';button.replaceWith(img);}catch(e){button.disabled=false;button.textContent=friendlyError(e);}};box.append(button);}if(!result.items?.length)box.append('ยังไม่มีภาพของผลตรวจที่ยืนยันแล้ว');}catch(e){box.textContent='อ่านภาพไม่ได้: '+friendlyError(e);}
  }

  function closeVerify() { if (!state.busy) dom.verifyDialog.close(); }

  function captureLocation() {
    if (!navigator.geolocation) { locationFailure('อุปกรณ์นี้ไม่รองรับ GPS'); return; }
    dom.locateButton.disabled = true; dom.locateButton.textContent = 'กำลังหาตำแหน่ง…';
    navigator.geolocation.getCurrentPosition(position => {
      state.location = { latitude:position.coords.latitude, longitude:position.coords.longitude, accuracy:Math.round(position.coords.accuracy), capturedAt:new Date().toISOString() };
      dom.noGps.checked = false; renderLocation(); dom.locateButton.disabled = false; dom.locateButton.textContent = '⌖ ใช้ตำแหน่งอีกครั้ง';
    }, error => {
      const messages = { 1:'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง',2:'หา GPS ไม่พบ',3:'ค้นหาตำแหน่งนานเกินไป' };
      locationFailure(messages[error.code] || 'อ่านตำแหน่งไม่สำเร็จ');
    }, { enableHighAccuracy:true,timeout:15000,maximumAge:0 });
  }

  function locationFailure(message) {
    state.location = null; renderLocation(message); dom.locateButton.disabled = false; dom.locateButton.textContent = '⌖ ลองใช้ตำแหน่งอีกครั้ง';
    dom.noGps.focus();
  }

  function renderLocation(error) {
    if (state.location && state.selected) {
      const distance = Math.round(haversine(state.location.latitude,state.location.longitude,state.selected.latitude,state.selected.longitude));
      dom.locationPanel.className = `location-panel ${state.location.accuracy > 100 ? 'warn' : 'ok'}`;
      dom.locationPanel.innerHTML = `<span class="location-icon">⌖</span><div><strong>พิกัดพร้อม · ห่างจุด HS ${distance.toLocaleString('th-TH')} ม.</strong><small>ความแม่นยำประมาณ ±${state.location.accuracy.toLocaleString('th-TH')} ม.${state.location.accuracy > 100 ? ' — ควรรอให้แม่นยำขึ้น' : ''}</small></div>`;
    } else {
      dom.locationPanel.className = `location-panel ${error ? 'warn' : ''}`;
      dom.locationPanel.innerHTML = `<span class="location-icon">⌖</span><div><strong>${esc(error || 'ยังไม่ได้บันทึกตำแหน่ง')}</strong><small>${error ? 'ลองใหม่ หรือเลือกบันทึกโดยไม่มี GPS ด้านล่าง' : 'กดใช้ตำแหน่งของฉันเมื่ออยู่หน้างาน'}</small></div>`;
    }
  }

  async function addPhotos(event) {
    const input = event?.target || dom.photoInput;
    const files = [...input.files].slice(0, 3-state.photos.length);
    if (!files.length) return;
    dom.verifyMessage.textContent = 'กำลังเตรียมรูป…';
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        state.photos.push(await compressPhoto(file));
      }
      renderPhotos(); dom.verifyMessage.textContent = '';
    } catch (error) { setMessage(dom.verifyMessage, `เตรียมรูปไม่สำเร็จ: ${friendlyError(error)}`, 'error'); }
    input.value = '';
  }

  async function compressPhoto(file) {
    return HSField.preparePhoto(file, state.selected, uuid());
  }

  function renderPhotos() {
    dom.photoPreview.replaceChildren(...state.photos.map((photo,index) => {
      const div = document.createElement('div'); div.className = 'photo-item photo-evidence-card';
      div.innerHTML = `<img src="${photo.preview || `data:${photo.mimeType};base64,${photo.base64}`}" alt="รูปหลักฐาน ${index+1}"><button type="button" aria-label="ลบรูป ${index+1}">×</button>`;
      div.insertAdjacentHTML('beforeend',HSField.describePhoto(photo));
      div.querySelector('button').addEventListener('click', () => { state.photos.splice(index,1); renderPhotos(); }); return div;
    }));
    renderPhotoPositions();
  }

  function renderPhotoPositions(){
    if(!state.map||!state.selected)return;
    if(!state.evidenceMarkers)state.evidenceMarkers=L.layerGroup().addTo(state.map);
    state.evidenceMarkers.clearLayers();
    state.photos.forEach((photo,index)=>{const m=photo.metadata;if(m?.latitude==null||m?.longitude==null)return;const point=[m.latitude,m.longitude];L.circleMarker(point,{radius:9,color:'#175b87',fillColor:'#fff',fillOpacity:1,weight:3}).bindTooltip('พิกัดกล้องจากภาพ '+(index+1)+' · ใช้สอบทวน').addTo(state.evidenceMarkers);L.polyline([[state.selected.latitude,state.selected.longitude],point],{color:'#175b87',weight:2,dashArray:'5 5'}).addTo(state.evidenceMarkers);if(m.accuracyM>0)L.circle(point,{radius:m.accuracyM,color:'#175b87',weight:1}).addTo(state.evidenceMarkers);});
  }

  function getFormPayload(status) {
    const outcome = dom.verifyForm.querySelector('[name=outcome]:checked')?.value;
    return {
      ...HSField.payload(), hsId:state.selected?.hsId, status, result:outcome, notes:dom.noteInput.value.trim(), action:dom.actionInput.value.trim(),
      location:state.location ? { latitude:state.location.latitude,longitude:state.location.longitude,accuracyM:state.location.accuracy, capturedAt:state.location.capturedAt } : undefined,
      missingGpsReason:state.location || status !== 'verified' ? undefined : (state.photos.some(x=>x.metadata?.latitude!=null)?'ใช้พิกัด EXIF ของภาพประกอบแทน GPS อุปกรณ์ โดยคงแหล่งที่มาแยกกัน':dom.noGpsReason.value)
    };
  }

  function validateForm(status='verified') {
    if (status === 'draft') return true;
    const fieldError=HSField.validate(state.photos); if(fieldError){setMessage(dom.verifyMessage,fieldError,'error');return false;}
    const outcome = dom.verifyForm.querySelector('[name=outcome]:checked');
    if (!outcome) { setMessage(dom.verifyMessage,'กรุณาเลือกผลการตรวจ','error'); dom.verifyForm.querySelector('[name=outcome]').focus(); return false; }
    const hasPhotoGps=state.photos.some(x=>x.metadata?.latitude!=null);
    if (!state.location && !hasPhotoGps && !dom.noGps.checked) { setMessage(dom.verifyMessage,'กรุณาบันทึกตำแหน่ง หรือระบุว่าบันทึกโดยไม่มี GPS','error'); dom.locateButton.focus(); return false; }
    if (!state.location && !hasPhotoGps && dom.noGps.checked && !dom.noGpsReason.value) { setMessage(dom.verifyMessage,'กรุณาเลือกเหตุผลที่ไม่มี GPS','error'); dom.noGpsReason.focus(); return false; }
    return true;
  }

  function reviewSubmission(event) {
    event.preventDefault(); if (!validateForm()) return;
    const p = getFormPayload('verified');
    dom.confirmSummary.innerHTML = `<strong>${esc(state.selected.hsId)} · ${esc(RESULT_LABELS[p.result])}</strong><br>${esc(areaLabel(state.selected))}<br>${state.location ? 'มีพิกัดหน้างาน' : 'ไม่มีพิกัดหน้างาน'} · ${state.photos.length} รูป`;
    dom.confirmDialog.showModal();
  }

  async function submitVerification(status) {
    if(phoneDemoMode){toast('บัญชีตัวอย่างดูข้อมูลได้เท่านั้น ไม่สามารถบันทึกผลตรวจ',true);return;}
    if (!validateForm(status) || state.busy) return;
    dom.confirmDialog.close(); setBusy(true); setMessage(dom.verifyMessage,status === 'draft' ? 'กำลังเก็บงานร่าง…' : 'กำลังบันทึกผล…');
    const job = { id:uuid(), endpoint:state.endpoint, inspectorId:state.serverConfig?.profile?.inspectorId, requestId:uuid(), payload:getFormPayload(status), photos:state.photos.map(({preview,...x}) => x), createdAt:new Date().toISOString(), attempts:0 };
    try {
      if (state.endpoint) {
        const result = await deliverJob(job);
        await applyServerResult(state.selected.hsId,result);
        toast(status === 'draft' ? 'เก็บงานร่างบนเซิร์ฟเวอร์แล้ว' : 'บันทึกผลสำเร็จ');
      } else {
        saveDemoResult(job.payload);
        toast(state.photos.length ? 'บันทึกผลตัวอย่างแล้ว — รูปในโหมดทดลองเป็นภาพ preview และไม่ถูกจัดเก็บ' : 'บันทึกในอุปกรณ์นี้แล้ว — ยังไม่ขึ้นระบบกลาง');
      }
      dom.verifyDialog.close(); applyFilters();
    } catch (error) {
      job.lastError = friendlyError(error); job.attempts = 1;
      try { await putJob(job); await refreshOutboxCount(); } catch (storageError) { setMessage(dom.verifyMessage,'ส่งไม่สำเร็จและพื้นที่จัดเก็บในเครื่องไม่พร้อม อย่าปิดหน้า: '+job.lastError,'error'); return; }
      setMessage(dom.verifyMessage,`ส่งไม่สำเร็จ เก็บงานไว้เพื่อลองใหม่แล้ว: ${job.lastError}`,'error');
      toast('เก็บงานไว้ในอุปกรณ์เพื่อส่งใหม่',true);
    } finally { setBusy(false); }
  }

  async function deliverJob(job) {
    if (job.endpoint !== state.endpoint || job.inspectorId !== state.serverConfig?.profile?.inspectorId) throw new Error('งานค้างเป็นของ endpoint หรือบัญชีอื่น กรุณาเชื่อมต่อบัญชีเดิมก่อนส่ง');
    const saved = await api('saveVerification', job.payload, job.requestId);
    const verification = saved?.verification || saved;
    const verificationId = verification?.verificationId || job.verificationId;
    if (job.photos.length && !verificationId) throw new Error('เซิร์ฟเวอร์ไม่ได้ส่ง verificationId สำหรับแนบรูป');
    job.verificationId = verificationId;
    for (const photo of job.photos) {
      if (photo.uploaded) continue;
      await api('uploadPhoto', { verificationId,hsId:job.payload.hsId,fileName:photo.fileName,mimeType:photo.mimeType,base64:photo.base64,capturedAt:photo.capturedAt,source:photo.source,originalSha256:photo.originalSha256,originalMetadata:photo.metadata }, photo.requestId);
      photo.uploaded = true;
    }
    return verification;
  }

  async function applyServerResult(hsId, verification) {
    let serverItem = null;
    try { const data = await api('getHS',{hsId}); serverItem = data?.hotspot || data?.item || data; } catch (_) { /* save response remains authoritative */ }
    const index = state.all.findIndex(x => x.hsId === hsId);
    if (index < 0) return;
    if (serverItem?.hsId || serverItem?.hs_id) state.all[index] = normalizeHS(serverItem);
    else if (verification?.verificationId) state.all[index] = { ...state.all[index],status:verification.status,verification };
    if(state.selected?.hsId===hsId && !dom.selectionContext.hidden)dom.statusFilter.value=state.all[index].status;
  }

  function saveDemoResult(payload) {
    const verification = { verificationId:`local-${uuid()}`, ...payload, updatedAt:new Date().toISOString(), verifiedAt:payload.status === 'verified' ? new Date().toISOString() : null };
    delete verification.location;
    if (payload.location) { verification.observedLatitude = payload.location.latitude; verification.observedLongitude = payload.location.longitude; }
    const all = JSON.parse(localStorage.getItem(STORE_DEMO) || '{}'); all[payload.hsId] = verification; localStorage.setItem(STORE_DEMO,JSON.stringify(all));
    const index = state.all.findIndex(x => x.hsId === payload.hsId); if (index >= 0) state.all[index] = { ...state.all[index],status:payload.status,verification };
    if(!dom.selectionContext.hidden)dom.statusFilter.value=payload.status;
  }

  async function retryOutbox() {
    if (!state.endpoint) return toast('ตั้งค่าเซิร์ฟเวอร์ก่อนส่งงานค้าง',true);
    const jobs = await getJobs(); if (!jobs.length) return;
    dom.retryButton.disabled = true;
    let success = 0;
    for (const job of jobs) {
      try { const result = await deliverJob(job); await applyServerResult(job.payload.hsId,result); await deleteJob(job.id); success++; }
      catch (error) { job.attempts = (job.attempts||0)+1; job.lastError = friendlyError(error); await putJob(job); }
    }
    dom.retryButton.disabled = false; await refreshOutboxCount(); applyFilters();
    toast(success ? `ส่งงานค้างสำเร็จ ${success} รายการ` : 'ยังส่งงานค้างไม่สำเร็จ',!success);
  }

  function syncFiltersFromHs(item) {
    dom.yearFilter.value=String(HSFiscal.year(item.acquiredAt));populateFiscalMonths(HSFiscal.date(item.acquiredAt).slice(0,7));
    dom.districtFilter.value=item.district;repopulateLocationFilters('district');dom.tambonFilter.value=item.tambon;repopulateLocationFilters('tambon');dom.villageFilter.value=item.village;
    dom.cropFilter.value=item.plantType;dom.statusFilter.value=item.status;dom.resultFilter.value='';dom.searchFilter.value='';
    dom.selectionContext.textContent=`เติมตัวกรองจาก HS ${item.hsId} แล้ว · ${areaLabel(item)} · กดล้างตัวกรองเพื่อดูพื้นที่อื่น`;dom.selectionContext.hidden=false;applyFilters();
  }

  function applyRoleUI() {
    if(typeof HSThaiPeriod!=='undefined')HSThaiPeriod.sync(state.all);
    updateProvinceGate();
    state.boundaries?.sync();
    if(typeof HSAdminAccounts!=='undefined')HSAdminAccounts.update();
    if(nationalMode){HSNationUI.sync();document.querySelectorAll('#workspaceSettingsCard,#fileImportCard,[data-admin-action=sync]').forEach(e=>e.style.display='none');}
    const profile=state.profile || state.serverConfig?.profile;
    const role=normalizedRole(profile?.role);
    const authenticated=Boolean(state.authValidated && state.token && profile && !sessionExpired());
    if(typeof HSAccessNavigation!=='undefined')HSAccessNavigation.updateAccess(authenticated);
    const canManage=authenticated && ['admin','super_admin'].includes(role);
    const canConfigure=authenticated && role==='super_admin';
    if(dom.apiEndpoint)dom.apiEndpoint.disabled=!canConfigure;if(dom.connectButton)dom.connectButton.disabled=!canConfigure;const endpointApply=document.getElementById('applyEndpointButton');if(endpointApply)endpointApply.disabled=!canConfigure;
    if(typeof HSTeam!=='undefined')HSTeam.updateAccess();
    dom.adminLoginGate.hidden=true;
    dom.adminProtected.hidden=!canManage;
    if(typeof HSRegistration!=='undefined')HSRegistration.refresh();
    dom.roleLabel.textContent=authenticated&&!canManage?'ผู้บันทึกข้อมูล · '+(profile.agency||profile.displayName):canManage ? (role==='super_admin' ? 'Super Admin · จัดการแหล่งข้อมูลและระบบ' : 'Admin · ตรวจ QA / ส่งออก / รายงาน') : 'ยังไม่ได้เข้าสู่ระบบ';
    dom.adminDisplayName.textContent=profile?.displayName || profile?.username || 'ผู้ดูแลระบบ';
    dom.adminRoleDescription.textContent=role==='super_admin' ? 'Super Admin' : role==='admin' ? 'Admin' : '';
    document.querySelectorAll('[data-super-admin-only]').forEach(element=>{element.hidden=!canConfigure;});
    [dom.saveConfigButton,dom.hsImportFile,dom.importDatasetYear,dom.sheetId,dom.sourceSheet,dom.driveId].forEach(element=>{element.disabled=!canConfigure;});
    document.querySelectorAll('[data-admin-action]').forEach(button=>{button.disabled=!canManage || (button.dataset.adminAction==='sync' && !canConfigure);});
    dom.confirmFileImport.disabled=!canConfigure || !state.importCandidate;
    if(dom.inspectorAccount)dom.inspectorAccount.hidden=true;
  }

  async function refreshSharedData() {
    dom.refreshDataButton.disabled=true;
    try { dom.yearFilter.value='';state.dataLoaded=false;await loadData(true); if(dom.liveError.hidden) toast('อ่านข้อมูลร่วมล่าสุดแล้ว'); }
    finally { dom.refreshDataButton.disabled=false; }
  }

  async function previewFileImport() {
    if (normalizedRole(state.profile?.role)!=='super_admin') return setMessage(dom.importMessage,'เฉพาะ Super Admin เท่านั้นที่นำเข้าไฟล์ได้','error');
    const file=dom.hsImportFile.files[0];state.importCandidate=null;dom.confirmFileImport.disabled=true;if(!file)return;
    dom.importMessage.textContent='กำลังตรวจไฟล์…';
    try {
      const parsed=await HSData.parseFile(file,{datasetYearBe:Number(dom.importDatasetYear.value)});
      const checked=HSData.normalizeRows(parsed.rows || parsed,{datasetYearBe:Number(dom.importDatasetYear.value)});
      const qa=parsed.qa || checked.qa;
      const payload={rows:checked.rows,sourceName:file.name,datasetYearBe:Number(dom.importDatasetYear.value),summary:parsed.summary};
      if(!payload.rows.length)throw new Error('ไม่พบ HS ที่ผ่านเงื่อนไข');
      if(qa.invalid || qa.duplicates)throw new Error(`ข้อมูลไม่พร้อม: invalid ${qa.invalid||0}, ซ้ำ ${qa.duplicates||0} กรุณาแก้ไฟล์ก่อนนำเข้า`);
      const serverPreview=await api('previewImportRows',payload);
      if(serverPreview && !serverPreview.canImport)throw new Error('เซิร์ฟเวอร์ไม่อนุญาตนำเข้า กรุณาตรวจ QA');
      state.importCandidate=payload;
      dom.importPreview.textContent=`${file.name} · ปีชุดข้อมูล ${payload.datasetYearBe}\nผ่าน ${payload.rows.length.toLocaleString('th-TH')} จุด · นอกเงื่อนไข ${qa.outOfScope||0} · ผิดรูปแบบ ${qa.invalid||0} · ซ้ำ ${qa.duplicates||0}\nยืนยันแล้วจะแทนที่ชุด HS ปัจจุบัน ผลตรวจและรูปเดิมยังเก็บประวัติไว้`;
      dom.importMessage.textContent='เซิร์ฟเวอร์ตรวจข้อมูลแล้ว รอคุณยืนยัน';dom.confirmFileImport.disabled=false;
    } catch(error) {setMessage(dom.importMessage,friendlyError(error),'error');dom.importPreview.textContent='ไฟล์ยังไม่ผ่านการตรวจ';}
  }

  async function confirmFileImport() {
    if(!state.importCandidate || normalizedRole(state.profile?.role)!=='super_admin')return;dom.confirmFileImport.disabled=true;
    try {
      await api('importRows',{...state.importCandidate,confirmed:true},uuid());
      state.dataLoaded=false; await loadData(); dom.importMessage.textContent='นำเข้าสำเร็จ และอัปเดตแผนที่แล้ว';state.importCandidate=null;
    } catch(error){setMessage(dom.importMessage,friendlyError(error),'error');dom.confirmFileImport.disabled=false;}
  }

  async function apiTransport(action,envelope) {
    const bounded=['register','registerProvincialAdmin','getRegistrationPolicy'].includes(action);
    const controller=bounded&&typeof AbortController!=='undefined'?new AbortController():null;
    let timer;
    const request=(async()=>{try{const response=await fetch(state.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(envelope),redirect:'follow',...(controller?{signal:controller.signal}:{})});return {response,text:await response.text()};}catch(error){if(error?.name==='AbortError')throw error;throw new Error('ติดต่อเซิร์ฟเวอร์ไม่ได้ โปรดตรวจอินเทอร์เน็ตและลองใหม่');}})();
    if(!bounded)return request;
    const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>{const error=new Error(action==='getRegistrationPolicy'?'โหลดประกาศไม่สำเร็จภายในเวลาที่กำหนด กรุณาลองเปิดลงทะเบียนใหม่':'การเชื่อมต่อใช้เวลานาน ระบบอาจได้รับคำขอแล้ว กรุณาให้ผู้ดูแลตรวจสถานะก่อนส่งซ้ำ');error.code='REQUEST_TIMEOUT';reject(error);controller?.abort();},action==='getRegistrationPolicy'?30000:90000);});
    try{return await Promise.race([request,timeout]);}finally{clearTimeout(timer);}
  }

  async function api(action,payload={},requestId) {
    if(phoneDemoMode)throw new Error('โหมดตัวอย่างเบอร์โทรไม่เชื่อม API และไม่อนุญาตการบันทึกข้อมูลจริง');
    if(previewMode)return HSPreview.api(action,payload,requestId);
    if (!state.endpoint) throw new Error('ยังไม่ได้ตั้งค่า URL ของ API');
    const envelope = { action,payload,token:state.token || undefined,csrf:state.csrf || undefined };
    if (requestId) envelope.requestId = requestId;
    const {response,text}=await apiTransport(action,envelope);
    let body; try { body = JSON.parse(text); } catch (_) { throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (${response.status})`); }
    if (!response.ok || body.ok !== true) {
      const error = new Error(body?.error?.message || `เซิร์ฟเวอร์ปฏิเสธคำขอ (${response.status})`); error.code = body?.error?.code; error.details = body?.error?.details; if(state.token&&['UNAUTHORIZED','PROVINCE_UNASSIGNED'].includes(error.code) && !['login','loginPhone','recordVisit','getCounters','getRegistrationPolicy','register','getTeam'].includes(action)){if(error.code==='UNAUTHORIZED')clearSession();state.all=[];state.filtered=[];state.serverConfig=null;applyRoleUI();renderAll();} throw error;
    }
    if (requestId && body.requestId && body.requestId !== requestId) throw new Error('requestId ที่เซิร์ฟเวอร์ตอบกลับไม่ตรงกับคำขอ');
    return body.data;
  }

  function saveEndpoint(value) {
    if(phoneDemoMode)throw new Error('โหมดตัวอย่างไม่อนุญาตให้เชื่อม API จริง');
    value = String(value ?? state.endpoint).trim().replace(/\/$/,'');
    state.endpoint = value;
    if (value) localStorage.setItem(STORE_ENDPOINT,value); else localStorage.removeItem(STORE_ENDPOINT);
    dom.apiEndpoint.value=value;
    updateModeUI();
  }

  async function loginPhoneInspector(phone) {
    if(phoneDemoMode)throw new Error('ใช้ปุ่มเข้าสู่ตัวอย่างสำหรับโหมดตัวอย่าง');
    if(!state.endpoint)throw new Error('ยังไม่ได้เชื่อมระบบกลาง');
    clearSession();
    try {
      const result=await api('loginPhone',{phone});
      if(!result?.token||result.profile?.role!=='inspector'||!result.csrf)throw new Error('ข้อมูลสิทธิ์ผู้บันทึกไม่ถูกต้อง');
      state.csrf=result.csrf;state.authValidated=true;state.token=result.token;state.profile=result.profile;state.expiresAt=result.expiresAt||'';
      sessionStorage.setItem('hsverify.csrf',state.csrf);sessionStorage.setItem('hsverify.sessionEndpoint',state.endpoint);sessionStorage.setItem(SESSION_TOKEN,state.token);sessionStorage.setItem(SESSION_PROFILE,JSON.stringify(state.profile));
      if(state.expiresAt)sessionStorage.setItem(SESSION_EXPIRES_AT,state.expiresAt);
      state.serverConfig={profile:state.profile};applyRoleUI();state.dataLoaded=false;state.all=[];state.filtered=[];renderAll();switchView('work');void loadData();toast('เข้าสู่ระบบแล้ว: '+state.profile.displayName);if(typeof HSUsageUI!=='undefined')HSUsageUI.user();
    } catch(error){clearSession();applyRoleUI();throw error;}
  }

  async function loginManagerCredentials({username,password}) {
    const endpoint=state.endpoint.trim().replace(/\/$/,'');
    if(!endpoint)throw new Error('ยังไม่ได้เชื่อมระบบกลาง กรุณาติดต่อผู้ติดตั้ง');
    if(!username?.trim()||!password)throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    const parsed=new URL(endpoint);
    if(!(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname))))throw new Error('URL ของ API ต้องใช้ HTTPS');
    clearSession();saveEndpoint(endpoint);
    try{
      const result=await api('login',{username,password});
      const role=normalizedRole(result?.profile?.role);
      if(!result?.token||!result?.csrf||!['admin','super_admin'].includes(role))throw new Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
      state.csrf=result.csrf;state.authValidated=true;state.token=result.token;state.profile={...result.profile,role};state.expiresAt=result.expiresAt||'';
      sessionStorage.setItem('hsverify.csrf',state.csrf);sessionStorage.setItem('hsverify.sessionEndpoint',state.endpoint);sessionStorage.setItem(SESSION_TOKEN,state.token);sessionStorage.setItem(SESSION_PROFILE,JSON.stringify(state.profile));
      if(state.expiresAt)sessionStorage.setItem(SESSION_EXPIRES_AT,state.expiresAt);
      state.serverConfig={profile:state.profile};applyRoleUI();state.all=[];state.filtered=[];renderAll();state.dataLoaded=false;
      switchView('admin');void loadData();toast('เข้าสู่ระบบแล้ว: '+state.profile.displayName);if(typeof HSUsageUI!=='undefined')HSUsageUI.user();
      return state.profile;
    }catch(error){clearSession();applyRoleUI();throw error;}
  }

  async function loginAdmin(event){
    event.preventDefault();dom.loginButton.disabled=true;
    try{await loginManagerCredentials({username:dom.loginUsername.value.trim(),password:dom.loginPassword.value});dom.loginUsername.value='';setMessage(dom.loginMessage,'เข้าสู่ระบบสำเร็จ','success');}
    catch(error){setMessage(dom.loginMessage,friendlyError(error),'error');}
    finally{dom.loginPassword.value='';dom.loginButton.disabled=false;}
  }

  async function logoutAdmin() {
    dom.logoutButton.disabled=true;
    try { if(state.token && state.endpoint)await api('logout',{}); }
    catch(error){toast(`เซิร์ฟเวอร์ออกจากระบบไม่สำเร็จ แต่ล้างข้อมูลในแท็บนี้แล้ว: ${friendlyError(error)}`,true);}
    finally {
      clearSession();state.serverConfig=null;state.importCandidate=null;applyRoleUI();dom.logoutButton.disabled=false;
      if(state.endpoint){state.all=[];state.filtered=[];renderAll();if(nationalMode)await loadData();}
      toast('ออกจากระบบแล้ว');
    }
  }

  function siteSettingsAllowed(){return Boolean(state.authValidated&&state.token&&!sessionExpired()&&state.profile?.role==='super_admin');}
  function initSiteSettings(){
    if(typeof HSSiteSettings==='undefined')return;
    const apply=value=>{for(const [key,prefix] of [['risk','risk'],['hub','hub']]){const item=value[key],link=$(prefix+'NavLink');if(link){link.textContent=item.label+' ↗';link.href=item.url;}$(prefix+'LinkLabel').value=item.label;$(prefix+'LinkUrl').value=item.url;}};
    apply(HSSiteSettings.read(localStorage));
    $('saveNavigationButton').onclick=()=>{try{const value=HSSiteSettings.save(localStorage,{risk:{label:$('riskLinkLabel').value,url:$('riskLinkUrl').value},hub:{label:$('hubLinkLabel').value,url:$('hubLinkUrl').value}},siteSettingsAllowed());apply(value);setMessage($('navigationSettingsMessage'),'บันทึกชื่อและลิงก์บนเบราว์เซอร์เครื่องนี้แล้ว','success');}catch(error){setMessage($('navigationSettingsMessage'),friendlyError(error),'error');}};
    $('applyEndpointButton').onclick=()=>connectServer(true);
  }
  async function connectServer(save=false) {
    // Event listeners pass a MouseEvent; only explicit true commits the new endpoint.
    save=save===true;
    if(!siteSettingsAllowed())return setMessage(dom.connectionMessage,'เฉพาะ Super Admin เท่านั้น','error');
    const candidate=dom.apiEndpoint.value.trim(),original=state.endpoint,token=state.token;
    dom.connectButton.disabled=true;$('applyEndpointButton').disabled=true;setMessage(dom.connectionMessage,'กำลังทดสอบ URL ที่ระบุ…');
    try{
      const endpoint=HSSiteSettings.url(candidate,true),policy=await HSSiteSettings.probe(endpoint);
      if(!siteSettingsAllowed()||state.token!==token||state.endpoint!==original)throw Error('บัญชีหรือปลายทางเปลี่ยนระหว่างทดสอบ กรุณาลองใหม่');
      dom.connectionDot.className='connection-dot online';
      if(save&&endpoint!==original){
        if(state.busy||state.importCandidate||dom.verifyDialog?.open)throw Error('กรุณาปิดงานที่กำลังทำก่อนเปลี่ยนปลายทาง');
        if((await getJobs()).length)throw Error('มีงานรอส่งในเครื่อง กรุณาส่งงานให้ครบก่อนเปลี่ยน API');
        if(!siteSettingsAllowed()||state.token!==token||state.endpoint!==original)throw Error('บัญชีเปลี่ยน กรุณาทดสอบใหม่');
        // Never transfer the old token/CSRF to a new server.
        localStorage.setItem(STORE_ENDPOINT,endpoint);clearSession();state.endpoint=endpoint;state.serverConfig=null;state.all=[];state.filtered=[];state.loadRevision=(state.loadRevision||0)+1;state.dataLoaded=false;state.boundaryHS=null;dom.apiEndpoint.value=endpoint;applyRoleUI();renderAll();HSRegistration.openAccess('manager');toast('เปลี่ยน API แล้ว กรุณาเข้าสู่ระบบปลายทางใหม่');
      }else setMessage(dom.connectionMessage,'เชื่อมต่อ API สำเร็จ · ประกาศ '+policy.version+(save?' · ใช้ URL นี้อยู่แล้ว':''),'success');
    }catch(error){dom.connectionDot.className='connection-dot offline';setMessage(dom.connectionMessage,friendlyError(error),'error');}
    finally{dom.connectButton.disabled=!siteSettingsAllowed();$('applyEndpointButton').disabled=!siteSettingsAllowed();}
  }

  function applyConfigToForm(config) {
    if (!config) return;
    applyRoleUI();
    const admin = config.admin || config;
    dom.sheetId.value = admin.sourceSpreadsheetId || '';
    dom.sourceSheet.value = admin.sourceSheet || 'hsPlant2026';
    dom.driveId.value = admin.photoFolderId || '';
  }

  async function saveServerConfig() {
    if (!state.endpoint || normalizedRole(state.profile?.role)!=='super_admin') return setMessage(dom.configMessage,'เฉพาะ Super Admin เท่านั้นที่บันทึกค่านี้ได้','error');
    dom.saveConfigButton.disabled = true; setMessage(dom.configMessage,'กำลังบันทึก…');
    try {
      const config = await api('setConfig',{ sourceSpreadsheetUrl:dom.sheetId.value.trim().startsWith('http')?dom.sheetId.value.trim():undefined,sourceSpreadsheetId:dom.sheetId.value.trim().startsWith('http')?undefined:dom.sheetId.value.trim(),sourceSheet:dom.sourceSheet.value.trim() || 'hsPlant2026',photoFolderId:dom.driveId.value.trim() },uuid());
      state.serverConfig = config; applyConfigToForm(config); setMessage(dom.configMessage,'เซิร์ฟเวอร์บันทึกค่าแล้ว','success');
    } catch (error) { setMessage(dom.configMessage,friendlyError(error),'error'); }
    finally { dom.saveConfigButton.disabled = false; }
  }

  async function runAdminAction(action,button) {
    const role=normalizedRole(state.profile?.role);
    if(!['admin','super_admin'].includes(role))return applyRoleUI();
    if(action==='print'){openSummaryReport();return;}
    if(action==='sync' && role!=='super_admin'){dom.adminResult.textContent='เฉพาะ Super Admin เท่านั้นที่ซิงก์แหล่งข้อมูลได้';return;}
    if (!state.endpoint&&!previewMode) { dom.adminResult.textContent = 'กรุณาเข้าสู่ระบบก่อน'; return; }
    if(action==='export'&&dom.startMonthFilter){const rangeError=HSPeriod.error(dom.startMonthFilter.value,dom.endMonthFilter.value);if(rangeError){dom.adminResult.textContent=rangeError;return;}}
    const apiAction = { sync:'syncSource',qa:'qa',export:'export' }[action];
    button.disabled = true; dom.adminResult.textContent = 'กำลังทำงาน…';
    try {
      const data = await api(apiAction,action === 'export' ? { dataset:'verifications',filters:{...(dom.startMonthFilter?.value&&dom.endMonthFilter?.value?{startMonth:dom.startMonthFilter.value,endMonth:dom.endMonthFilter.value}:{}),provinceCode:nationalMode?HSNationUI.selectedProvinceCode:undefined,district:dom.districtFilter.value,tambon:dom.tambonFilter.value,village:dom.villageFilter.value,plantType:dom.cropFilter.value,status:dom.statusFilter.value,result:dom.resultFilter.value,search:dom.searchFilter.value} } : {},action==='sync' ? uuid() : undefined);
      if (action === 'export') downloadServerExport(data);
      dom.adminResult.textContent = `${new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · สำเร็จ\n${action === 'export' ? `ดาวน์โหลด ${Number(data?.rowCount || 0).toLocaleString('th-TH')} แถวแล้ว` : formatAdminResult(data)}`;
      if (action === 'sync') await loadData();
    } catch (error) { dom.adminResult.textContent = `${new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · ไม่สำเร็จ\n${friendlyError(error)}`; }
    finally { applyRoleUI(); }
  }

  function formatAdminResult(data) {
    if (data == null) return 'เซิร์ฟเวอร์ไม่ได้ส่งรายละเอียดเพิ่มเติม';
    if (typeof data === 'string') return data;
    return Object.entries(data).filter(([,v]) => typeof v !== 'object').map(([k,v]) => `${k}: ${v}`).join('\n') || 'ดำเนินการเรียบร้อย';
  }

  function exportLocalCsv() {
    const headers = ['hs_id','acquired_at','district','tambon','village','land_type','plant_type','latitude','longitude','status','result','notes','action','verified_at'];
    const cell = value => `"${String(value ?? '').replace(/"/g,'""')}"`;
    const rows = state.filtered.map(item => {
      const v = item.verification || {};
      return [item.hsId,item.acquiredAt,item.district,item.tambon,item.village,item.landType,item.plantType,item.latitude,item.longitude,item.status,v.result,v.notes,v.action,v.verifiedAt].map(cell).join(',');
    });
    const blob = new Blob(['\ufeff',headers.join(','),'\r\n',rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `hs-verification-${new Date().toISOString().slice(0,10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href),1000);
    dom.adminResult.textContent = `${new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · ส่งออกข้อมูลตัวอย่างในเครื่อง ${rows.length.toLocaleString('th-TH')} แถวแล้ว (ไม่ใช่ข้อมูลคลาวด์)`;
  }

  function downloadServerExport(data) {
    if (!data?.base64) throw new Error('เซิร์ฟเวอร์ไม่ได้ส่งไฟล์ส่งออก');
    const binary = atob(data.base64), bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes],{type:data.mimeType || 'text/csv;charset=utf-8'});
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = data.fileName || `hs-verification-${new Date().toISOString().slice(0,10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href),1000);
  }

  function setBusy(busy) { state.busy = busy; dom.confirmSubmit.disabled = busy; dom.saveDraftButton.disabled = busy; dom.reviewSubmitButton.disabled = busy; }
  function setLoading(loading) { dom.hotspotList.innerHTML = loading ? '<div class="empty-state">กำลังโหลดข้อมูล…</div>' : dom.hotspotList.innerHTML; }
  function setMessage(element,text,type='') { element.textContent = text; element.className = `form-message ${type}`; }
  function toast(message,error=false) { const t=document.createElement('div');t.className=`toast ${error?'error':''}`;t.textContent=message;dom.toastRegion.append(t);setTimeout(()=>t.remove(),4200); }
  function friendlyError(error) { return error?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'; }
  function normalizedRole(role) { const value=String(role || '').toLowerCase().replace(/[\s-]+/g,'_');return value==='superadmin'? 'super_admin' : value; }
  function readSessionProfile() { try{return JSON.parse(sessionStorage.getItem(SESSION_PROFILE) || 'null');}catch(_){return null;} }
  function sessionExpired() { if(!state.expiresAt)return false;const expires=new Date(state.expiresAt).getTime();return Number.isFinite(expires) && expires<=Date.now(); }
  function clearSession() {
    if(typeof HSDataCache!=='undefined')HSDataCache.clear();
    state.csrf='';sessionStorage.removeItem('hsverify.csrf');if(nationalMode)HSNationUI.invalidate();
    state.authValidated=false;state.token='';state.profile=null;state.expiresAt='';
    sessionStorage.removeItem(SESSION_TOKEN);sessionStorage.removeItem(SESSION_PROFILE);sessionStorage.removeItem(SESSION_EXPIRES_AT);sessionStorage.removeItem('hsverify.reportSnapshot');
  }
  function unique(values) { return [...new Set(values.filter(v => v !== '' && v != null))]; }
  function locale(a,b) { return String(a).localeCompare(String(b),'th'); }
  function esc(value) { const d=document.createElement('div');d.textContent=String(value??'');return d.innerHTML; }
  function cssEscape(value) { return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-z0-9_-]/gi,''); }
  function formatDate(value) { if (!value) return 'ไม่ระบุวันที่'; const d=new Date(value); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'}); }
  function formatDateTime(value) { const d=new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}); }
  function inspectorLabel() { const p=state.serverConfig?.profile; return p?.displayName || p?.inspectorName || p?.name || p?.email || p?.id || (state.endpoint ? 'บัญชีผู้ตรวจจากเซิร์ฟเวอร์' : 'ผู้ตรวจตัวอย่างในเครื่อง'); }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16)); }
  function debounce(fn,ms) { let timer; return (...args) => { clearTimeout(timer);timer=setTimeout(()=>fn(...args),ms); }; }
  function haversine(aLat,aLng,bLat,bLng) { const r=6371000,toRad=x=>x*Math.PI/180,dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);const a=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;return 2*r*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }

  function openDb() {
    return new Promise((resolve,reject) => { const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(DB_STORE,{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); });
  }
  async function dbOp(mode,operation) { const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,mode),store=tx.objectStore(DB_STORE),request=operation(store);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();}); }
  function putJob(job) { return dbOp('readwrite',store=>store.put(job)); }
  function getJobs() { return dbOp('readonly',store=>store.getAll()); }
  function deleteJob(id) { return dbOp('readwrite',store=>store.delete(id)); }
  async function refreshOutboxCount() { try { const count=(await getJobs()).length;dom.retryCount.textContent=count;dom.retryButton.hidden=!count; } catch (_) { dom.retryButton.hidden=true; } }
})();
