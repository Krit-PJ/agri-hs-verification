function actorCanAccessHs_(actor, hs) {
  if(typeof nationalReadActor_==='function'&&!nationalReadActor_(actor,hs))return false;
  if (['admin', 'super_admin'].indexOf(actor.role) >= 0) return true;
  if (actor.district && cleanText_(hs.district) !== actor.district) return false;
  if (actor.tambon && cleanText_(hs.tambon) !== actor.tambon) return false;
  return true;
}

function requireAccessibleHs_(actor, hsId) {
  const hs = findOne_(APP.SHEETS.BASE, 'hs_id', cleanText_(hsId, 128));
  assert_(hs && String(hs.active).toLowerCase() !== 'false', 'NOT_FOUND', 'ไม่พบ Hotspot');
  assert_(actorCanAccessHs_(actor, hs), 'FORBIDDEN', 'Hotspot อยู่นอกพื้นที่รับผิดชอบ');
  return hs;
}

function latestVerificationMap_() {
  const map = {};
  const photosByVerification = {};
  rowsAsObjects_(APP.SHEETS.PHOTOS).forEach(function(p){photosByVerification[cleanText_(p.verification_id)]=true;});
  rowsAsObjects_(APP.SHEETS.VERIFICATION).forEach(function (row) {
    const key = cleanText_(row.hs_id);
    const prior = map[key];
    if (!prior || Date.parse(row.updated_at || row.verified_at) >= Date.parse(prior.updated_at || prior.verified_at)) map[key] = row;
  });
  Object.keys(map).forEach(function(key){const row=map[key];row._evidenceState=!(row.evidence_required===true || row.evidence_required==='true') ? 'not_required' : photosByVerification[cleanText_(row.verification_id)] ? 'provided' : cleanText_(row.photo_missing_reason) ? 'exception' : 'pending';});
  return map;
}

function applyHsFilters_(rows, filters, actor, latest) {
  filters = filters || {};
  let fiscalStart='',fiscalEnd='';
  if(filters.startMonth!=null){const start=String(filters.startMonth),end=String(filters.endMonth||'');assert_(/^\d{4}-(0[1-9]|1[0-2])$/.test(start)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(end)&&start<=end&&Number(start.slice(0,4))>=1900&&Number(end.slice(0,4))<=2300,'VALIDATION_ERROR','ช่วงเดือนเริ่มต้นและสิ้นสุดไม่ถูกต้อง');fiscalStart=start+'-01';fiscalEnd=end;}
  else if(filters.fiscalYearBe){const fy=Number(filters.fiscalYearBe),end=cleanText_(filters.endMonth,7);assert_(Number.isInteger(fy)&&fy>=2400&&fy<=2800&&/^\d{4}-\d{2}$/.test(end),'VALIDATION_ERROR','ช่วงปีงบประมาณไม่ถูกต้อง');fiscalStart=String(fy-544)+'-10-01';const last=String(fy-543)+'-09';assert_(end>=fiscalStart.slice(0,7)&&end<=last&&Number(end.slice(5))>=1&&Number(end.slice(5))<=12,'VALIDATION_ERROR','เดือนสิ้นสุดต้องอยู่ในปีงบประมาณ');fiscalEnd=end;}
  const search = compact_(filters.search);
  return rows.filter(function (row) {
    if (String(row.active).toLowerCase() === 'false' || !actorCanAccessHs_(actor, row)) return false;
    if(fiscalStart){const at=new Date(row.acquired_at);if(isNaN(at.getTime()))return false;const date=Utilities.formatDate(at,'Asia/Bangkok','yyyy-MM-dd');if(date<fiscalStart||date.slice(0,7)>fiscalEnd)return false;}

    if(filters.provinceCode&&typeof nationalCode_==='function'&&nationalCode_(row)!==filters.provinceCode)return false;
    const verification = latest[cleanText_(row.hs_id)];
    const status = verification ? cleanText_(verification.status) : 'pending';
    if (filters.district && cleanText_(row.district) !== cleanText_(filters.district)) return false;
    if (filters.tambon && cleanText_(row.tambon) !== cleanText_(filters.tambon)) return false;
    if (filters.village && cleanText_(row.village) !== cleanText_(filters.village)) return false;
    if (filters.plantType && cleanText_(row.plant_type) !== normalizePlantType_(filters.plantType)) return false;
    if (filters.status && status !== cleanText_(filters.status)) return false;
    if (filters.result && (!verification || cleanText_(verification.result) !== cleanText_(filters.result))) return false;
    if (filters.year || filters.month) {
      const acquired = new Date(cleanText_(row.acquired_at));
      if (isNaN(acquired.getTime())) return false;
      const localYear = Number(Utilities.formatDate(acquired, 'Asia/Bangkok', 'yyyy'));
      const localMonth = Number(Utilities.formatDate(acquired, 'Asia/Bangkok', 'M'));
      const requestedYear = Number(filters.year || 0);
      const cohortYear = Number(row.dataset_year_be) || localYear + 543;
      const yearMatches = !requestedYear || requestedYear === cohortYear || requestedYear + 543 === cohortYear;
      if (!yearMatches || (filters.month && Number(filters.month) !== localMonth)) return false;
    }
    if (search) {
      const haystack = compact_([row.hs_id, row.district, row.tambon, row.village, row.plant_type].join(' '));
      if (haystack.indexOf(search) < 0) return false;
    }
    return true;
  });
}

