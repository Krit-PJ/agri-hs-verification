/* ============================== ผลตรวจจุดความร้อน ============================== */
/*
 * สิทธิ์
 *   admin     : บันทึกผลตรวจในจังหวัดของตน และแก้ไขรายการที่ตนบันทึก
 *   minisuper : บันทึก แก้ไข เพิ่ม ลบ ผลตรวจทุกรายการในจังหวัดของตน
 *   superadmin: ทุกจังหวัด
 * 1 จุด HS มีผลตรวจปัจจุบัน 1 รายการ ประวัติการแก้ไขทุกครั้งอยู่ใน AuditLog
 */

function canEdit_(user, rec) {
  if (isNational_(user)) return true;
  if (rec.provinceCode !== user.prov) return false;
  return user.role === 'minisuper' || rec.recordedById === user.sub;
}
function canDelete_(user, rec) { return isNational_(user) || (user.role === 'minisuper' && rec.provinceCode === user.prov); }

function publicVerification_(rec, user) {
  const o = stripRow_(rec);
  o.canEdit = canEdit_(user, rec);
  o.canDelete = canDelete_(user, rec);
  return o;
}

function photosOf_(verificationId) {
  return readAll_('Photos').filter(p => p.verificationId === verificationId).map(stripRow_);
}

function verificationGet_(user, b) {
  const prov = requireProvince_(user, b.province);
  const id = clean_(b.hotspotId, 80);
  const hs = sourceHsById_(prov, id);
  if (!hs) throw new Error('ไม่พบจุด HS ' + id + ' ในข้อมูลต้นทาง');
  const rec = findRow_('Verifications', r => r.provinceCode === prov && r.hotspotId === id);
  return { ok: true, hotspot: hs, verification: rec ? publicVerification_(rec, user) : null, photos: rec ? photosOf_(rec.verificationId) : [], canCreate: true };
}

function verificationSave_(user, b) {
  const prov = requireProvince_(user, b.province);
  const hotspotId = clean_(b.hotspotId, 80);
  const clientRequestId = uuid_(b.clientRequestId);
  if (!clientRequestId) throw new Error('ต้องมีรหัสคำขอ (clientRequestId)');
  const hs = sourceHsById_(prov, hotspotId);
  if (!hs) throw new Error('ไม่พบจุด HS ' + hotspotId + ' ในข้อมูลต้นทางของจังหวัด' + PROVINCES[prov]);

  const status = oneOf_(b.status || 'draft', STATUSES, 'สถานะ');
  const result = b.result ? oneOf_(b.result, RESULTS, 'ผลตรวจ') : '';
  const obsLat = num_(b.obsLat, 5, 21), obsLng = num_(b.obsLng, 97, 106);
  const missingGpsReason = oneOf_(b.missingGpsReason || '', MISSING_GPS_REASONS, 'เหตุผลไม่มี GPS');
  const photoMissingReason = oneOf_(b.photoMissingReason || '', PHOTO_MISSING_REASONS, 'เหตุผลไม่มีภาพ');
  const plannedPhotos = Math.max(0, Math.min(MAX_PHOTOS_PER_HS, Number(b.plannedPhotos) || 0));
  if (status === 'verified') {
    if (!result) throw new Error('กรุณาเลือกผลการตรวจ');
    if ((obsLat === '' || obsLng === '') && !missingGpsReason) throw new Error('กรุณาบันทึกตำแหน่ง GPS หรือระบุเหตุผลที่ไม่มี GPS');
  }
  const personCategory = b.personCategory ? oneOf_(b.personCategory, PERSON_CATEGORIES, 'ประเภทผู้ลงพื้นที่') : '';

  return withLock_(() => {
    const replay = findRow_('Verifications', r => r.clientRequestId === clientRequestId);
    if (replay) return { ok: true, replay: true, verification: publicVerification_(replay, user) };
    const existing = findRow_('Verifications', r => r.provinceCode === prov && r.hotspotId === hotspotId);
    if (existing && !canEdit_(user, existing)) throw new Error('จุดนี้บันทึกโดย ' + existing.recordedByName + ' แล้ว ผู้บันทึกเดิมหรือผู้ดูแลจังหวัดเท่านั้นที่แก้ไขได้');
    const photoCount = existing ? photosOf_(existing.verificationId).length : 0;
    if (status === 'verified' && photoCount + plannedPhotos === 0 && !photoMissingReason) throw new Error('กรุณาแนบภาพถ่าย หรือระบุเหตุผลที่ไม่มีภาพ');
    const data = {
      clientRequestId: clientRequestId, provinceCode: prov, provinceName: PROVINCES[prov], hotspotId: hotspotId,
      hsDate: hs.date, districtName: hs.districtName, subdistrictName: hs.subdistrictName, village: hs.village, plantType: hs.plantType, hsLat: hs.lat, hsLng: hs.lng,
      status: status, result: result, fireState: oneOf_(b.fireState || '', FIRE_STATES, 'สถานะไฟ'),
      observedMatches: oneOf_(b.observedMatches || '', ['', 'yes', 'no'], 'สภาพพื้นที่'), observedLandType: clean_(b.observedLandType, 100), observedPlantType: clean_(b.observedPlantType, 150),
      personCategory: personCategory, personCategoryOther: personCategory === 'อื่นๆ' ? clean_(b.personCategoryOther, 150) : '',
      fieldInspectorName: clean_(b.fieldInspectorName, 200) || user.name, inspectedAt: isoish_(b.inspectedAt) || now_(),
      obsLat: obsLat, obsLng: obsLng, gpsAccuracyM: num_(b.gpsAccuracyM, 0, 100000), missingGpsReason: obsLat === '' ? missingGpsReason : '',
      distanceM: distanceM_(Number(hs.lat), Number(hs.lng), obsLat, obsLng),
      notes: clean_(b.notes, 500), followUpAction: clean_(b.followUpAction, 1000), photoMissingReason: photoMissingReason,
      updatedAt: now_(), updatedById: user.sub, updatedByName: user.name
    };
    let rec;
    if (existing) {
      updateRow_('Verifications', existing._row, data);
      rec = findRow_('Verifications', r => r.verificationId === existing.verificationId);
      audit_(user, 'verification_update', hotspotId, summaryText_(data), prov);
    } else {
      const id = newId_('V');
      appendObj_('Verifications', Object.assign({}, data, {
        verificationId: id, photoCount: 0, recordedById: user.sub, recordedByName: user.name, recordedByRole: user.role, createdAt: now_()
      }));
      rec = findRow_('Verifications', r => r.verificationId === id);
      audit_(user, 'verification_create', hotspotId, summaryText_(data), prov);
    }
    return { ok: true, verification: publicVerification_(rec, user) };
  });
}

