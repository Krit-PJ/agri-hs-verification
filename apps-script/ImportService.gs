function sourceSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SOURCE_SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : getSpreadsheet_();
}

function sourceIndex_(headers) {
  const index = {};
  Object.keys(SOURCE_ALIASES).forEach(function (key) { index[key] = findHeader_(headers, SOURCE_ALIASES[key]); });
  return index;
}

function isDetailIndex_(index) {
  return index.hsId >= 0 && index.acquiredAt >= 0 && index.province >= 0 && index.district >= 0 &&
    index.tambon >= 0 && index.landType >= 0 && index.plantType >= 0 &&
    ((index.latitude >= 0 && index.longitude >= 0) || index.maps >= 0);
}

function readPivotReference_(sheet) {
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const normalized = row.map(compact_);
    const provinceColumn = normalized.indexOf('จังหวัด');
    if (provinceColumn < 0) continue;
    const plantColumns = {};
    let valid = true;
    APP.PLANT_TYPES.forEach(function (plant) {
      const column = normalized.indexOf(compact_(plant));
      if (column < 0) valid = false;
      plantColumns[plant] = column;
    });
    if (!valid) continue;
    for (let dataIndex = rowIndex + 1; dataIndex < values.length; dataIndex += 1) {
      if (normalizeProvince_(values[dataIndex][provinceColumn]) !== normalizeProvince_(APP.PROVINCE)) continue;
      const byPlantType = {};
      let total = 0;
      APP.PLANT_TYPES.forEach(function (plant) {
        const count = Number(values[dataIndex][plantColumns[plant]] || 0);
        assert_(Number.isFinite(count) && count >= 0 && Math.floor(count) === count, 'SOURCE_INVALID', 'ยอด Pivot ของ ' + plant + ' ไม่ถูกต้อง');
        byPlantType[plant] = count;
        total += count;
      });
      return {sheet: sheet.getName(), byPlantType: byPlantType, total: total};
    }
  }
  return null;
}

function parseDetailSheet_(sheet) {
  const values = sheet.getDataRange().getValues();
  assert_(values.length >= 2, 'SOURCE_INVALID', 'ชีตรายละเอียดไม่มีข้อมูล');
  const headers = values[0].map(function (value) { return cleanText_(value); });
  const index = sourceIndex_(headers);
  assert_(isDetailIndex_(index), 'SOURCE_INVALID', 'ชีตรายละเอียดขาด hsID, วันที่, พื้นที่ หรือพิกัด');
  const importedAt = isoNow_();
  const seen = {};
  const rows = [];
  const qa = {
    inputRows: values.length - 1,
    accepted: 0,
    wrongProvince: 0,
    wrongLandType: 0,
    wrongPlantType: 0,
    duplicateHsId: 0,
    missingDate: 0,
    missingId: 0,
    missingCoordinates: 0,
    byPlantType: {}
  };
  APP.PLANT_TYPES.forEach(function (plant) { qa.byPlantType[plant] = 0; });
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (normalizeProvince_(valueAt_(row, index.province)) !== normalizeProvince_(APP.PROVINCE)) { qa.wrongProvince += 1; continue; }
    if (normalizeLandType_(valueAt_(row, index.landType)) !== normalizeLandType_(APP.LAND_TYPE)) { qa.wrongLandType += 1; continue; }
    const plantType = normalizePlantType_(valueAt_(row, index.plantType));
    if (APP.PLANT_TYPES.indexOf(plantType) < 0) { qa.wrongPlantType += 1; continue; }
    const rawId = cleanText_(valueAt_(row, index.hsId), 128);
    if (!rawId) { qa.missingId += 1; continue; }
    const hsId = rawId;
    if (seen[hsId]) { qa.duplicateHsId += 1; continue; }
    const acquiredAt = toIsoSourceDate_(valueAt_(row, index.acquiredAt), valueAt_(row, index.time));
    if (!acquiredAt) { qa.missingDate += 1; continue; }
    let latitude;
    let longitude;
    if (index.latitude >= 0 && index.longitude >= 0) {
      if (!cleanText_(valueAt_(row, index.latitude)) || !cleanText_(valueAt_(row, index.longitude))) { qa.missingCoordinates += 1; continue; }
      latitude = Number(valueAt_(row, index.latitude));
      longitude = Number(valueAt_(row, index.longitude));
    } else {
      const coordinates = parseMapCoordinates_(valueAt_(row, index.maps));
      latitude = coordinates && coordinates.latitude;
      longitude = coordinates && coordinates.longitude;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { qa.missingCoordinates += 1; continue; }
    seen[hsId] = true;
    const snapshot = {
      hsId: hsId,
      acquiredAt: acquiredAt,
      latitude: latitude,
      longitude: longitude,
      province: APP.PROVINCE,
      district: cleanText_(valueAt_(row, index.district), 120),
      tambon: cleanText_(valueAt_(row, index.tambon), 120),
      village: cleanText_(valueAt_(row, index.village), 120),
      landType: APP.LAND_TYPE,
      plantType: plantType,
      sourceSheet: sheet.getName(),
      sourceRow: rowIndex + 1
    };
    rows.push({
      hs_id: hsId,
      acquired_at: acquiredAt,
      latitude: latitude,
      longitude: longitude,
      province: APP.PROVINCE,
      district: snapshot.district,
      tambon: snapshot.tambon,
      village: snapshot.village,
      land_type: APP.LAND_TYPE,
      plant_type: plantType,
      source_sheet: sheet.getName(),
      source_row: rowIndex + 1,
      source_snapshot_json: jsonStringifySafe_(snapshot),
      imported_at: importedAt,
      active: true,
      dataset_year_be: sourceDatasetYear_(sheet.getName(), acquiredAt)
    });
    qa.accepted += 1;
    qa.byPlantType[plantType] += 1;
  }
  assert_(rows.length > 0, 'SOURCE_EMPTY', 'ไม่พบรายการที่ผ่านเงื่อนไขนำเข้า');
  return {rows: rows, qa: qa};
}