function allHs_(actor, payload) {
  payload = payload || {};
  const latest = latestVerificationMap_();
  const filtered = applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE), payload.filters, actor, latest);
  return {
    items: filtered.map(function (row) { return publicHs_(row, latest[cleanText_(row.hs_id)]); }),
    page: 1,
    pageSize: filtered.length,
    total: filtered.length,
    totalPages: filtered.length ? 1 : 0
  };
}

function listHs_(actor, payload) {
  payload = payload || {};
  const page = Math.max(1, Math.floor(Number(payload.page) || 1));
  const pageSize = Math.min(APP.MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(payload.pageSize) || 100)));
  const latest = latestVerificationMap_();
  const filtered = applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE), payload.filters, actor, latest);
  const offset = (page - 1) * pageSize;
  return {
    items: filtered.slice(offset, offset + pageSize).map(function (row) { return publicHs_(row, latest[cleanText_(row.hs_id)]); }),
    page: page,
    pageSize: pageSize,
    total: filtered.length,
    totalPages: Math.ceil(filtered.length / pageSize)
  };
}

function photoMetadataForHs_(hsId) {
  return rowsAsObjects_(APP.SHEETS.PHOTOS).filter(function (row) { return cleanText_(row.hs_id) === hsId; }).map(function (row) {
    return {
      photoId: cleanText_(row.photo_id),
      verificationId: cleanText_(row.verification_id),
      hsId: cleanText_(row.hs_id),
      mimeType: cleanText_(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      caption: cleanText_(row.caption),
      inspectorId: cleanText_(row.inspector_id),
      capturedAt: cleanText_(row.photo_taken_at),
      uploadedAt: cleanText_(row.uploaded_at), source: cleanText_(row.attachment_source),
      coordinateSource: cleanText_(row.coordinate_source),
      latitude: row.photo_latitude === '' || row.photo_latitude == null ? null : Number(row.photo_latitude),
      longitude: row.photo_longitude === '' || row.photo_longitude == null ? null : Number(row.photo_longitude),
      accuracyM: row.photo_accuracy_m === '' || row.photo_accuracy_m == null ? null : Number(row.photo_accuracy_m),
      capturedAtSource: cleanText_(row.photo_taken_at_source),
      distanceToHsM: row.distance_to_hs_m === '' || row.distance_to_hs_m == null ? null : Number(row.distance_to_hs_m),
      sha256: cleanText_(row.sha256),
      originalSha256: cleanText_(row.original_sha256) || cleanText_(row.sha256),
      derivativeSha256: cleanText_(row.sha256),
      exif: parseStoredJson_(row.exif_json), evidenceQa: parseStoredJson_(row.evidence_qa_json),
      deviceCapture: parseStoredJson_(row.device_capture_json)
    };
  });
}

function getHs_(actor, payload) {
  const hs = requireAccessibleHs_(actor, payload && payload.hsId);
  const latest = latestVerificationMap_()[cleanText_(hs.hs_id)];
  const result = publicHs_(hs, latest);
  result.photos = photoMetadataForHs_(cleanText_(hs.hs_id));
  return result;
}

function idempotentVerification_(requestId, actor, hsId) {
  const direct = findOne_(APP.SHEETS.VERIFICATION, 'request_id', requestId);
  if (direct) {
    assert_(cleanText_(direct.inspector_id) === actor.id && cleanText_(direct.hs_id) === hsId, 'CONFLICT', 'requestId ถูกใช้กับรายการอื่นแล้ว');
    return publicVerification_(direct);
  }
  const log = findOne_(APP.SHEETS.LOG, 'request_id', requestId);
  if (log && log.action === 'saveVerification' && log.status === 'success') {
    let replay;
    try { replay = JSON.parse(cleanText_(log.details_json)).verification; } catch (ignored) {}
    assert_(cleanText_(log.actor_id) === actor.id && replay && replay.hsId === hsId, 'CONFLICT', 'requestId ถูกใช้กับรายการอื่นแล้ว');
    return replay;
  }
  return null;
}

function saveVerification_(actor, requestId, payload) {
  payload = payload || {};
  return withScriptLock_(function () {
    const hs = requireAccessibleHs_(actor, payload.hsId);
    const replay = idempotentVerification_(requestId, actor, cleanText_(hs.hs_id));
    if (replay) return {verification: replay, idempotent: true};
    const status = cleanText_(payload.status) || 'verified';
    const result = cleanText_(payload.result);
    assert_(APP.STATUSES.indexOf(status) >= 0, 'VALIDATION_ERROR', 'status ไม่ถูกต้อง');
    assert_((status === 'draft' && (!result || APP.RESULTS.indexOf(result) >= 0)) || (status === 'verified' && APP.RESULTS.indexOf(result) >= 0), 'VALIDATION_ERROR', 'result ไม่ถูกต้องหรือยังไม่ได้ระบุ');
    let observedLatitude = '';
    let observedLongitude = '';
    let gpsAccuracyM = '';
    let missingGpsReason = cleanText_(payload.missingGpsReason, 500);
    let distanceM = '';
    if (payload.location != null) {
      assert_(payload.location && typeof payload.location === 'object', 'VALIDATION_ERROR', 'location ไม่ถูกต้อง');
      observedLatitude = parseNumber_(payload.location.latitude, -90, 90, 'location.latitude');
      observedLongitude = parseNumber_(payload.location.longitude, -180, 180, 'location.longitude');
      if (payload.location.accuracyM != null && payload.location.accuracyM !== '') gpsAccuracyM = parseNumber_(payload.location.accuracyM, 0, 100000, 'location.accuracyM');
      missingGpsReason = '';
      distanceM = haversineMeters_(Number(hs.latitude), Number(hs.longitude), observedLatitude, observedLongitude);
    }
    if (status === 'verified' && payload.location == null) assert_(missingGpsReason, 'VALIDATION_ERROR', 'ต้องระบุ missingGpsReason เมื่อไม่มีพิกัด GPS');
    const now = isoNow_();
    const person = validatePersonCategory_(payload.personCategory || actor.personCategory, payload.personCategoryOther || actor.personCategoryOther);
    const fieldInspectorName = cleanText_(payload.fieldInspectorName,120) || actor.displayName;
    const inspectedAt = parseOptionalIsoDate_(payload.inspectedAt, 'inspectedAt') || now;
    assert_(Date.parse(inspectedAt) <= Date.parse(now) + 5*60000, 'VALIDATION_ERROR', 'วันเวลาตรวจต้องไม่อยู่ในอนาคต');
    const inspectedAtSource = payload.inspectedAt ? cleanText_(payload.inspectedAtSource) || 'client_device' : 'server_default';
    assert_(['client_device','user_confirmed','server_default'].indexOf(inspectedAtSource)>=0, 'VALIDATION_ERROR', 'ที่มาวันเวลาตรวจไม่ถูกต้อง');
    assert_(payload.observedLandMatchesSource == null || typeof payload.observedLandMatchesSource === 'boolean', 'VALIDATION_ERROR', 'ต้องยืนยันประเภทพื้นที่เป็น true/false');
    const matches = payload.observedLandMatchesSource == null ? '' : payload.observedLandMatchesSource;
    const observedLand = matches === false ? cleanText_(payload.observedLandType,120) : matches === true ? cleanText_(hs.land_type) : '';
    const observedPlant = matches === false ? cleanText_(payload.observedPlantType,120) : matches === true ? cleanText_(hs.plant_type) : '';
    assert_(matches !== false || (observedLand && observedPlant), 'VALIDATION_ERROR', 'โปรดระบุประเภทพื้นที่และพืชที่พบจริง');
    const fireState = result === 'burned' ? cleanText_(payload.fireState) || 'unknown' : '';
    assert_(!fireState || ['active','extinguished','unknown'].indexOf(fireState)>=0, 'VALIDATION_ERROR', 'สถานะไฟไม่ถูกต้อง');
    const requestedId = payload.verificationId ? requireUuid_(payload.verificationId, 'verificationId') : '';
    let existing = requestedId ? findOne_(APP.SHEETS.VERIFICATION, 'verification_id', requestedId) : null;
    if (requestedId) assert_(existing, 'NOT_FOUND', 'ไม่พบรายการตรวจสอบ');
    if (existing) {
      assert_(cleanText_(existing.hs_id) === cleanText_(hs.hs_id), 'CONFLICT', 'verificationId ไม่ตรงกับ Hotspot');
      assert_(['admin', 'super_admin'].indexOf(actor.role) >= 0 || cleanText_(existing.inspector_id) === actor.id, 'FORBIDDEN', 'แก้ไขได้เฉพาะรายการของตนเอง');
    }
    const record = {
      verification_id: existing ? cleanText_(existing.verification_id) : uuid_(),
      request_id: requestId,
      hs_id: cleanText_(hs.hs_id),
      status: status,
      result: result,
      notes: cleanText_(payload.notes, 2000),
      action: cleanText_(payload.action, 1000),
      observed_latitude: observedLatitude,
      observed_longitude: observedLongitude,
      gps_accuracy_m: gpsAccuracyM,
      missing_gps_reason: missingGpsReason,
      distance_m: distanceM,
      inspector_id: actor.id,
      inspector_name: actor.displayName,
      verified_at: now,
      source_snapshot_json: cleanText_(hs.source_snapshot_json) || jsonStringifySafe_(publicHs_(hs, null)),
      created_at: existing ? cleanText_(existing.created_at) : now,
      updated_at: now,
      person_category: person.category, person_category_other: person.other, field_inspector_name: fieldInspectorName,
      reported_by_id: actor.id, reported_by_name: actor.displayName, agency: cleanText_(actor.agency,200),
      inspected_at: inspectedAt, inspected_at_source: inspectedAtSource, submitted_at: now,
      observed_land_matches_source: matches, observed_land_type: observedLand, observed_plant_type: observedPlant,
      fire_state: fireState, evidence_required: status === 'verified' || Boolean(existing && (existing.evidence_required === true || existing.evidence_required === 'true')),
      photo_missing_reason: cleanText_(payload.photoMissingReason,500)
    };
    try {
      if (existing) updateObjectRow_(APP.SHEETS.VERIFICATION, existing._row, record);
      else appendObject_(APP.SHEETS.VERIFICATION, record);
      if (person.category && fieldInspectorName === actor.displayName) {
        const profile = findOne_(APP.SHEETS.INSPECTORS, 'inspector_id', actor.id);
        if(profile) { profile.person_category=person.category; profile.person_category_other=person.other; updateObjectRow_(APP.SHEETS.INSPECTORS,profile._row,profile); }
      }
      const verification = publicVerification_(record);
      appendLog_(actor, requestId, 'saveVerification', 'verification', record.verification_id, 'success', {verification: verification});
      return {verification: verification, idempotent: false};
    } catch (error) {
      appendLog_(actor, requestId, 'saveVerification', 'verification', record.verification_id, 'failure', {code: error.code || 'INTERNAL_ERROR', message: error.message});
      throw error;
    }
  });
}

function getPhotoFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = cleanText_(properties.getProperty('PHOTO_FOLDER_ID'));
  if (configuredId) return DriveApp.getFolderById(configuredId);
  const folder = DriveApp.createFolder('HS Verification Photos (Private)');
  try { folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (error) {
    try { folder.setTrashed(true); } catch (ignored) {}
    throw new ApiError('DRIVE_PRIVACY_ERROR', 'ไม่สามารถกำหนดโฟลเดอร์รูปเป็นส่วนตัวได้');
  }
  properties.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function uploadPhoto_(actor, requestId, payload) {
  payload = payload || {};
  return withScriptLock_(function () {
    const verificationId = requireUuid_(payload.verificationId, 'verificationId');
    const verification = findOne_(APP.SHEETS.VERIFICATION, 'verification_id', verificationId);
    assert_(verification, 'NOT_FOUND', 'ไม่พบรายการตรวจสอบ');
    const hs = requireAccessibleHs_(actor, payload.hsId);
    assert_(cleanText_(verification.hs_id) === cleanText_(hs.hs_id), 'CONFLICT', 'รายการตรวจสอบไม่ตรงกับ Hotspot');
    assert_(['admin', 'super_admin'].indexOf(actor.role) >= 0 || cleanText_(verification.inspector_id) === actor.id, 'FORBIDDEN', 'อัปโหลดรูปได้เฉพาะรายการของตนเอง');
    const prior = findOne_(APP.SHEETS.PHOTOS, 'request_id', requestId);
    if (prior) {
      assert_(cleanText_(prior.inspector_id) === actor.id && cleanText_(prior.hs_id) === cleanText_(hs.hs_id) && cleanText_(prior.verification_id) === verificationId, 'CONFLICT', 'requestId ถูกใช้กับรูปอื่นแล้ว');
      return {photo: photoMetadataForHs_(cleanText_(prior.hs_id)).filter(function (item) { return item.photoId === cleanText_(prior.photo_id); })[0], idempotent: true};
    }
    const mimeType = cleanText_(payload.mimeType, 64).toLowerCase();
    assert_(APP.PHOTO_MIME_TYPES.indexOf(mimeType) >= 0, 'UNSUPPORTED_MEDIA_TYPE', 'รองรับเฉพาะ JPEG, PNG และ WebP');
    let base64 = cleanText_(payload.base64);
    const dataUri = base64.match(/^data:([^;]+);base64,(.*)$/s);
    if (dataUri) {
      assert_(dataUri[1].toLowerCase() === mimeType, 'VALIDATION_ERROR', 'MIME type ไม่ตรงกับ data URI');
      base64 = dataUri[2];
    }
    assert_(base64 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length % 4 === 0, 'INVALID_BASE64', 'ข้อมูลรูปไม่ใช่ base64 ที่ถูกต้อง');
    let bytes;
    try { bytes = Utilities.base64Decode(base64); } catch (error) { throw new ApiError('INVALID_BASE64', 'ข้อมูลรูปไม่ใช่ base64 ที่ถูกต้อง'); }
    assert_(bytes.length > 0 && bytes.length <= APP.MAX_PHOTO_BYTES, 'PHOTO_TOO_LARGE', 'รูปต้องมีขนาดไม่เกิน 1 MB', {maxBytes: APP.MAX_PHOTO_BYTES});
    assert_(bytesMatchMime_(bytes, mimeType), 'MEDIA_SIGNATURE_MISMATCH', 'เนื้อหาไฟล์ไม่ตรงกับ MIME type');
    const metadata = HSEvidence.inspectBytes(bytes);
    const attachmentSource = cleanText_(payload.source) || 'import';
    assert_(['camera','import'].indexOf(attachmentSource)>=0, 'VALIDATION_ERROR', 'แหล่งที่มาภาพไม่ถูกต้อง');
    const deviceCapture = {source:'client_reported',captureAt:'',location:null};
    let captureLocation = null;
    if(attachmentSource==='camera' && payload.captureLocation) {
      captureLocation = {
        latitude:parseNumber_(payload.captureLocation.latitude,-90,90,'captureLocation.latitude'),
        longitude:parseNumber_(payload.captureLocation.longitude,-180,180,'captureLocation.longitude'),
        accuracyM: payload.captureLocation.accuracyM == null ? null : parseNumber_(payload.captureLocation.accuracyM,0,100000,'captureLocation.accuracyM')
      };
      deviceCapture.location=captureLocation;
      deviceCapture.captureAt=parseOptionalIsoDate_(payload.captureAt || payload.captureLocation.capturedAt,'captureAt');
    }
    // A resized derivative may lose EXIF. Retain separately reported original EXIF, never label it server-read.
    let reportedOriginal=null;
    if(payload.originalMetadata && typeof payload.originalMetadata==='object'){
      const original=payload.originalMetadata;
      if(original.latitude!=null && original.longitude!=null){reportedOriginal={latitude:parseNumber_(original.latitude,-90,90,'originalMetadata.latitude'),longitude:parseNumber_(original.longitude,-180,180,'originalMetadata.longitude'),accuracyM:null,capturedAt:parseOptionalIsoDate_(original.capturedAt,'originalMetadata.capturedAt'),timeZoneKnown:original.timeZoneKnown===true,source:'client_reported_original_exif'};}
    }
    // Imported photos never inherit the uploader's current device coordinates.
    const evidencePoint = metadata.latitude != null && metadata.longitude != null ? metadata : reportedOriginal || (
      attachmentSource==='camera' && captureLocation && deviceCapture.captureAt ? {
        latitude:captureLocation.latitude,longitude:captureLocation.longitude,accuracyM:captureLocation.accuracyM,
        capturedAt:deviceCapture.captureAt,timeZoneKnown:true,source:'client_reported_camera'
      } : metadata);
    const evidenceQa = HSEvidence.assess({hs:{latitude:Number(hs.latitude),longitude:Number(hs.longitude),acquiredAt:cleanText_(hs.acquired_at)},metadata:evidencePoint,captureLocation:captureLocation,captureAt:deviceCapture.captureAt});
    evidenceQa.coordinateSource=evidencePoint.source;
    if(evidencePoint.source==='client_reported_original_exif'){evidenceQa.status='review';evidenceQa.reasons.push('พิกัดจาก EXIF ภาพต้นฉบับรายงานโดยเครื่องผู้ใช้ ไม่ได้ตรวจจากไฟล์ต้นฉบับบนเซิร์ฟเวอร์');}
    if(metadata.parseStatus==='malformed') { evidenceQa.status='review'; evidenceQa.reasons.push('EXIF เสียหายหรืออ่านไม่ได้'); }
    const derivativeHash=sha256Bytes_(bytes);
    const claimedOriginal=cleanText_(payload.originalSha256,64);
    assert_(!claimedOriginal||/^[a-f0-9]{64}$/i.test(claimedOriginal),'VALIDATION_ERROR','originalSha256 ไม่ถูกต้อง');
    // Original hash is client-reported when the original file was resized before upload.
    const originalHash=claimedOriginal||derivativeHash;
    if(claimedOriginal && claimedOriginal!==derivativeHash){deviceCapture.originalHashSource='client_reported';deviceCapture.originalSha256=claimedOriginal;deviceCapture.originalMetadata=payload.originalMetadata&&typeof payload.originalMetadata==='object'?payload.originalMetadata:null;}
    const duplicates=rowsAsObjects_(APP.SHEETS.PHOTOS).filter(function(p){return (cleanText_(p.original_sha256)||cleanText_(p.sha256))===originalHash;});
    if(duplicates.length) { evidenceQa.status='review'; evidenceQa.reasons.push('พบไฟล์ภาพเดิมในระบบ โปรดสอบทวนการใช้หลักฐานซ้ำ'); }
    const extension = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}[mimeType];
    const photoId = uuid_();
    const rawName = cleanText_(payload.fileName, 160).replace(/[^\p{L}\p{N}._-]+/gu, '_');
    const fileName = (rawName || (cleanText_(hs.hs_id) + '-' + photoId)) + (rawName.toLowerCase().endsWith(extension) ? '' : extension);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    let file;
    try {
      file = getPhotoFolder_().createFile(blob);
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      const uploadedAt = isoNow_();
      const row = {
        photo_id: photoId,
        request_id: requestId,
        verification_id: verificationId,
        hs_id: cleanText_(hs.hs_id),
        drive_file_id: file.getId(),
        mime_type: mimeType,
        size_bytes: bytes.length,
        sha256: sha256Bytes_(bytes),
        caption: cleanText_(payload.caption, 500),
        inspector_id: actor.id,
        client_captured_at: deviceCapture.captureAt,
        uploaded_at: uploadedAt, attachment_source:attachmentSource,
        exif_json:jsonStringifySafe_(metadata), coordinate_source:evidencePoint.latitude != null && evidencePoint.longitude != null ? evidencePoint.source : 'none',
        photo_latitude:evidencePoint.latitude == null ? '' : evidencePoint.latitude,
        photo_longitude:evidencePoint.longitude == null ? '' : evidencePoint.longitude,
        photo_accuracy_m:evidencePoint.accuracyM == null ? '' : evidencePoint.accuracyM,
        photo_taken_at:evidencePoint.capturedAt || '', photo_taken_at_source:evidencePoint.source==='client_reported_original_exif'?'client_reported_original_exif':metadata.timeSource || '',
        device_capture_json:jsonStringifySafe_(deviceCapture), distance_to_hs_m:evidenceQa.distanceM == null ? '' : evidenceQa.distanceM,
        evidence_qa_json:jsonStringifySafe_(evidenceQa), original_sha256:originalHash
      };
      appendObject_(APP.SHEETS.PHOTOS, row);
      const photo = photoMetadataForHs_(cleanText_(hs.hs_id)).filter(function (item) { return item.photoId === photoId; })[0];
      appendLog_(actor, requestId, 'uploadPhoto', 'photo', photoId, 'success', {photo: photo});
      return {photo: photo, idempotent: false};
    } catch (error) {
      if (file) try { file.setTrashed(true); } catch (ignored) {}
      appendLog_(actor, requestId, 'uploadPhoto', 'photo', photoId, 'failure', {code: error.code || 'INTERNAL_ERROR', message: error.message});
      throw error;
    }
  });
}

function getPhoto_(actor, payload) {
  const photo = findOne_(APP.SHEETS.PHOTOS, 'photo_id', payload && payload.photoId);
  assert_(photo, 'NOT_FOUND', 'ไม่พบรูป');
  requireAccessibleHs_(actor, photo.hs_id);
  const verification=findOne_(APP.SHEETS.VERIFICATION,'verification_id',photo.verification_id);
  assert_(verification&&verification.status==='verified'&&cleanText_(verification.hs_id)===cleanText_(photo.hs_id),'FORBIDDEN','แสดงภาพได้เมื่อยืนยันผลตรวจแล้วเท่านั้น');
  const file = DriveApp.getFileById(cleanText_(photo.drive_file_id));
  const blob = file.getBlob(),bytes=blob.getBytes(),mimeType=cleanText_(photo.mime_type);
  assert_(bytes.length<=APP.MAX_READ_PHOTO_BYTES,'PHOTO_TOO_LARGE','ภาพเดิมเกินขนาดที่อนุญาต');
  assert_(APP.PHOTO_MIME_TYPES.indexOf(mimeType)>=0&&bytesMatchMime_(bytes,mimeType),'MEDIA_SIGNATURE_MISMATCH','รูปแบบภาพไม่ถูกต้อง');
  return {photoId:cleanText_(photo.photo_id),mimeType:mimeType,fileName:cleanText_(photo.photo_id)+({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[mimeType]),base64:Utilities.base64Encode(bytes)};
}

function locationValues_(actor, payload, level) {
  const filters = {};
  if (level !== 'district') filters.district = cleanText_(payload && payload.district);
  if (level === 'village') filters.tambon = cleanText_(payload && payload.tambon);
  if (level !== 'district') assert_(filters.district, 'VALIDATION_ERROR', 'ต้องระบุ district');
  if (level === 'village') assert_(filters.tambon, 'VALIDATION_ERROR', 'ต้องระบุ tambon');
  const field = level === 'district' ? 'district' : (level === 'tambon' ? 'tambon' : 'village');
  const seen = {};
  rowsAsObjects_(APP.SHEETS.BASE).forEach(function (row) {
    if (!actorCanAccessHs_(actor, row) || String(row.active).toLowerCase() === 'false') return;
    if (filters.district && cleanText_(row.district) !== filters.district) return;
    if (filters.tambon && cleanText_(row.tambon) !== filters.tambon) return;
    const value = cleanText_(row[field]);
    if (value) seen[value] = true;
  });
  return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'th'); });
}

