/* Field evidence and person categories; authorization remains server controlled. */
var HSField = (() => {
  'use strict';
  const categories=['นักวิชาการส่งเสริมการเกษตร','กำนัน','ผู้ใหญ่บ้าน','ผู้ช่วยผู้ใหญ่บ้าน','อกม.','อื่นๆ'];
  const el=id=>document.getElementById(id);
  let openedAt;
  function update(){el('personOtherWrap').hidden=el('personCategory').value!=='อื่นๆ';el('observedFields').hidden=el('observedMatches').value!=='no';el('fireStateWrap').hidden=document.querySelector('[name=outcome]:checked')?.value!=='burned';}
  function init(){categories.forEach(name=>el('personCategory').add(new Option(name,name)));['personCategory','observedMatches'].forEach(id=>el(id).addEventListener('change',update));document.querySelectorAll('[name=outcome]').forEach(x=>x.addEventListener('change',update));}
  function reset(item,profile){openedAt=new Date().toISOString();el('personCategory').value=profile?.personCategory||profile?.category||localStorage.getItem('hsverify.personCategory')||'';el('personCategoryOther').value=profile?.personCategoryOther||profile?.categoryOther||'';el('fieldInspectorName').value='';el('inspectedAt').value='';update();}
  function payload(){const category=el('personCategory').value;localStorage.setItem('hsverify.personCategory',category);return {personCategory:category,personCategoryOther:el('personCategoryOther').value.trim(),fieldInspectorName:el('fieldInspectorName').value.trim(),inspectedAt:el('inspectedAt').value?new Date(el('inspectedAt').value).toISOString():openedAt,inspectedAtSource:el('inspectedAt').value?'user_confirmed':'client_device',observedLandMatchesSource:el('observedMatches').value==='yes'?true:el('observedMatches').value==='no'?false:null,observedLandType:el('observedMatches').value==='no'?el('observedLandType').value:'',observedPlantType:el('observedMatches').value==='no'?el('observedPlantType').value.trim():'',fireState:el('fireState').value,evidenceRequired:true,photoMissingReason:el('photoMissingReason').value};}
  function validate(photos){if(!el('personCategory').value)return 'กรุณาเลือกประเภทผู้ลงพื้นที่';if(el('personCategory').value==='อื่นๆ'&&!el('personCategoryOther').value.trim())return 'กรุณาระบุประเภทบุคคลอื่น';if(!photos.length&&!el('photoMissingReason').value)return 'กรุณาแนบภาพหลักฐาน หรือเลือกเหตุผลที่ไม่มีภาพ';if(el('inspectedAt').value&&!Number.isFinite(new Date(el('inspectedAt').value).getTime()))return 'วันเวลาตรวจไม่ถูกต้อง';return '';}
  async function preparePhoto(file,hs,requestId){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('รองรับภาพ JPEG, PNG และ WebP เท่านั้น');
    if(file.size>5*1024*1024)throw Error('ภาพต้นฉบับเกิน 5 MB กรุณาเลือกไฟล์อื่น ระบบไม่ย่อภาพเพื่อรักษาหลักฐาน');
    const bytes=new Uint8Array(await file.arrayBuffer());const metadata=HSEvidence.inspectBytes(bytes);const qa=HSEvidence.assess({hs,metadata});
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('อ่านภาพไม่ได้'));r.readAsDataURL(file);});
    return {fileName:file.name,mimeType:file.type,base64:data.split(',')[1],preview:data,requestId,source:'import',capturedAt:metadata.timeZoneKnown?metadata.capturedAt:null,attachedAt:new Date().toISOString(),metadata,qa};
  }
  function describePhoto(photo){const m=photo.metadata;if(!m)return '';const gps=m.latitude!=null&&m.longitude!=null?`${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}`:'ไม่มีพิกัดในภาพ';const distance=Number.isFinite(photo.qa?.distanceM)?` · ห่าง HS ${Math.round(photo.qa.distanceM).toLocaleString('th-TH')} ม.`:'';const safe=value=>String(value).replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));const reasons=(photo.qa?.reasons||[]).map(safe).join(' · ');return `<div class="photo-meta"><strong>${gps}${distance}</strong><small>${m.capturedAt?safe(m.capturedAt):'ไม่มีเวลาถ่ายที่ตรวจสอบได้'} · ${m.timeZoneKnown?'ทราบเขตเวลา':'ไม่ทราบเขตเวลา'}</small><small>${reasons}</small></div>`;}
  return {init,reset,payload,validate,preparePhoto,describePhoto,categories};
})();
