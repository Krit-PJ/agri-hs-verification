function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  assert_(spreadsheet, 'CONFIG_ERROR', 'ไม่พบ Spreadsheet กรุณาตั้งค่า SPREADSHEET_ID');
  return spreadsheet;
}

function getRequiredSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  assert_(sheet, 'CONFIG_ERROR', 'ไม่พบชีต ' + name);
  return sheet;
}

function ensureSchema_() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(APP.HEADERS).forEach(function (name) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = APP.HEADERS[name];
    ensureSheetColumns_(sheet, headers.length);
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const actual = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getDisplayValues()[0].slice(0, headers.length);
    assert_(actual.join('|') === headers.join('|'), 'SCHEMA_MISMATCH', 'หัวคอลัมน์ชีต ' + name + ' ไม่ตรงกับ schema');
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
}

function rowsAsObjects_(sheetName) {
  const sheet = getRequiredSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const headers = APP.HEADERS[sheetName];
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row, offset) {
    const object = {_row: offset + 2};
    headers.forEach(function (header, index) {
      const value = row[index];
      object[header] = value instanceof Date ? value.toISOString() : value;
    });
    return object;
  });
}

function objectToRow_(sheetName, object) {
  return APP.HEADERS[sheetName].map(function (header) {
    const value = object[header];
    return typeof value === 'string' ? safeCell_(value) : (value == null ? '' : value);
  });
}

function appendObject_(sheetName, object) {
  const sheet = getRequiredSheet_(sheetName);
  const row = objectToRow_(sheetName, object);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return object;
}

function updateObjectRow_(sheetName, rowNumber, object) {
  const sheet = getRequiredSheet_(sheetName);
  const row = objectToRow_(sheetName, object);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  return object;
}

function findOne_(sheetName, field, value) {
  const rows = rowsAsObjects_(sheetName);
  for (let i = 0; i < rows.length; i += 1) if (String(rows[i][field]) === String(value)) return rows[i];
  return null;
}

function appendLog_(actor, requestId, action, entityType, entityId, status, details) {
  try {
    appendObject_(APP.SHEETS.LOG, {
      log_id: uuid_(),
      request_id: cleanText_(requestId, 64),
      timestamp: isoNow_(),
      actor_id: actor && actor.id ? actor.id : 'anonymous',
      action: cleanText_(action, 64),
      entity_type: cleanText_(entityType, 64),
      entity_id: cleanText_(entityId, 128),
      status: cleanText_(status, 32),
      details_json: safeCell_(jsonStringifySafe_(details || {}))
    });
  } catch (logError) {
    console.error('Audit log failure: ' + (logError && logError.message ? logError.message : logError));
  }
}

function replaceBaseAtomically_(objects) {
  const spreadsheet = getSpreadsheet_();
  const targetName = APP.SHEETS.BASE;
  const oldSheet = spreadsheet.getSheetByName(targetName);
  const stamp = new Date().getTime();
  const stageName = '_HS_Base_stage_' + stamp;
  const backupName = '_HS_Base_backup_' + stamp;
  const stage = spreadsheet.insertSheet(stageName);
  const headers = APP.HEADERS[targetName];
  try {
    stage.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (objects.length) {
      const values = objects.map(function (object) { return objectToRow_(targetName, object); });
      stage.getRange(2, 1, values.length, headers.length).setValues(values);
    }
    stage.setFrozenRows(1);
    stage.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    assert_(stage.getLastRow() === objects.length + 1, 'WRITE_FAILED', 'จำนวนแถว staging ไม่ถูกต้อง');
    if (oldSheet) oldSheet.setName(backupName);
    stage.setName(targetName);
    if (oldSheet) spreadsheet.deleteSheet(oldSheet);
  } catch (error) {
    const currentStage = spreadsheet.getSheetByName(stageName);
    if (currentStage) spreadsheet.deleteSheet(currentStage);
    const backup = spreadsheet.getSheetByName(backupName);
    if (backup && !spreadsheet.getSheetByName(targetName)) backup.setName(targetName);
    throw error;
  }
}

function publicInspector_(row) {
  return {
    inspectorId: cleanText_(row.inspector_id),
    displayName: cleanText_(row.display_name),
    district: cleanText_(row.district),
    tambon: cleanText_(row.tambon),
    role: cleanText_(row.role),
    personCategory: cleanText_(row.person_category), personCategoryOther: cleanText_(row.person_category_other),
    position: cleanText_(row.position), agency: cleanText_(row.agency)
  };
}

function publicHs_(row, latestVerification) {
  return {
    provinceCode:typeof nationalCode_==='function'?nationalCode_(row):'',
    hsId: cleanText_(row.hs_id),
    acquiredAt: cleanText_(row.acquired_at),
    datasetYearBe: Number(row.dataset_year_be) || Number(Utilities.formatDate(new Date(row.acquired_at), 'Asia/Bangkok', 'yyyy')) + 543,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    province: cleanText_(row.province),
    district: cleanText_(row.district),
    tambon: cleanText_(row.tambon),
    village: cleanText_(row.village),
    landType: cleanText_(row.land_type),
    plantType: cleanText_(row.plant_type),
    active: String(row.active).toLowerCase() !== 'false',
    verification: latestVerification ? publicVerification_(latestVerification) : null
  };
}

