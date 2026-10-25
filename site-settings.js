var HSSiteSettings=(()=>{
 'use strict';const KEY='hsverify.siteSettings.v1';
 const defaults={risk:{label:'ระบบ Agri-Risk Map Burning',url:'https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/'},hub:{label:'Green Gain Hub',url:'https://krit-pj.github.io/Green_Gain_Hub-KPP/'}};
 function url(value,api=false){const u=new URL(String(value||'').trim());if(u.protocol!=='https:'||u.username||u.password)throw Error('กรุณาใช้ HTTPS URL ที่ไม่มีชื่อผู้ใช้ รหัสผ่าน หรือ #');if(api&&(u.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(u.pathname)||u.search||u.hash))throw Error('API ต้องเป็น URL เว็บแอป Google Apps Script ลงท้าย /exec');return u.href;}
 function read(storage){try{const value=JSON.parse(storage.getItem(KEY)||'{}');if(value.risk&&(value.risk.label==='แผนที่ความเสี่ยง'||String(value.risk.url||'').replace(/\/$/,'')==='https://krit-pj.github.io/agri-risk-map-burning'))value.risk=defaults.risk;return {risk:normalize(value.risk||defaults.risk),hub:normalize(value.hub||defaults.hub)};}catch(_){return JSON.parse(JSON.stringify(defaults));}}
 function normalize(item){const label=String(item.label||'').trim();if(!label||label.length>60)throw Error('ชื่อปุ่มต้องมี 1–60 ตัวอักษร');return{label,url:url(item.url)};}
 function save(storage,value,allowed){if(!allowed)throw Error('เฉพาะ Super Admin เท่านั้น');const clean={risk:normalize(value.risk),hub:normalize(value.hub)};storage.setItem(KEY,JSON.stringify(clean));return clean;}
 async function probe(endpoint,fetcher=fetch){endpoint=url(endpoint,true);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'getRegistrationPolicy',payload:{}}),signal:controller.signal,redirect:'follow'});const body=await response.json();if(!response.ok||body.ok!==true||!body.data?.version||!['phone_only'].includes(body.data.authMethod))throw Error('ปลายทางตอบกลับไม่ตรงกับ HS Verification API');return body.data;}finally{clearTimeout(timer);}}
 return{read,save,url,probe};
})();
if(typeof module==='object')module.exports=HSSiteSettings;