function summaries_(actor, payload) {
  const latest = latestVerificationMap_();
  const rows = applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE), payload && payload.filters, actor, latest);
  const result = {total: rows.length, byStatus: {}, byResult: {}, byDistrict: {}, byTambon: {}, byVillage: {}, byPlantType: {}, submitted: 0, confirmed: 0, followUpRequired: 0, evidencePending: 0};
  rows.forEach(function (row) {
    const verification = latest[cleanText_(row.hs_id)];
    const status = verification ? cleanText_(verification.status) : 'pending';
    const outcome = verification ? cleanText_(verification.result) : '';
    const district = (typeof nationalCode_==='function'?nationalCode_(row)+'/'+row.province+'/':'')+(cleanText_(row.district) || '(ไม่ระบุ)');
    const tambon = district + '/' + (cleanText_(row.tambon) || '(ไม่ระบุ)');
    const village = tambon + '/' + (cleanText_(row.village) || '(ไม่ระบุ)');
    const plant = cleanText_(row.plant_type) || '(ไม่ระบุ)';
    if(verification && status==='verified') {
      result.submitted += 1;
      if(['not_found','needs_review','inaccessible'].indexOf(outcome)>=0) result.followUpRequired += 1;
      else result.confirmed += 1;
      if(verificationEvidenceState_(verification)==='pending') result.evidencePending += 1;
    }
    result.byStatus[status] = (result.byStatus[status] || 0) + 1;
    if (outcome && status === 'verified') result.byResult[outcome] = (result.byResult[outcome] || 0) + 1;
    result.byDistrict[district] = (result.byDistrict[district] || 0) + 1;
    result.byTambon[tambon] = (result.byTambon[tambon] || 0) + 1;
    result.byVillage[village] = (result.byVillage[village] || 0) + 1;
    result.byPlantType[plant] = (result.byPlantType[plant] || 0) + 1;
  });
  return result;
}

