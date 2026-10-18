function doGet() {
  return outputJson_({ok: false, requestId: '', error: {code: 'METHOD_NOT_ALLOWED', message: 'ใช้ POST พร้อม token เท่านั้น'}});
}

function doPost(event) {
  let requestId = '';
  try {
    const raw = event && event.postData ? String(event.postData.contents || '') : '';
    assert_(raw.length > 0 && raw.length <= APP.MAX_BODY_CHARS, 'INVALID_REQUEST', 'คำขอว่างหรือมีขนาดใหญ่เกินไป');
    const envelope = parseJsonObject_(raw);
    requestId = cleanText_(envelope.requestId, 64);
    const action = cleanText_(envelope.action, 64);
    assert_(action, 'INVALID_REQUEST', 'ต้องระบุ action');
    const payload = envelope.payload == null ? {} : envelope.payload;
    assert_(payload && typeof payload === 'object' && !Array.isArray(payload), 'INVALID_REQUEST', 'payload ต้องเป็น object');
    if (action === 'getCounters') return outputJson_({ok:true,requestId:requestId,data:getCounters_()});
    if (action === 'recordVisit') return outputJson_({ok:true,requestId:requestId,data:recordVisit_(payload)});
    if (action === 'getRegistrationPolicy') return outputJson_({ok:true,requestId:requestId,data:getRegistrationPolicy_()});
    if (action === 'register') return outputJson_({ok:true,requestId:requestId,data:registerUser_(payload)});
    if (action === 'getTeam') return outputJson_({ok:true,requestId:requestId,data:getTeam_()});
    if (action === 'login') {
      return outputJson_({ok: true, requestId: requestId, data: login_(payload)});
    }
    if (action === 'loginPhone') {
      return outputJson_({ok: true, requestId: requestId, data: loginPhone_(payload)});
    }
    if(typeof nationalPublicRead_==='function' && action==='bootstrap' && !envelope.token)return outputJson_({ok:true,requestId:requestId,data:nationalPublicRead_()});
    const actor = authenticate_(envelope.token);
    if(typeof nationalCsrf_==='function')nationalCsrf_(envelope);
    if (action === 'recordUsage') return outputJson_({ok:true,requestId:requestId,data:recordUsage_(actor)});
    if (action === 'logout') {
      return outputJson_({ok: true, requestId: requestId, data: logoutSession_(envelope.token)});
    }
    const data = dispatch_(actor, action, requestId, payload);
    return outputJson_({ok: true, requestId: requestId, data: data});
  } catch (error) {
    return outputJson_({ok: false, requestId: requestId, error: publicError_(error)});
  }
}

function dispatch_(actor, action, requestId, payload) {
  if(typeof nationalGuard_==='function')nationalGuard_(actor,action);
  const mutationActions = ['saveVerification', 'verifyHS', 'uploadPhoto', 'syncSource', 'importSource', 'setConfig', 'importRows'];
  if (mutationActions.indexOf(action) >= 0) requestId = requireUuid_(requestId, 'requestId');
  switch (action) {
    case 'getMyProfile':return {profile:actor};
    case 'listRegistrations':return listRegistrations_(actor,payload);
    case 'approveRegistration':return reviewRegistration_(actor,payload,true);
    case 'rejectRegistration':return reviewRegistration_(actor,payload,false);
    case 'getHSPhotos':return getHsPhotos_(actor,payload);
    case 'nationalPreview':return nationalPreview_(actor,payload);
    case 'nationalReadSource':return nationalReadSource_(actor,payload);
    case 'nationalCommit':return nationalCommit_(actor,requireUuid_(requestId,'requestId'),payload);
    case 'nationalSetSource':return nationalSetSource_(actor,requireUuid_(requestId,'requestId'),payload);
    case 'assignProvince':return assignProvince_(actor,requireUuid_(requestId,'requestId'),payload);
    case 'saveTeam':
      requireUuid_(requestId,'requestId');
      return saveTeam_(actor,payload);
    case 'getConfig':
    case 'status':
      return getConfig_(actor);
    case 'bootstrap':
    case 'read':
      return {
        config: getConfig_(actor),
        filters: {
          districts: locationValues_(actor, {}, 'district'),
          tambons: payload.filters && payload.filters.district ? locationValues_(actor, {district: payload.filters.district}, 'tambon') : [],
          villages: payload.filters && payload.filters.district && payload.filters.tambon ? locationValues_(actor, {district: payload.filters.district, tambon: payload.filters.tambon}, 'village') : []
        },
        summary: summaries_(actor, payload),
        hotspots: allHs_(actor, payload)
      };
    case 'listHS':
      return listHs_(actor, payload);
    case 'getHS':
      return getHs_(actor, payload);
    case 'getDistricts':
      return {items: locationValues_(actor, payload, 'district')};
    case 'getTambons':
      return {items: locationValues_(actor, payload, 'tambon')};
    case 'getVillages':
      return {items: locationValues_(actor, payload, 'village')};
    case 'summaries':
      return summaries_(actor, payload);
    case 'saveVerification':
    case 'verifyHS':
      return saveVerification_(actor, requestId, payload);
    case 'uploadPhoto':
      return uploadPhoto_(actor, requestId, payload);
    case 'getPhoto':
      return getPhoto_(actor, payload);
    case 'qa':
      return qa_(actor);
    case 'log':
      return readLog_(actor, payload);
    case 'export':
      return exportCsv_(actor, payload);
    case 'syncSource':
    case 'importSource':
      return syncSource_(actor, requestId);
    case 'previewImportRows':
      return previewImportRows_(actor, payload);
    case 'importRows':
      return importRows_(actor, requestId, payload);
    case 'setConfig':
      return setConfig_(actor, requestId, payload);
    default:
      throw new ApiError('UNKNOWN_ACTION', 'ไม่รู้จัก action: ' + action);
  }
}
