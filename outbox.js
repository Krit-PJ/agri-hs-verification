/* งานค้างเมื่อสัญญาณขาด: เก็บใน IndexedDB ของอุปกรณ์ แล้วส่งซ้ำด้วยรหัสคำขอเดิม (เซิร์ฟเวอร์ไม่บันทึกซ้ำ) */
var HSOutbox = (() => {
  'use strict';
  const DB = 'hsverify-v3-outbox', STORE = 'jobs';
  function open() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('อุปกรณ์นี้ไม่รองรับการเก็บงานค้าง'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode), store = t.objectStore(STORE);
      const out = fn(store);
      t.oncomplete = () => { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
  }
  const put = job => tx('readwrite', s => s.put(job));
  const remove = id => tx('readwrite', s => s.delete(id));
  const all = () => tx('readonly', s => s.getAll()).then(x => x || []).catch(() => []);
  /** ส่งงานหนึ่งรายการ: ผลตรวจก่อน แล้วแนบภาพทีละภาพ (แต่ละขั้นปลอดภัยต่อการส่งซ้ำ) */
  async function run(job, api) {
    const saved = await api.post('verification_save', job.payload);
    const verificationId = saved.verification.verificationId;
    for (const p of job.photos || []) {
      if (p.done) continue;
      await api.post('photo_upload', Object.assign({}, p, { verificationId }), 90000);
      p.done = true;
      await put(job);
    }
    await remove(job.id);
    return saved;
  }
  async function flush(api) {
    let sent = 0, failed = 0;
    for (const job of await all()) {
      try { await run(job, api); sent++; } catch (err) { failed++; if (err.network) break; }
    }
    return { sent, failed };
  }
  return { put, remove, all, run, flush };
})();