function qa_(actor) {
  requireAdmin_(actor);
  const base = rowsAsObjects_(APP.SHEETS.BASE).filter(function(r){return actorCanAccessHs_(actor,r);});
  const scopeIds={};base.forEach(function(r){scopeIds[r.hs_id]=true;});
  const verifications = rowsAsObjects_(APP.SHEETS.VERIFICATION).filter(function(r){return scopeIds[r.hs_id];});
  const photos = rowsAsObjects_(APP.SHEETS.PHOTOS).filter(function(r){return scopeIds[r.hs_id];});
  const ids = {};
  const verificationIds = {};
  const qa = {baseRows: base.length, duplicateHsIds: [], invalidCoordinates: [], orphanVerifications: [], orphanPhotos: [], byPlantType: {}};
  base.forEach(function (row) {
    const id = cleanText_(row.hs_id);
    if (ids[id]) qa.duplicateHsIds.push(id); else ids[id] = true;
    if (!cleanText_(row.latitude) || !cleanText_(row.longitude) || !Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude)) || Math.abs(Number(row.latitude)) > 90 || Math.abs(Number(row.longitude)) > 180) qa.invalidCoordinates.push(id);
    const plant = cleanText_(row.plant_type);
    qa.byPlantType[plant] = (qa.byPlantType[plant] || 0) + 1;
  });
  verifications.forEach(function (row) {
    verificationIds[cleanText_(row.verification_id)] = true;
    if (!ids[cleanText_(row.hs_id)]) qa.orphanVerifications.push(cleanText_(row.verification_id));
  });
  photos.forEach(function (row) {
    if (!ids[cleanText_(row.hs_id)] || !verificationIds[cleanText_(row.verification_id)]) qa.orphanPhotos.push(cleanText_(row.photo_id));
  });
  qa.ok = !qa.duplicateHsIds.length && !qa.invalidCoordinates.length && !qa.orphanVerifications.length && !qa.orphanPhotos.length;
  return qa;
}

