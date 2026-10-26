/* ติดต่อ Backend (Google Apps Script Web App) + Session — แบบเดียวกับระบบ TH-Agri-Risk-Maps-Burning */
var HSApi = (() => {
  'use strict';
  const KEY = 'hsverify.v3.session';
  const cfg = globalThis.HS_SITE_CONFIG || {};
  const endpoint = () => String(cfg.apiEndpoint || '').trim();
  let session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { session = null; }
  if (session && (!session.exp || session.exp < Date.now() || session.endpoint !== endpoint())) session = null;

  function save(s) {
    session = s;
    try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (_) {}
  }

  async function request(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 45000);
    try {
      const res = await fetch(url, Object.assign({ redirect: 'follow', cache: 'no-store', signal: controller.signal }, options));
      if (!res.ok) throw new Error('เชื่อมต่อระบบไม่สำเร็จ (' + res.status + ')');
      const data = await res.json();
      if (!data || data.ok === false) {
        const msg = String((data && data.error) || 'เกิดข้อผิดพลาด');
        if (/^AUTH:/.test(msg)) { save(null); window.dispatchEvent(new CustomEvent('hs:session-expired', { detail: msg })); }
        throw new Error(msg.replace(/^AUTH:\s*/, ''));
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('ระบบตอบสนองช้าเกินไป กรุณาลองใหม่');
      if (err instanceof TypeError) { const e = new Error('เชื่อมต่อเครือข่ายไม่ได้'); e.network = true; throw e; }
      throw err;
    } finally { clearTimeout(timer); }
  }

  function get(action, params) {
    if (!endpoint()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API'));
    const q = new URLSearchParams(Object.assign({ action }, params || {}));
    return request(endpoint() + '?' + q.toString(), { method: 'GET' });
  }

  /** POST แบบ text/plain เพื่อไม่ให้เบราว์เซอร์ส่ง preflight (Apps Script ไม่รองรับ OPTIONS) */
  function post(action, body, timeoutMs) {
    if (!endpoint()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API — ผู้ติดตั้งต้องใส่ URL Apps Script ใน site-config.js'));
    const payload = Object.assign({}, body || {}, { action, token: session ? session.token : '' });
    return request(endpoint(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }, timeoutMs);
  }

  const device = () => (navigator.userAgent || '').replace(/\s+/g, ' ').slice(0, 120);

  function adopt(data) {
    save({ token: data.token, user: data.user, exp: Date.now() + 8 * 3600 * 1000 - 60000, endpoint: endpoint() });
    return data.user;
  }

  async function login(kind, credentials) {
    return adopt(await post(kind === 'super' ? 'login_super' : 'login_admin', Object.assign({ device: device() }, credentials)));
  }

  /** ลงทะเบียน Admin — สำเร็จแล้วเข้าสู่ระบบให้ทันที */
  async function register(form) {
    return adopt(await post('register', Object.assign({ device: device() }, form)));
  }

  async function logout() {
    if (session) { try { await post('logout', {}, 10000); } catch (_) {} }
    save(null);
  }

  return {
    get, post, login, register, logout,
    configured: () => Boolean(endpoint()),
    endpoint,
    user: () => (session && session.exp > Date.now() ? session.user : null),
    refreshUser: user => { if (session) save(Object.assign({}, session, { user })); }
  };
})();