function publicVerification_(row) {
  return {
    verificationId: cleanText_(row.verification_id),
    hsId: cleanText_(row.hs_id),
    status: cleanText_(row.status),
    result: cleanText_(row.result),
    notes: cleanText_(row.notes),
    action: cleanText_(row.action),
    observedLatitude: row.observed_latitude === '' ? null : Number(row.observed_latitude),
    observedLongitude: row.observed_longitude === '' ? null : Number(row.observed_longitude),
    gpsAccuracyM: row.gps_accuracy_m === '' ? null : Number(row.gps_accuracy_m),
    missingGpsReason: cleanText_(row.missing_gps_reason),
    distanceM: row.distance_m === '' ? null : Number(row.distance_m),
    inspectorId: cleanText_(row.inspector_id),
    inspectorName: cleanText_(row.inspector_name),
    verifiedAt: cleanText_(row.verified_at),
    updatedAt: cleanText_(row.updated_at),
    personCategory: cleanText_(row.person_category), personCategoryOther: cleanText_(row.person_category_other),
    fieldInspectorName: cleanText_(row.field_inspector_name) || cleanText_(row.inspector_name),
    reportedById: cleanText_(row.reported_by_id) || cleanText_(row.inspector_id),
    reportedByName: cleanText_(row.reported_by_name) || cleanText_(row.inspector_name), agency: cleanText_(row.agency),
    inspectedAt: cleanText_(row.inspected_at), inspectedAtSource: cleanText_(row.inspected_at_source),
    submittedAt: cleanText_(row.submitted_at) || cleanText_(row.verified_at),
    observedLandMatchesSource: row.observed_land_matches_source === true || row.observed_land_matches_source === 'true' ? true : row.observed_land_matches_source === false || row.observed_land_matches_source === 'false' ? false : null,
    observedLandType: cleanText_(row.observed_land_type), observedPlantType: cleanText_(row.observed_plant_type),
    fireState: cleanText_(row.fire_state), evidenceRequired: row.evidence_required === true || row.evidence_required === 'true',
    photoMissingReason: cleanText_(row.photo_missing_reason),
    evidenceState: verificationEvidenceState_(row),
    followUpRequired: ['not_found', 'needs_review'].indexOf(cleanText_(row.result)) >= 0

  };
}

// Run once from the Apps Script editor before deploying v1.1. Keeps every existing row.
function migrateSchemaV11() {
  const sheet = getRequiredSheet_(APP.SHEETS.BASE);
  const headers = APP.HEADERS.HS_Base;
  const actual = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  if (actual.join('|') === headers.join('|')) return {migrated:false};
  assert_(actual.join('|') === headers.slice(0,-1).join('|'), 'SCHEMA_MISMATCH', 'รองรับการย้ายจาก schema v1.0 เท่านั้น');
  sheet.getRange(1,headers.length).setValue('dataset_year_be');
  const count = sheet.getLastRow()-1;
  if (count > 0) {
    const rows = sheet.getRange(2,1,count,headers.length-1).getValues();
    sheet.getRange(2,headers.length,count,1).setValues(rows.map(function(row){return [sourceDatasetYear_(row[10],row[1])];}));
  }
  ensureSchema_();
  return {migrated:true,rows:Math.max(0,count)};
}

// Additive migration only; validates every existing header before any mutation.
function migrateSchemaV12() {
  return withScriptLock_(function () {
    const spreadsheet = getSpreadsheet_();
    const plans = Object.keys(APP.HEADERS).map(function (name) {
      const sheet = spreadsheet.getSheetByName(name);
      if (!sheet || !sheet.getLastRow()) return {name:name, sheet:sheet, existing:0};
      const actual = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
      const expected = APP.HEADERS[name];
      assert_(actual.length <= expected.length && actual.every(function(h,i){return h===expected[i];}), 'SCHEMA_MISMATCH', 'หัวคอลัมน์ '+name+' ไม่ตรง ไม่แก้ข้อมูลเดิม');
      return {name:name,sheet:sheet,existing:actual.length};
    });
    plans.forEach(function(p){
      const headers=APP.HEADERS[p.name];
      const sheet=p.sheet || spreadsheet.insertSheet(p.name);
      ensureSheetColumns_(sheet,headers.length);
      if(p.existing < headers.length) sheet.getRange(1,p.existing+1,1,headers.length-p.existing).setValues([headers.slice(p.existing)]);
    });
    ensureSchema_();
    return {migrated:plans.some(function(p){return p.existing<APP.HEADERS[p.name].length;}),version:APP.VERSION};
  });
}

function verificationEvidenceState_(row) {
  if (row._evidenceState) return row._evidenceState;
  if (!(row.evidence_required === true || row.evidence_required === 'true')) return 'not_required';
  if (rowsAsObjects_(APP.SHEETS.PHOTOS).some(function(p){return cleanText_(p.verification_id)===cleanText_(row.verification_id);})) return 'provided';
  return cleanText_(row.photo_missing_reason) ? 'exception' : 'pending';
}

function ensureSheetColumns_(sheet,required) {
  if(typeof sheet.getMaxColumns==='function' && sheet.getMaxColumns()<required) sheet.insertColumnsAfter(sheet.getMaxColumns(),required-sheet.getMaxColumns());
}