function summaryText_(d) {
  return [d.status === 'verified' ? 'ยืนยันผล' : 'งานร่าง', RESULT_LABELS[d.result] || '', d.districtName, d.subdistrictName].filter(String).join(' · ');
}

function verificationDelete_(user, b) {
  return withLock_(() => {
    const rec = findRow_('Verifications', r => r.verificationId === b.verificationId);
    if (!rec) throw new Error('ไม่พบผลตรวจ');
    if (!canDelete_(user, rec)) throw new Error('ลบผลตรวจได้เฉพาะ Mini Super Admin ของจังหวัด หรือ Super Admin');
    const photos = readAll_('Photos').filter(p => p.verificationId === rec.verificationId);
    photos.slice().sort((a, c) => c._row - a._row).forEach(p => {
      trashDriveFile_(p.driveFileId);
      deleteRow_('Photos', p._row);
    });
    deleteRow_('Verifications', rec._row);
    audit_(user, 'verification_delete', rec.hotspotId, JSON.stringify(Object.assign(stripRow_(rec), { photos: photos.length, reason: clean_(b.reason, 300) })), rec.provinceCode);
    return { ok: true };
  });
}

function trashDriveFile_(id) {
  try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (err) { console.warn('trash failed ' + id + ': ' + err); }
}

/* ------------------------------ ภาพหลักฐาน ------------------------------ */