function resolveSource_() {
  const spreadsheet = sourceSpreadsheet_();
  const configuredName = cleanText_(PropertiesService.getScriptProperties().getProperty('SOURCE_SHEET')) || APP.DEFAULT_SOURCE_SHEET;
  const configured = spreadsheet.getSheetByName(configuredName);
  assert_(configured, 'SOURCE_NOT_FOUND', 'ไม่พบชีตต้นทาง ' + configuredName);
  const configuredValues = configured.getDataRange().getValues();
  const configuredIndex = configuredValues.length ? sourceIndex_(configuredValues[0].map(function (value) { return cleanText_(value); })) : {};
  const configuredIsDetail = isDetailIndex_(configuredIndex);
  let detail = configured;
  let fallbackUsed = false;
  if (!configuredIsDetail) {
    detail = spreadsheet.getSheetByName(APP.DETAIL_FALLBACK_SHEET);
    assert_(detail, 'SOURCE_INVALID', configuredName + ' ไม่ใช่ข้อมูลรายจุดและไม่พบชีต ' + APP.DETAIL_FALLBACK_SHEET);
    const detailValues = detail.getDataRange().getValues();
    assert_(detailValues.length && isDetailIndex_(sourceIndex_(detailValues[0].map(function (value) { return cleanText_(value); }))), 'SOURCE_INVALID', APP.DETAIL_FALLBACK_SHEET + ' ขาดข้อมูลรายจุดที่จำเป็น');
    fallbackUsed = true;
  }
  const pivotSheet = spreadsheet.getSheetByName(APP.PIVOT_REFERENCE_SHEET);
  const reference = readPivotReference_(pivotSheet);
  return {
    configuredSheet: configuredName,
    detailSheet: detail,
    detailSheetName: detail.getName(),
    fallbackUsed: fallbackUsed,
    reference: reference
  };
}

