function touchHsRevision_(){PropertiesService.getScriptProperties().setProperty('HS_DATA_REVISION',uuid_());}
function getDatasetInfo_(actor){
 const codes=actor.role==='public'?nationalPublicCodes_():nationalAuthorized_(actor);
 const dataset=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')||getSpreadsheet_().getId();
 const scope={dataset:sha256_(dataset),agencyLevel:actor.agencyLevel||'',tambon:actor.tambon||'',role:actor.role,id:actor.role==='public'?'public':actor.id,provinceCodes:codes,district:actor.role==='inspector'?actor.district||'':''};
 const props=PropertiesService.getScriptProperties();
 const revision=[APP.VERSION,props.getProperty('HS_DATA_REVISION')||'legacy',getRequiredSheet_(APP.SHEETS.BASE).getLastRow(),getRequiredSheet_(APP.SHEETS.VERIFICATION).getLastRow(),getRequiredSheet_(APP.SHEETS.PHOTOS).getLastRow()].join(':');
 return {scopeKey:sha256_(JSON.stringify(scope)),revision:revision,config:getConfig_(actor),maxAgeSeconds:600};
}