function photoFolder_(prov) {
  const root = DriveApp.getFolderById(setting_('photo_folder_id') || DEFAULT_PHOTO_FOLDER_ID);
  const name = prov + ' ' + PROVINCES[prov];
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function photoUpload_(user, b) {
  const clientRequestId = uuid_(b.clientRequestId);
  if (!clientRequestId) throw new Error('ต้องมีรหัสคำขอ (clientRequestId)');
  const mime = oneOf_(b.mimeType, PHOTO_MIME_TYPES, 'ชนิดภาพ');
  const base64 = String(b.base64 || '');
  if (!base64 || base64.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 8) throw new Error('ภาพต้องมีขนาดไม่เกิน 1 MB');
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('ภาพต้องมีขนาดไม่เกิน 1 MB');
  return withLock_(() => {
    const replay = findRow_('Photos', p => p.clientRequestId === clientRequestId);
    if (replay) return { ok: true, replay: true, photo: stripRow_(replay) };
    const rec = findRow_('Verifications', r => r.verificationId === b.verificationId);
    if (!rec) throw new Error('ไม่พบผลตรวจ กรุณาบันทึกผลก่อนแนบภาพ');
    if (!canEdit_(user, rec)) throw new Error('ไม่มีสิทธิ์แนบภาพในผลตรวจนี้');
    const count = photosOf_(rec.verificationId).length;
    if (count >= MAX_PHOTOS_PER_HS) throw new Error('แนบภาพได้สูงสุด ' + MAX_PHOTOS_PER_HS + ' ภาพต่อจุด');
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const fileName = rec.hotspotId + '_' + (count + 1) + '_' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss') + '.' + ext;
    const file = photoFolder_(rec.provinceCode).createFile(Utilities.newBlob(bytes, mime, fileName));
    const photo = {
      photoId: newId_('P'), clientRequestId: clientRequestId, verificationId: rec.verificationId, hotspotId: rec.hotspotId, provinceCode: rec.provinceCode,
      driveFileId: file.getId(), fileName: fileName, mimeType: mime, sizeBytes: bytes.length, sha256: sha256Bytes_(bytes),
      photoLat: num_(b.photoLat, -90, 90), photoLng: num_(b.photoLng, -180, 180), takenAt: clean_(b.takenAt, 40),
      uploadedById: user.sub, uploadedByName: user.name, uploadedAt: now_()
    };
    appendObj_('Photos', photo);
    updateRow_('Verifications', rec._row, { photoCount: count + 1 });
    audit_(user, 'photo_upload', rec.hotspotId, fileName + ' ' + bytes.length + ' bytes', rec.provinceCode);
    return { ok: true, photo: photo };
  });
}

function photoGet_(user, b) {
  const p = findRow_('Photos', x => x.photoId === b.photoId);
  if (!p) throw new Error('ไม่พบภาพ');
  requireProvince_(user, p.provinceCode);
  const blob = DriveApp.getFileById(p.driveFileId).getBlob();
  return { ok: true, photoId: p.photoId, mimeType: p.mimeType, base64: Utilities.base64Encode(blob.getBytes()) };
}

function photoDelete_(user, b) {
  return withLock_(() => {
    const p = findRow_('Photos', x => x.photoId === b.photoId);
    if (!p) throw new Error('ไม่พบภาพ');
    const rec = findRow_('Verifications', r => r.verificationId === p.verificationId);
    if (!rec || !canEdit_(user, rec)) throw new Error('ไม่มีสิทธิ์ลบภาพนี้');
    trashDriveFile_(p.driveFileId);
    deleteRow_('Photos', p._row);
    const fresh = findRow_('Verifications', r => r.verificationId === rec.verificationId);
    updateRow_('Verifications', fresh._row, { photoCount: photosOf_(rec.verificationId).length });
    audit_(user, 'photo_delete', rec.hotspotId, p.fileName, rec.provinceCode);
    return { ok: true };
  });
}

/** รายการผลตรวจเต็มของจังหวัด (สำหรับสรุปผล/ส่งออก) */
function verificationsList_(user, b) {
  const prov = requireProvince_(user, b.province);
  const rows = readAll_('Verifications').filter(r => r.provinceCode === prov).map(r => publicVerification_(r, user));
  if (b.export) audit_(user, 'export', 'ผลตรวจจังหวัด' + PROVINCES[prov], rows.length + ' รายการ', prov);
  return { ok: true, province: prov, verifications: rows };
}

/**
 * ภาพหลักฐานสำหรับรายงานพิมพ์: รับรายการ {province, hotspotId} ครั้งละไม่เกิน REPORT_BATCH จุด
 * คืนเฉพาะผลตรวจ "ตรวจแล้ว" ที่มีภาพ และอยู่ในขอบเขตสิทธิ์ของผู้ใช้ (นอกขอบเขตนับเป็น skipped)
 */
function reportPhotos_(user, b) {
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length > REPORT_BATCH) throw new Error('ขอภาพได้ครั้งละไม่เกิน ' + REPORT_BATCH + ' จุด');
  const out = []; let skipped = 0;
  const verifs = readAll_('Verifications'), photos = readAll_('Photos');
  items.forEach(it => {
    const prov = provCode_(it && it.province), id = clean_(it && it.hotspotId, 80);
    if (!prov || !inScope_(user, prov)) { skipped++; return; }
    const rec = verifs.find(r => r.provinceCode === prov && r.hotspotId === id && r.status === 'verified');
    if (!rec) return;
    const list = photos.filter(p => p.verificationId === rec.verificationId).slice(0, MAX_PHOTOS_PER_HS);
    if (!list.length) return;
    const v = stripRow_(rec);
    out.push({
      province: prov, hotspotId: id,
      verification: { result: v.result, fireState: v.fireState, inspectedAt: v.inspectedAt, obsLat: v.obsLat, obsLng: v.obsLng, distanceM: v.distanceM,
        fieldInspectorName: v.fieldInspectorName, personCategory: v.personCategory, recordedByName: v.recordedByName, notes: v.notes, followUpAction: v.followUpAction },
      photos: list.map(p => {
        let base64 = '';
        try { base64 = Utilities.base64Encode(DriveApp.getFileById(p.driveFileId).getBlob().getBytes()); } catch (e) { base64 = ''; }
        return { photoId: p.photoId, mimeType: p.mimeType, base64: base64, takenAt: cellText_(p.takenAt), photoLat: p.photoLat, photoLng: p.photoLng };
      }).filter(p => p.base64)
    });
  });
  if (b.audit) audit_(user, 'report', 'รายงานพร้อมภาพหลักฐาน', String(b.total || items.length) + ' จุด', isNational_(user) ? '' : user.prov);
  return { ok: true, items: out, skipped: skipped };
}