function reconcileSource_(parsed, resolved) {
  const reference = resolved.reference;
  if (!reference) {
    assert_(!resolved.fallbackUsed, 'RECONCILIATION_UNAVAILABLE', 'ชีตสรุปไม่มีรูปแบบยอดที่อ่านได้ ต้องตรวจ Pivot ก่อนนำเข้า หรือกำหนดชีตรายจุดโดยตรง');
    return {available: false, match: null, note: 'ไม่พบ Pivot ที่อ่านยอดได้; นำเข้าจาก detail โดยไม่มีการเทียบยอด'};
  }
  const mismatches = [];
  APP.PLANT_TYPES.forEach(function (plant) {
    if (parsed.qa.byPlantType[plant] !== reference.byPlantType[plant]) {
      mismatches.push({plantType: plant, detail: parsed.qa.byPlantType[plant], pivot: reference.byPlantType[plant]});
    }
  });
  const match = parsed.qa.accepted === reference.total && mismatches.length === 0;
  assert_(match, 'RECONCILIATION_FAILED', 'ยอดข้อมูลรายจุดไม่ตรงกับ ' + reference.sheet, {
    detailTotal: parsed.qa.accepted,
    pivotTotal: reference.total,
    mismatches: mismatches
  });
  return {available: true, match: true, sheet: reference.sheet, total: reference.total, byPlantType: reference.byPlantType};
}

function syncSource_(actor, requestId) {
  requireSuperAdmin_(actor);
  return withScriptLock_(function () {
    const prior = findOne_(APP.SHEETS.LOG, 'request_id', requestId);
    if (prior && prior.action === 'syncSource' && prior.status === 'success') {
      return {idempotent: true, imported: Number(JSON.parse(cleanText_(prior.details_json) || '{}').imported || 0)};
    }
    try {
      const resolved = resolveSource_();
      const parsed = parseDetailSheet_(resolved.detailSheet);
      parsed.rows.forEach(function(row){ row.dataset_year_be = sourceDatasetYear_(resolved.configuredSheet, row.acquired_at); });
      assert_(parsed.rows.length <= APP.MAX_IMPORT_ROWS, 'SOURCE_TOO_LARGE', 'รองรับข้อมูลไม่เกิน 5000 จุด');
      assert_(!(parsed.qa.duplicateHsId + parsed.qa.missingDate + parsed.qa.missingId + parsed.qa.missingCoordinates), 'IMPORT_QA_FAILED', 'ต้นทางมีรายการผิดพลาด ต้องแก้ก่อนแทนที่ฐาน', parsed.qa);
      assert_(parsed.rows.every(function(row){return row.district && row.tambon;}), 'IMPORT_QA_FAILED', 'ต้นทางขาดอำเภอหรือตำบล');
      const reconciliation = reconcileSource_(parsed, resolved);
      replaceBaseAtomically_(parsed.rows);
      const result = {
        imported: parsed.rows.length,
        configuredSheet: resolved.configuredSheet,
        detailSheet: resolved.detailSheetName,
        fallbackUsed: resolved.fallbackUsed,
        reconciliation: reconciliation,
        qa: parsed.qa
      };
      appendLog_(actor, requestId, 'syncSource', 'sheet', APP.SHEETS.BASE, 'success', result);
      return result;
    } catch (error) {
      appendLog_(actor, requestId, 'syncSource', 'sheet', APP.SHEETS.BASE, 'failure', {code: error.code || 'INTERNAL_ERROR', message: error.message});
      throw error;
    }
  });
}

