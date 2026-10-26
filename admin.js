/* เข้าใช้งานระบบ + แผงผู้ดูแล (คำขอ / บัญชี / ผลตรวจ / บันทึกการใช้งาน / การเข้าใช้ / ตั้งค่า) */
var HSAdmin = (() => {
  'use strict';
  const C = HSCore;
  const $ = id => document.getElementById(id);
  const esc = C.escapeHtml;
  let ctx = null;
  let tab = '';
  const cache = {};

  function init(context) {
    ctx = context;
    // กล่องเข้าใช้งาน
    document.querySelectorAll('[data-access-tab]').forEach(b => b.addEventListener('click', () => showAccessTab(b.dataset.accessTab)));
    $('accessClose').addEventListener('click', () => $('accessDialog').close());
    $('phoneLoginForm').addEventListener('submit', e => login(e, 'phone'));
    $('superLoginForm').addEventListener('submit', e => login(e, 'super'));
    $('registerForm').addEventListener('submit', register);
    $('logoutButton').addEventListener('click', () => $('accessLoginNav').click());
    const provs = Object.entries(C.PROVINCES).sort((a, b) => a[1].localeCompare(b[1], 'th'));
    $('regProvince').innerHTML = '<option value="">เลือกจังหวัด</option>' + provs.map(([c, n]) => '<option value="' + c + '">' + esc(n) + '</option>').join('');
    $('adminTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
  }

  function provincesLoaded() {
    if (ctx.province() && !$('regProvince').value) $('regProvince').value = ctx.province();
  }

  /* ---------------------------------------------------------------- เข้าสู่ระบบ / ขออนุญาต */
  function openAccess(which) {
    if (!HSApi.configured()) { ctx.toast('ยังไม่ได้ตั้งค่า API ของระบบ — ผู้ติดตั้งต้องใส่ URL Apps Script ใน site-config.js', true); return; }
    ['phoneLoginMessage', 'superLoginMessage', 'registerMessage'].forEach(id => { $(id).textContent = ''; });
    if (ctx.province()) $('regProvince').value = ctx.province();
    showAccessTab(which || 'phone');
    $('accessDialog').showModal();
  }
  function showAccessTab(which) {
    document.querySelectorAll('[data-access-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.accessTab === which)));
    document.querySelectorAll('[data-access-panel]').forEach(p => { p.hidden = p.dataset.accessPanel !== which; });
    $('accessTitle').textContent = which === 'register' ? 'ขออนุญาตใช้งาน' : 'เข้าใช้งานระบบ';
  }
  async function login(e, kind) {
    e.preventDefault();
    const msg = $(kind === 'super' ? 'superLoginMessage' : 'phoneLoginMessage');
    const btn = e.target.querySelector('button[type=submit]');
    msg.textContent = ''; btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ…';
    try {
      const creds = kind === 'super' ? { username: $('loginUsername').value, password: $('loginPassword').value } : { phone: C.normalizePhone($('loginPhone').value) };
      if (kind !== 'super' && !C.validPhone(creds.phone)) throw new Error('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
      const user = await HSApi.login(kind, creds);
      $('loginPassword').value = '';
      $('accessDialog').close();
      ctx.toast('ยินดีต้อนรับ ' + user.name + ' (' + C.ROLE_LABELS[user.role] + ')');
      tab = '';
      ctx.onSession();
    } catch (err) { msg.textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }
  }
  async function register(e) {
    e.preventDefault();
    const msg = $('registerMessage'), btn = e.target.querySelector('button[type=submit]');
    const phone = C.normalizePhone($('regPhone').value);
    if (!$('regProvince').value) { msg.textContent = 'กรุณาเลือกจังหวัดที่ปฏิบัติงาน'; return; }
    if (!C.validPhone(phone)) { msg.textContent = 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ตัวอย่าง 0812345678)'; return; }
    if (!$('regConsent').checked) { msg.textContent = 'กรุณายืนยันการรับทราบการใช้ข้อมูลส่วนบุคคล'; return; }
    btn.disabled = true; btn.textContent = 'กำลังลงทะเบียน…'; msg.textContent = '';
    try {
      const user = await HSApi.register({ phone, fullName: $('regName').value, position: $('regPosition').value, affiliation: $('regAffiliation').value, provinceCode: $('regProvince').value, consent: true });
      e.target.reset();
      $('accessDialog').close();
      ctx.toast('ลงทะเบียนสำเร็จ ยินดีต้อนรับ ' + user.name + ' — ครั้งต่อไปเข้าสู่ระบบด้วยเบอร์ ' + phone);
      tab = '';
      ctx.onSession();
    } catch (err) { msg.textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'ลงทะเบียนและเริ่มใช้งาน'; }
  }

  /* ---------------------------------------------------------------- แผงผู้ดูแล */
  function tabsFor(user) {
    if (!user) return [];
    const t = [];
    if (C.can(user, 'manage')) t.push(['requests', 'ผู้ลงทะเบียน'], ['accounts', 'บัญชีผู้ใช้']);
    t.push(['records', C.can(user, 'manage') ? 'ผลการตรวจสอบ' : 'ผลตรวจที่บันทึก'], ['audit', C.can(user, 'manage') ? 'บันทึกการใช้งาน' : 'บันทึกการใช้งานของฉัน']);
    if (C.can(user, 'manage')) t.push(['logins', 'รายงานการเข้าใช้']);
    if (C.can(user, 'settings')) t.push(['settings', 'ตั้งค่าระบบ']);
    return t;
  }

  function render() {
    const user = HSApi.user();
    if (!user) { $('adminTabs').innerHTML = ''; $('adminPanels').innerHTML = ''; return; }
    $('roleLabel').textContent = C.ROLE_LABELS[user.role] + (user.prov && user.prov !== '*' ? ' · จังหวัด' + (C.PROVINCES[user.prov] || '') : ' · ทุกจังหวัด');
    $('adminDisplayName').textContent = user.name;
    $('adminRoleDescription').textContent = C.ROLE_DESCRIPTIONS[user.role] || '';
    $('adminTitle').textContent = C.can(user, 'manage') ? 'ผู้ดูแลระบบ' : 'งานของฉัน';
    const tabs = tabsFor(user);
    if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
    $('adminTabs').innerHTML = tabs.map(([id, label]) => '<button type="button" role="tab" data-tab="' + id + '" aria-selected="' + (id === tab) + '">' + esc(label) + '</button>').join('');
    const panel = $('adminPanels');
    panel.innerHTML = '<section class="settings-card"><p class="muted">กำลังโหลด…</p></section>';
    ({ requests: renderRequests, accounts: renderAccounts, records: renderRecords, audit: renderAudit, logins: renderLogins, settings: renderSettings })[tab](panel, user)
      .then(() => labelTables(panel))
      .catch(err => { panel.innerHTML = '<section class="settings-card"><p class="notice error">' + esc(err.message) + '</p></section>'; });
  }

  const provinceOptions = (user, selected, allLabel) => {
    if (!C.can(user, 'chooseProvince')) return '<option value="' + esc(user.prov) + '">' + esc(C.PROVINCES[user.prov]) + '</option>';
    const list = Object.entries(C.PROVINCES).sort((a, b) => a[1].localeCompare(b[1], 'th'));
    return (allLabel ? '<option value="">' + allLabel + '</option>' : '') + list.map(([c, n]) => '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
  };
  const table = (head, rows, empty) => '<div class="table-scroll" tabindex="0"><table><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" class="muted">' + (empty || 'ไม่มีข้อมูล') + '</td></tr>') + '</tbody></table></div>';
  const td = v => '<td>' + esc(v) + '</td>';
  /** ใส่ชื่อคอลัมน์ให้ทุกช่อง เพื่อให้จอแคบแสดงตารางเป็นการ์ดรายแถว */
  function labelTables(root) {
    root.querySelectorAll('table').forEach(t => {
      const heads = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim());
      t.classList.add('card-table');
      t.querySelectorAll('tbody tr').forEach(tr => Array.from(tr.children).forEach((cell, i) => { if (!cell.hasAttribute('colspan') && heads[i]) cell.setAttribute('data-label', heads[i]); }));
    });
  }
  const roleChip = role => '<span class="role-pill ' + esc(role) + '">' + esc(C.ROLE_LABELS[role] || role) + '</span>';
  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) ctx.toast(okMsg); render(); } catch (err) { ctx.toast(err.message, true); }
  }

  /* ผู้ลงทะเบียน — Admin ลงทะเบียนเองใช้งานได้ทันที ผู้ดูแลตรวจและระงับได้ */
  async function renderRequests(panel, user) {
    const days = cache.regDays === undefined ? 30 : cache.regDays;
    const data = await HSApi.post('requests_list', { status: 'all', days });
    const statusText = r => r.status === 'pending' ? 'รออนุมัติ' : r.accountStatus === 'approved' ? 'ใช้งานได้' : r.accountStatus === 'disabled' ? 'ระงับแล้ว' : r.accountStatus === 'deleted' ? 'ลบบัญชีแล้ว' : r.status;
    const pillClass = r => r.accountStatus === 'approved' ? 'not_burned' : r.status === 'pending' ? 'pending' : 'burned';
    const pending = data.requests.filter(r => r.status === 'pending').length;
    panel.innerHTML = '<section class="table-card"><div class="section-title"><div><p class="eyebrow">ลงทะเบียนแล้วใช้งานได้ทันที</p><h2>ผู้ลงทะเบียน ' + data.requests.length.toLocaleString('th-TH') + ' คน</h2>' +
      '<p class="field-hint">' + (C.can(user, 'manageMini') ? 'ทุกจังหวัด' : 'จังหวัด' + esc(C.PROVINCES[user.prov])) + ' · ตรวจรายชื่อผู้ลงทะเบียนใหม่ หากไม่ใช่เจ้าหน้าที่ให้กด “ระงับ” มีผลทันที' + (pending ? ' · มีคำขอเดิมรออนุมัติ ' + pending + ' รายการ' : '') + '</p></div>' +
      '<label class="inline-label">ช่วงเวลา<select id="regDays"><option value="7">7 วันล่าสุด</option><option value="30">30 วันล่าสุด</option><option value="0">ทั้งหมด</option></select></label></div>' +
      table(['วันที่ลงทะเบียน', 'ชื่อ - สกุล', 'ตำแหน่ง / สังกัด', 'จังหวัด', 'เบอร์โทร', 'สถานะบัญชี', ''], data.requests.map(r => '<tr>' + td(C.thaiDateTime(r.createdAt)) + td(r.fullName) + td(r.position + ' · ' + r.affiliation) + td(r.provinceName) + td(r.phone) +
        '<td><span class="status-pill ' + pillClass(r) + '">' + esc(statusText(r)) + '</span>' + (r.accountRole === 'minisuper' ? ' ' + roleChip('minisuper') : '') + '</td>' +
        '<td>' + (r.status === 'pending' ? '<div class="button-row compact-row"><button class="primary-button compact" data-approve="' + esc(r.requestId) + '">อนุมัติ</button><button class="secondary-button compact" data-reject="' + esc(r.requestId) + '">ปฏิเสธ</button></div>'
          : r.accountId && r.accountId !== user.sub && (C.can(user, 'manageMini') || r.accountRole === 'admin') && r.accountStatus !== 'deleted' ? '<div class="button-row compact-row"><button class="secondary-button compact' + (r.accountStatus === 'approved' ? ' danger-button' : '') + '" data-status="' + esc(r.accountId) + '" data-to="' + (r.accountStatus === 'approved' ? 'disabled' : 'approved') + '">' + (r.accountStatus === 'approved' ? 'ระงับ' : 'เปิดใช้') + '</button></div>' : '') + '</td></tr>'), 'ยังไม่มีผู้ลงทะเบียนในช่วงนี้') + '</section>';
    $('regDays').value = String(days);
    $('regDays').onchange = e => { cache.regDays = Number(e.target.value); render(); };
    panel.onclick = e => {
      const a = e.target.closest('[data-approve]'), r = e.target.closest('[data-reject]'), st = e.target.closest('[data-status]');
      if (a) act(() => HSApi.post('request_decide', { requestId: a.dataset.approve, decision: 'approve' }), 'อนุมัติแล้ว');
      if (r) { const reason = prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)'); if (reason !== null) act(() => HSApi.post('request_decide', { requestId: r.dataset.reject, decision: 'reject', reason }), 'ปฏิเสธคำขอแล้ว'); }
      if (st && (st.dataset.to === 'approved' || confirm('ระงับบัญชีนี้? ผู้ใช้จะออกจากระบบและบันทึกผลไม่ได้ทันที'))) act(() => HSApi.post('account_status', { accountId: st.dataset.status, status: st.dataset.to }), st.dataset.to === 'approved' ? 'เปิดใช้บัญชีแล้ว' : 'ระงับบัญชีแล้ว (มีผลทันที)');
    };
  }

  /* บัญชีผู้ใช้ */
  async function renderAccounts(panel, user) {
    const data = await HSApi.post('accounts_list', {});
    const prefill = cache.prefillPhone || ''; cache.prefillPhone = '';
    const rows = data.accounts.map(a => {
      const manageable = C.can(user, 'manageMini') || a.role === 'admin';
      const self = a.accountId === user.sub;
      return '<tr' + (a.status !== 'approved' ? ' class="muted-row"' : '') + '>' + td(a.accountId) + td(a.fullName) + td(a.position + (a.affiliation ? ' · ' + a.affiliation : '')) + td(a.provinceName) + td(a.phone) + '<td>' + roleChip(a.role) + '</td>' + td(a.status === 'approved' ? 'ใช้งาน' : 'ระงับ') + td(C.thaiDateTime(a.lastLoginAt)) +
        '<td>' + (manageable && !self ? '<div class="button-row compact-row"><button class="secondary-button compact" data-edit="' + esc(a.accountId) + '">แก้ไข</button><button class="secondary-button compact" data-status="' + esc(a.accountId) + '" data-to="' + (a.status === 'approved' ? 'disabled' : 'approved') + '">' + (a.status === 'approved' ? 'ระงับ' : 'เปิดใช้') + '</button><button class="secondary-button compact danger-button" data-del="' + esc(a.accountId) + '">ลบ</button></div>' : self ? '<small>บัญชีของท่าน</small>' : '') + '</td></tr>';
    });
    panel.innerHTML = '<details id="accDetails" class="settings-card collapsible"' + (prefill ? ' open' : '') + '><summary><span id="accFormTitle">＋ เพิ่มบัญชีผู้ใช้' + (C.can(user, 'manageMini') ? ' / แต่งตั้ง Mini Super Admin' : '') + '</span></summary>' +
      '<form id="accountForm" class="team-fields"><input type="hidden" id="accId"><label>เบอร์โทรศัพท์<input id="accPhone" type="tel" required maxlength="15" value="' + esc(prefill) + '"></label><label>ชื่อ - สกุล<input id="accName" required maxlength="150"></label><label>ตำแหน่ง<input id="accPosition" maxlength="150"></label><label>สังกัด<input id="accAffiliation" maxlength="200"></label>' +
      '<label>จังหวัด<select id="accProvince">' + provinceOptions(user, ctx.province() || user.prov) + '</select></label><label>บทบาท<select id="accRole"><option value="admin">Admin — ผู้บันทึกข้อมูล</option>' + (C.can(user, 'manageMini') ? '<option value="minisuper">Mini Super Admin — ผู้ดูแลจังหวัด</option>' : '') + '</select></label>' +
      '<div class="button-row"><button class="primary-button" type="submit">บันทึกบัญชี</button><button id="accCancel" class="secondary-button" type="button">ล้างฟอร์ม</button></div></form></details>' +
      '<section class="table-card"><div class="section-title"><div><p class="eyebrow">' + (C.can(user, 'manageMini') ? 'ทุกจังหวัด' : 'จังหวัด' + esc(C.PROVINCES[user.prov])) + '</p><h2>บัญชีผู้ใช้ ' + data.accounts.length + ' บัญชี</h2></div><input id="accSearch" type="search" placeholder="ค้นหาชื่อ เบอร์ จังหวัด"></div>' +
      table(['รหัส', 'ชื่อ - สกุล', 'ตำแหน่ง / สังกัด', 'จังหวัด', 'เบอร์โทร', 'บทบาท', 'สถานะ', 'เข้าใช้ล่าสุด', ''], rows) + '</section>';
    $('accSearch').oninput = e => { const q = e.target.value.toLowerCase(); panel.querySelectorAll('tbody tr').forEach(tr => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); }); };
    $('accCancel').onclick = () => { $('accountForm').reset(); $('accId').value = ''; $('accFormTitle').textContent = '＋ เพิ่มบัญชีผู้ใช้'; };
    $('accountForm').onsubmit = e => {
      e.preventDefault();
      const phone = C.normalizePhone($('accPhone').value);
      if (!C.validPhone(phone)) return ctx.toast('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง', true);
      act(() => HSApi.post('account_save', { accountId: $('accId').value, phone, fullName: $('accName').value, position: $('accPosition').value, affiliation: $('accAffiliation').value, provinceCode: $('accProvince').value, role: $('accRole').value }), 'บันทึกบัญชีแล้ว');
    };
    panel.onclick = e => {
      const ed = e.target.closest('[data-edit]'), st = e.target.closest('[data-status]'), del = e.target.closest('[data-del]');
      if (ed) {
        const a = data.accounts.find(x => x.accountId === ed.dataset.edit);
        $('accId').value = a.accountId; $('accPhone').value = a.phone; $('accName').value = a.fullName; $('accPosition').value = a.position; $('accAffiliation').value = a.affiliation; $('accProvince').value = a.provinceCode; $('accRole').value = a.role;
        $('accFormTitle').textContent = 'แก้ไขบัญชี ' + a.accountId; $('accDetails').open = true; $('accDetails').scrollIntoView({ behavior: 'smooth' });
      }
      if (st) act(() => HSApi.post('account_status', { accountId: st.dataset.status, status: st.dataset.to }), st.dataset.to === 'approved' ? 'เปิดใช้บัญชีแล้ว' : 'ระงับบัญชีแล้ว (มีผลทันที)');
      if (del && confirm('ลบบัญชี ' + del.dataset.del + ' ถาวร?')) act(() => HSApi.post('account_delete', { accountId: del.dataset.del }), 'ลบบัญชีแล้ว');
    };
  }

  /* ผลการตรวจสอบ */
  async function renderRecords(panel, user) {
    const prov = C.can(user, 'chooseProvince') ? (cache.recProv || ctx.province() || '') : user.prov;
    let list = [];
    if (prov) list = (await HSApi.post('verifications_list', { province: prov })).verifications;
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const mine = user.role === 'admin' && cache.recMine !== false;
    const shown = mine ? list.filter(v => v.recordedById === user.sub) : list;
    panel.innerHTML = '<section class="table-card"><div class="section-title"><div><p class="eyebrow">ฐานข้อมูลผลตรวจ</p><h2>ผลการตรวจสอบ ' + shown.length.toLocaleString('th-TH') + ' รายการ</h2></div><div class="button-row">' +
      (C.can(user, 'chooseProvince') ? '<label class="inline-label">จังหวัด<select id="recProv">' + provinceOptions(user, prov, '— เลือกจังหวัด —') + '</select></label>' : '') +
      (user.role === 'admin' ? '<label class="check-label inline"><input id="recMine" type="checkbox"' + (mine ? ' checked' : '') + '>เฉพาะที่ฉันบันทึก</label>' : '') +
      '<button id="recExport" class="secondary-button" type="button"' + (shown.length ? '' : ' disabled') + '>ส่งออก CSV</button>' + (C.can(user, 'manage') && prov ? '<button id="recCache" class="secondary-button" type="button">ดึง HS ต้นทางใหม่</button>' : '') + '</div></div>' +
      '<p class="field-hint">' + (C.can(user, 'deleteVerification', { province: prov }) ? 'ท่านแก้ไขและลบผลตรวจได้ทุกรายการในจังหวัด · ' : 'Admin แก้ไขได้เฉพาะรายการที่ตนบันทึก · ') + 'เปิดแก้ไขจากแผนที่หรือรายการจุดในหน้า “ตรวจสอบจุดความร้อน”</p>' +
      table(['HS', 'วันที่ HS', 'อำเภอ / ตำบล', 'สถานะ', 'ผลตรวจ', 'ภาพ', 'ระยะจากจุด HS', 'ผู้บันทึก', 'แก้ไขล่าสุด', ''], shown.slice(0, 500).map(v => '<tr>' + td(v.hotspotId) + td(C.thaiDate(v.hsDate)) + td(v.districtName + ' / ' + v.subdistrictName) + td(C.STATUS_LABELS[v.status]) + td(C.RESULT_LABELS[v.result] || '—') + td(v.photoCount || 0) + td(v.distanceM === '' ? '—' : C.formatDistance(Number(v.distanceM))) + td(v.recordedByName + ' (' + (C.ROLE_LABELS[v.recordedByRole] || '') + ')') + td(C.thaiDateTime(v.updatedAt) + (v.updatedByName && v.updatedByName !== v.recordedByName ? ' · ' + v.updatedByName : '')) +
        '<td>' + (v.canDelete ? '<button class="secondary-button compact danger-button" data-del-v="' + esc(v.verificationId) + '" data-hs="' + esc(v.hotspotId) + '">ลบ</button>' : '') + '</td></tr>'), prov ? 'ยังไม่มีผลตรวจ' : 'เลือกจังหวัดก่อน') +
      (shown.length > 500 ? '<p class="field-hint">แสดง 500 รายการล่าสุด · ส่งออก CSV เพื่อดูทั้งหมด</p>' : '') + '</section>';
    if ($('recProv')) $('recProv').onchange = e => { cache.recProv = e.target.value; render(); };
    if ($('recMine')) $('recMine').onchange = e => { cache.recMine = e.target.checked; render(); };
    if ($('recCache')) $('recCache').onclick = () => act(async () => { await HSApi.post('cache_clear', { province: prov }); if (prov === ctx.province()) await ctx.reloadHotspots(); }, 'ล้างแคชและอ่าน HS ต้นทางใหม่แล้ว');
    $('recExport').onclick = async () => {
      try {
        const full = (await HSApi.post('verifications_list', { province: prov, export: true })).verifications.filter(v => !mine || v.recordedById === user.sub);
        const cols = ['verificationId', 'hotspotId', 'hsDate', 'provinceName', 'districtName', 'subdistrictName', 'village', 'plantType', 'hsLat', 'hsLng', 'status', 'result', 'fireState', 'observedMatches', 'observedLandType', 'observedPlantType', 'personCategory', 'personCategoryOther', 'fieldInspectorName', 'inspectedAt', 'obsLat', 'obsLng', 'gpsAccuracyM', 'missingGpsReason', 'distanceM', 'photoCount', 'photoMissingReason', 'notes', 'followUpAction', 'recordedByName', 'recordedByRole', 'createdAt', 'updatedByName', 'updatedAt'];
        HSApp.download('ผลตรวจ_' + C.PROVINCES[prov] + '_' + new Date().toISOString().slice(0, 10) + '.csv', C.toCsv(cols.map(k => ({ label: k, value: v => k === 'result' ? (C.RESULT_LABELS[v.result] || '') : k === 'status' ? C.STATUS_LABELS[v.status] : v[k] })), full));
      } catch (err) { ctx.toast(err.message, true); }
    };
    panel.onclick = e => {
      const d = e.target.closest('[data-del-v]');
      if (d) { const reason = prompt('ลบผลตรวจจุด ' + d.dataset.hs + ' (รวมภาพ) — ระบุเหตุผล'); if (reason !== null) act(async () => { await HSApi.post('verification_delete', { verificationId: d.dataset.delV, reason }); if (prov === ctx.province()) await ctx.reloadHotspots(); }, 'ลบผลตรวจแล้ว'); }
    };
  }

  /* บันทึกการใช้งาน */
  async function renderAudit(panel, user) {
    const f = cache.audit || (cache.audit = { from: '', to: '', role: '', filterAction: '', q: '', province: '' });
    const data = await HSApi.post('audit_list', Object.assign({ limit: 500 }, f));
    const labels = data.labels || {};
    const manage = C.can(user, 'manage');
    panel.innerHTML = '<section class="settings-card"><div class="section-title"><div><p class="eyebrow">ตรวจสอบย้อนหลัง</p><h2>' + (manage ? 'บันทึกการใช้งานของ Admin / Mini Super Admin / Super Admin' : 'บันทึกการใช้งานของฉัน') + '</h2><p class="field-hint">' + (user.role === 'superadmin' ? 'ทุกจังหวัด ทุกบทบาท' : user.role === 'minisuper' ? 'เจ้าหน้าที่ในจังหวัด' + esc(C.PROVINCES[user.prov]) + ' (ไม่รวม Super Admin)' : 'เฉพาะการใช้งานของบัญชีนี้') + ' · บันทึกการเข้า/ออกระบบ การบันทึก แก้ไข ลบ ผลตรวจ การแนบภาพ การจัดการบัญชี การส่งออก และการตั้งค่า</p></div></div>' +
      '<form id="auditFilter" class="filter-grid"><label>ตั้งแต่วันที่<input type="date" name="from" value="' + esc(f.from) + '"></label><label>ถึงวันที่<input type="date" name="to" value="' + esc(f.to) + '"></label>' +
      (manage ? '<label>บทบาท<select name="role"><option value="">ทุกบทบาท</option><option value="admin">Admin</option><option value="minisuper">Mini Super Admin</option>' + (user.role === 'superadmin' ? '<option value="superadmin">Super Admin</option><option value="public">ผู้ยื่นคำขอ</option>' : '') + '</select></label>' : '') +
      (user.role === 'superadmin' ? '<label>จังหวัด<select name="province">' + provinceOptions(user, f.province, 'ทุกจังหวัด') + '</select></label>' : '') +
      '<label>การกระทำ<select name="filterAction"><option value="">ทั้งหมด</option>' + Object.entries(labels).map(([k, v]) => '<option value="' + esc(k) + '">' + esc(v) + '</option>').join('') + '</select></label>' +
      '<label class="search-label">ค้นหา<input type="search" name="q" value="' + esc(f.q) + '" placeholder="ชื่อ รหัสบัญชี เลข HS"></label><div class="button-row"><button class="primary-button" type="submit">กรอง</button><button id="auditExport" class="secondary-button" type="button">ส่งออก CSV</button></div></form></section>' +
      (manage ? '<section class="table-card"><div class="section-title"><div><p class="eyebrow">สรุปรายบุคคล</p><h2>ผู้ใช้งาน ' + data.people.length + ' คน</h2></div></div>' + table(['ชื่อ', 'บทบาท', 'จังหวัด', 'เข้าสู่ระบบ (ครั้ง)', 'บันทึก/แก้ไข/ลบผลตรวจ', 'กิจกรรมทั้งหมด', 'ล่าสุด'], data.people.sort((a, b) => String(b.last).localeCompare(String(a.last))).map(p => '<tr>' + td(p.actorName) + '<td>' + roleChip(p.role) + '</td>' + td(C.PROVINCES[p.provinceCode] || '—') + td(p.logins) + td(p.verifications) + td(p.actions) + td(C.thaiDateTime(p.last)) + '</tr>')) + '</section>' : '') +
      '<section class="table-card"><div class="section-title"><div><p class="eyebrow">รายการ</p><h2>' + data.total.toLocaleString('th-TH') + ' รายการ' + (data.total > data.logs.length ? ' (แสดง ' + data.logs.length + ' ล่าสุด)' : '') + '</h2></div></div>' +
      table(['เวลา', 'ผู้ใช้', 'บทบาท', 'จังหวัด', 'การกระทำ', 'รายการ', 'รายละเอียด'], data.logs.map(l => '<tr>' + td(C.thaiDateTime(l.time)) + td(l.actorName) + '<td>' + roleChip(l.role) + '</td>' + td(C.PROVINCES[l.provinceCode] || '—') + td(labels[l.action] || l.action) + td(l.target) + '<td class="detail-cell">' + esc(String(l.detail).slice(0, 240)) + '</td></tr>')) + '</section>';
    const form = $('auditFilter');
    ['role', 'province', 'filterAction'].forEach(n => { if (form.elements[n]) form.elements[n].value = f[n] || ''; });
    form.onsubmit = e => { e.preventDefault(); ['from', 'to', 'role', 'province', 'filterAction', 'q'].forEach(n => { f[n] = form.elements[n] ? form.elements[n].value : ''; }); render(); };
    $('auditExport').onclick = () => HSApp.download('บันทึกการใช้งาน_' + new Date().toISOString().slice(0, 10) + '.csv', C.toCsv([
      { label: 'เวลา', key: 'time' }, { label: 'รหัสผู้ใช้', key: 'actorId' }, { label: 'ชื่อ', key: 'actorName' }, { label: 'บทบาท', value: l => C.ROLE_LABELS[l.role] || l.role },
      { label: 'จังหวัด', value: l => C.PROVINCES[l.provinceCode] || '' }, { label: 'การกระทำ', value: l => labels[l.action] || l.action }, { label: 'รายการ', key: 'target' }, { label: 'รายละเอียด', key: 'detail' }
    ], data.logs));
  }

  /* รายงานการเข้าใช้ */
  async function renderLogins(panel, user) {
    const data = await HSApi.post('login_report', { limit: 500 });
    const labels = data.labels || {};
    panel.innerHTML = (user.role === 'superadmin' ? '<section class="table-card"><div class="section-title"><div><p class="eyebrow">ความปลอดภัย</p><h2>หมายเลขที่ไม่มีในระบบแต่พยายามเข้าใช้ (' + data.unknown.length + ')</h2></div></div>' +
      table(['หมายเลข', 'จำนวนครั้ง', 'ครั้งแรก', 'ล่าสุด', ''], data.unknown.sort((a, b) => b.count - a.count).map(u => '<tr>' + td(u.identifier) + td(u.count) + td(C.thaiDateTime(u.first)) + td(C.thaiDateTime(u.last)) + '<td><button class="secondary-button compact" data-add="' + esc(u.identifier) + '">เพิ่มเป็นผู้ใช้</button></td></tr>'), 'ไม่มี') + '</section>' : '') +
      '<section class="table-card"><div class="section-title"><div><p class="eyebrow">ทุกการพยายามเข้าใช้ (ไม่บันทึกรหัสผ่าน)</p><h2>การเข้าใช้ ' + data.total.toLocaleString('th-TH') + ' ครั้ง</h2></div></div>' +
      table(['เวลา', 'บทบาท', 'หมายเลข / ชื่อผู้ใช้', 'ผล', 'ชื่อ', 'จังหวัด', 'อุปกรณ์'], data.attempts.map(a => '<tr>' + td(C.thaiDateTime(a.time)) + '<td>' + roleChip(a.role) + '</td>' + td(a.identifier) + '<td><span class="status-pill ' + (a.result === 'success' ? 'not_burned' : 'burned') + '">' + esc(labels[a.result] || a.result) + '</span></td>' + td(a.fullName) + td(a.provinceName) + '<td class="detail-cell">' + esc(a.device) + '</td></tr>')) + '</section>';
    panel.onclick = e => { const b = e.target.closest('[data-add]'); if (b) { cache.prefillPhone = b.dataset.add; tab = 'accounts'; render(); } };
  }

  /* ตั้งค่าระบบ (Super Admin) */
  async function renderSettings(panel) {
    const s = (await HSApi.post('settings_get', {})).settings;
    panel.innerHTML = '<section class="settings-card"><div class="section-title"><div><p class="eyebrow">Super Admin</p><h2>แหล่งข้อมูลและที่เก็บไฟล์</h2></div><span class="connection-dot online" title="เชื่อมต่อแล้ว"></span></div>' +
      '<p class="field-hint">ฐานข้อมูลระบบนี้: <a href="https://docs.google.com/spreadsheets/d/' + esc(s.db_id) + '/edit" target="_blank" rel="noopener">Thailand HS Verification - Database</a> · Backend v' + esc(s.version) + ' · API: ' + esc(HSApi.endpoint()) + '</p>' +
      '<form id="settingsForm"><label>Google Sheet แหล่ง HS (แท็บ HS_รหัสจังหวัด) — URL หรือ ID<input name="source_sheet_id" value="' + esc(s.source_sheet_id) + '" required></label>' +
      '<label>โฟลเดอร์ Google Drive เก็บภาพหลักฐาน — URL หรือ ID<input name="photo_folder_id" value="' + esc(s.photo_folder_id) + '" required></label>' +
      '<label>ลิงก์ระบบ Agri-Risk Map Burning<input name="risk_url" type="url" value="' + esc(s.risk_url) + '"></label><label>ลิงก์ Green Gain Hub<input name="hub_url" type="url" value="' + esc(s.hub_url) + '"></label>' +
      '<button class="primary-button" type="submit">บันทึกการตั้งค่า</button></form></section>' +
      '<section class="settings-card"><h2>บัญชี Super Admin</h2><p class="field-hint">เปลี่ยนชื่อผู้ใช้/รหัสผ่านใน Apps Script Editor ด้วยคำสั่ง <code>setSuperAdmin(\'ชื่อใหม่\', \'รหัสใหม่\')</code> · ระบบเก็บเฉพาะค่า Hash ใน Script Properties</p>' +
      '<p class="field-hint">นำบัญชีจากระบบ Agri-Risk Map Burning มาใช้: รัน <code>copyAccountsFromRiskMap()</code> ใน Apps Script Editor (คัดลอกเฉพาะบัญชีที่อนุมัติแล้ว ข้ามเบอร์ที่มีอยู่)</p></section>';
    $('settingsForm').onsubmit = e => {
      e.preventDefault();
      const settings = Object.fromEntries(new FormData(e.target));
      act(() => HSApi.post('settings_save', { settings }), 'บันทึกการตั้งค่าแล้ว');
    };
  }

  return { init, openAccess, render, provincesLoaded };
})();
