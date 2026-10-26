/* ระบบตรวจสอบจุดความร้อน v3 — ตัวควบคุมหน้าเว็บหลัก */
(() => {
  'use strict';
  const C = HSCore;
  const cfg = globalThis.HS_SITE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = C.escapeHtml;
  const PAGE = 80;
  const LAST_PROVINCE = 'hsverify.v3.province';
  const MAX_PHOTOS = 3;

  const state = {
    provinces: [], province: '', rows: [], filtered: [], visible: PAGE, source: '',
    map: null, markers: null, boundary: {}, fitPending: false,
    selected: null, record: null, existingPhotos: [], photos: [], location: null, busy: false
  };

  document.addEventListener('DOMContentLoaded', init);

  /* ---------------------------------------------------------------- เริ่มต้น */
  async function init() {
    if (cfg.riskMapUrl) $('riskNavLink').href = cfg.riskMapUrl;
    if (cfg.greenGainHubUrl) $('hubNavLink').href = cfg.greenGainHubUrl;
    bind();
    fillPersonCategories();
    initMap();
    HSAdmin.init({ provinces: () => state.provinces, province: () => state.province, onSession: sessionChanged, toast, reloadHotspots: () => loadProvince(state.province, true) });
    window.addEventListener('hs:session-expired', () => { toast('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่', true); sessionChanged(); });
    applySessionUI();
    counter();
    await loadProvinces();
    refreshOutbox();
  }

  function bind() {
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('menuButton').addEventListener('click', () => { const open = !$('mainNav').classList.contains('open'); $('mainNav').classList.toggle('open', open); $('menuButton').setAttribute('aria-expanded', String(open)); });
    $('accessLoginNav').addEventListener('click', () => HSApi.user() ? logout() : HSAdmin.openAccess('phone'));
    $('provinceSelect').addEventListener('change', e => loadProvince(e.target.value));
    document.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => setLayout(b.dataset.layout)));
    ['districtFilter', 'tambonFilter', 'villageFilter', 'cropFilter', 'statusFilter', 'resultFilter', 'startMonth', 'endMonth'].forEach(id => $(id).addEventListener('change', () => {
      if (id === 'districtFilter') { $('tambonFilter').value = ''; $('villageFilter').value = ''; }
      if (id === 'tambonFilter') $('villageFilter').value = '';
      if (['districtFilter', 'tambonFilter', 'startMonth', 'endMonth'].includes(id)) fillLocationFilters();
      state.fitPending = ['districtFilter', 'tambonFilter', 'villageFilter'].includes(id);
      if (id === 'startMonth' || id === 'endMonth') $('summaryYear').value = '';
      applyFilters();
    }));
    let t; $('searchFilter').addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 180); });
    $('resetFilters').addEventListener('click', resetFilters);
    $('allHotspotsButton').addEventListener('click', resetFilters);
    $('resetPeriod').addEventListener('click', () => { setDefaultPeriod(); applyFilters(); });
    $('refreshDataButton').addEventListener('click', () => loadProvince(state.province, true));
    $('loadMore').addEventListener('click', () => { state.visible += PAGE; renderList(); });
    $('hotspotList').addEventListener('click', e => { const card = e.target.closest('[data-hs-id]'); if (card) openVerify(state.rows.find(r => r.hsId === card.dataset.hsId)); });
    $('summaryLevel').addEventListener('change', renderSummary);
    $('summaryYear').addEventListener('change', () => {
      const y = Number($('summaryYear').value);
      if (y) { const ce = y - 543; $('startMonth').value = pickMonth((ce - 1) + '-10', 'start'); $('endMonth').value = pickMonth(ce + '-09', 'end'); }
      else setDefaultPeriod();
      fillLocationFilters(); applyFilters();
    });
    $('printReportButton').addEventListener('click', printReport);
    $('exportSummaryButton').addEventListener('click', exportSummary);
    $('boundaryDistrictOn').addEventListener('change', () => drawBoundaries());
    $('boundarySubdistrictOn').addEventListener('change', () => drawBoundaries());
    $('boundaryFit').addEventListener('click', fitProvince);
    // ฟอร์มบันทึกผล
    $('closeDialog').addEventListener('click', closeVerify);
    $('verifyDialog').addEventListener('cancel', e => { e.preventDefault(); closeVerify(); });
    $('verifyForm').addEventListener('submit', e => { e.preventDefault(); review(); });
    $('saveDraftButton').addEventListener('click', () => submit('draft'));
    $('confirmSubmit').addEventListener('click', () => { $('confirmDialog').close(); submit('verified'); });
    $('cancelConfirm').addEventListener('click', () => $('confirmDialog').close());
    $('deleteVerificationButton').addEventListener('click', deleteRecord);
    $('locateButton').addEventListener('click', locate);
    $('noGps').addEventListener('change', () => { $('noGpsReasonWrap').hidden = !$('noGps').checked; if ($('noGps').checked) { state.location = null; renderLocation(); } else $('noGpsReason').value = ''; });
    $('personCategory').addEventListener('change', () => { $('personOtherWrap').hidden = $('personCategory').value !== 'อื่นๆ'; });
    $('observedMatches').addEventListener('change', () => { $('observedFields').hidden = $('observedMatches').value !== 'no'; });
    document.querySelectorAll('input[name=outcome]').forEach(r => r.addEventListener('change', () => { $('fireStateWrap').hidden = outcome() !== 'burned'; }));
    $('photoInput').addEventListener('change', addPhotos);
    $('importPhotoInput').addEventListener('change', addPhotos);
    $('photoPreview').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) { state.photos.splice(Number(b.dataset.remove), 1); renderPhotos(); } });
    $('existingPhotos').addEventListener('click', existingPhotoAction);
    $('noteInput').addEventListener('input', () => { $('noteCount').textContent = $('noteInput').value.length + '/500'; });
    $('retryButton').addEventListener('click', flushOutbox);
    window.addEventListener('online', () => { toast('กลับมาออนไลน์แล้ว'); flushOutbox(); });
  }

  /* ---------------------------------------------------------------- บัญชีผู้ใช้ */
  function applySessionUI() {
    const user = HSApi.user();
    $('headerIdentity').textContent = user ? user.name + ' · ' + C.ROLE_LABELS[user.role] : 'ผู้ใช้ทั่วไป';
    $('accessLoginNav').textContent = user ? 'ออกจากระบบ' : 'เข้าใช้งานระบบ';
    $('adminNav').hidden = !user;
    $('adminNav').textContent = user && C.can(user, 'manage') ? 'ผู้ดูแลระบบ' : 'บันทึกการใช้งานของฉัน';
    const live = HSApi.configured();
    $('modeBadge').className = 'mode-badge ' + (user ? 'live' : 'demo');
    $('modeBadge').textContent = user ? (C.ROLE_LABELS[user.role] + (user.prov && user.prov !== '*' ? ' · ' + (C.PROVINCES[user.prov] || '') : '')) : live ? 'ข้อมูลสาธารณะ' : 'อ่านอย่างเดียว';
    const notice = $('publicNotice');
    if (!live) { notice.hidden = false; notice.innerHTML = '<strong>อ่านจุด HS จาก Google Sheet ต้นทางโดยตรง</strong><span>ยังไม่ได้เชื่อม API ของฐานข้อมูลผลตรวจ จึงแสดงทุกจุดเป็น “รอตรวจ” และยังเข้าสู่ระบบไม่ได้</span>'; }
    else notice.hidden = true;
    const sel = $('provinceSelect');
    const locked = user && !C.can(user, 'chooseProvince');
    sel.disabled = Boolean(locked);
    if (locked && state.provinces.length && state.province !== user.prov) loadProvince(user.prov);
  }

  function sessionChanged() {
    applySessionUI();
    HSAdmin.render();
    if (state.province) loadProvince(state.province, true);
    if (!HSApi.user() && !$('adminView').hidden) switchView('work');
  }

  async function logout() {
    await HSApi.logout();
    toast('ออกจากระบบแล้ว');
    sessionChanged();
  }

  function counter() {
    if (!HSApi.configured()) return;
    let seen = false; try { seen = sessionStorage.getItem('hsverify.v3.hit') === '1'; sessionStorage.setItem('hsverify.v3.hit', '1'); } catch (_) {}
    HSApi.get(seen ? 'counter' : 'hit').then(d => {
      $('visitCounter').textContent = 'ผู้เข้าชมวันนี้ ' + d.counter.today.toLocaleString('th-TH') + ' · ทั้งหมด ' + d.counter.total.toLocaleString('th-TH');
    }).catch(() => {});
  }

  /* ---------------------------------------------------------------- จังหวัดและข้อมูล HS */
  async function loadProvinces() {
    const sel = $('provinceSelect');
    try {
      if (HSApi.configured()) state.provinces = (await HSApi.get('provinces')).provinces;
      else {
        const codes = await HSSheetSource.available(cfg.sourceSheetUrl, C.PROVINCES);
        state.provinces = codes.map(code => ({ code, name: C.PROVINCES[code] }));
      }
    } catch (err) {
      showError('อ่านรายชื่อจังหวัดไม่สำเร็จ: ' + err.message);
      state.provinces = [];
    }
    state.provinces.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    sel.innerHTML = '<option value="">— เลือกจังหวัด (' + state.provinces.length + ' จังหวัดที่มีข้อมูล HS) —</option>' +
      state.provinces.map(p => '<option value="' + esc(p.code) + '">' + esc(p.name) + (p.hsCount ? ' · ' + Number(p.hsCount).toLocaleString('th-TH') + ' จุด' : '') + '</option>').join('');
    HSAdmin.provincesLoaded();
    const user = HSApi.user();
    let code = user && !C.can(user, 'chooseProvince') ? user.prov : (new URLSearchParams(location.search).get('province') || '');
    if (!code) { try { code = localStorage.getItem(LAST_PROVINCE) || ''; } catch (_) {} }
    if (code && state.provinces.some(p => p.code === code)) await loadProvince(code);
    else renderAll();
  }

  async function loadProvince(code, force) {
    const user = HSApi.user();
    if (user && !C.can(user, 'chooseProvince') && code !== user.prov) code = user.prov;
    $('provinceSelect').value = code || '';
    if (!code) { state.province = ''; state.rows = []; updateBrand(); renderAll(); return; }
    if (code !== state.province) { resetFilterControls(); state.fitPending = true; }
    state.province = code;
    try { localStorage.setItem(LAST_PROVINCE, code); } catch (_) {}
    updateBrand();
    setLoading(true);
    $('liveError').hidden = true;
    try {
      if (HSApi.configured()) {
        state.rows = C.fromApi(await HSApi.get('hotspots', { province: code }));
        state.source = 'ฐานข้อมูลระบบตรวจสอบ + HS_' + code + ' จาก Agri-Risk Map';
      } else {
        const res = await HSSheetSource.load(cfg.sourceSheetUrl, code, C.PROVINCES);
        state.rows = C.fromSheetSource(res.rows);
        state.source = 'Google Sheet ต้นทาง แท็บ HS_' + code + ' (อ่านอย่างเดียว)';
      }
      if (state.province !== code) return;
      buildPeriodOptions();
      if (force !== true || !$('startMonth').value) setDefaultPeriod();
      fillLocationFilters();
      fillCropFilter();
      loadBoundaries(code);
      applyFilters();
      const p = state.provinces.find(x => x.code === code);
      $('provinceCoverage').textContent = 'จังหวัด' + C.PROVINCES[code] + ' · ' + state.rows.length.toLocaleString('th-TH') + ' จุด' + (p && p.firstDate ? ' · ข้อมูล ' + C.thaiDate(p.firstDate) + ' – ' + C.thaiDate(p.lastDate) : '');
      $('dataSourceLabel').textContent = 'แหล่งข้อมูล: ' + state.source;
    } catch (err) {
      state.rows = [];
      showError('อ่านจุดความร้อนของจังหวัด' + C.PROVINCES[code] + ' ไม่สำเร็จ: ' + err.message);
      renderAll();
    } finally { setLoading(false); }
  }

  function updateBrand() {
    const code = state.province;
    const logo = code && globalThis.HS_PROVINCE_LOGOS && HS_PROVINCE_LOGOS[code];
    $('provinceLogo').hidden = !logo;
    $('provinceLogoFallback').hidden = Boolean(logo);
    if (logo) { $('provinceLogo').src = logo.path; $('provinceLogo').alt = 'ตราประจำจังหวัด' + C.PROVINCES[code]; }
    $('areaSubtitle').textContent = code ? 'พื้นที่การเกษตรในจังหวัด' + C.PROVINCES[code] : 'พื้นที่การเกษตรของประเทศไทย';
  }

  function setLoading(on) { $('refreshDataButton').disabled = on; $('refreshDataButton').textContent = on ? 'กำลังอ่านข้อมูล…' : '↻ อัปเดตข้อมูล'; }
  function showError(msg) { $('liveError').hidden = false; $('liveError').textContent = msg; }

  /* ---------------------------------------------------------------- ตัวกรอง */
  function buildPeriodOptions() {
    const months = C.monthsBetween(state.rows);
    const opts = months.map(m => '<option value="' + m + '">' + esc(C.monthLabel(m)) + '</option>').join('');
    $('startMonth').innerHTML = opts; $('endMonth').innerHTML = opts;
    const years = Array.from(new Set(state.rows.map(r => C.fiscalYear(r.date)).filter(Boolean))).sort((a, b) => b - a);
    $('summaryYear').innerHTML = '<option value="">ตามช่วงเวลาที่เลือก</option>' + years.map(y => '<option value="' + y + '">ปีงบประมาณ ' + y + ' (ต.ค. ' + (y - 1) + ' – ก.ย. ' + y + ')</option>').join('');
  }
  function pickMonth(target, edge) {
    const months = C.monthsBetween(state.rows);
    if (!months.length) return '';
    if (edge === 'start') return months.find(m => m >= target) || months[months.length - 1];
    return months.slice().reverse().find(m => m <= target) || months[0];
  }
  function setDefaultPeriod() {
    const p = C.defaultPeriod(state.rows);
    $('startMonth').value = p.start; $('endMonth').value = p.end;
    $('summaryYear').value = '';
  }
  function filters() {
    let start = $('startMonth').value, end = $('endMonth').value;
    if (start && end && start > end) [start, end] = [end, start];
    return { start, end, district: $('districtFilter').value, tambon: $('tambonFilter').value, village: $('villageFilter').value, crop: $('cropFilter').value, status: $('statusFilter').value, result: $('resultFilter').value, search: $('searchFilter').value };
  }
  function fillSelect(id, values, allLabel) {
    const sel = $(id), current = sel.value;
    sel.innerHTML = '<option value="">' + allLabel + '</option>' + values.map(v => '<option>' + esc(v) + '</option>').join('');
    sel.value = values.includes(current) ? current : '';
  }
  function fillLocationFilters() {
    const f = filters();
    const inPeriod = r => (!f.start || C.monthKey(r.date) >= f.start) && (!f.end || C.monthKey(r.date) <= f.end);
    fillSelect('districtFilter', C.distinct(state.rows, 'district', inPeriod), 'ทุกอำเภอ');
    const d = $('districtFilter').value;
    fillSelect('tambonFilter', d ? C.distinct(state.rows, 'tambon', r => inPeriod(r) && r.district === d) : [], 'ทุกตำบล');
    const t = $('tambonFilter').value;
    fillSelect('villageFilter', t ? C.distinct(state.rows, 'village', r => inPeriod(r) && r.district === d && r.tambon === t) : [], 'ทุกหมู่บ้าน');
    $('tambonFilter').disabled = !d; $('villageFilter').disabled = !t;
  }
  function fillCropFilter() { fillSelect('cropFilter', C.distinct(state.rows, 'plantType'), 'ทุกประเภท'); }
  function resetFilterControls() {
    ['districtFilter', 'tambonFilter', 'villageFilter', 'cropFilter', 'statusFilter', 'resultFilter', 'searchFilter'].forEach(id => { $(id).value = ''; });
  }
  function resetFilters() {
    resetFilterControls(); setDefaultPeriod(); fillLocationFilters(); state.fitPending = true; applyFilters();
  }
  function applyFilters() {
    state.filtered = C.applyFilters(state.rows, filters()).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    state.visible = PAGE;
    const f = filters();
    $('periodHint').textContent = f.start ? 'แสดงจุดตั้งแต่ ' + C.monthLabel(f.start) + ' ถึง ' + C.monthLabel(f.end) + ' (ปีงบประมาณเริ่ม ต.ค.)' : '';
    renderAll();
  }

  /* ---------------------------------------------------------------- แสดงผล */
  function renderAll() {
    $('resultCount').textContent = state.filtered.length.toLocaleString('th-TH');
    const t = C.tally(state.filtered);
    $('selectedCount').textContent = state.filtered.length ? '· ตรวจแล้ว ' + t.verified.toLocaleString('th-TH') + ' · รอตรวจ ' + t.pending.toLocaleString('th-TH') : '';
    renderList(); renderMarkers(); renderSummary();
  }

  function renderList() {
    const list = $('hotspotList');
    const items = state.filtered.slice(0, state.visible);
    if (!state.province) list.innerHTML = '<div class="empty-state">กรุณาเลือกจังหวัดก่อนแสดงจุดความร้อน</div>';
    else if (!items.length) list.innerHTML = '<div class="empty-state"><strong>ไม่พบจุดที่ตรงกับตัวกรอง</strong><br>ลองล้างหรือเปลี่ยนตัวกรอง</div>';
    else list.innerHTML = items.map(card).join('');
    $('loadMore').hidden = state.visible >= state.filtered.length;
    if (!$('loadMore').hidden) $('loadMore').textContent = 'แสดงเพิ่ม (เหลือ ' + (state.filtered.length - state.visible).toLocaleString('th-TH') + ')';
  }
  const statusText = r => r.result ? C.RESULT_LABELS[r.result] + (r.status === 'draft' ? ' (ร่าง)' : '') : C.STATUS_LABELS[r.status] || 'รอตรวจ';
  const statusClass = r => r.status === 'verified' && r.result ? r.result : r.status;
  const areaLabel = r => [r.village, r.tambon, r.district].filter(Boolean).join(' · ') || 'ไม่ระบุพื้นที่';
  function card(r) {
    return '<button type="button" class="hotspot-card" data-hs-id="' + esc(r.hsId) + '"><div class="row"><span class="hotspot-id">' + esc(r.hsId) + '</span><span class="status-pill ' + esc(statusClass(r)) + '">' + esc(statusText(r)) + '</span></div><h3>' + esc(areaLabel(r)) + '</h3><p>' + esc(r.plantType) + ' · ' + esc(C.thaiDate(r.date)) + (r.time ? ' ' + esc(r.time) + ' น.' : '') + (r.photoCount ? ' · ภาพ ' + r.photoCount : '') + '</p></button>';
  }
  const markerColor = r => r.status === 'draft' ? C.COLORS.draft : r.status === 'verified' ? (C.COLORS[r.result] || C.COLORS.not_found) : C.COLORS.pending;

  function renderMarkers() {
    if (!state.map) return;
    state.markers.clearLayers();
    const bounds = [];
    state.filtered.forEach(r => {
      const m = L.circleMarker([r.lat, r.lng], { radius: 7, weight: 2, color: '#fff', fillColor: markerColor(r), fillOpacity: .95 });
      m.bindTooltip('<strong>' + esc(r.hsId) + '</strong><br>' + esc(areaLabel(r)) + '<br>' + esc(statusText(r)));
      m.on('click', () => openVerify(r));
      m.addTo(state.markers); bounds.push([r.lat, r.lng]);
    });
    if (state.fitPending && bounds.length) { state.map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 }); state.fitPending = false; }
  }

  function summaryRows() {
    const f = filters(); delete f.status; delete f.result;
    return C.applyFilters(state.rows, f);
  }
  function renderSummary() {
    const has = Boolean(state.province);
    $('summaryPrompt').hidden = has; $('summaryContent').hidden = !has;
    if (!has) return;
    const rows = summaryRows(), t = C.tally(rows), f = filters();
    const stat = (v, label, color) => '<article class="stat-card" style="--accent:' + color + '"><strong>' + Number(v).toLocaleString('th-TH') + '</strong><span>' + label + '</span></article>';
    $('summaryStats').innerHTML = stat(t.total, 'จุดความร้อนทั้งหมด', '#174f38') + stat(t.verified, 'ตรวจแล้ว (' + t.progress + '%)', '#18845d') + stat(t.burned, 'พบการเผา', C.COLORS.burned) + stat(t.not_burned, 'ไม่พบการเผา', C.COLORS.not_burned) + stat(t.followup, 'ต้องติดตาม / ตรวจซ้ำ', C.COLORS.needs_review) + stat(t.pending + t.draft, 'รอตรวจ / งานร่าง', C.COLORS.pending);
    $('summaryScopeHint').textContent = 'จังหวัด' + C.PROVINCES[state.province] + (f.district ? ' › อำเภอ' + f.district : '') + (f.tambon ? ' › ตำบล' + f.tambon : '') + (f.start ? ' · ' + C.monthLabel(f.start) + ' – ' + C.monthLabel(f.end) : '');
    const groups = C.groupSummary(rows, $('summaryLevel').value);
    $('summaryBody').innerHTML = groups.length ? groups.map(g => '<tr><td>' + esc(g.area) + '</td><td>' + g.total + '</td><td>' + g.verified + '</td><td>' + g.burned + '</td><td>' + g.not_burned + '</td><td>' + g.draft + '</td><td><div class="progress" role="img" aria-label="' + g.progress + '%"><i style="width:' + g.progress + '%"></i></div><small>' + g.progress + '%</small></td></tr>').join('') : '<tr><td colspan="7" class="muted">ไม่มีข้อมูลในขอบเขตนี้</td></tr>';
  }

  function exportSummary() {
    const groups = C.groupSummary(summaryRows(), $('summaryLevel').value);
    download('สรุปผลตรวจ_' + C.PROVINCES[state.province] + '.csv', C.toCsv([
      { label: 'พื้นที่', key: 'area' }, { label: 'ทั้งหมด', key: 'total' }, { label: 'ตรวจแล้ว', key: 'verified' }, { label: 'พบการเผา', key: 'burned' },
      { label: 'ไม่พบการเผา', key: 'not_burned' }, { label: 'ติดตาม', key: 'followup' }, { label: 'งานร่าง', key: 'draft' }, { label: 'รอตรวจ', key: 'pending' }, { label: 'ความคืบหน้า %', key: 'progress' }
    ], groups));
  }

  function printReport() {
    const rows = summaryRows(), t = C.tally(rows), f = filters();
    const groups = C.groupSummary(rows, $('summaryLevel').value);
    const burned = rows.filter(r => r.status === 'verified' && r.result === 'burned').slice(0, 300);
    const logo = globalThis.HS_PROVINCE_LOGOS && HS_PROVINCE_LOGOS[state.province];
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    const html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานผลตรวจสอบจุดความร้อน ' + esc(C.PROVINCES[state.province]) + '</title><base href="' + esc(base) + '">' +
      '<style>@page{size:A4 landscape;margin:12mm}body{font-family:"Sarabun","Noto Sans Thai",sans-serif;color:#1f2328;font-size:12px}header{display:flex;gap:12px;align-items:center;border-bottom:3px solid #1a7f37;padding-bottom:8px}header img{height:56px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #c9d1d9;padding:4px 6px;text-align:left}th{background:#dafbe1}.stats{display:flex;gap:8px;margin:10px 0}.stats div{border:1px solid #c9d1d9;border-radius:8px;padding:6px 10px}.stats b{display:block;font-size:18px}footer{margin-top:12px;color:#57606a;font-size:10px}</style></head><body>' +
      '<header><img src="assets/logo-doae.png" alt="">' + (logo ? '<img src="' + esc(logo.path) + '" alt="">' : '') + '<div><h1>รายงานผลการตรวจสอบจุดความร้อนในพื้นที่การเกษตร จังหวัด' + esc(C.PROVINCES[state.province]) + '</h1><div>' + esc($('summaryScopeHint').textContent) + '</div></div></header>' +
      '<div class="stats"><div><b>' + t.total + '</b>จุดทั้งหมด</div><div><b>' + t.verified + '</b>ตรวจแล้ว (' + t.progress + '%)</div><div><b>' + t.burned + '</b>พบการเผา</div><div><b>' + t.not_burned + '</b>ไม่พบการเผา</div><div><b>' + t.followup + '</b>ติดตาม/ตรวจซ้ำ</div><div><b>' + (t.pending + t.draft) + '</b>รอตรวจ/ร่าง</div></div>' +
      '<table><thead><tr><th>พื้นที่</th><th>ทั้งหมด</th><th>ตรวจแล้ว</th><th>พบการเผา</th><th>ไม่พบการเผา</th><th>งานร่าง</th><th>ความคืบหน้า</th></tr></thead><tbody>' +
      groups.map(g => '<tr><td>' + esc(g.area) + '</td><td>' + g.total + '</td><td>' + g.verified + '</td><td>' + g.burned + '</td><td>' + g.not_burned + '</td><td>' + g.draft + '</td><td>' + g.progress + '%</td></tr>').join('') + '</tbody></table>' +
      (burned.length ? '<h2 style="font-size:14px;margin-top:14px">จุดที่ยืนยันพบการเผา</h2><table><thead><tr><th>HS</th><th>วันที่</th><th>อำเภอ</th><th>ตำบล</th><th>หมู่บ้าน</th><th>พืช</th><th>วันที่ตรวจ</th></tr></thead><tbody>' + burned.map(r => '<tr><td>' + esc(r.hsId) + '</td><td>' + esc(C.thaiDate(r.date)) + '</td><td>' + esc(r.district) + '</td><td>' + esc(r.tambon) + '</td><td>' + esc(r.village) + '</td><td>' + esc(r.plantType) + '</td><td>' + esc(C.thaiDate(r.inspectedDate)) + '</td></tr>').join('') + '</tbody></table>' : '') +
      '<footer>พิมพ์เมื่อ ' + esc(new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })) + ' · แหล่ง HS: ฐานข้อมูล Agri-Risk Map Burning · ระบบตรวจสอบจุดความร้อน v3.0</footer><script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>';
    const w = window.open('', '_blank');
    if (!w) return toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up', true);
    w.document.open(); w.document.write(html); w.document.close();
  }

  function switchView(name) {
    if (name === 'admin' && !HSApi.user()) return HSAdmin.openAccess('phone');
    document.querySelectorAll('.view').forEach(v => { const on = v.id === name + 'View'; v.classList.toggle('active', on); v.hidden = !on; });
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('provinceGate').hidden = name === 'admin';
    $('mainNav').classList.remove('open'); $('menuButton').setAttribute('aria-expanded', 'false');
    if (name === 'summary') renderSummary();
    if (name === 'admin') HSAdmin.render();
    if (name === 'work' && state.map) setTimeout(() => state.map.invalidateSize(), 30);
  }
  function setLayout(layout) {
    document.querySelectorAll('[data-layout]').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
    document.querySelector('.map-wrap').hidden = layout === 'list';
    $('mapLayout').style.gridTemplateColumns = layout === 'list' ? '1fr' : '';
    if (layout === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 30);
  }

  /* ---------------------------------------------------------------- แผนที่และขอบเขต */
  function initMap() {
    if (!window.L) { $('mapFallback').hidden = false; return; }
    try {
      state.map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([15.5, 100.8], 6);
      const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.map);
      const satellite = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
      const terrain = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
      L.control.layers({ 'ถนน': streets, 'ดาวเทียม': satellite, 'ภูมิประเทศ': terrain }, {}, { collapsed: true }).addTo(state.map);
      state.boundaryLayer = L.layerGroup().addTo(state.map);
      state.markers = L.layerGroup().addTo(state.map);
    } catch (err) { $('mapFallback').hidden = false; state.map = null; }
  }

  async function loadBoundaries(code) {
    if (!state.map || state.boundary.code === code) return drawBoundaries();
    state.boundary = { code };
    const get = async level => { try { const r = await fetch('data/boundaries/' + code + '/' + level + '.geojson'); return r.ok ? await r.json() : null; } catch (_) { return null; } };
    const [province, district, subdistrict] = await Promise.all([get('province'), get('district'), get('subdistrict')]);
    if (state.boundary.code !== code) return;
    Object.assign(state.boundary, { province, district, subdistrict });
    drawBoundaries();
  }
  function drawBoundaries() {
    if (!state.map || !state.boundaryLayer) return;
    state.boundaryLayer.clearLayers();
    const b = state.boundary, f = filters();
    const style = (color, weight, dash) => ({ color, weight, fill: false, dashArray: dash, interactive: false });
    if (b.province) L.geoJSON(b.province, { style: style('#174f38', 2.5) }).addTo(state.boundaryLayer);
    if (b.district && $('boundaryDistrictOn').checked) L.geoJSON(b.district, { style: f2 => style('#75530c', f2.properties.nameTH === f.district ? 3 : 1.4) }).bindTooltip(l => 'อ.' + l.feature.properties.nameTH, { sticky: true }).addTo(state.boundaryLayer);
    if (b.subdistrict && $('boundarySubdistrictOn').checked) L.geoJSON(b.subdistrict, { style: style('#6f57a1', 1, '3 3') }).addTo(state.boundaryLayer);
  }
  function fitProvince() {
    const b = state.boundary;
    if (state.map && b.province) state.map.fitBounds(L.geoJSON(b.province).getBounds(), { padding: [10, 10] });
  }

  /* ---------------------------------------------------------------- ฟอร์มบันทึกผล */
  function fillPersonCategories() {
    $('personCategory').innerHTML = '<option value="">เลือกประเภทบุคคล</option>' + C.PERSON_CATEGORIES.map(c => '<option>' + esc(c) + '</option>').join('');
  }
  const outcome = () => (document.querySelector('input[name=outcome]:checked') || {}).value || '';

  function resetForm() {
    $('verifyForm').reset();
    state.photos = []; state.location = null; state.record = null; state.existingPhotos = [];
    $('personOtherWrap').hidden = true; $('noGpsReasonWrap').hidden = true; $('fireStateWrap').hidden = true; $('observedFields').hidden = true;
    $('verifyMessage').textContent = ''; $('recordInfo').textContent = ''; $('noteCount').textContent = '0/500';
    $('existingPhotos').innerHTML = ''; renderPhotos(); renderLocation();
  }

  async function openVerify(r) {
    if (!r) return;
    resetForm();
    state.selected = r;
    $('verifyTitle').textContent = 'จุด HS ' + r.hsId;
    $('selectedMeta').innerHTML = '<div class="meta-grid"><span><small>วันที่ตรวจพบ</small><strong>' + esc(C.thaiDate(r.date)) + (r.time ? ' ' + esc(r.time) + ' น.' : '') + '</strong></span><span><small>พืช/พื้นที่</small><strong>' + esc(r.plantType) + '</strong></span><span class="meta-wide"><small>ที่ตั้ง</small><strong>' + esc(areaLabel(r)) + ' จ.' + esc(C.PROVINCES[r.provinceCode] || '') + '</strong></span><span><small>พิกัด</small><strong>' + r.lat.toFixed(5) + ', ' + r.lng.toFixed(5) + '</strong></span><span><small>สถานะ</small><strong>' + esc(statusText(r)) + '</strong></span></div>';
    $('navigateLink').href = 'https://www.google.com/maps/dir/?api=1&destination=' + r.lat + ',' + r.lng;
    const user = HSApi.user();
    const allowed = C.can(user, 'record', { province: r.provinceCode });
    setFormEnabled(false);
    $('deleteVerificationButton').hidden = true;
    const hint = $('verifyLoginHint');
    hint.hidden = allowed;
    hint.textContent = !HSApi.configured() ? 'ยังไม่ได้เชื่อม API ฐานข้อมูลผลตรวจ จึงดูข้อมูลได้อย่างเดียว' : !user ? 'เข้าสู่ระบบ (Admin / Mini Super Admin) เพื่อบันทึกผลการตรวจสอบ' : 'บัญชีของท่านบันทึกผลได้เฉพาะจังหวัด' + (C.PROVINCES[user.prov] || '');
    $('verifyDialog').showModal();
    if (!allowed) return;
    $('recordInfo').textContent = 'กำลังอ่านผลตรวจเดิม…';
    try {
      const data = await HSApi.post('verification_get', { province: r.provinceCode, hotspotId: r.hsId });
      if (state.selected !== r) return;
      state.record = data.verification;
      state.existingPhotos = data.photos || [];
      fillForm(state.record);
      renderExistingPhotos();
      const editable = !state.record || state.record.canEdit;
      setFormEnabled(editable);
      $('deleteVerificationButton').hidden = !(state.record && state.record.canDelete);
      $('recordInfo').textContent = state.record
        ? 'บันทึกโดย ' + state.record.recordedByName + ' (' + (C.ROLE_LABELS[state.record.recordedByRole] || '') + ') เมื่อ ' + C.thaiDateTime(state.record.createdAt) + (state.record.updatedByName ? ' · แก้ไขล่าสุดโดย ' + state.record.updatedByName + ' ' + C.thaiDateTime(state.record.updatedAt) : '') + (editable ? '' : ' · ท่านดูได้อย่างเดียว ผู้บันทึกเดิมหรือผู้ดูแลจังหวัดเท่านั้นที่แก้ไขได้')
        : 'ยังไม่มีผลตรวจของจุดนี้';
    } catch (err) {
      $('recordInfo').textContent = 'อ่านผลตรวจเดิมไม่สำเร็จ: ' + err.message;
      setFormEnabled(!err.network ? false : true);
    }
  }

  function setFormEnabled(on) {
    $('verifyFields').disabled = !on;
    $('saveDraftButton').hidden = !on; $('reviewSubmitButton').hidden = !on; $('locateButton').hidden = !on;
  }

  function fillForm(v) {
    if (!v) return;
    const set = (id, val) => { $(id).value = val == null ? '' : val; };
    set('personCategory', v.personCategory); $('personOtherWrap').hidden = v.personCategory !== 'อื่นๆ'; set('personCategoryOther', v.personCategoryOther);
    if (v.fieldInspectorName && v.fieldInspectorName !== v.recordedByName) set('fieldInspectorName', v.fieldInspectorName);
    set('inspectedAt', String(v.inspectedAt || '').slice(0, 16));
    const radio = document.querySelector('input[name=outcome][value="' + v.result + '"]'); if (radio) radio.checked = true;
    $('fireStateWrap').hidden = v.result !== 'burned'; set('fireState', v.fireState || 'unknown');
    set('observedMatches', v.observedMatches); $('observedFields').hidden = v.observedMatches !== 'no'; set('observedLandType', v.observedLandType || 'พื้นที่เกษตร'); set('observedPlantType', v.observedPlantType);
    if (v.obsLat !== '' && v.obsLat != null) { state.location = { latitude: Number(v.obsLat), longitude: Number(v.obsLng), accuracy: Number(v.gpsAccuracyM) || null, saved: true }; }
    else if (v.missingGpsReason) { $('noGps').checked = true; $('noGpsReasonWrap').hidden = false; set('noGpsReason', v.missingGpsReason); }
    set('photoMissingReason', v.photoMissingReason); set('noteInput', v.notes); set('actionInput', v.followUpAction);
    $('noteCount').textContent = String(v.notes || '').length + '/500';
    renderLocation();
  }

  function locate() {
    if (!navigator.geolocation) return toast('อุปกรณ์ไม่รองรับการระบุตำแหน่ง', true);
    $('locateButton').disabled = true; $('locateButton').textContent = 'กำลังหาตำแหน่ง…';
    navigator.geolocation.getCurrentPosition(p => {
      state.location = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
      $('noGps').checked = false; $('noGpsReasonWrap').hidden = true; $('noGpsReason').value = '';
      renderLocation(); done();
    }, err => { toast(err.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เลือก “บันทึกโดยไม่มี GPS” และระบุเหตุผล' : 'หาตำแหน่งไม่สำเร็จ ลองอีกครั้งในที่โล่ง', true); done(); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    function done() { $('locateButton').disabled = false; $('locateButton').textContent = '⌖ ใช้ตำแหน่งของฉัน'; }
  }
  function renderLocation() {
    const l = state.location, r = state.selected;
    const panel = $('locationPanel');
    if (!l) { panel.innerHTML = '<span class="location-icon">⌖</span><div><strong>ยังไม่ได้บันทึกตำแหน่ง</strong><small>กดใช้ตำแหน่งของฉันเมื่ออยู่หน้างาน</small></div>'; return; }
    const d = r ? C.distanceM(r.lat, r.lng, l.latitude, l.longitude) : null;
    panel.innerHTML = '<span class="location-icon">✓</span><div><strong>' + l.latitude.toFixed(6) + ', ' + l.longitude.toFixed(6) + '</strong><small>' + (l.accuracy ? 'ความแม่นยำ ±' + l.accuracy + ' ม. · ' : '') + (d != null ? 'ห่างจุด HS ' + d.toLocaleString('th-TH') + ' ม.' : '') + (l.saved ? ' · ตำแหน่งที่บันทึกไว้' : '') + '</small></div>';
  }

  async function addPhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (state.existingPhotos.length + state.photos.length >= MAX_PHOTOS) { toast('แนบภาพได้สูงสุด ' + MAX_PHOTOS + ' ภาพต่อจุด', true); break; }
      try {
        let meta = null;
        if (file.type === 'image/jpeg' && globalThis.HSEvidence) { try { meta = HSEvidence.inspectBytes(new Uint8Array(await file.slice(0, 262144).arrayBuffer())); } catch (_) {} }
        const img = await HSImage.compress(file, meta);
        state.photos.push({ clientRequestId: C.uuid(), mimeType: img.mimeType, base64: img.base64, preview: img.preview, photoLat: meta && meta.latitude != null ? meta.latitude : '', photoLng: meta && meta.longitude != null ? meta.longitude : '', takenAt: meta && meta.capturedAt ? String(meta.capturedAt) : '' });
      } catch (err) { toast(err.message, true); }
    }
    renderPhotos();
  }
  function renderPhotos() {
    $('photoPreview').innerHTML = state.photos.map((p, i) => '<div class="photo-item"><img src="' + p.preview + '" alt="ภาพใหม่ ' + (i + 1) + '"><button type="button" data-remove="' + i + '" aria-label="นำภาพออก">×</button></div>').join('');
  }
  function renderExistingPhotos() {
    const canEdit = state.record && state.record.canEdit;
    $('existingPhotos').innerHTML = state.existingPhotos.map(p => '<div class="photo-item" data-photo="' + esc(p.photoId) + '"><button type="button" class="photo-load" data-load="' + esc(p.photoId) + '" style="position:static;width:100%;height:100%;border-radius:0;background:#e9f5ed;color:#17633e;font-size:.85rem">ดูภาพ ' + esc(C.thaiDateTime(p.uploadedAt)) + '</button>' + (canEdit ? '<button type="button" data-delete-photo="' + esc(p.photoId) + '" aria-label="ลบภาพ">×</button>' : '') + '</div>').join('');
  }
  async function existingPhotoAction(e) {
    const load = e.target.closest('[data-load]'), del = e.target.closest('[data-delete-photo]');
    try {
      if (load) {
        load.textContent = 'กำลังโหลด…';
        const d = await HSApi.post('photo_get', { photoId: load.dataset.load }, 60000);
        const img = document.createElement('img'); img.src = 'data:' + d.mimeType + ';base64,' + d.base64; img.alt = 'ภาพหลักฐาน';
        load.replaceWith(img);
      } else if (del && confirm('ลบภาพนี้ออกจากผลตรวจ?')) {
        await HSApi.post('photo_delete', { photoId: del.dataset.deletePhoto });
        state.existingPhotos = state.existingPhotos.filter(p => p.photoId !== del.dataset.deletePhoto);
        renderExistingPhotos(); toast('ลบภาพแล้ว');
      }
    } catch (err) { toast(err.message, true); }
  }

  function payload(status) {
    const r = state.selected, l = state.location;
    return {
      clientRequestId: C.uuid(), province: r.provinceCode, hotspotId: r.hsId, status, result: outcome(),
      fireState: outcome() === 'burned' ? $('fireState').value : '',
      observedMatches: $('observedMatches').value, observedLandType: $('observedMatches').value === 'no' ? $('observedLandType').value : '', observedPlantType: $('observedMatches').value === 'no' ? $('observedPlantType').value : '',
      personCategory: $('personCategory').value, personCategoryOther: $('personCategoryOther').value, fieldInspectorName: $('fieldInspectorName').value,
      inspectedAt: $('inspectedAt').value ? $('inspectedAt').value + ':00' : '',
      obsLat: l ? Number(l.latitude.toFixed(6)) : '', obsLng: l ? Number(l.longitude.toFixed(6)) : '', gpsAccuracyM: l && l.accuracy ? l.accuracy : '',
      missingGpsReason: !l && $('noGps').checked ? $('noGpsReason').value : '',
      photoMissingReason: $('photoMissingReason').value, plannedPhotos: state.photos.length,
      notes: $('noteInput').value, followUpAction: $('actionInput').value
    };
  }
  function validate(p) {
    if (p.status !== 'verified') return '';
    if (!p.result) return 'กรุณาเลือกผลการตรวจ';
    if (p.obsLat === '' && !p.missingGpsReason) return 'กรุณากด “ใช้ตำแหน่งของฉัน” หรือเลือกบันทึกโดยไม่มี GPS พร้อมเหตุผล';
    if (!state.photos.length && !state.existingPhotos.length && !p.photoMissingReason) return 'กรุณาแนบภาพถ่าย หรือระบุเหตุผลที่ไม่มีภาพ';
    if (p.personCategory === 'อื่นๆ' && !p.personCategoryOther.trim()) return 'กรุณาระบุประเภทบุคคลอื่น';
    return '';
  }
  function review() {
    const p = payload('verified'), problem = validate(p);
    if (problem) { $('verifyMessage').textContent = problem; return; }
    const r = state.selected;
    $('confirmSummary').innerHTML = '<p><strong>' + esc(r.hsId) + '</strong> · ' + esc(areaLabel(r)) + '</p><p>ผลตรวจ: <strong>' + esc(C.RESULT_LABELS[p.result]) + '</strong></p><p>ตำแหน่ง: ' + (p.obsLat !== '' ? p.obsLat + ', ' + p.obsLng : 'ไม่มี GPS (' + esc($('noGpsReason').selectedOptions[0].textContent) + ')') + '</p><p>ภาพใหม่ ' + state.photos.length + ' ภาพ' + (state.existingPhotos.length ? ' · ภาพเดิม ' + state.existingPhotos.length + ' ภาพ' : '') + '</p>';
    $('confirmDialog').showModal();
  }

  async function submit(status) {
    if (state.busy) return;
    const p = payload(status), problem = validate(p);
    if (problem) { $('verifyMessage').textContent = problem; return; }
    const job = { id: p.clientRequestId, payload: p, photos: state.photos.map(x => ({ clientRequestId: x.clientRequestId, mimeType: x.mimeType, base64: x.base64, photoLat: x.photoLat, photoLng: x.photoLng, takenAt: x.takenAt })), createdAt: new Date().toISOString(), hsId: state.selected.hsId };
    state.busy = true; $('verifyMessage').textContent = 'กำลังส่งข้อมูล…';
    $('saveDraftButton').disabled = $('reviewSubmitButton').disabled = true;
    try {
      const saved = await HSOutbox.run(job, HSApi);
      updateRow(state.selected, saved.verification, job.photos.length);
      toast(status === 'verified' ? 'บันทึกผลการตรวจแล้ว' : 'เก็บงานร่างแล้ว');
      closeVerify();
    } catch (err) {
      if (err.network) {
        await HSOutbox.put(job).catch(() => {});
        toast('ไม่มีสัญญาณ — เก็บงานไว้ในเครื่อง จะส่งอีกครั้งเมื่อออนไลน์', true);
        closeVerify(); refreshOutbox();
      } else $('verifyMessage').textContent = err.message;
    } finally {
      state.busy = false; $('saveDraftButton').disabled = $('reviewSubmitButton').disabled = false;
    }
  }

  function updateRow(r, v, addedPhotos) {
    if (!r || !v) return;
    r.status = v.status; r.result = v.result || ''; r.inspectedDate = String(v.inspectedAt || '').slice(0, 10);
    r.photoCount = (state.existingPhotos.length || 0) + (addedPhotos || 0);
    applyFilters();
  }

  async function deleteRecord() {
    const rec = state.record;
    if (!rec) return;
    const reason = prompt('ลบผลตรวจของจุด ' + rec.hotspotId + ' ทั้งหมด (รวมภาพ)\nกรุณาระบุเหตุผล (บันทึกในประวัติการใช้งาน)');
    if (reason === null) return;
    try {
      await HSApi.post('verification_delete', { verificationId: rec.verificationId, reason });
      const r = state.selected; r.status = 'pending'; r.result = ''; r.photoCount = 0;
      toast('ลบผลตรวจแล้ว'); closeVerify(); applyFilters();
    } catch (err) { $('verifyMessage').textContent = err.message; }
  }

  function closeVerify() { if ($('verifyDialog').open) $('verifyDialog').close(); state.selected = null; }

  /* ---------------------------------------------------------------- งานค้าง */
  async function refreshOutbox() {
    const jobs = await HSOutbox.all();
    $('retryButton').hidden = !jobs.length; $('retryCount').textContent = jobs.length;
  }
  async function flushOutbox() {
    if (!HSApi.user()) return refreshOutbox();
    const res = await HSOutbox.flush(HSApi);
    if (res.sent) { toast('ส่งงานค้างแล้ว ' + res.sent + ' รายการ'); loadProvince(state.province, true); }
    if (res.failed) toast('ยังส่งงานค้างไม่ได้ ' + res.failed + ' รายการ', true);
    refreshOutbox();
  }

  /* ---------------------------------------------------------------- เครื่องมือ */
  function toast(message, error) {
    const t = document.createElement('div');
    t.className = 'toast' + (error ? ' error' : '');
    t.textContent = message;
    $('toastRegion').append(t);
    setTimeout(() => t.remove(), error ? 6000 : 3500);
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  globalThis.HSApp = { toast, download };
})();