function parseSpreadsheetId_(value) {
  value = cleanText_(value, 500);
  if (!value) return '';
  const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:[\/?#].*)?$/.exec(value);
  const id = match ? match[1] : value;
  assert_(/^[A-Za-z0-9_-]+$/.test(id), 'VALIDATION_ERROR', 'Google Sheet URL หรือ ID ไม่ถูกต้อง');
  return id;
}

function sourceDatasetYear_(sourceName, acquiredAt) {
  const match = /(?:hsPlant|hsAll)(20\d{2})/i.exec(sourceName || '');
  return match ? Number(match[1]) + 543 : Number(Utilities.formatDate(new Date(acquiredAt), 'Asia/Bangkok', 'yyyy')) + 543;
}

function canonicalImport_(payload) {
  payload = payload || {};
  assert_(Array.isArray(payload.rows) && payload.rows.length > 0 && payload.rows.length <= APP.MAX_IMPORT_ROWS, 'VALIDATION_ERROR', 'ต้องมีข้อมูล 1–5000 แถว');
  const sourceName = cleanText_(payload.sourceName, 100) || 'file-import';
  const year = payload.datasetYearBe == null || payload.datasetYearBe === '' ? null : Number(payload.datasetYearBe);
  assert_(year === null || (Number.isInteger(year) && year >= 2500 && year <= 2700), 'VALIDATION_ERROR', 'datasetYearBe ต้องเป็นปี พ.ศ.');
  // Reuse the source parser so local file imports have identical scope and QA rules.
  const headers = ['hsID','acquired_at','Time','Province','Amphoe','Tambon','Village','LandType','PlantType','latitude','longitude'];
  const values = [headers].concat(payload.rows.map(function (row) {
    assert_(row && typeof row === 'object' && !Array.isArray(row), 'VALIDATION_ERROR', 'แถวข้อมูลต้องเป็น object');
    return [row.hsId,row.acquiredAt,row.time || '',row.province,row.district,row.tambon,row.village,row.landType,row.plantType,row.latitude,row.longitude];
  }));
  const parsed = parseDetailSheet_({getName: function () { return sourceName; }, getDataRange: function () { return {getValues: function () { return values; }}; }});
  parsed.rows.forEach(function (row) { row.dataset_year_be = year || sourceDatasetYear_(sourceName, row.acquired_at); });
  parsed.qa.missingLocation = parsed.rows.filter(function (row) { return !row.district || !row.tambon; }).length;
  const invalid = parsed.qa.duplicateHsId + parsed.qa.missingDate + parsed.qa.missingId + parsed.qa.missingCoordinates + parsed.qa.missingLocation;
  const reconciliation = payload.summary ? reconcileSource_(parsed, {reference: {sheet:sourceName, total:Number(payload.summary.total), byPlantType:payload.summary.byPlantType || {}}, fallbackUsed:false}) : {available:false,match:null,note:'ไม่มี summary สำหรับเทียบยอด'};
  return {rows:parsed.rows, result:{imported:parsed.rows.length, qa:parsed.qa, reconciliation:reconciliation, datasetYearBe:year, sourceName:sourceName, canImport:invalid === 0}};
}

function previewImportRows_(actor, payload) {
  requireSuperAdmin_(actor);
  return canonicalImport_(payload).result;
}

function importRows_(actor, requestId, payload) {
  requireSuperAdmin_(actor);
  assert_(payload && payload.confirmed === true, 'CONFIRMATION_REQUIRED', 'ตรวจ QA แล้วกดยืนยันนำเข้า');
  return withScriptLock_(function () {
    const prior = findOne_(APP.SHEETS.LOG, 'request_id', requestId);
    if (prior) {
      assert_(prior.action === 'importRows' && prior.actor_id === actor.id && prior.status === 'success', 'CONFLICT', 'requestId ถูกใช้แล้ว');
      return Object.assign({idempotent:true}, JSON.parse(cleanText_(prior.details_json)));
    }
    try {
      const parsed = canonicalImport_(payload);
      assert_(parsed.result.canImport, 'IMPORT_QA_FAILED', 'มีแถวผิดพลาดหรือซ้ำ กรุณาแก้ก่อนแทนที่ฐานข้อมูล', parsed.result.qa);
      replaceBaseAtomically_(parsed.rows);
      appendLog_(actor, requestId, 'importRows', 'sheet', APP.SHEETS.BASE, 'success', parsed.result);
      return parsed.result;
    } catch (error) {
      appendLog_(actor, requestId, 'importRows', 'sheet', APP.SHEETS.BASE, 'failure', {code:error.code || 'INTERNAL_ERROR', message:error.message, qa:error.details || null});
      throw error;
    }
  });
}
