/* Public team directory with server-authorized edits. No credentials or private profile fields. */
function getTeam_(){
  const raw=PropertiesService.getScriptProperties().getProperty('PUBLIC_TEAM_V1');
  if(raw){const value=JSON.parse(raw);assert_(Array.isArray(value.members),'CONFIG_ERROR','ข้อมูลทีมไม่ถูกต้อง');return value;}
  return {revision:0,members:[{id:'developer-kitti',name:'ดร. กิตติ  โพธิ์จวง',position:'ผู้พัฒนาระบบ',agency:'กลุ่มอารักขาพืช สำนักงานเกษตรจังหวัดกำแพงเพชร'}]};
}
function saveTeam_(actor,payload){
  requireSuperAdmin_(actor);
  const member=payload.member||{};
  const entry={id:cleanText_(member.id,80),name:cleanText_(member.name,150),position:cleanText_(member.position,200),agency:cleanText_(member.agency,250)};
  assert_(entry.id && entry.name && entry.position && entry.agency,'VALIDATION_ERROR','กรุณากรอกชื่อ ตำแหน่ง และสังกัดให้ครบ');
  const lock=LockService.getScriptLock();assert_(lock.tryLock(10000),'CONFLICT','มีผู้แก้ไขข้อมูลอยู่ กรุณาลองใหม่');
  try{
    const directory=getTeam_();assert_(Number(payload.revision)===directory.revision,'CONFLICT','ข้อมูลทีมมีการเปลี่ยนแปลง กรุณาเปิดหน้าทีมใหม่แล้วบันทึกอีกครั้ง');
    const index=directory.members.findIndex(function(item){return item.id===entry.id;});
    if(index<0){assert_(directory.members.length<20,'VALIDATION_ERROR','รองรับบุคลากรไม่เกิน20รายการ');directory.members.push(entry);}else directory.members[index]=entry;
    directory.revision+=1;
    const json=JSON.stringify(directory);assert_(Utilities.newBlob(json).getBytes().length<8500,'VALIDATION_ERROR','ข้อมูลทีมมีขนาดใหญ่เกินพื้นที่จัดเก็บ');
    PropertiesService.getScriptProperties().setProperty('PUBLIC_TEAM_V1',json);return directory;
  }finally{lock.releaseLock();}
}