function readLog_(actor, payload) {
  requireAdmin_(actor);
  payload = payload || {};
  const page = Math.max(1, Math.floor(Number(payload.page) || 1));
  const pageSize = Math.min(APP.MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(payload.pageSize) || 100)));
  let rows = rowsAsObjects_(APP.SHEETS.LOG).reverse();
  if(typeof nationalReadActor_==='function'&&actor.role!=='super_admin')rows=rows.filter(function(r){return r.actor_id===actor.id;});
  if (payload.action) rows = rows.filter(function (row) { return cleanText_(row.action) === cleanText_(payload.action); });
  if (payload.actorId) rows = rows.filter(function (row) { return cleanText_(row.actor_id) === cleanText_(payload.actorId); });
  const offset = (page - 1) * pageSize;
  return {
    items: rows.slice(offset, offset + pageSize).map(function (row) {
      let details = {};
      try { details = JSON.parse(cleanText_(row.details_json) || '{}'); } catch (ignored) {}
      return {logId: cleanText_(row.log_id), requestId: cleanText_(row.request_id), timestamp: cleanText_(row.timestamp), actorId: cleanText_(row.actor_id), action: cleanText_(row.action), entityType: cleanText_(row.entity_type), entityId: cleanText_(row.entity_id), status: cleanText_(row.status), details: details};
    }),
    page: page,
    pageSize: pageSize,
    total: rows.length,
    totalPages: Math.ceil(rows.length / pageSize)
  };
}

