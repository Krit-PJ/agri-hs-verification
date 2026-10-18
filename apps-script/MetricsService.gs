/* Aggregate operational counts only. Cache deduplication is best effort, never an identity log. */
const USAGE_COUNTERS_PROPERTY_ = 'USAGE_COUNTERS_V1';
function metricsDay_(){return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10);}
function readCountersState_(){
  const raw=PropertiesService.getScriptProperties().getProperty(USAGE_COUNTERS_PROPERTY_);
  if(!raw)return {totalVisits:0,totalUserDays:0,daily:{}};
  const state=JSON.parse(raw);
  assert_(state&&typeof state.daily==='object'&&!Array.isArray(state.daily),'CONFIG_ERROR','ข้อมูลสถิติไม่ถูกต้อง');
  return state;
}
function countersView_(state){
  const day=metricsDay_(),today=state.daily[day]||{visits:0,users:0};
  return {timeZone:'Asia/Bangkok',totalVisits:state.totalVisits,totalUserDays:state.totalUserDays,today:{date:day,visits:today.visits,users:today.users},daily:Object.keys(state.daily).sort().map(function(date){return {date:date,visits:state.daily[date].visits,users:state.daily[date].users};}),deduplication:'best_effort'};
}
function getCounters_(){return countersView_(readCountersState_());}
function recordVisit_(payload){
  const visitId=requireUuid_(payload&&payload.visitId,'visitId').toLowerCase();
  return recordCounter_('visits','visit:'+sha256_(visitId));
}
function recordUsage_(actor){
  assert_(actor&&actor.id&&['inspector','admin','super_admin'].indexOf(actor.role)>=0,'UNAUTHORIZED','กรุณาเข้าสู่ระบบ');
  // A secret pepper prevents guessing phone-based account identifiers from cache keys.
  ensureAuthSecrets_();
  return recordCounter_('users','user:'+tokenHash_(String(actor.username||actor.id)));
}
function recordCounter_(kind,identityKey){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return Object.assign(getCounters_(),{counted:false});
  try{
    const state=readCountersState_(),cache=sessionCache_(),day=metricsDay_();
    // Bound anonymous UUID churn to 120 cache writes / minute and 10,000 / day.
    const minuteKey='metrics-rate:'+Math.floor(Date.now()/60000),minuteCount=Number(cache.get(minuteKey)||0);
    const dayKey='metrics-budget:'+day,dayCount=Number(cache.get(dayKey)||0);
    if(minuteCount>=120||dayCount>=10000)return Object.assign(countersView_(state),{counted:false});
    const dedupeKey='metrics:'+day+':'+identityKey;
    if(cache.get(dedupeKey))return Object.assign(countersView_(state),{counted:false});
    const bucket=state.daily[day]||(state.daily[day]={visits:0,users:0});
    bucket[kind]++;
    if(kind==='visits')state.totalVisits++;else state.totalUserDays++;
    Object.keys(state.daily).sort().slice(0,-30).forEach(function(date){delete state.daily[date];});
    PropertiesService.getScriptProperties().setProperty(USAGE_COUNTERS_PROPERTY_,JSON.stringify(state));
    // Apps Script cache maximum is six hours; eviction may cause approximate overcounting.
    cache.put(dedupeKey,'1',21600);
    cache.put(minuteKey,String(minuteCount+1),120);
    cache.put(dayKey,String(dayCount+1),21600);
    return Object.assign(countersView_(state),{counted:true});
  }finally{lock.releaseLock();}
}
