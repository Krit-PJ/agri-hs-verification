(() => {
  'use strict';

  const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const RESULT_LABELS = { burned:'พบการเผา', not_burned:'ไม่พบการเผา', not_found:'ไม่พบจุด', needs_review:'ต้องตรวจซ้ำ' };
  const STATUS_LABELS = { pending:'รอตรวจ', draft:'งานร่าง', verified:'ตรวจแล้ว' };
  const COLORS = { pending:'#e3651d', draft:'#2677ad', burned:'#cb2c29', not_burned:'#18845d', not_found:'#687976', needs_review:'#7a5ab5' };
  const STORE_ENDPOINT = 'hsverify.apiEndpoint';
  const previewMode=typeof HSPreview!=='undefined'&&HSPreview.enabled;
  const STORE_DEMO = previewMode?'hsverify.preview.results':'hsverify.demoResults';
  const SESSION_TOKEN = 'hsverify.sessionToken';
  const SESSION_PROFILE = 'hsverify.sessionProfile';
  const SESSION_EXPIRES_AT = 'hsverify.sessionExpiresAt';
  const DB_NAME = 'hsverify-outbox';
  const DB_STORE = 'jobs';
  const PAGE_SIZE = 80;
  const nationalMode=typeof HSNationUI!=='undefined';
  const scopedRows=()=>nationalMode?HSNationUI.filter(state.all):state.all;

  const $ = id => document.getElementById(id);
  const dom = {};
  const state = {
    all: [], filtered: [], visible: PAGE_SIZE, selected: null, map: null,
    markers: null, mapFailed: false, photos: [], location: null,
    endpoint: previewMode?'':globalThis.HS_SITE_CONFIG?.apiEndpoint || localStorage.getItem(STORE_ENDPOINT) || '', token: sessionStorage.getItem(SESSION_TOKEN) || '',
    profile: readSessionProfile(), expiresAt:sessionStorage.getItem(SESSION_EXPIRES_AT) || '',
    csrf:sessionStorage.getItem('hsverify.csrf')||'',authValidated:false, serverConfig: null, busy: false, dataLoaded:false, importCandidate:null, sourceName:"", latestYear:null
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    ['refreshDataButton','dataSourceLabel','selectionContext','summaryDistrict','summaryYear','summaryReset','printReportButton','roleLabel','adminLoginGate','adminLoginForm','loginUsername','loginPassword','loginButton','loginMessage','adminProtected','adminDisplayName','adminRoleDescription','logoutButton','serverSettingsCard','workspaceSettingsCard','hsImportFile','importDatasetYear','importPreview','confirmFileImport','importMessage','importPhotoInput','modeBadge','demoNotice','liveError','yearFilter','monthFilter','districtFilter','tambonFilter','villageFilter','cropFilter','statusFilter','resultFilter','searchFilter','resetFilters','allHotspotsButton','resultCount','selectedCount','hotspotList','loadMore','mapLayout','mapFallback','summaryStats','summaryLevel','summaryBody','verifyDialog','verifyForm','verifyTitle','selectedMeta','navigateLink','locateButton','locationPanel','noGps','noGpsReasonWrap','noGpsReason','photoInput','photoPreview','noteInput','noteCount','actionInput','verifyMessage','saveDraftButton','reviewSubmitButton','confirmDialog','confirmSummary','confirmSubmit','cancelConfirm','closeDialog','retryButton','retryCount','toastRegion','menuButton','mainNav','apiEndpoint','connectButton','connectionDot','connectionMessage','sheetId','sourceSheet','driveId','saveConfigButton','configMessage','adminResult'].forEach(id => dom[id] = $(id));
    if (sessionExpired()) clearSession();
    dom.apiEndpoint.value = state.endpoint;
    bindEvents();
    if(nationalMode){HSNationUI.init({api,rows:()=>state.all,profile:()=>state.profile,valid:()=>Boolean(state.authValidated&&state.token&&!sessionExpired()),reload:loadData,change:()=>{dom.districtFilter.value='';dom.tambonFilter.value='';dom.villageFilter.value='';populateFilters();applyFilters();}});setInterval(()=>{if(state.token&&sessionExpired()){clearSession();state.all=[];state.filtered=[];applyRoleUI();renderAll();loadData();}},15000);}
    HSField.init();
    HSTeam.init({preview:previewMode,api,getEndpoint:()=>previewMode?'local-preview':state.endpoint,canEdit:()=>Boolean(state.authValidated && state.token && !sessionExpired() && ['admin','super_admin'].includes(state.profile?.role))});
    if(previewMode)HSPreview.connect({filtered:()=>state.filtered,rows:()=>state.all,profile:()=>state.profile,role:p=>{state.profile=p;state.token=p.role==='public'?'':'LOCAL-PREVIEW-NO-NETWORK';state.authValidated=p.role!=='public';state.expiresAt='';applyRoleUI();if(state.dataLoaded){populateFilters();applyFilters();}}});
    updateModeUI();
    initMap();
    await loadData();
    await refreshOutboxCount();
  }

  function bindEvents() {
    document.querySelectorAll('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    dom.menuButton.addEventListener('click', () => {
      const open = dom.mainNav.classList.toggle('open');
      dom.menuButton.setAttribute('aria-expanded', String(open));
    });
    document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => setLayout(button.dataset.layout)));
    ['yearFilter','monthFilter','districtFilter','tambonFilter','villageFilter','cropFilter','statusFilter','resultFilter'].forEach(id => dom[id].addEventListener('change', () => {
      if (id === 'districtFilter') repopulateLocationFilters('district');
      if (id === 'tambonFilter') repopulateLocationFilters('tambon');
      applyFilters();
    }));
    dom.searchFilter.addEventListener('input', debounce(applyFilters, 180));
    dom.resetFilters.addEventListener('click', resetFilters);
    dom.allHotspotsButton.addEventListener('click', resetFilters);
    dom.hotspotList.addEventListener('click', event => { const card=event.target.closest('[data-hs-id]'); if(!card)return; const item=state.all.find(x=>x.hsId===card.dataset.hsId);if(item){try{openVerify(item);}catch(error){console.error(error);toast('เปิดฟอร์มไม่สำเร็จ: '+friendlyError(error),true);}} });
    dom.loadMore.addEventListener('click', () => { state.visible += PAGE_SIZE; renderList(); });
    dom.summaryLevel.addEventListener('change', renderSummary);
    dom.summaryDistrict.addEventListener('change',()=>{if(nationalMode){dom.districtFilter.value=dom.summaryDistrict.value;repopulateLocationFilters('district');applyFilters();}else renderSummary();}); dom.summaryYear.addEventListener('change',()=>{if(nationalMode){dom.yearFilter.value=dom.summaryYear.value;applyFilters();}else renderSummary();});
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

  function switchView(name) {
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
    dom.connectionDot.className = `connection-dot ${live ? 'offline' : 'offline'}`;
  }

  function initMap() {
    if (!window.L) return showMapFallback('โหลดระบบแผนที่ไม่สำเร็จ');
    try {
      state.map = L.map('map', { zoomControl:true }).setView([16.4, 99.52], 9);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
      }).addTo(state.map);
      state.markers = L.layerGroup().addTo(state.map);
    } catch (error) { showMapFallback('เบราว์เซอร์นี้เปิดแผนที่ไม่ได้'); }
  }

  function showMapFallback(message) {
    state.mapFailed = true; dom.mapFallback.hidden = false;
    dom.mapFallback.querySelector('strong').textContent = message;
  }

  async function loadData() {
    setLoading(true);
    dom.liveError.hidden = true;
    try {
      if (state.endpoint) {
        const data = await api('bootstrap', { filters:{} });
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
      if (!state.dataLoaded) { dom.yearFilter.value=String(state.latestYear); dom.summaryYear.value=String(state.latestYear); }
      else { Object.entries({yearFilter:oldFilters.year,monthFilter:oldFilters.month,districtFilter:oldFilters.district,cropFilter:oldFilters.crop,statusFilter:oldFilters.status,resultFilter:oldFilters.result,searchFilter:oldFilters.search}).forEach(([id,v])=>{dom[id].value=v;});repopulateLocationFilters('district');dom.tambonFilter.value=oldFilters.tambon;repopulateLocationFilters('tambon');dom.villageFilter.value=oldFilters.village; }
      state.dataLoaded=true; applyFilters(); applyRoleUI();
      const times=state.all.map(x=>x.acquiredAt).filter(Boolean).sort();
      dom.dataSourceLabel.textContent=`${state.endpoint ? 'ฐาน HS กลางที่เชื่อมกับระบบความเสี่ยง' : state.sourceName} · ${state.all.length.toLocaleString('th-TH')} จุด · ล่าสุด ${times.length?formatDate(times.at(-1)):'ไม่ระบุ'} · อัปเดต ${new Date().toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok'})}`;
    } catch (error) {
      state.all = []; state.filtered = []; renderAll();
      const prefix = state.endpoint ? 'เชื่อมระบบกลางไม่สำเร็จ ข้อมูลตัวอย่างไม่ได้ถูกนำมาใช้: ' : 'เปิดข้อมูลในเครื่องไม่สำเร็จ: ';
      dom.liveError.textContent = prefix + friendlyError(error); dom.liveError.hidden = false;
    } finally { setLoading(false); }
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
    fillSelect(dom.yearFilter, unique(state.all.map(x => x.datasetYearBe)).sort((a,b) => b-a), 'ทุกปี');
    fillSelect(dom.monthFilter, unique(state.all.map(x => x.month)).sort((a,b) => a-b), 'ทุกเดือน', x => MONTHS[x-1] || x);
    fillSelect(dom.districtFilter, unique(scopedRows().map(x => x.district)).sort(locale), 'ทุกอำเภอ');
    fillSelect(dom.cropFilter, unique(state.all.map(x => x.plantType)).filter(x => x !== 'ไม่ระบุ').sort(locale), 'ทุกชนิดพืช');
    fillSelect(dom.summaryYear,unique(state.all.map(x=>x.datasetYearBe)).sort((a,b)=>b-a),'ทุกปีชุดข้อมูล');
    fillSelect(dom.summaryDistrict,unique(scopedRows().map(x=>x.district)).sort(locale),'ทั้งจังหวัด · ทุกอำเภอ');
    repopulateLocationFilters('district');
    if(nationalMode){const overview=!HSNationUI.selectedProvinceCode;[dom.districtFilter,dom.tambonFilter,dom.villageFilter,dom.summaryDistrict].forEach(e=>{e.disabled=overview;if(overview)e.value='';});}
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
      year:dom.yearFilter.value, month:dom.monthFilter.value, district:dom.districtFilter.value,
      tambon:dom.tambonFilter.value, village:dom.villageFilter.value, crop:dom.cropFilter.value,
      status:dom.statusFilter.value, result:dom.resultFilter.value, search:dom.searchFilter.value.trim().toLocaleLowerCase('th')
    };
  }

  function applyFilters() {
    const f = filters(); state.visible = PAGE_SIZE;
    dom.allHotspotsButton.setAttribute('aria-pressed', String(!Object.values(f).some(Boolean)));
    state.filtered = scopedRows().filter(x => {
      const result = x.verification?.result || x.result || '';
      const haystack = `${x.hsId} ${x.district} ${x.tambon} ${x.village} ${x.plantType} ${x.landType}`.toLocaleLowerCase('th');
      return (!f.year || String(x.datasetYearBe) === f.year) && (!f.month || String(x.month) === f.month) &&
        (!f.district || x.district === f.district) && (!f.tambon || x.tambon === f.tambon) && (!f.village || x.village === f.village) &&
        (!f.crop || x.plantType === f.crop) && (!f.status || x.status === f.status) &&
        (!f.result || result === f.result) && (!f.search || haystack.includes(f.search));
    });
    if(nationalMode){dom.summaryDistrict.value=dom.districtFilter.value;dom.summaryYear.value=dom.yearFilter.value;}
    renderAll();
  }

  function resetFilters() {
    ['yearFilter','monthFilter','districtFilter','tambonFilter','villageFilter','cropFilter','statusFilter','resultFilter','searchFilter'].forEach(id => dom[id].value = '');
    dom.selectionContext.hidden=true; repopulateLocationFilters('district'); applyFilters();
  }

  function renderAll() { dom.resultCount.textContent = state.filtered.length.toLocaleString('th-TH'); renderList(); renderMarkers(); renderSummary(); }

  function renderList() {
    const items = state.filtered.slice(0,state.visible);
    if (!items.length) dom.hotspotList.innerHTML = nationalMode&&!scopedRows().length ? '<div class="empty-state"><strong>ยังไม่มีข้อมูล HS ที่อ่านได้ในจังหวัดนี้</strong><br>จังหวัดนี้อาจยังไม่นำเข้าหรือยังไม่เผยแพร่ · ไม่แสดงจุดจากจังหวัดอื่นแทน</div>' : '<div class="empty-state"><strong>ไม่พบจุดที่ตรงกับตัวกรอง</strong><br>ลองล้างหรือเปลี่ยนตัวกรอง</div>';
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
      const result = item.verification?.result; const color = COLORS[result] || COLORS[item.status] || COLORS.pending;
      const marker = L.circleMarker([item.latitude,item.longitude], { radius:7,weight:2,color:'#fff',fillColor:color,fillOpacity:.95 });
      marker.bindTooltip(`<strong>${esc(item.hsId)}</strong><br>${esc(areaLabel(item))}`);
      marker.on('click', () => openVerify(item)); marker.addTo(state.markers); bounds.push([item.latitude,item.longitude]);
    });
    if (bounds.length) state.map.fitBounds(bounds, { padding:[25,25],maxZoom:14 });
  }

  function renderSummary() {
    if (!dom.summaryStats) return;
    if(nationalMode){const hint=document.getElementById('summaryScopeHint');if(hint)hint.textContent=[HSNationUI.scope(),'ปีชุดข้อมูล '+(dom.yearFilter.value||'ทุกปี'),dom.monthFilter.value?'เดือน '+MONTHS[Number(dom.monthFilter.value)-1]:'ทุกเดือน',dom.districtFilter.value,dom.tambonFilter.value,dom.villageFilter.value,dom.cropFilter.value,dom.statusFilter.value,dom.resultFilter.value].filter(Boolean).join(' · ');}
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
    dom.summaryBody.innerHTML = rows.length ? rows.map(([name,row]) => { const pct = row.total ? Math.round(row.verified/row.total*100) : 0; return `<tr><td><strong>${esc(name)}</strong></td><td>${row.total.toLocaleString('th-TH')}</td><td>${row.verified.toLocaleString('th-TH')}</td><td>${row.burned.toLocaleString('th-TH')}</td><td><span class="progress"><i style="width:${pct}%"></i></span>${pct}%</td></tr>`; }).join('') : '<tr><td colspan="5">ไม่มีข้อมูล</td></tr>';
  }

  function openSummaryReport() {
    if (!window.HSReport) return toast('เปิดตัวสร้างรายงานไม่สำเร็จ กรุณาโหลดหน้าใหม่',true);
    const rows=nationalMode?state.filtered:state.all.filter(item=>(!dom.summaryDistrict.value || item.district===dom.summaryDistrict.value)&&(!dom.summaryYear.value || String(item.datasetYearBe)===dom.summaryYear.value));
    try {
      HSReport.openReport({
        rows,
        filters:{district:dom.summaryDistrict.value,year:dom.summaryYear.value,scope:nationalMode?[HSNationUI.scope(),dom.tambonFilter.value,dom.villageFilter.value].filter(Boolean).join(' · '):'',provinceCode:nationalMode?HSNationUI.selectedProvinceCode:'',month:dom.monthFilter.value},
        sourceLabel:state.endpoint ? 'ฐานข้อมูล HS กลาง ณ เวลาที่เปิดรายงาน' : (state.sourceName || 'ชุดข้อมูลอ้างอิงในเครื่อง'),
        generatedAt:new Date().toISOString(),
        logoDoae:new URL('assets/logo-doae.png',location.href).href,
        logoKpp:new URL('assets/logo-kpp.png',location.href).href,
        fontRegular:new URL('assets/fonts/Sarabun-Regular.ttf',location.href).href,
        fontBold:new URL('assets/fonts/Sarabun-Bold.ttf',location.href).href
      });
    } catch(error){toast(friendlyError(error),true);}
  }

  function openVerify(item) {
    if(nationalMode&&(!state.authValidated||!state.token||sessionExpired()))return toast('การดูข้อมูลไม่ต้องเข้าสู่ระบบ การบันทึกผลต้องเข้าสู่ระบบก่อน',true);
    if(nationalMode)HSNationUI.selectProvince(item.provinceCode);
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
    HSField.reset(state.selected,state.serverConfig?.profile); renderLocation(); renderPhotos(); dom.verifyDialog.showModal();
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
      await api('uploadPhoto', { verificationId,hsId:job.payload.hsId,fileName:photo.fileName,mimeType:photo.mimeType,base64:photo.base64,capturedAt:photo.capturedAt,source:photo.source }, photo.requestId);
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
    dom.yearFilter.value=String(item.datasetYearBe);dom.monthFilter.value=String(item.month);
    dom.districtFilter.value=item.district;repopulateLocationFilters('district');dom.tambonFilter.value=item.tambon;repopulateLocationFilters('tambon');dom.villageFilter.value=item.village;
    dom.cropFilter.value=item.plantType;dom.statusFilter.value=item.status;dom.resultFilter.value='';dom.searchFilter.value='';
    dom.selectionContext.textContent=`เติมตัวกรองจาก HS ${item.hsId} แล้ว · ${areaLabel(item)} · กดล้างตัวกรองเพื่อดูพื้นที่อื่น`;dom.selectionContext.hidden=false;applyFilters();
  }

  function applyRoleUI() {
    if(nationalMode){HSNationUI.sync();document.querySelectorAll('#workspaceSettingsCard,#fileImportCard,[data-admin-action=sync]').forEach(e=>e.style.display='none');}
    const profile=state.profile || state.serverConfig?.profile;
    const role=normalizedRole(profile?.role);
    const authenticated=Boolean(state.authValidated && state.token && profile && !sessionExpired());
    const canManage=authenticated && ['admin','super_admin'].includes(role);
    const canConfigure=authenticated && role==='super_admin';
    if(typeof HSTeam!=='undefined')HSTeam.updateAccess();
    dom.adminLoginGate.hidden=canManage;
    dom.adminProtected.hidden=!canManage;
    dom.roleLabel.textContent=canManage ? (role==='super_admin' ? 'Super Admin · จัดการแหล่งข้อมูลและระบบ' : 'Admin · ตรวจ QA / ส่งออก / รายงาน') : 'ยังไม่ได้เข้าสู่ระบบ';
    dom.adminDisplayName.textContent=profile?.displayName || profile?.username || 'ผู้ดูแลระบบ';
    dom.adminRoleDescription.textContent=role==='super_admin' ? 'Super Admin' : role==='admin' ? 'Admin' : '';
    document.querySelectorAll('[data-super-admin-only]').forEach(element=>{element.hidden=!canConfigure;});
    [dom.saveConfigButton,dom.hsImportFile,dom.importDatasetYear,dom.sheetId,dom.sourceSheet,dom.driveId].forEach(element=>{element.disabled=!canConfigure;});
    document.querySelectorAll('[data-admin-action]').forEach(button=>{button.disabled=!canManage || (button.dataset.adminAction==='sync' && !canConfigure);});
    dom.confirmFileImport.disabled=!canConfigure || !state.importCandidate;
    if (!canManage && profile && authenticated) setMessage(dom.loginMessage,'บัญชีนี้ไม่มีสิทธิ์เปิดพื้นที่ผู้ดูแล','error');
  }

  async function refreshSharedData() {
    dom.refreshDataButton.disabled=true;
    try { dom.yearFilter.value='';state.dataLoaded=false;await loadData(); if(dom.liveError.hidden) toast('อ่านข้อมูลร่วมล่าสุดแล้ว'); }
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

  async function api(action,payload={},requestId) {
    if(previewMode)return HSPreview.api(action,payload,requestId);
    if (!state.endpoint) throw new Error('ยังไม่ได้ตั้งค่า URL ของ API');
    const envelope = { action,payload,token:state.token || undefined,csrf:state.csrf || undefined };
    if (requestId) envelope.requestId = requestId;
    let response;
    try { response = await fetch(state.endpoint,{ method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(envelope),redirect:'follow' }); }
    catch (_) { throw new Error('ติดต่อเซิร์ฟเวอร์ไม่ได้ โปรดตรวจอินเทอร์เน็ตและ URL'); }
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch (_) { throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (${response.status})`); }
    if (!response.ok || body.ok !== true) {
      const error = new Error(body?.error?.message || `เซิร์ฟเวอร์ปฏิเสธคำขอ (${response.status})`); error.code = body?.error?.code; error.details = body?.error?.details; if(['UNAUTHORIZED','PROVINCE_UNASSIGNED'].includes(error.code) && action!=='login'){if(error.code==='UNAUTHORIZED')clearSession();state.all=[];state.filtered=[];state.serverConfig=null;applyRoleUI();renderAll();} throw error;
    }
    if (requestId && body.requestId && body.requestId !== requestId) throw new Error('requestId ที่เซิร์ฟเวอร์ตอบกลับไม่ตรงกับคำขอ');
    return body.data;
  }

  function saveEndpoint(value) {
    value = String(value ?? state.endpoint).trim().replace(/\/$/,'');
    state.endpoint = value;
    if (value) localStorage.setItem(STORE_ENDPOINT,value); else localStorage.removeItem(STORE_ENDPOINT);
    dom.apiEndpoint.value=value;
    updateModeUI();
  }

  async function loginAdmin(event) {
    event.preventDefault();
    const endpoint=state.endpoint.trim().replace(/\/$/,'');
    const username=dom.loginUsername.value.trim();
    const password=dom.loginPassword.value;
    if(!endpoint)return setMessage(dom.loginMessage,'ยังไม่ได้เชื่อมระบบกลาง กรุณาให้ผู้ติดตั้งกำหนดปลายทางใน site-config.js ก่อนเปิดใช้บัญชี','error');
    if (!username || !password) return setMessage(dom.loginMessage,'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน','error');
    let parsed;try{parsed=new URL(endpoint);}catch(_){return setMessage(dom.loginMessage,'URL ของ API ไม่ถูกต้อง','error');}
    if(!(parsed.protocol==='https:' || (parsed.protocol==='http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))))return setMessage(dom.loginMessage,'URL ของ API ต้องใช้ HTTPS','error');
    clearSession();saveEndpoint(endpoint);dom.loginButton.disabled=true;setMessage(dom.loginMessage,'กำลังเข้าสู่ระบบ…');
    try {
      const result=await api('login',{username,password});
      const role=normalizedRole(result?.profile?.role);
      if(!result?.token || !result?.profile)throw new Error('เซิร์ฟเวอร์ไม่ได้ส่งข้อมูลเข้าสู่ระบบที่ครบถ้วน');
      state.csrf=result.csrf||'';sessionStorage.setItem('hsverify.csrf',state.csrf);state.authValidated=true;state.token=result.token;state.profile={...result.profile,role};state.expiresAt=result.expiresAt || '';
      if(!['admin','super_admin'].includes(role)){
        try{await api('logout',{});}catch(_){/* access is still cleared locally */}
        clearSession();throw new Error('บัญชีนี้ไม่มีสิทธิ์ Admin หรือ Super Admin');
      }
      sessionStorage.setItem(SESSION_TOKEN,state.token);sessionStorage.setItem(SESSION_PROFILE,JSON.stringify(state.profile));
      if(state.expiresAt)sessionStorage.setItem(SESSION_EXPIRES_AT,state.expiresAt);
      state.serverConfig={profile:state.profile};dom.loginUsername.value='';setMessage(dom.loginMessage,'เข้าสู่ระบบสำเร็จ','success');applyRoleUI();
      state.dataLoaded=false;await loadData();toast(`เข้าสู่ระบบในชื่อ ${state.profile.displayName || state.profile.username}`);
    } catch(error){clearSession();applyRoleUI();setMessage(dom.loginMessage,friendlyError(error),'error');}
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

  async function connectServer() {
    if (normalizedRole(state.profile?.role)!=='super_admin') return setMessage(dom.connectionMessage,'เฉพาะ Super Admin เท่านั้นที่ตรวจการเชื่อมต่อนี้ได้','error');
    dom.connectButton.disabled = true; setMessage(dom.connectionMessage,'กำลังตรวจสอบ…');
    try {
      const config = await api('getConfig',{}); state.serverConfig = {...config,profile:state.profile}; applyConfigToForm(state.serverConfig);
      dom.connectionDot.className = 'connection-dot online'; setMessage(dom.connectionMessage,previewMode?'โหมดทดสอบในเครื่อง · ไม่ได้เชื่อม Google จริง':'เชื่อมต่อสำเร็จ','success'); await loadData();
    } catch (error) { dom.connectionDot.className = 'connection-dot offline'; setMessage(dom.connectionMessage,friendlyError(error),'error'); }
    finally { dom.connectButton.disabled = false; }
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
    const apiAction = { sync:'syncSource',qa:'qa',export:'export' }[action];
    button.disabled = true; dom.adminResult.textContent = 'กำลังทำงาน…';
    try {
      const data = await api(apiAction,action === 'export' ? { dataset:'verifications',filters:{provinceCode:nationalMode?HSNationUI.selectedProvinceCode:undefined,year:dom.yearFilter.value,month:dom.monthFilter.value,district:dom.districtFilter.value,tambon:dom.tambonFilter.value,village:dom.villageFilter.value,plantType:dom.cropFilter.value,status:dom.statusFilter.value,result:dom.resultFilter.value,search:dom.searchFilter.value} } : {},action==='sync' ? uuid() : undefined);
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
