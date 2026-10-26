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
    const manage = C.can(user, 'manage'), t = [];
    if (manage) t.push(['accounts', 'บัญชีผู้ใช้']);
    t.push(['records', manage ? 'ผลการตรวจสอบ' : 'ผลตรวจของฉัน'], ['history', manage ? 'ประวัติการใช้งาน' : 'ประวัติของฉัน']);
    if (C.can(user, 'settings')) t.push(['settings', 'ตั้งค่า']);
    return t;
  }

  function render() {
    const user = HSApi.user();
    if (!user) { $('adminTabs').innerHTML = ''; $('adminPanels').innerHTML = ''; return; }
    $('roleLabel').textContent = C.ROLE_LABELS[user.role] + (user.role === 'minisuper' ? (user.prov === '*' ? ' ระดับประเทศ' : ' ระดับจังหวัด') : '') + ' · ' + C.scopeLabel(user);
    // ออกจากระบบอยู่ที่เมนูหลักแล้ว — ไม่แสดงปุ่มซ้ำในหน้าผู้ดูแล
    $('adminDisplayName').textContent = user.name;
    $('adminRoleDescription').textContent = user.role === 'minisuper' && user.prov === '*' ? C.ROLE_DESCRIPTIONS.minisuperNational : C.ROLE_DESCRIPTIONS[user.role] || '';
    $('adminTitle').textContent = C.can(user, 'manage') ? 'ผู้ดูแลระบบ' : 'งานของฉัน';
    const tabs = tabsFor(user);
    if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
    $('adminTabs').innerHTML = tabs.map(([id, label]) => '<button type="button" role="tab" data-tab="' + id + '" aria-selected="' + (id === tab) + '">' + esc(label) + '</button>').join('');
    const panel = $('adminPanels');
    panel.innerHTML = '<section class="settings-card"><p class="muted">กำลังโหลด…</p></section>';
    ({ accounts: renderAccounts, records: renderRecords, history: renderHistory, settings: renderSettings })[tab](panel, user)
      .then(() => labelTables(panel))
      .catch(err => { panel.innerHTML = '<section class="settings-card"><p class="notice error">' + esc(err.message) + '</p></section>'; });
  }

  const provinceOptions = (user, selected, allLabel) => {
    if (!C.can(user, 'chooseProvince')) return '<option value="' + esc(user.prov) + '"' + (selected === user.prov ? ' selected' : '') + '>' + esc(C.PROVINCES[user.prov]) + '</option>';
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

  /* บัญชีผู้ใช้ — Super Admin แต่งตั้ง Mini Super Admin (ระดับประเทศหรือจังหวัด) · Mini Super Admin จัดการ Admin ในขอบเขตของตน */
  async function renderAccounts(panel, user) {
    const [data, pend] = await Promise.all([HSApi.post('accounts_list', {}), HSApi.post('requests_list', { status: 'pending' }).catch(() => ({ requests: [] }))]);
    const view = cache.accView || 'all';
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const isNew = a => String(a.createdAt).slice(0, 10) >= weekAgo;
    const prefill = cache.prefillPhone || ''; cache.prefillPhone = '';
    const isSuper = C.can(user, 'manageMini');
    const scopeText = a => a.provinceCode === C.ALL ? 'ทุกจังหวัด (ทั้งระบบ)' : a.provinceName;
    const sup = data.superAdmin;
    const superRow = sup ? '<tr class="protected-row"><td>SUPER</td><td>' + esc(sup.username || '— ยังไม่ได้ตั้งค่า —') + '</td><td>บัญชีหลักของระบบ</td><td>ทุกจังหวัด (ทั้งระบบ)</td><td>—</td><td>' + roleChip('superadmin') + '</td><td>' + (sup.configured ? 'ใช้งาน' : 'ยังไม่ตั้งรหัสผ่าน') + '</td><td>—</td><td><small>🔒 ลบ/ระงับไม่ได้ · เปลี่ยนรหัสผ่านที่เมนู “ระบบตรวจสอบ HS” ในชีตฐานข้อมูล</small></td></tr>' : '';
    const order = { minisuper: 0, admin: 1 };
    const accounts = data.accounts.slice().sort((x, y) => (order[x.role] - order[y.role]) || String(x.provinceCode === C.ALL ? '' : x.provinceName).localeCompare(String(y.provinceCode === C.ALL ? '' : y.provinceName), 'th') || String(x.accountId).localeCompare(String(y.accountId)));
    const rows = accounts.map(a => {
      const manageable = isSuper || a.role === 'admin';
      const self = a.accountId === user.sub;
      if (view === 'new' && !isNew(a)) return '';
      if (view === 'mini' && a.role !== 'minisuper') return '';
      if (view === 'disabled' && a.status === 'approved') return '';
      return '<tr' + (a.status !== 'approved' ? ' class="muted-row"' : '') + '>' + td(a.accountId) + '<td>' + esc(a.fullName) + (isNew(a) ? ' <span class="new-badge">ใหม่</span>' : '') + (a.approvedBy === 'ลงทะเบียนด้วยตนเอง' ? '<br><small class="muted">ลงทะเบียนเอง ' + esc(C.thaiDate(a.createdAt)) + '</small>' : '') + '</td>' + td(a.position + (a.affiliation ? ' · ' + a.affiliation : '')) + td(scopeText(a)) + td(a.phone) + '<td>' + roleChip(a.role) + (a.role === 'minisuper' ? '<br><small>' + (a.provinceCode === C.ALL ? 'ระดับประเทศ' : 'ระดับจังหวัด') + '</small>' : '') + '</td>' + '<td class="nowrap">' + (a.status === 'approved' ? 'ใช้งาน' : 'ระงับ') + '</td>' + td(C.thaiDateTime(a.lastLoginAt)) +
        '<td>' + (manageable && !self ? '<div class="button-row compact-row"><button class="secondary-button compact" data-edit="' + esc(a.accountId) + '">แก้ไข</button><button class="secondary-button compact" data-status="' + esc(a.accountId) + '" data-to="' + (a.status === 'approved' ? 'disabled' : 'approved') + '">' + (a.status === 'approved' ? 'ระงับ' : 'เปิดใช้') + '</button><button class="secondary-button compact danger-button" data-del="' + esc(a.accountId) + '">ลบ</button></div>' : self ? '<small>บัญชีของท่าน</small>' : '<small>จัดการได้โดย Super Admin</small>') + '</td></tr>';
    });
    const provinceSelect = '<option value="">— เลือก —</option>' + (isSuper ? '<option value="' + C.ALL + '">ทุกจังหวัด (ทั้งระบบ) — สำหรับ Mini Super Admin ระดับประเทศ</option>' : '') + provinceOptions(user, '');
    const miniCount = accounts.filter(a => a.role === 'minisuper').length, adminCount = accounts.length - miniCount;
    const pending = pend.requests || [];
    const counts = { all: accounts.length, new: accounts.filter(isNew).length, mini: miniCount, disabled: accounts.filter(a => a.status !== 'approved').length };
    panel.innerHTML = (pending.length ? '<section class="notice warning pending-requests"><strong>คำขอรออนุมัติ ' + pending.length + ' รายการ</strong>' + pending.map(r => '<div class="pending-row"><span>' + esc(r.fullName) + ' · ' + esc(r.provinceName) + ' · ' + esc(r.phone) + '</span><button class="primary-button compact" data-approve="' + esc(r.requestId) + '">อนุมัติ</button><button class="secondary-button compact" data-reject="' + esc(r.requestId) + '">ปฏิเสธ</button></div>').join('') + '</section>' : '') +
      '<div class="toolbar-form accounts-bar"><div class="segmented" role="group" aria-label="แสดงบัญชี">' +
        [['all', 'ทั้งหมด'], ['new', 'ลงทะเบียนใหม่ 7 วัน'], ['mini', 'Mini Super Admin'], ['disabled', 'ระงับ']].map(([k, l]) => '<button type="button" data-view-acc="' + k + '" class="' + (view === k ? 'active' : '') + '">' + l + ' <small>' + counts[k] + '</small></button>').join('') +
        '</div><input id="accSearch" class="grow" type="search" placeholder="ค้นหาชื่อ เบอร์ จังหวัด" aria-label="ค้นหาบัญชี">' +
        '<button type="button" class="secondary-button" data-new-admin>＋ เพิ่ม Admin</button>' + (isSuper ? '<button type="button" class="primary-button" data-new-mini="ALL">＋ แต่งตั้ง Mini Super Admin</button>' : '') + '</div>' +
      '<section id="accDetails" class="settings-card account-form"' + (prefill ? '' : ' hidden') + '><div class="section-title"><h2 id="accFormTitle">เพิ่มบัญชี Admin (ผู้บันทึกข้อมูล)</h2><button type="button" class="text-button" id="accClose">ปิด</button></div>' +
      '<form id="accountForm" class="team-fields"><input type="hidden" id="accId">' +
      '<label>บทบาท<select id="accRole"><option value="admin">Admin — ผู้บันทึกข้อมูล</option>' + (isSuper ? '<option value="minisuper">Mini Super Admin — ผู้ดูแลระบบ</option>' : '') + '</select></label>' +
      '<label>ขอบเขต / จังหวัด<select id="accProvince">' + provinceSelect + '</select></label>' +
      '<label>เบอร์โทรศัพท์ (ใช้เข้าสู่ระบบ)<input id="accPhone" type="tel" required maxlength="15" value="' + esc(prefill) + '"></label><label>ชื่อ - สกุล<input id="accName" required maxlength="150"></label><label>ตำแหน่ง<input id="accPosition" maxlength="150"></label><label>สังกัด<input id="accAffiliation" maxlength="200"></label>' +
      '<p id="accScopeHint" class="field-hint"></p>' +
      '<div class="button-row"><button class="primary-button" type="submit">บันทึกบัญชี</button><button id="accCancel" class="secondary-button" type="button">ยกเลิก</button></div></form></section>' +
      '<section class="table-card"><p class="field-hint">' + esc(C.scopeLabel(user)) + ' · ' + (sup ? 'Super Admin 1 · ' : '') + 'Mini Super Admin ' + miniCount + ' · Admin ' + adminCount + ' · ผู้ลงทะเบียนใหม่ใช้งานได้ทันที หากไม่ใช่เจ้าหน้าที่ให้กด “ระงับ”</p>' +
      table(['รหัส', 'ชื่อ - สกุล', 'ตำแหน่ง / สังกัด', 'ขอบเขต', 'เบอร์โทร', 'บทบาท', 'สถานะ', 'เข้าใช้ล่าสุด', ''], (superRow && (view === 'all' || view === 'mini') ? [superRow] : []).concat(rows.filter(Boolean)), 'ไม่มีบัญชีในมุมมองนี้') + '</section>';
    const syncScope = () => {
      const role = $('accRole').value, all = $('accProvince').querySelector('option[value="' + C.ALL + '"]');
      if (all) { all.hidden = role !== 'minisuper'; if (role !== 'minisuper' && $('accProvince').value === C.ALL) $('accProvince').value = ''; }
      $('accScopeHint').textContent = role === 'admin' ? 'Admin บันทึกผลตรวจได้เฉพาะจังหวัดที่เลือก'
        : $('accProvince').value === C.ALL ? 'Mini Super Admin ระดับประเทศ: จัดการระบบได้ทุกจังหวัด ยกเว้นบัญชี Super Admin / Mini Super Admin และการตั้งค่าระบบ'
        : 'Mini Super Admin ระดับจังหวัด: อนุมัติเจ้าหน้าที่และจัดการข้อมูลเฉพาะจังหวัดที่เลือก';
    };
    $('accRole').onchange = syncScope; $('accProvince').onchange = syncScope; syncScope();
    if (!isSuper) $('accProvince').value = user.prov !== '*' ? user.prov : (ctx.province() && ctx.province() !== C.ALL ? ctx.province() : '');
    $('accSearch').oninput = e => { const q = e.target.value.toLowerCase(); panel.querySelectorAll('tbody tr').forEach(tr => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); }); };
    const resetForm = () => { $('accountForm').reset(); $('accId').value = ''; $('accFormTitle').textContent = 'เพิ่มบัญชี Admin (ผู้บันทึกข้อมูล)'; syncScope(); };
    const closeForm = () => { resetForm(); $('accDetails').hidden = true; };
    $('accCancel').onclick = closeForm; $('accClose').onclick = closeForm;
    $('accountForm').onsubmit = e => {
      e.preventDefault();
      const phone = C.normalizePhone($('accPhone').value);
      if (!C.validPhone(phone)) return ctx.toast('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง', true);
      if (!$('accProvince').value) return ctx.toast('กรุณาเลือกขอบเขต / จังหวัด', true);
      const label = $('accRole').value === 'minisuper' ? 'แต่งตั้ง Mini Super Admin แล้ว' : 'บันทึกบัญชีแล้ว';
      act(() => HSApi.post('account_save', { accountId: $('accId').value, phone, fullName: $('accName').value, position: $('accPosition').value, affiliation: $('accAffiliation').value, provinceCode: $('accProvince').value, role: $('accRole').value }), label + ' — เข้าสู่ระบบด้วยเบอร์ ' + phone + ' ได้ทันที');
    };
    panel.onclick = e => {
      const ed = e.target.closest('[data-edit]'), st = e.target.closest('[data-status]'), del = e.target.closest('[data-del]'), nm = e.target.closest('[data-new-mini]'), na = e.target.closest('[data-new-admin]'), vw = e.target.closest('[data-view-acc]'), ap = e.target.closest('[data-approve]'), rj = e.target.closest('[data-reject]');
      if (vw) { cache.accView = vw.dataset.viewAcc; render(); return; }
      if (ap) act(() => HSApi.post('request_decide', { requestId: ap.dataset.approve, decision: 'approve' }), 'อนุมัติแล้ว');
      if (rj) { const reason = prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)'); if (reason !== null) act(() => HSApi.post('request_decide', { requestId: rj.dataset.reject, decision: 'reject', reason }), 'ปฏิเสธคำขอแล้ว'); }
      if (na) { resetForm(); $('accDetails').hidden = false; $('accDetails').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('accProvince').focus(); }
      if (nm) {
        resetForm(); $('accRole').value = 'minisuper'; syncScope();
        $('accProvince').value = nm.dataset.newMini === C.ALL ? C.ALL : ''; syncScope();
        $('accFormTitle').textContent = 'แต่งตั้ง Mini Super Admin — เลือกขอบเขต “ทุกจังหวัด” หรือจังหวัดเดียว';
        $('accDetails').hidden = false; $('accDetails').scrollIntoView({ behavior: 'smooth' }); $('accPhone').focus();
      }
      if (ed) {
        const a = accounts.find(x => x.accountId === ed.dataset.edit);
        $('accId').value = a.accountId; $('accPhone').value = a.phone; $('accName').value = a.fullName; $('accPosition').value = a.position; $('accAffiliation').value = a.affiliation; $('accRole').value = a.role; syncScope(); $('accProvince').value = a.provinceCode; syncScope();
        $('accFormTitle').textContent = 'แก้ไขบัญชี ' + a.accountId; $('accDetails').hidden = false; $('accDetails').scrollIntoView({ behavior: 'smooth' });
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
    const more = (manage ? '<label>บทบาท<select name="role"><option value="">ทุกบทบาท</option><option value="admin">Admin</option><option value="minisuper">Mini Super Admin</option>' + (user.role === 'superadmin' ? '<option value="superadmin">Super Admin</option><option value="public">ผู้ลงทะเบียน</option>' : '') + '</select></label>' : '') +
      (C.isNational(user) ? '<label>จังหวัด<select name="province">' + provinceOptions(user, f.province, 'ทุกจังหวัด') + '</select></label>' : '') +
      '<label>ตั้งแต่วันที่<input type="date" name="from" value="' + esc(f.from) + '"></label><label>ถึงวันที่<input type="date" name="to" value="' + esc(f.to) + '"></label>';
    panel.innerHTML = '<form id="auditFilter" class="toolbar-form"><label>การกระทำ<select name="filterAction"><option value="">ทั้งหมด</option>' + Object.entries(labels).filter(([k]) => k !== 'visit').map(([k, v]) => '<option value="' + esc(k) + '">' + esc(v) + '</option>').join('') + '</select></label>' +
        '<label class="grow">ค้นหา<input type="search" name="q" value="' + esc(f.q) + '" placeholder="ชื่อ รหัสบัญชี เลข HS"></label>' +
        '<button class="primary-button" type="submit">แสดง</button><button id="auditExport" class="secondary-button" type="button">ส่งออก CSV</button>' +
        '<details class="more-filters"' + (f.role || f.province || f.from || f.to ? ' open' : '') + '><summary>ตัวกรองเพิ่มเติม</summary><div class="more-grid">' + more + '</div></details></form>' +
      (manage ? '<details class="table-card collapsible"><summary>สรุปรายบุคคล · ' + data.people.length + ' คน</summary>' + table(['ชื่อ', 'บทบาท', 'จังหวัด', 'เข้าสู่ระบบ (ครั้ง)', 'บันทึก/แก้ไข/ลบผลตรวจ', 'กิจกรรมทั้งหมด', 'ล่าสุด'], data.people.sort((a, b) => String(b.last).localeCompare(String(a.last))).map(p => '<tr>' + td(p.actorName) + '<td>' + roleChip(p.role) + '</td>' + td(C.PROVINCES[p.provinceCode] || '—') + td(p.logins) + td(p.verifications) + td(p.actions) + td(C.thaiDateTime(p.last)) + '</tr>')) + '</details>' : '') +
      '<section class="table-card"><div class="section-title"><div><h2>การบันทึก/แก้ไขข้อมูล ' + data.total.toLocaleString('th-TH') + ' รายการ' + (data.total > data.logs.length ? ' (แสดง ' + data.logs.length + ' ล่าสุด)' : '') + '</h2></div></div>' +
      table(['เวลา', 'ผู้ใช้', 'บทบาท', 'จังหวัด', 'การกระทำ', 'รายการ', 'รายละเอียด'], data.logs.filter(l => l.action !== 'visit').map(l => '<tr>' + td(C.thaiDateTime(l.time)) + td(l.actorName) + '<td>' + roleChip(l.role) + '</td>' + td(C.PROVINCES[l.provinceCode] || '—') + td(labels[l.action] || l.action) + td(l.target) + '<td class="detail-cell">' + esc(String(l.detail).slice(0, 240)) + '</td></tr>')) + '</section>';
    const form = $('auditFilter');
    ['role', 'province', 'filterAction'].forEach(n => { if (form.elements[n]) form.elements[n].value = f[n] || ''; });
    form.onsubmit = e => { e.preventDefault(); ['from', 'to', 'role', 'province', 'filterAction', 'q'].forEach(n => { f[n] = form.elements[n] ? form.elements[n].value : ''; }); render(); };
    $('auditExport').onclick = () => HSApp.download('บันทึกการใช้งาน_' + new Date().toISOString().slice(0, 10) + '.csv', C.toCsv([
      { label: 'เวลา', key: 'time' }, { label: 'รหัสผู้ใช้', key: 'actorId' }, { label: 'ชื่อ', key: 'actorName' }, { label: 'บทบาท', value: l => C.ROLE_LABELS[l.role] || l.role },
      { label: 'จังหวัด', value: l => C.PROVINCES[l.provinceCode] || '' }, { label: 'การกระทำ', value: l => labels[l.action] || l.action }, { label: 'รายการ', key: 'target' }, { label: 'รายละเอียด', key: 'detail' }
    ], data.logs));
  }

  /* ประวัติการใช้งาน = การเข้าใช้งานระบบ + การบันทึก/แก้ไขข้อมูล (สลับในแท็บเดียว) */
  async function renderHistory(panel, user) {
    const view = cache.histView || 'logins';
    panel.innerHTML = '<div class="segmented sub-switch" role="group" aria-label="ประเภทประวัติ"><button type="button" data-hist="logins" class="' + (view === 'logins' ? 'active' : '') + '">การเข้าใช้งานระบบ</button><button type="button" data-hist="audit" class="' + (view === 'audit' ? 'active' : '') + '">การบันทึก / แก้ไขข้อมูล</button></div><div id="histBody"></div>';
    panel.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => { cache.histView = b.dataset.hist; render(); });
    const body = $('histBody');
    await (view === 'audit' ? renderAudit : renderLogins)(body, user);
  }

  /* ประวัติการเข้าใช้งานระบบ */
  async function renderLogins(panel, user) {
    const f = cache.hist || (cache.hist = { days: 30, from: '', to: '', role: '', result: '', q: '', province: '' });
    const data = await HSApi.post('login_report', Object.assign({ limit: 500 }, f));
    if (!Array.isArray(data.daily)) throw new Error('Backend ยังเป็นรุ่นเก่า — ผู้ดูแลต้องอัปเดต Apps Script เป็นรุ่น 3.2 ก่อนใช้งานประวัติการเข้าใช้งาน');
    const labels = data.labels || {};
    const manage = C.can(user, 'manage');
    const national = C.isNational(user);
    const max = Math.max(1, ...data.daily.map(d => d.success + d.failed + d.visits));
    const stat = (v, label, color) => '<article class="stat-card" style="--accent:' + color + '"><strong>' + Number(v).toLocaleString('th-TH') + '</strong><span>' + label + '</span></article>';
    const bars = data.daily.map(d => {
      const h = n => Math.round(n / max * 100);
      const day = Number(d.date.slice(8, 10));
      return '<div class="hist-day" title="' + esc(C.thaiDate(d.date) + ' · เข้าสู่ระบบ ' + d.success + ' · เปิดใช้งาน ' + d.visits + ' · ล้มเหลว ' + d.failed + ' · ผู้ใช้ ' + d.users + ' คน') + '"><div class="hist-stack"><i class="fail" style="height:' + h(d.failed) + '%"></i><i class="visit" style="height:' + h(d.visits) + '%"></i><i class="ok" style="height:' + h(d.success) + '%"></i></div><small>' + (data.daily.length <= 31 || day === 1 || day === 15 ? day : '') + '</small></div>';
    }).join('');
    const roleOptions = '<option value="">ทุกบทบาท</option><option value="admin">Admin</option><option value="minisuper">Mini Super Admin</option>' + (user.role === 'superadmin' ? '<option value="superadmin">Super Admin</option>' : '');
    const more = (manage ? '<label>บทบาท<select name="role">' + roleOptions + '</select></label>' : '') +
      (national ? '<label>จังหวัด<select name="province">' + provinceOptions(user, f.province, 'ทุกจังหวัด') + '</select></label>' : '') +
      '<label>ผลการเข้าสู่ระบบ<select name="result"><option value="">ทั้งหมด</option>' + Object.entries(labels).map(([k, v]) => '<option value="' + esc(k) + '">' + esc(v) + '</option>').join('') + '</select></label>' +
      '<label>ตั้งแต่วันที่<input type="date" name="from" value="' + esc(f.from) + '"></label><label>ถึงวันที่<input type="date" name="to" value="' + esc(f.to) + '"></label>';
    panel.innerHTML = '<form id="histFilter" class="toolbar-form"><label>ช่วงเวลา<select name="days"><option value="7">7 วันล่าสุด</option><option value="30">30 วันล่าสุด</option><option value="90">90 วันล่าสุด</option><option value="365">1 ปี</option></select></label>' +
        (manage ? '<label class="grow">ค้นหา<input type="search" name="q" value="' + esc(f.q) + '" placeholder="ชื่อ เบอร์โทร รหัสบัญชี"></label>' : '') +
        '<button class="primary-button" type="submit">แสดง</button><button id="histExport" class="secondary-button" type="button">ส่งออก CSV</button>' +
        '<details class="more-filters"' + (f.role || f.province || f.result || f.from || f.to ? ' open' : '') + '><summary>ตัวกรองเพิ่มเติม</summary><div class="more-grid">' + more + '</div></details></form>' +
      '<div class="stat-grid">' + stat(data.stats.loginsToday, 'เข้าสู่ระบบวันนี้ (ครั้ง)', '#18845d') + stat(data.stats.activeToday, 'ผู้ใช้งานวันนี้ (คน)', '#1d6fd1') + stat(data.stats.activePeople, 'ผู้ใช้งานในช่วงที่เลือก (คน)', '#174f38') + stat(data.stats.failed, 'เข้าสู่ระบบไม่สำเร็จ (ครั้ง)', C.COLORS.burned) + '</div>' +
      '<section class="table-card"><div class="section-title"><div><h2>การเข้าใช้งานรายวัน ' + esc(C.thaiDate(data.from)) + ' – ' + esc(C.thaiDate(data.to || new Date().toISOString().slice(0, 10))) + '</h2></div><div class="hist-legend"><span><i class="ok"></i>เข้าสู่ระบบ</span><span><i class="visit"></i>เปิดใช้งาน</span><span><i class="fail"></i>ไม่สำเร็จ</span></div></div><div class="hist-chart" role="img" aria-label="กราฟการเข้าใช้งานรายวัน">' + bars + '</div></section>' +
      '<section class="table-card"><div class="section-title"><div><h2>ผู้ใช้งาน ' + data.people.length + ' คน</h2></div></div>' +
        table(['ชื่อ', 'บทบาท', 'จังหวัด', 'เข้าสู่ระบบ', 'เปิดใช้งาน', 'ไม่สำเร็จ', 'ครั้งแรก', 'ล่าสุด', 'อุปกรณ์ล่าสุด'], data.people.map(p => '<tr>' + td(p.name) + '<td>' + roleChip(p.role) + '</td>' + td(p.provinceCode ? C.provinceName(p.provinceCode) || '—' : '—') + td(p.logins) + td(p.visits) + td(p.failed) + td(C.thaiDateTime(p.first)) + td(C.thaiDateTime(p.last) + (p.lastAction ? ' · ' + p.lastAction : '')) + '<td class="detail-cell">' + esc(deviceLabel(p.lastDevice)) + '</td></tr>'), 'ยังไม่มีการเข้าใช้งานในช่วงนี้') + '</section>' +
      (national && data.unknown.length ? '<section class="table-card"><div class="section-title"><div><p class="eyebrow">ความปลอดภัย</p><h2>หมายเลขที่ไม่มีในระบบแต่พยายามเข้าใช้ (' + data.unknown.length + ')</h2></div></div>' +
        table(['หมายเลข', 'จำนวนครั้ง', 'ครั้งแรก', 'ล่าสุด', ''], data.unknown.sort((a, b) => b.count - a.count).map(u => '<tr>' + td(u.identifier) + td(u.count) + td(C.thaiDateTime(u.first)) + td(C.thaiDateTime(u.last)) + '<td><button class="secondary-button compact" data-add="' + esc(u.identifier) + '">เพิ่มเป็นผู้ใช้</button></td></tr>')) + '</section>' : '') +
      '<section class="table-card"><div class="section-title"><div><p class="eyebrow">รายการ</p><h2>การเข้าสู่ระบบ ' + data.total.toLocaleString('th-TH') + ' ครั้ง' + (data.total > data.attempts.length ? ' (แสดง ' + data.attempts.length + ' ล่าสุด)' : '') + '</h2></div></div>' +
        table(['เวลา', 'บทบาท', 'หมายเลข / ชื่อผู้ใช้', 'ผล', 'ชื่อ', 'จังหวัด', 'อุปกรณ์'], data.attempts.map(a => '<tr>' + td(C.thaiDateTime(a.time)) + '<td>' + roleChip(a.role) + '</td>' + td(a.identifier) + '<td><span class="status-pill ' + (a.result === 'success' ? 'not_burned' : 'burned') + '">' + esc(labels[a.result] || a.result) + '</span></td>' + td(a.fullName) + td(a.provinceName) + '<td class="detail-cell">' + esc(deviceLabel(a.device)) + '</td></tr>')) + '</section>';
    const form = $('histFilter');
    ['days', 'role', 'result', 'province'].forEach(n => { if (form.elements[n]) form.elements[n].value = f[n] || (n === 'days' ? '30' : ''); });
    form.onsubmit = e => { e.preventDefault(); ['days', 'from', 'to', 'role', 'result', 'q', 'province'].forEach(n => { f[n] = form.elements[n] ? form.elements[n].value : ''; }); render(); };
    $('histExport').onclick = () => HSApp.download('ประวัติการเข้าใช้งาน_' + new Date().toISOString().slice(0, 10) + '.csv', C.toCsv([
      { label: 'เวลา', key: 'time' }, { label: 'บทบาท', value: a => C.ROLE_LABELS[a.role] || a.role }, { label: 'หมายเลข/ชื่อผู้ใช้', key: 'identifier' },
      { label: 'ผล', value: a => labels[a.result] || a.result }, { label: 'รหัสบัญชี', key: 'accountId' }, { label: 'ชื่อ', key: 'fullName' }, { label: 'จังหวัด', key: 'provinceName' }, { label: 'อุปกรณ์', key: 'device' }
    ], data.attempts));
    panel.onclick = e => { const b = e.target.closest('[data-add]'); if (b) { cache.prefillPhone = b.dataset.add; tab = 'accounts'; render(); } };
  }

  /** ย่อ user agent ให้อ่านง่าย */
  function deviceLabel(ua) {
    const s = String(ua || '');
    if (!s) return '—';
    const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iOS/i.test(s) ? 'iOS' : /Windows/i.test(s) ? 'Windows' : /Mac OS/i.test(s) ? 'macOS' : /Linux/i.test(s) ? 'Linux' : '';
    const br = /Edg\//.test(s) ? 'Edge' : /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Line\//i.test(s) ? 'LINE' : /FBAN|FBAV/.test(s) ? 'Facebook' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : '';
    return [br, os].filter(Boolean).join(' · ') || s.slice(0, 60);
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
