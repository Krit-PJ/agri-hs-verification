/* ระบบตรวจสอบจุดความร้อน v3 — ตัวควบคุมหน้าเว็บหลัก */
(() => {
  'use strict';
  const C = HSCore;
  const cfg = globalThis.HS_SITE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = C.escapeHtml;
  const PAGE = 60;
  const LAST_PROVINCE = 'hsverify.v3.province';
  const LAST_PERSON = 'hsverify.v3.personCategory';
  const MAX_PHOTOS = 3;
  const mobile = () => matchMedia('(max-width: 700px)').matches;
  const allMode = () => state.province === C.ALL;
  const scopeName = () => allMode() ? 'ทุกจังหวัด' : 'จังหวัด' + C.provinceName(state.province);

  const state = {
    provinces: [], province: '', rows: [], filtered: [], visible: PAGE, source: '',
    map: null, markers: null, boundaryLayer: null, meLayer: null, boundary: {}, fitPending: false,
    near: null, selected: null, record: null, existingPhotos: [], photos: [], location: null, busy: false, pendingHs: null
  };

  document.addEventListener('DOMContentLoaded', init);

  /* ================================================================ เริ่มต้น */
  async function init() {
    const setTop = () => document.documentElement.style.setProperty('--topbar-h', document.querySelector('.topbar').offsetHeight + 'px');
    setTop(); window.addEventListener('resize', setTop);
    if (cfg.riskMapUrl) $('riskNavLink').href = cfg.riskMapUrl;
    if (cfg.greenGainHubUrl) $('hubNavLink').href = cfg.greenGainHubUrl;
    bind();
    fillPersonCategories();
    initMap();
    HSAdmin.init({ provinces: () => state.provinces, province: () => state.province, onSession: sessionChanged, toast, reloadHotspots: () => loadProvince(state.province, true) });
    $('accessDialog').addEventListener('close', () => setTimeout(() => { if (!HSApi.user()) state.pendingHs = null; }, 0));
    window.addEventListener('hs:session-expired', e => { toast(String((e.detail || '').replace(/^AUTH:\s*/, '')) || 'หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่', true); closeVerify(); sessionChanged(); });
    applySessionUI();
    counter();
    await loadProvinces();
    touch();
    refreshOutbox();
    watchBackToMap();
  }

  function bind() {
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('menuButton').addEventListener('click', () => toggleMenu());
    document.querySelectorAll('#mainNav a').forEach(a => a.addEventListener('click', () => toggleMenu(false)));
    $('accessLoginNav').addEventListener('click', () => { toggleMenu(false); HSApi.user() ? logout() : HSAdmin.openAccess('phone'); });
    $('provinceSelect').addEventListener('change', e => loadProvince(e.target.value));
    document.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => setLayout(b.dataset.layout)));
    ['provinceFilter', 'districtFilter', 'tambonFilter', 'villageFilter', 'cropFilter', 'statusFilter', 'resultFilter', 'startMonth', 'endMonth'].forEach(id => $(id).addEventListener('change', () => {
      if (id === 'provinceFilter') { $('districtFilter').value = ''; $('tambonFilter').value = ''; $('villageFilter').value = ''; loadBoundaries($('provinceFilter').value); }
      if (id === 'districtFilter') { $('tambonFilter').value = ''; $('villageFilter').value = ''; }
      if (id === 'tambonFilter') $('villageFilter').value = '';
      if (['provinceFilter', 'districtFilter', 'tambonFilter', 'startMonth', 'endMonth'].includes(id)) fillLocationFilters();
      state.fitPending = ['provinceFilter', 'districtFilter', 'tambonFilter', 'villageFilter'].includes(id);
      applyFilters();
      if (id === 'districtFilter' || id === 'tambonFilter') drawBoundaries();
      if (id === 'startMonth' || id === 'endMonth') $('periodPreset').value = 'custom';
    }));
    let t; $('searchFilter').addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 180); });
    $('resetFilters').addEventListener('click', resetFilters);
    $('applyFiltersMobile').addEventListener('click', () => { toggleFilters(false); if (mobile()) document.querySelector('.result-toolbar').scrollIntoView({ behavior: 'smooth' }); });
    $('filterToggle').addEventListener('click', () => toggleFilters());
    $('filterChips').addEventListener('click', e => { const c = e.target.closest('[data-clear]'); if (c) clearFilter(c.dataset.clear); });
    $('periodPreset').addEventListener('change', () => { applyPreset($('periodPreset').value); fillLocationFilters(); applyFilters(); });
    $('refreshDataButton').addEventListener('click', () => loadProvince(state.province, true));
    $('loadMore').addEventListener('click', () => { state.visible += PAGE; renderList(); });
    $('hotspotList').addEventListener('click', e => {
      const card = e.target.closest('[data-hs-id]');
      if (!card) return;
      const r = state.rows.find(x => x.hsId === card.dataset.hsId);
      if (e.target.closest('[data-show-map]')) return showOnMap(r);
      openVerify(r);
    });
    $('hotspotList').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.hotspot-card')) { e.preventDefault(); e.target.click(); } });
    $('fieldBar').addEventListener('click', fieldBarAction);
    $('backToMap').addEventListener('click', () => document.querySelector('.result-toolbar').scrollIntoView({ behavior: 'smooth' }));
    $('summaryLevel').addEventListener('change', renderSummary);
    $('printReportButton').addEventListener('click', printReport);
    $('exportSummaryButton').addEventListener('click', exportSummary);
    // ฟอร์มบันทึกผล
    $('closeDialog').addEventListener('click', closeVerify);
    $('verifyDialog').addEventListener('cancel', e => { e.preventDefault(); closeVerify(); });
    $('verifyForm').addEventListener('submit', e => { e.preventDefault(); review(); });
    $('saveDraftButton').addEventListener('click', () => submit('draft'));
    $('confirmSubmit').addEventListener('click', () => { $('confirmDialog').close(); submit('verified'); });
    $('cancelConfirm').addEventListener('click', () => $('confirmDialog').close());
    $('deleteVerificationButton').addEventListener('click', deleteRecord);
    $('locateButton').addEventListener('click', () => locate(true));
    $('gateLogin').addEventListener('click', () => gate('phone'));
    $('gateRegister').addEventListener('click', () => gate('register'));
    $('noGps').addEventListener('change', () => { $('noGpsReasonWrap').hidden = !$('noGps').checked; if ($('noGps').checked) { state.location = null; renderLocation(); } else $('noGpsReason').value = ''; });
    $('personCategory').addEventListener('change', () => { $('personOtherWrap').hidden = $('personCategory').value !== 'อื่นๆ'; try { localStorage.setItem(LAST_PERSON, $('personCategory').value); } catch (_) {} });
    $('observedMatches').addEventListener('change', () => { $('observedFields').hidden = $('observedMatches').value !== 'no'; });
    document.querySelectorAll('input[name=outcome]').forEach(r => r.addEventListener('change', () => { $('fireStateWrap').hidden = outcome() !== 'burned'; $('verifyMessage').textContent = ''; }));
    $('photoInput').addEventListener('change', addPhotos);
    $('importPhotoInput').addEventListener('change', addPhotos);
    $('photoPreview').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) { state.photos.splice(Number(b.dataset.remove), 1); renderPhotos(); } });
    $('existingPhotos').addEventListener('click', existingPhotoAction);
    $('noteInput').addEventListener('input', () => { $('noteCount').textContent = $('noteInput').value.length + '/500'; });
    $('retryButton').addEventListener('click', flushOutbox);
    window.addEventListener('online', () => { toast('กลับมาออนไลน์แล้ว'); flushOutbox(); });
  }

  function toggleMenu(force) {
    const open = typeof force === 'boolean' ? force : !$('mainNav').classList.contains('open');
    $('mainNav').classList.toggle('open', open);
    $('menuButton').setAttribute('aria-expanded', String(open));
  }

  /* ================================================================ บัญชีผู้ใช้ */
  function applySessionUI() {
    const user = HSApi.user();
    $('headerIdentity').hidden = !user;
    $('headerIdentity').textContent = user ? identityText(user) : '';
    $('accessLoginNav').textContent = user ? 'ออกจากระบบ' : 'เข้าใช้งานระบบ';
    $('adminNav').hidden = !user;
    $('adminNav').textContent = user && C.can(user, 'manage') ? 'ผู้ดูแลระบบ' : 'งานของฉัน';
    const live = HSApi.configured();
    const notice = $('publicNotice');
    notice.hidden = live;
    if (!live) notice.textContent = 'ดูข้อมูลได้อย่างเดียว — ระบบยังไม่ได้เชื่อมฐานข้อมูลผลตรวจ';
    const locked = user && !C.can(user, 'chooseProvince');
    $('provinceSelect').disabled = Boolean(locked);
    if (locked && state.provinces.length && state.province !== user.prov) loadProvince(user.prov);
    renderFieldBar();
  }

  function sessionChanged() {
    renderProvinceOptions();
    applySessionUI();
    counter();
    touch();
    HSAdmin.render();
    const pending = state.pendingHs;
    state.pendingHs = null;
    const user = HSApi.user();
    const target = user && !C.can(user, 'chooseProvince') ? user.prov : (state.province === C.ALL && !C.can(user, 'allProvinces') ? '' : state.province);
    const reload = target ? loadProvince(target, target === state.province) : (state.province ? loadProvince('') : Promise.resolve());
    reload.then(() => {
      if (pending && user) { const r = state.rows.find(x => x.hsId === pending); if (r) openVerify(r); }
    });
    if (!user && !$('adminView').hidden) switchView('work');
  }

  async function logout() {
    await HSApi.logout();
    toast('ออกจากระบบแล้ว');
    sessionChanged();
  }

  /** บันทึกการเปิดใช้งานของผู้ที่เข้าสู่ระบบค้างไว้ (เซิร์ฟเวอร์บันทึกไม่เกิน 1 ครั้ง/30 นาที) */
  function touch() {
    if (!HSApi.user()) return;
    HSApi.post('touch', { page: state.province === C.ALL ? 'ทุกจังหวัด' : state.province ? 'จังหวัด' + C.provinceName(state.province) : 'หน้าแรก', device: (navigator.userAgent || '').slice(0, 120) }).catch(() => {});
  }

  function counter() {
    const el = $('visitCounter');
    if (!HSApi.configured()) { el.textContent = 'สถิติผู้เข้าชมจะแสดงเมื่อเชื่อมฐานข้อมูลแล้ว'; return; }
    el.textContent = 'กำลังอ่านสถิติการใช้งาน…';
    let seen = false; try { seen = sessionStorage.getItem('hsverify.v3.hit') === '1'; sessionStorage.setItem('hsverify.v3.hit', '1'); } catch (_) {}
    HSApi.get(seen ? 'counter' : 'hit').then(d => {
      const c = d.counter;
      el.textContent = 'ผู้เข้าชมวันนี้ ' + c.today.toLocaleString('th-TH') + ' · ทั้งหมด ' + c.total.toLocaleString('th-TH') + (c.staffToday != null ? ' · เจ้าหน้าที่ใช้งานวันนี้ ' + c.staffToday.toLocaleString('th-TH') + ' คน' : '');
    }).catch(() => { el.textContent = 'อ่านสถิติการใช้งานไม่สำเร็จ'; });
  }

  /* ================================================================ แถบงานภาคสนาม */
  /** ปุ่มงานภาคสนามในแถบผลลัพธ์ — แสดงเฉพาะเจ้าหน้าที่ที่บันทึกผลในพื้นที่นี้ได้ */
  function renderFieldBar() {
    const bar = $('fieldBar'), user = HSApi.user();
    const canRecord = HSApi.configured() && user && state.province && C.can(user, 'record', { province: state.province === C.ALL ? user.prov : state.province });
    bar.innerHTML = !canRecord ? '' : state.near
      ? '<button type="button" class="secondary-button compact" data-fb="clearnear">✕ เลิกเรียงตามระยะ</button>'
      : '<button type="button" class="primary-button compact" data-fb="near">⌖ จุดรอตรวจใกล้ฉัน</button>';
  }

  function fieldBarAction(e) {
    const b = e.target.closest('[data-fb]');
    if (!b) return;
    const a = b.dataset.fb;
    if (a === 'register' || a === 'login') return HSAdmin.openAccess(a === 'register' ? 'register' : 'phone');
    if (a === 'clearnear') { state.near = null; clearMe(); applyFilters(); renderFieldBar(); }
    if (a === 'near') {
      b.disabled = true; b.textContent = 'กำลังหาตำแหน่ง…';
      getPosition().then(p => {
        state.near = { lat: p.latitude, lng: p.longitude, accuracy: p.accuracy };
        $('statusFilter').value = 'pending';
        showMe(); applyFilters(); setLayout('list'); scrollToResults(); renderFieldBar();
      }).catch(err => { toast(err.message, true); renderFieldBar(); });
    }
  }
  function scrollToResults() { document.querySelector('.result-toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /* ================================================================ จังหวัดและข้อมูล HS */
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
    renderProvinceOptions();
    HSAdmin.provincesLoaded();
    const user = HSApi.user();
    let code = user && !C.can(user, 'chooseProvince') ? user.prov : (new URLSearchParams(location.search).get('province') || '');
    if (!code) { try { code = localStorage.getItem(LAST_PROVINCE) || ''; } catch (_) {} }
    if (code && provinceAllowed(code)) await loadProvince(code);
    else renderAll();
  }

  function provinceAllowed(code) {
    if (code === C.ALL) return C.can(HSApi.user(), 'allProvinces') && state.provinces.length > 0;
    return state.provinces.some(p => p.code === code);
  }
  function renderProvinceOptions() {
    const sel = $('provinceSelect'), user = HSApi.user();
    const total = state.provinces.reduce((n, p) => n + (Number(p.hsCount) || 0), 0);
    sel.innerHTML = '<option value="">— เลือกจังหวัด (' + state.provinces.length + ' จังหวัดที่มีข้อมูล HS) —</option>' +
      (C.can(user, 'allProvinces') && state.provinces.length ? '<option value="' + C.ALL + '">★ ทุกจังหวัดที่มีข้อมูล' + (total ? ' · ' + total.toLocaleString('th-TH') + ' จุด' : '') + '</option>' : '') +
      state.provinces.map(p => '<option value="' + esc(p.code) + '">' + esc(p.name) + (p.hsCount ? ' · ' + Number(p.hsCount).toLocaleString('th-TH') + ' จุด' : '') + '</option>').join('');
    sel.value = state.province && provinceAllowed(state.province) ? state.province : '';
    $('provinceFilter').innerHTML = '<option value="">ทุกจังหวัด</option>' + state.provinces.map(p => '<option value="' + esc(p.code) + '">' + esc(p.name) + '</option>').join('');
  }

  /** โหลด HS ทุกจังหวัดพร้อมกันครั้งละ 4 จังหวัด (ใช้แคชฝั่งเซิร์ฟเวอร์ของแต่ละจังหวัด) */
  async function loadAllProvinces() {
    const codes = state.provinces.map(p => p.code), out = new Array(codes.length);
    let next = 0, done = 0;
    const failed = [];
    const worker = async () => {
      while (next < codes.length) {
        const i = next++;
        try {
          out[i] = HSApi.configured() ? C.fromApi(await HSApi.get('hotspots', { province: codes[i] }))
            : C.fromSheetSource((await HSSheetSource.load(cfg.sourceSheetUrl, codes[i], C.PROVINCES)).rows);
        } catch (err) { failed.push(C.provinceName(codes[i])); out[i] = []; }
        done++;
        $('dataSourceLabel').textContent = 'กำลังอ่านจุดความร้อน ' + done + '/' + codes.length + ' จังหวัด…';
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, codes.length) }, worker));
    if (failed.length) showError('อ่านข้อมูลไม่สำเร็จบางจังหวัด: ' + failed.join(', ') + ' — กด “อัปเดตข้อมูล” เพื่อลองใหม่');
    return out.flat();
  }

  async function loadProvince(code, force) {
    const user = HSApi.user();
    if (user && !C.can(user, 'chooseProvince') && code !== user.prov) code = user.prov;
    if (code === C.ALL && !C.can(user, 'allProvinces')) code = '';
    $('provinceSelect').value = code || '';
    if (!code) { state.province = ''; state.rows = []; updateBrand(); renderAll(); return; }
    if (code !== state.province) { resetFilterControls(); state.fitPending = true; state.near = null; clearMe(); state.periodSet = false; }
    state.province = code;
    try { localStorage.setItem(LAST_PROVINCE, code); } catch (_) {}
    updateBrand();
    setLoading(true);
    $('liveError').hidden = true;
    try {
      if (code === C.ALL) {
        state.rows = await loadAllProvinces();
        state.source = 'ฐานข้อมูลผลตรวจ + จุด HS ทุกจังหวัด (' + state.provinces.length + ' จังหวัด) จากระบบ Agri-Risk Map';
      } else if (HSApi.configured()) {
        state.rows = C.fromApi(await HSApi.get('hotspots', { province: code }));
        state.source = 'ฐานข้อมูลผลตรวจ + จุด HS_' + code + ' จากระบบ Agri-Risk Map';
      } else {
        const res = await HSSheetSource.load(cfg.sourceSheetUrl, code, C.PROVINCES);
        state.rows = C.fromSheetSource(res.rows);
        state.source = 'Google Sheet ต้นทาง แท็บ HS_' + code + ' (อ่านอย่างเดียว)';
      }
      if (state.province !== code) return;
      const period = force === true && state.periodSet ? [$('startMonth').value, $('endMonth').value] : null;
      const preset = force === true && state.periodSet ? $('periodPreset').value : '';
      buildPeriodOptions();
      if (period) { $('startMonth').value = period[0]; $('endMonth').value = period[1]; $('periodPreset').value = [...$('periodPreset').options].some(o => o.value === preset) ? preset : 'custom'; }
      if (!period || !$('startMonth').value) setDefaultPeriod();
      state.periodSet = true;
      fillLocationFilters();
      fillCropFilter();
      loadBoundaries(code === C.ALL ? $('provinceFilter').value : code);
      applyFilters();
      const p = state.provinces.find(x => x.code === code);
      $('provinceCoverage').textContent = state.rows.length.toLocaleString('th-TH') + ' จุด' + (code === C.ALL ? ' จาก ' + state.provinces.length + ' จังหวัด' : '') + (p && p.firstDate ? ' · ข้อมูล ' + C.thaiDate(p.firstDate) + ' – ' + C.thaiDate(p.lastDate) : '');
      $('provinceFilterWrap').hidden = code !== C.ALL;
      const levelOpt = $('summaryLevel').querySelector('option[value=province]');
      levelOpt.hidden = code !== C.ALL;
      if (code === C.ALL && force !== true) $('summaryLevel').value = 'province';
      $('periodPreset').disabled = !state.rows.length;
      if (code !== C.ALL && $('summaryLevel').value === 'province') $('summaryLevel').value = 'amphoe';
      $('dataSourceLabel').textContent = 'แหล่งข้อมูล: ' + state.source + ' · ' + ($('provinceCoverage').textContent || '');
    } catch (err) {
      state.rows = [];
      showError('อ่านจุดความร้อน' + (code === C.ALL ? 'ทุกจังหวัด' : 'ของจังหวัด' + C.provinceName(code)) + ' ไม่สำเร็จ: ' + err.message);
      renderAll();
    } finally { setLoading(false); renderFieldBar(); }
  }

  function updateBrand() {
    const code = state.province;
    const logo = code && code !== C.ALL && globalThis.HS_PROVINCE_LOGOS && HS_PROVINCE_LOGOS[code];
    $('provinceLogo').hidden = !logo;
    $('provinceLogoFallback').hidden = Boolean(logo);
    if (logo) { $('provinceLogo').src = logo.path; $('provinceLogo').alt = 'ตราประจำจังหวัด' + C.provinceName(code); }
    $('areaSubtitle').textContent = code && code !== C.ALL ? 'พื้นที่การเกษตรในจังหวัด' + C.provinceName(code) : 'พื้นที่การเกษตรของประเทศไทย';
  }

  function setLoading(on) {
    $('refreshDataButton').disabled = on; $('refreshDataButton').classList.toggle('spin', on);
    $('resultCount').closest('.result-toolbar').classList.toggle('loading', on);
  }
  function showError(msg) { $('liveError').hidden = false; $('liveError').textContent = msg; }

  /* ================================================================ ตัวกรอง */
  /** ช่วงเวลา: เลือกปีงบประมาณ (ต.ค.–ก.ย.) ได้ในคลิกเดียว หรือ “ทั้งหมด” / “กำหนดเอง” */
  function identityText(u) {
    const role = C.ROLE_LABELS[u.role] || '';
    const parts = [u.name];
    if (role && String(u.name).indexOf(role) < 0) parts.push(role);
    if (u.role !== 'superadmin') parts.push(C.scopeLabel(u));
    return parts.join(' · ');
  }
  const shortMonth = m => C.monthLabel(m).replace(/(\d{2})(\d{2})$/, '$2');
  function buildPeriodOptions() {
    const groups = C.fiscalGroups(C.monthsBetween(state.rows));
    const opts = groups.map(g => '<optgroup label="ปีงบประมาณ ' + g.year + '">' + g.months.map(m => '<option value="' + m + '">' + esc(C.monthLabel(m)) + '</option>').join('') + '</optgroup>').join('');
    $('startMonth').innerHTML = opts; $('endMonth').innerHTML = opts;
    $('periodPreset').innerHTML = groups.map(g => '<option value="fy:' + g.year + '">ปีงบ ' + g.year + ' (' + esc(shortMonth(g.months[0])) + '–' + esc(shortMonth(g.months[g.months.length - 1])) + ')</option>').join('') +
      (groups.length > 1 ? '<option value="all">ทุกช่วงเวลา</option>' : '') + '<option value="custom">กำหนดเอง…</option>';
  }
  function applyPreset(v) {
    const months = C.monthsBetween(state.rows);
    $('customPeriod').hidden = v !== 'custom';
    if (v === 'custom') { toggleFilters(true); return; }
    if (v === 'all') { $('startMonth').value = months[0] || ''; $('endMonth').value = months[months.length - 1] || ''; return; }
    const y = Number(String(v).slice(3)), ce = y - 543;
    $('startMonth').value = pickMonth((ce - 1) + '-10', 'start'); $('endMonth').value = pickMonth(ce + '-09', 'end');
  }
  function toggleFilters(force) {
    const open = typeof force === 'boolean' ? force : $('filterPanel').hidden;
    $('filterPanel').hidden = !open;
    $('filterToggle').setAttribute('aria-expanded', String(open));
    $('filterToggle').classList.toggle('open', open);
  }
  function clearFilter(key) {
    if (key === 'province') { $('provinceFilter').value = ''; loadBoundaries(''); }
    if (key === 'province' || key === 'district') $('districtFilter').value = '';
    if (key === 'province' || key === 'district' || key === 'tambon') $('tambonFilter').value = '';
    if (['province', 'district', 'tambon', 'village'].includes(key)) $('villageFilter').value = '';
    if (key === 'crop') $('cropFilter').value = '';
    if (key === 'status') $('statusFilter').value = '';
    if (key === 'result') $('resultFilter').value = '';
    if (key === 'search') $('searchFilter').value = '';
    if (key === 'all') return resetFilters();
    fillLocationFilters(); state.fitPending = true; applyFilters(); drawBoundaries();
  }
  function pickMonth(target, edge) {
    const months = C.monthsBetween(state.rows);
    if (!months.length) return '';
    if (edge === 'start') return months.find(m => m >= target) || months[months.length - 1];
    return months.slice().reverse().find(m => m <= target) || months[0];
  }
  function setDefaultPeriod() {
    const p = C.defaultPeriod(state.rows);
    $('startMonth').value = p.start ? pickMonth(p.start, 'start') : ''; $('endMonth').value = p.end ? pickMonth(p.end, 'end') : '';
    const first = $('periodPreset').options[0];
    if (first) { $('periodPreset').value = first.value; applyPreset(first.value); }
  }
  function filters() {
    let start = $('startMonth').value, end = $('endMonth').value;
    if (start && end && start > end) [start, end] = [end, start];
    return { start, end, province: allMode() ? $('provinceFilter').value : '', district: $('districtFilter').value, tambon: $('tambonFilter').value, village: $('villageFilter').value, crop: $('cropFilter').value, status: $('statusFilter').value, result: $('resultFilter').value, search: $('searchFilter').value };
  }
  function fillSelect(id, values, allLabel) {
    const sel = $(id), current = sel.value;
    sel.innerHTML = '<option value="">' + allLabel + '</option>' + values.map(v => '<option>' + esc(v) + '</option>').join('');
    sel.value = values.includes(current) ? current : '';
  }
  function fillLocationFilters() {
    const f = filters();
    const inPeriod = r => (!f.start || C.monthKey(r.date) >= f.start) && (!f.end || C.monthKey(r.date) <= f.end) && (!f.province || r.provinceCode === f.province);
    const needProvince = allMode() && !f.province;
    fillSelect('districtFilter', needProvince ? [] : C.distinct(state.rows, 'district', inPeriod), needProvince ? 'เลือกจังหวัดก่อน' : 'ทุกอำเภอ');
    $('districtFilter').disabled = needProvince;
    const d = $('districtFilter').value;
    fillSelect('tambonFilter', d ? C.distinct(state.rows, 'tambon', r => inPeriod(r) && r.district === d) : [], d ? 'ทุกตำบล' : 'เลือกอำเภอก่อน');
    const t = $('tambonFilter').value;
    fillSelect('villageFilter', t ? C.distinct(state.rows, 'village', r => inPeriod(r) && r.district === d && r.tambon === t) : [], t ? 'ทุกหมู่บ้าน' : 'เลือกตำบลก่อน');
    $('tambonFilter').disabled = !d; $('villageFilter').disabled = !t;
  }
  function fillCropFilter() { fillSelect('cropFilter', C.distinct(state.rows, 'plantType'), 'ทุกประเภท'); }
  function resetFilterControls() {
    ['provinceFilter', 'districtFilter', 'tambonFilter', 'villageFilter', 'cropFilter', 'statusFilter', 'resultFilter', 'searchFilter'].forEach(id => { $(id).value = ''; });
  }
  function resetFilters() {
    resetFilterControls(); setDefaultPeriod(); fillLocationFilters(); state.fitPending = true; state.near = null; clearMe(); applyFilters(); drawBoundaries(); renderFieldBar();
  }
  function applyFilters() {
    let rows = C.applyFilters(state.rows, filters());
    rows = state.near ? C.byDistance(rows, state.near.lat, state.near.lng) : rows.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    state.filtered = rows;
    state.visible = PAGE;
    const f = filters();
    $('periodHint').textContent = f.start ? 'แสดงจุดตั้งแต่ ' + C.monthLabel(f.start) + ' ถึง ' + C.monthLabel(f.end) + ' · ปีงบประมาณเริ่มเดือนตุลาคม' : '';
    $('sortHint').hidden = !state.near;
    if (state.near) $('sortHint').textContent = 'เรียงจากจุดที่ใกล้ตำแหน่งของท่านที่สุด (ระยะเส้นตรง)';
    renderChips();
    renderAll();
  }
  /** ตัวกรองที่ใช้อยู่แสดงเป็นป้าย กด × เพื่อนำออก */
  function renderChips() {
    const f = filters(), chips = [];
    if (f.province) chips.push(['province', 'จ.' + C.provinceName(f.province)]);
    if (f.district) chips.push(['district', 'อ.' + f.district]);
    if (f.tambon) chips.push(['tambon', 'ต.' + f.tambon]);
    if (f.village) chips.push(['village', f.village]);
    if (f.crop) chips.push(['crop', f.crop]);
    if (f.status) chips.push(['status', C.STATUS_LABELS[f.status]]);
    if (f.result) chips.push(['result', C.RESULT_LABELS[f.result]]);
    if (f.search) chips.push(['search', '“' + f.search + '”']);
    $('filterCount').hidden = !chips.length;
    $('filterCount').textContent = chips.length;
    $('filterChips').innerHTML = chips.length ? chips.map(([k, label]) => '<button type="button" class="chip" data-clear="' + k + '" aria-label="นำตัวกรอง ' + esc(label) + ' ออก">' + esc(label) + ' <span aria-hidden="true">×</span></button>').join('') + (chips.length > 1 ? '<button type="button" class="chip clear" data-clear="all">ล้างทั้งหมด</button>' : '') : '';
  }

  /* ================================================================ แสดงผล */
  function renderAll() {
    $('resultCount').textContent = state.filtered.length.toLocaleString('th-TH');
    const t = C.tally(state.filtered);
    $('selectedCount').innerHTML = state.filtered.length ? '<span class="tally ok">ตรวจแล้ว ' + t.verified.toLocaleString('th-TH') + '</span><span class="tally wait">รอตรวจ ' + t.pending.toLocaleString('th-TH') + '</span>' + (t.burned ? '<span class="tally fire">พบการเผา ' + t.burned.toLocaleString('th-TH') + '</span>' : '') : state.province ? '' : '<span class="muted">เลือกจังหวัดเพื่อเริ่ม</span>';
    renderList(); renderMarkers(); renderSummary(); renderFieldBar();
  }

  function renderList() {
    const list = $('hotspotList');
    const items = state.filtered.slice(0, state.visible);
    if (!state.province) list.innerHTML = '<div class="empty-state">กรุณาเลือกจังหวัดก่อนแสดงจุดความร้อน</div>';
    else if (!items.length) list.innerHTML = '<div class="empty-state"><strong>ไม่พบจุดที่ตรงกับตัวกรอง</strong><br>ลองล้างหรือเปลี่ยนตัวกรอง</div>';
    else {
      const user = HSApi.user(), canRecord = C.can(user, 'record', { province: state.province });
      list.innerHTML = items.map(r => card(r, canRecord)).join('');
    }
    $('loadMore').hidden = state.visible >= state.filtered.length;
    if (!$('loadMore').hidden) $('loadMore').textContent = 'แสดงเพิ่ม (เหลือ ' + (state.filtered.length - state.visible).toLocaleString('th-TH') + ')';
  }
  const statusText = r => r.result ? C.RESULT_LABELS[r.result] + (r.status === 'draft' ? ' (ร่าง)' : '') : C.STATUS_LABELS[r.status] || 'รอตรวจ';
  const statusClass = r => r.status === 'verified' && r.result ? r.result : r.status;
  const areaLabel = r => [r.village, r.tambon, r.district].concat(allMode() ? ['จ.' + C.provinceName(r.provinceCode)] : []).filter(Boolean).join(' · ') || 'ไม่ระบุพื้นที่';
  function card(r, canRecord) {
    const todo = canRecord && r.status === 'pending';
    return '<article class="hotspot-card' + (todo ? ' todo' : '') + '" data-hs-id="' + esc(r.hsId) + '" tabindex="0" role="button" aria-label="' + esc('จุด ' + r.hsId + ' ' + areaLabel(r) + ' ' + statusText(r)) + '">' +
      '<div class="row"><h3>' + esc(areaLabel(r)) + '</h3><span class="status-pill ' + esc(statusClass(r)) + '">' + esc(statusText(r)) + '</span></div>' +
      '<p>' + esc(r.plantType) + ' · ' + esc(C.thaiDate(r.date)) + (r.time ? ' ' + esc(r.time) + ' น.' : '') + (r.photoCount ? ' · ภาพ ' + r.photoCount : '') + (r.distance != null ? ' · <span class="distance">ห่าง ' + esc(C.formatDistance(r.distance)) + '</span>' : '') + '</p>' +
      '<div class="card-actions"><span class="hotspot-id">' + esc(r.hsId) + '</span><button type="button" class="icon-text" data-show-map aria-label="แสดงจุด ' + esc(r.hsId) + ' บนแผนที่">⌖ แผนที่</button>' +
      (canRecord ? '<span class="card-cta' + (todo ? ' todo' : '') + '">' + (todo ? 'บันทึกผล ›' : 'ดู / แก้ไข ›') + '</span>' : '') + '</div></article>';
  }
  const markerColor = r => r.status === 'draft' ? C.COLORS.draft : r.status === 'verified' ? (C.COLORS[r.result] || C.COLORS.not_found) : C.COLORS.pending;

  function renderMarkers() {
    if (!state.map) return;
    state.markers.clearLayers();
    state.markerById = {};
    const bounds = [];
    state.filtered.forEach(r => {
      const m = L.circleMarker([r.lat, r.lng], { radius: 8, weight: 2, color: '#fff', fillColor: markerColor(r), fillOpacity: .95 });
      m.bindTooltip('<strong>' + esc(r.hsId) + '</strong><br>' + esc(areaLabel(r)) + '<br>' + esc(statusText(r)));
      m.on('click', () => openVerify(r));
      m.addTo(state.markers); bounds.push([r.lat, r.lng]);
      state.markerById[r.hsId] = m;
    });
    if (state.fitPending && bounds.length) { state.map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 }); state.fitPending = false; }
  }
  function showOnMap(r) {
    if (!state.map || !r) return;
    setLayout('map');
    document.querySelector('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    state.map.setView([r.lat, r.lng], 15);
    const m = state.markerById && state.markerById[r.hsId];
    if (m) m.openTooltip();
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
    $('summaryScopeHint').textContent = scopeName() + (f.province ? ' › จังหวัด' + C.provinceName(f.province) : '') + (f.district ? ' › อำเภอ' + f.district : '') + (f.tambon ? ' › ตำบล' + f.tambon : '') + (f.start ? ' · ' + C.monthLabel(f.start) + ' – ' + C.monthLabel(f.end) : '');
    const groups = C.groupSummary(rows, $('summaryLevel').value);
    $('summaryBody').innerHTML = groups.length ? groups.map(g => '<tr><td data-label="พื้นที่">' + esc(g.area) + '</td><td data-label="ทั้งหมด">' + g.total + '</td><td data-label="ตรวจแล้ว">' + g.verified + '</td><td data-label="พบการเผา">' + g.burned + '</td><td data-label="ไม่พบการเผา">' + g.not_burned + '</td><td data-label="งานร่าง">' + g.draft + '</td><td data-label="ความคืบหน้า"><div class="progress" role="img" aria-label="' + g.progress + '%"><i style="width:' + g.progress + '%"></i></div><small>' + g.progress + '%</small></td></tr>').join('') : '<tr><td colspan="7" class="muted">ไม่มีข้อมูลในขอบเขตนี้</td></tr>';
  }

  function exportSummary() {
    const groups = C.groupSummary(summaryRows(), $('summaryLevel').value);
    download('สรุปผลตรวจ_' + scopeName() + '.csv', C.toCsv([
      { label: 'พื้นที่', key: 'area' }, { label: 'ทั้งหมด', key: 'total' }, { label: 'ตรวจแล้ว', key: 'verified' }, { label: 'พบการเผา', key: 'burned' },
      { label: 'ไม่พบการเผา', key: 'not_burned' }, { label: 'ติดตาม', key: 'followup' }, { label: 'งานร่าง', key: 'draft' }, { label: 'รอตรวจ', key: 'pending' }, { label: 'ความคืบหน้า %', key: 'progress' }
    ], groups));
  }

  function printReport() {
    const rows = summaryRows(), t = C.tally(rows);
    const groups = C.groupSummary(rows, $('summaryLevel').value);
    const burned = rows.filter(r => r.status === 'verified' && r.result === 'burned').slice(0, 300);
    const logo = !allMode() && globalThis.HS_PROVINCE_LOGOS && HS_PROVINCE_LOGOS[state.province];
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    const html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานผลตรวจสอบจุดความร้อน ' + esc(scopeName()) + '</title><base href="' + esc(base) + '">' +
      '<style>@page{size:A4 landscape;margin:12mm}body{font-family:"Sarabun","Noto Sans Thai",sans-serif;color:#1f2328;font-size:12px}header{display:flex;gap:12px;align-items:center;border-bottom:3px solid #1a7f37;padding-bottom:8px}header img{height:56px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #c9d1d9;padding:4px 6px;text-align:left}th{background:#dafbe1}.stats{display:flex;gap:8px;margin:10px 0}.stats div{border:1px solid #c9d1d9;border-radius:8px;padding:6px 10px}.stats b{display:block;font-size:18px}footer{margin-top:12px;color:#57606a;font-size:10px}</style></head><body>' +
      '<header><img src="assets/logo-doae.png" alt="">' + (logo ? '<img src="' + esc(logo.path) + '" alt="">' : '') + '<div><h1>รายงานผลการตรวจสอบจุดความร้อนในพื้นที่การเกษตร ' + esc(scopeName()) + '</h1><div>' + esc($('summaryScopeHint').textContent) + '</div></div></header>' +
      '<div class="stats"><div><b>' + t.total + '</b>จุดทั้งหมด</div><div><b>' + t.verified + '</b>ตรวจแล้ว (' + t.progress + '%)</div><div><b>' + t.burned + '</b>พบการเผา</div><div><b>' + t.not_burned + '</b>ไม่พบการเผา</div><div><b>' + t.followup + '</b>ติดตาม/ตรวจซ้ำ</div><div><b>' + (t.pending + t.draft) + '</b>รอตรวจ/ร่าง</div></div>' +
      '<table><thead><tr><th>พื้นที่</th><th>ทั้งหมด</th><th>ตรวจแล้ว</th><th>พบการเผา</th><th>ไม่พบการเผา</th><th>งานร่าง</th><th>ความคืบหน้า</th></tr></thead><tbody>' +
      groups.map(g => '<tr><td>' + esc(g.area) + '</td><td>' + g.total + '</td><td>' + g.verified + '</td><td>' + g.burned + '</td><td>' + g.not_burned + '</td><td>' + g.draft + '</td><td>' + g.progress + '%</td></tr>').join('') + '</tbody></table>' +
      (burned.length ? '<h2 style="font-size:14px;margin-top:14px">จุดที่ยืนยันพบการเผา</h2><table><thead><tr><th>HS</th><th>วันที่</th><th>อำเภอ</th><th>ตำบล</th><th>หมู่บ้าน</th><th>พืช</th><th>วันที่ตรวจ</th></tr></thead><tbody>' + burned.map(r => '<tr><td>' + esc(r.hsId) + '</td><td>' + esc(C.thaiDate(r.date)) + '</td><td>' + esc(r.district) + '</td><td>' + esc(r.tambon) + '</td><td>' + esc(r.village) + '</td><td>' + esc(r.plantType) + '</td><td>' + esc(C.thaiDate(r.inspectedDate)) + '</td></tr>').join('') + '</tbody></table>' : '') +
      '<footer>พิมพ์เมื่อ ' + esc(new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })) + ' · แหล่ง HS: ฐานข้อมูล Agri-Risk Map Burning · ระบบตรวจสอบจุดความร้อน v3</footer><script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>';
    const w = window.open('', '_blank');
    if (!w) return toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up', true);
    w.document.open(); w.document.write(html); w.document.close();
  }

  function switchView(name) {
    toggleMenu(false);
    if (name === 'admin' && !HSApi.user()) return HSAdmin.openAccess('phone');
    document.querySelectorAll('.view').forEach(v => { const on = v.id === name + 'View'; v.classList.toggle('active', on); v.hidden = !on; });
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('provinceGate').hidden = name === 'admin';
    $('backToMap').hidden = true;
    if (name === 'summary') renderSummary();
    if (name === 'admin') HSAdmin.render();
    if (name === 'work' && state.map) setTimeout(() => state.map.invalidateSize(), 30);
    window.scrollTo({ top: 0 });
  }
  function setLayout(layout) {
    document.querySelectorAll('[data-layout]').forEach(b => b.classList.toggle('active', b.dataset.layout === layout));
    document.querySelector('.map-wrap').hidden = layout === 'list';
    $('mapLayout').classList.toggle('list-only', layout === 'list');
    if (layout === 'map' && state.map) setTimeout(() => state.map.invalidateSize(), 30);
  }
  function watchBackToMap() {
    if (!('IntersectionObserver' in window)) return;
    const panel = document.querySelector('.result-panel'), toolbar = document.querySelector('.result-toolbar');
    let panelVisible = false, toolbarVisible = true;
    const update = () => { $('backToMap').hidden = !(mobile() && panelVisible && !toolbarVisible && !$('workView').hidden); };
    new IntersectionObserver(e => { panelVisible = e[0].isIntersecting; update(); }).observe(panel);
    new IntersectionObserver(e => { toolbarVisible = e[0].isIntersecting; update(); }).observe(toolbar);
  }

  /* ================================================================ แผนที่และขอบเขต */
  function initMap() {
    if (!window.L) { $('mapFallback').hidden = false; return; }
    try {
      state.map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([15.5, 100.8], 6);
      const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.map);
      const satellite = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
      const terrain = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
      state.boundaryLayer = L.layerGroup().addTo(state.map);
      state.markers = L.layerGroup().addTo(state.map);
      state.meLayer = L.layerGroup().addTo(state.map);
      L.control.layers({ 'ถนน': streets, 'ดาวเทียม': satellite, 'ภูมิประเทศ': terrain }, {}, { collapsed: true }).addTo(state.map);
      const Tools = L.Control.extend({
        options: { position: 'topright' },
        onAdd() {
          const div = L.DomUtil.create('div', 'map-tools leaflet-bar');
          div.innerHTML = '<label><input type="checkbox" id="boundaryDistrictOn" checked>อำเภอ</label><label><input type="checkbox" id="boundarySubdistrictOn">ตำบล</label><button type="button" id="boundaryFit" title="ดูเต็มจังหวัด" aria-label="ดูเต็มจังหวัด">⤢<span class="t"> เต็มจังหวัด</span></button><button type="button" id="mapLocate" title="ตำแหน่งของฉัน" aria-label="ตำแหน่งของฉัน">⌖<span class="t"> ตำแหน่งฉัน</span></button>';
          L.DomEvent.disableClickPropagation(div);
          return div;
        }
      });
      new Tools().addTo(state.map);
      $('boundaryDistrictOn').addEventListener('change', drawBoundaries);
      $('boundarySubdistrictOn').addEventListener('change', drawBoundaries);
      $('boundaryFit').addEventListener('click', fitProvince);
      $('mapLocate').addEventListener('click', () => getPosition().then(p => { state.near = state.near || null; showMe(p); state.map.setView([p.latitude, p.longitude], 14); }).catch(err => toast(err.message, true)));
    } catch (err) { $('mapFallback').hidden = false; state.map = null; }
  }

  async function loadBoundaries(code) {
    if (!code) { state.boundary = {}; return drawBoundaries(); }
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
    if (b.district && $('boundaryDistrictOn').checked) L.geoJSON(b.district, { style: ft => style('#75530c', ft.properties.nameTH === f.district ? 3.5 : 1.4) }).addTo(state.boundaryLayer);
    if (b.subdistrict && $('boundarySubdistrictOn').checked) L.geoJSON(b.subdistrict, { style: ft => style('#6f57a1', ft.properties.nameTH === f.tambon ? 3 : 1, ft.properties.nameTH === f.tambon ? '' : '3 3') }).addTo(state.boundaryLayer);
  }
  function fitProvince() {
    const b = state.boundary;
    if (state.map && b.province) state.map.fitBounds(L.geoJSON(b.province).getBounds(), { padding: [10, 10] });
  }
  function showMe(p) {
    if (!state.map) return;
    const pos = p || (state.near && { latitude: state.near.lat, longitude: state.near.lng, accuracy: state.near.accuracy });
    if (!pos) return;
    state.meLayer.clearLayers();
    if (pos.accuracy) L.circle([pos.latitude, pos.longitude], { radius: pos.accuracy, color: '#1d5f8f', weight: 1, fillOpacity: .08, interactive: false }).addTo(state.meLayer);
    L.circleMarker([pos.latitude, pos.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: '#1d6fd1', fillOpacity: 1 }).bindTooltip('ตำแหน่งของฉัน').addTo(state.meLayer);
  }
  function clearMe() { if (state.meLayer) state.meLayer.clearLayers(); }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('อุปกรณ์ไม่รองรับการระบุตำแหน่ง'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
        err => reject(new Error(err.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งให้เบราว์เซอร์ หรือเลือก “บันทึกโดยไม่มี GPS”' : 'หาตำแหน่งไม่สำเร็จ ลองอีกครั้งในที่โล่ง')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
    });
  }

  /* ================================================================ ฟอร์มบันทึกผล */
  function fillPersonCategories() {
    $('personCategory').innerHTML = '<option value="">เลือกประเภทบุคคล</option>' + C.PERSON_CATEGORIES.map(c => '<option>' + esc(c) + '</option>').join('');
  }
  const outcome = () => (document.querySelector('input[name=outcome]:checked') || {}).value || '';

  function resetForm() {
    $('verifyForm').reset();
    state.photos = []; state.location = null; state.record = null; state.existingPhotos = [];
    $('personOtherWrap').hidden = true; $('noGpsReasonWrap').hidden = true; $('fireStateWrap').hidden = true; $('observedFields').hidden = true;
    $('verifyMessage').textContent = ''; $('recordInfo').textContent = ''; $('noteCount').textContent = '0/500';
    try { const last = localStorage.getItem(LAST_PERSON); if (last && C.PERSON_CATEGORIES.includes(last)) $('personCategory').value = last; } catch (_) {}
    $('existingPhotos').innerHTML = ''; renderPhotos(); renderLocation();
  }

  function setMode(mode, text) {
    // mode: edit | readonly | gate
    $('verifyGate').hidden = mode !== 'gate';
    $('verifyGateText').textContent = text || '';
    $('verifyFields').hidden = mode === 'gate';
    $('verifyFields').disabled = mode !== 'edit';
    $('verifyActions').hidden = mode !== 'edit';
    $('locateButton').hidden = mode !== 'edit';
  }

  function gate(which) {
    state.pendingHs = state.selected && state.selected.hsId;
    closeVerify(true);
    HSAdmin.openAccess(which);
  }

  async function openVerify(r) {
    if (!r) return;
    resetForm();
    state.selected = r;
    $('verifyTitle').textContent = 'จุด HS ' + r.hsId;
    $('selectedMeta').innerHTML = '<div class="meta-grid compact-meta"><span><small>วันที่ตรวจพบ</small><strong>' + esc(C.thaiDate(r.date)) + (r.time ? ' ' + esc(r.time) + ' น.' : '') + '</strong></span><span><small>สถานะ</small><strong>' + esc(statusText(r)) + '</strong></span><span><small>พืช/พื้นที่</small><strong>' + esc(r.plantType) + '</strong></span><span><small>พิกัด</small><strong>' + r.lat.toFixed(5) + ', ' + r.lng.toFixed(5) + '</strong></span><span class="meta-wide"><small>ที่ตั้ง</small><strong>' + esc(areaLabel(r)) + ' จ.' + esc(C.provinceName(r.provinceCode)) + '</strong></span></div>';
    $('navigateLink').href = 'https://www.google.com/maps/dir/?api=1&destination=' + r.lat + ',' + r.lng;
    const user = HSApi.user();
    const allowed = C.can(user, 'record', { province: r.provinceCode });
    $('deleteVerificationButton').hidden = true;
    if (!HSApi.configured()) setMode('gate', 'ระบบยังไม่ได้เชื่อมฐานข้อมูลผลตรวจ จึงดูข้อมูลจุดได้อย่างเดียว');
    else if (!user) setMode('gate', 'บันทึกผลการตรวจต้องเข้าสู่ระบบด้วยเบอร์โทร — ยังไม่มีบัญชี ลงทะเบียน Admin แล้วใช้งานได้ทันที ระบบจะเปิดจุดนี้ให้อัตโนมัติ');
    else if (!allowed) setMode('gate', 'บัญชีของท่านบันทึกผลได้เฉพาะ' + C.scopeLabel(user));
    else setMode('edit');
    $('gateLogin').hidden = $('gateRegister').hidden = Boolean(user) || !HSApi.configured();
    $('verifyDialog').showModal();
    $('verifyDialog').querySelector('form').scrollTop = 0;
    if (!allowed || !HSApi.configured()) return;
    autoLocate();
    if (r.status === 'pending') $('recordInfo').textContent = 'ยังไม่มีผลตรวจของจุดนี้ — กรอกผลแล้วกด “ตรวจทานและยืนยัน”';
    else $('recordInfo').textContent = 'กำลังอ่านผลตรวจเดิม…';
    try {
      const data = await HSApi.post('verification_get', { province: r.provinceCode, hotspotId: r.hsId });
      if (state.selected !== r) return;
      state.record = data.verification;
      state.existingPhotos = data.photos || [];
      if (state.record) {
        fillForm(state.record);
        const editable = state.record.canEdit;
        setMode(editable ? 'edit' : 'readonly');
        $('deleteVerificationButton').hidden = !state.record.canDelete;
        $('recordInfo').textContent = 'บันทึกโดย ' + state.record.recordedByName + ' (' + (C.ROLE_LABELS[state.record.recordedByRole] || '') + ') ' + C.thaiDateTime(state.record.createdAt) + (state.record.updatedByName ? ' · แก้ไขล่าสุด ' + state.record.updatedByName + ' ' + C.thaiDateTime(state.record.updatedAt) : '') + (editable ? '' : ' · ดูได้อย่างเดียว: ผู้บันทึกเดิมหรือผู้ดูแลจังหวัดเท่านั้นที่แก้ไขได้');
      } else $('recordInfo').textContent = 'ยังไม่มีผลตรวจของจุดนี้ — กรอกผลแล้วกด “ตรวจทานและยืนยัน”';
      renderExistingPhotos();
    } catch (err) {
      $('recordInfo').textContent = err.network ? 'ออฟไลน์ — บันทึกได้ ระบบจะเก็บไว้ในเครื่องและส่งเมื่อมีสัญญาณ' : 'อ่านผลตรวจเดิมไม่สำเร็จ: ' + err.message;
    }
  }

  async function autoLocate() {
    try {
      if (!navigator.permissions) return;
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state === 'granted' && !state.location) locate(false);
    } catch (_) {}
  }

  function fillForm(v) {
    const set = (id, val) => { $(id).value = val == null ? '' : val; };
    set('personCategory', v.personCategory); $('personOtherWrap').hidden = v.personCategory !== 'อื่นๆ'; set('personCategoryOther', v.personCategoryOther);
    if (v.fieldInspectorName && v.fieldInspectorName !== v.recordedByName) set('fieldInspectorName', v.fieldInspectorName);
    set('inspectedAt', String(v.inspectedAt || '').slice(0, 16));
    const radio = document.querySelector('input[name=outcome][value="' + v.result + '"]'); if (radio) radio.checked = true;
    $('fireStateWrap').hidden = v.result !== 'burned'; set('fireState', v.fireState || 'unknown');
    set('observedMatches', v.observedMatches); $('observedFields').hidden = v.observedMatches !== 'no'; set('observedLandType', v.observedLandType || 'พื้นที่เกษตร'); set('observedPlantType', v.observedPlantType);
    if (v.obsLat !== '' && v.obsLat != null) state.location = { latitude: Number(v.obsLat), longitude: Number(v.obsLng), accuracy: Number(v.gpsAccuracyM) || null, saved: true };
    else if (v.missingGpsReason) { $('noGps').checked = true; $('noGpsReasonWrap').hidden = false; set('noGpsReason', v.missingGpsReason); }
    set('photoMissingReason', v.photoMissingReason); set('noteInput', v.notes); set('actionInput', v.followUpAction);
    $('noteCount').textContent = String(v.notes || '').length + '/500';
    renderLocation();
  }

  function locate(manual) {
    const btn = $('locateButton');
    btn.disabled = true; btn.textContent = 'กำลังหาตำแหน่ง…';
    getPosition().then(p => {
      state.location = p;
      $('noGps').checked = false; $('noGpsReasonWrap').hidden = true; $('noGpsReason').value = '';
      renderLocation();
    }).catch(err => { if (manual) toast(err.message, true); })
      .finally(() => { btn.disabled = false; btn.textContent = '⌖ ใช้ตำแหน่งของฉัน'; });
  }
  function renderLocation() {
    const l = state.location, r = state.selected;
    const panel = $('locationPanel');
    if (!l) { panel.className = 'location-panel'; panel.innerHTML = '<span class="location-icon">⌖</span><div><strong>ยังไม่ได้บันทึกตำแหน่ง</strong><small>กด “ใช้ตำแหน่งของฉัน” เมื่ออยู่หน้างาน</small></div>'; return; }
    const d = r ? C.distanceM(r.lat, r.lng, l.latitude, l.longitude) : null;
    panel.className = 'location-panel ok';
    panel.innerHTML = '<span class="location-icon">✓</span><div><strong>' + l.latitude.toFixed(6) + ', ' + l.longitude.toFixed(6) + '</strong><small>' + (l.accuracy ? 'ความแม่นยำ ±' + l.accuracy + ' ม. · ' : '') + (d != null ? 'ห่างจุด HS ' + C.formatDistance(d) : '') + (l.saved ? ' · ตำแหน่งที่บันทึกไว้' : '') + '</small></div>';
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
        $('photoMissingReason').value = '';
      } catch (err) { toast(err.message, true); }
    }
    renderPhotos();
  }
  function renderPhotos() {
    $('photoPreview').innerHTML = state.photos.map((p, i) => '<div class="photo-item"><img src="' + p.preview + '" alt="ภาพใหม่ ' + (i + 1) + '"><button type="button" data-remove="' + i + '" aria-label="นำภาพออก">×</button></div>').join('');
  }
  function renderExistingPhotos() {
    const canEdit = state.record && state.record.canEdit;
    $('existingPhotos').innerHTML = state.existingPhotos.map(p => '<div class="photo-item" data-photo="' + esc(p.photoId) + '"><button type="button" class="photo-load" data-load="' + esc(p.photoId) + '">ดูภาพที่บันทึกไว้<br><small>' + esc(C.thaiDateTime(p.uploadedAt)) + '</small></button>' + (canEdit ? '<button type="button" data-delete-photo="' + esc(p.photoId) + '" aria-label="ลบภาพ">×</button>' : '') + '</div>').join('');
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
      photoMissingReason: state.photos.length ? '' : $('photoMissingReason').value, plannedPhotos: state.photos.length,
      notes: $('noteInput').value, followUpAction: $('actionInput').value
    };
  }
  function validate(p) {
    if (p.status !== 'verified') return null;
    if (p.obsLat === '' && !p.missingGpsReason) return ['locationPanel', 'ขั้นที่ 1: กด “ใช้ตำแหน่งของฉัน” หรือเลือกบันทึกโดยไม่มี GPS พร้อมเหตุผล'];
    if (!p.result) return ['verifyFields', 'ขั้นที่ 2: กรุณาเลือกผลการตรวจ'];
    if (!state.photos.length && !state.existingPhotos.length && !p.photoMissingReason) return ['photoMissingReason', 'ขั้นที่ 3: แนบภาพถ่าย หรือเลือกเหตุผลที่ไม่มีภาพ'];
    if (p.personCategory === 'อื่นๆ' && !p.personCategoryOther.trim()) return ['personCategoryOther', 'กรุณาระบุประเภทบุคคลอื่น'];
    return null;
  }
  function showProblem(problem) {
    $('verifyMessage').textContent = problem[1];
    const target = problem[0] === 'verifyFields' ? document.querySelector('.outcome-grid') : $(problem[0]);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(problem[1], true);
  }
  function review() {
    const p = payload('verified'), problem = validate(p);
    if (problem) return showProblem(problem);
    const r = state.selected;
    $('confirmSummary').innerHTML = '<p><strong>' + esc(r.hsId) + '</strong><br>' + esc(areaLabel(r)) + '</p><p>ผลตรวจ: <strong>' + esc(C.RESULT_LABELS[p.result]) + '</strong></p><p>ตำแหน่ง: ' + (p.obsLat !== '' ? p.obsLat + ', ' + p.obsLng : 'ไม่มี GPS (' + esc($('noGpsReason').selectedOptions[0].textContent) + ')') + '</p><p>ภาพใหม่ ' + state.photos.length + ' ภาพ' + (state.existingPhotos.length ? ' · ภาพเดิม ' + state.existingPhotos.length + ' ภาพ' : '') + '</p>';
    $('confirmDialog').showModal();
  }

  async function submit(status) {
    if (state.busy) return;
    const p = payload(status), problem = validate(p);
    if (problem) return showProblem(problem);
    const job = { id: p.clientRequestId, payload: p, photos: state.photos.map(x => ({ clientRequestId: x.clientRequestId, mimeType: x.mimeType, base64: x.base64, photoLat: x.photoLat, photoLng: x.photoLng, takenAt: x.takenAt })), createdAt: new Date().toISOString(), hsId: state.selected.hsId };
    state.busy = true; $('verifyMessage').textContent = state.photos.length ? 'กำลังส่งผลตรวจและภาพ ' + state.photos.length + ' ภาพ…' : 'กำลังส่งข้อมูล…';
    $('saveDraftButton').disabled = $('reviewSubmitButton').disabled = true;
    try {
      const saved = await HSOutbox.run(job, HSApi);
      updateRow(state.selected, saved.verification, job.photos.length);
      toast(status === 'verified' ? '✓ บันทึกผลการตรวจแล้ว' : 'เก็บงานร่างแล้ว');
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

  function closeVerify(keepPending) {
    if ($('verifyDialog').open) $('verifyDialog').close();
    state.selected = null;
    if (keepPending !== true) state.pendingHs = state.pendingHs || null;
  }

  /* ================================================================ งานค้าง */
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

  /* ================================================================ เครื่องมือ */
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