function exportCsv_(actor, payload) {
  requireAdmin_(actor);
  payload = payload || {};
  const dataset = cleanText_(payload.dataset) || 'verifications';
  const mapping = {
    hotspots: APP.SHEETS.BASE,
    verifications: APP.SHEETS.VERIFICATION,
    photos: APP.SHEETS.PHOTOS,
    log: APP.SHEETS.LOG
  };
  const sheetName = mapping[dataset];
  assert_(sheetName, 'VALIDATION_ERROR', 'dataset ต้องเป็น hotspots, verifications, photos หรือ log');
  const headers = APP.HEADERS[sheetName].slice();
  let rows = rowsAsObjects_(sheetName);
  if(typeof nationalReadActor_==='function'){const latest=latestVerificationMap_(),scoped=applyHsFilters_(rowsAsObjects_(APP.SHEETS.BASE),payload.filters,actor,latest),ids={};scoped.forEach(function(r){ids[r.hs_id]=true;});rows=dataset==='log'?rows.filter(function(r){return actor.role==='super_admin'||r.actor_id===actor.id;}):rows.filter(function(r){return !!ids[r.hs_id];});}
  const escapeCsv = function (value) {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const lines = [headers.map(escapeCsv).join(',')];
  rows.forEach(function (row) { lines.push(headers.map(function (header) { return escapeCsv(row[header]); }).join(',')); });
  const csv = '\uFEFF' + lines.join('\r\n');
  const date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
  return {
    fileName: 'hs-verification-' + dataset + '-' + date + '.csv',
    mimeType: 'text/csv;charset=utf-8',
    base64: Utilities.base64Encode(Utilities.newBlob(csv, 'text/csv').getBytes()),
    rowCount: rows.length
  };
}

function getConfig_(actor) {
  const data = {
    national:typeof HSNational!=='undefined',
    authorizedProvinceCodes:typeof nationalAuthorized_==='function'?nationalAuthorized_(actor):[],
    version: APP.VERSION,
    province:typeof HSNational!=='undefined'?(actor.role==='admin'?(HSNational.provinces[actor.assignedProvinceCode]||'ยังไม่กำหนดจังหวัด'):'ประเทศไทย'):APP.PROVINCE,
    landType: APP.LAND_TYPE,
    plantTypes: APP.PLANT_TYPES.slice(),
    statuses: ['pending'].concat(APP.STATUSES),
    results: APP.RESULTS.slice(),
    personCategories: APP.PERSON_CATEGORIES.slice(),
    limits: {maxImportRows: APP.MAX_IMPORT_ROWS, maxPageSize: APP.MAX_PAGE_SIZE, maxPhotoBytes: APP.MAX_PHOTO_BYTES, photoMimeTypes: APP.PHOTO_MIME_TYPES.slice()},
    profile: {agencyLevel:actor.agencyLevel||'',phone:actor.phone||'',authMethod:actor.authMethod||'',assignedProvinceCode:actor.assignedProvinceCode||'',inspectorId: actor.id, displayName: actor.displayName, district: actor.district, tambon: actor.tambon, role: actor.role, personCategory: actor.personCategory || '', personCategoryOther: actor.personCategoryOther || '', position: actor.position || '', agency: actor.agency || ''}
  };
  if (['admin', 'super_admin'].indexOf(actor.role) >= 0 && (typeof nationalReadActor_!=='function'||actor.role==='super_admin')) {
    const properties = PropertiesService.getScriptProperties();
    data.admin = {
      sourceSpreadsheetId: cleanText_(properties.getProperty('SOURCE_SPREADSHEET_ID')),
      sourceSheet: cleanText_(properties.getProperty('SOURCE_SHEET')) || APP.DEFAULT_SOURCE_SHEET,
      photoFolderId: cleanText_(properties.getProperty('PHOTO_FOLDER_ID')),
      photoFolderConfigured: Boolean(properties.getProperty('PHOTO_FOLDER_ID'))
    };
  }
  return data;
}

function setConfig_(actor, requestId, payload) {
  requireSuperAdmin_(actor);
  payload = payload || {};
  return withScriptLock_(function () {
    const properties = PropertiesService.getScriptProperties();
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'sourceSpreadsheetId') || Object.prototype.hasOwnProperty.call(payload, 'sourceSpreadsheetUrl')) {
      const id = parseSpreadsheetId_(payload.sourceSpreadsheetUrl || payload.sourceSpreadsheetId);
      if (id) SpreadsheetApp.openById(id);
      updates.SOURCE_SPREADSHEET_ID = id;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'sourceSheet')) {
      const name = cleanText_(payload.sourceSheet, 100) || APP.DEFAULT_SOURCE_SHEET;
      const sourceId = Object.prototype.hasOwnProperty.call(updates, 'SOURCE_SPREADSHEET_ID') ? updates.SOURCE_SPREADSHEET_ID : properties.getProperty('SOURCE_SPREADSHEET_ID');
      const spreadsheet = sourceId ? SpreadsheetApp.openById(sourceId) : getSpreadsheet_();
      assert_(spreadsheet.getSheetByName(name), 'SOURCE_NOT_FOUND', 'ไม่พบชีตต้นทาง ' + name);
      updates.SOURCE_SHEET = name;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'photoFolderId')) {
      const folderId = cleanText_(payload.photoFolderId, 200);
      if (folderId) DriveApp.getFolderById(folderId);
      updates.PHOTO_FOLDER_ID = folderId;
    }
    Object.keys(updates).forEach(function (key) {
      if (updates[key]) properties.setProperty(key, updates[key]); else properties.deleteProperty(key);
    });
    const config = getConfig_(actor);
    appendLog_(actor, requestId, 'setConfig', 'config', 'script-properties', 'success', {changedKeys: Object.keys(payload), config: config.admin});
    return config;
  });
}

function parseStoredJson_(value) { try{return JSON.parse(cleanText_(value)||'{}');}catch(ignored){return {};} }
