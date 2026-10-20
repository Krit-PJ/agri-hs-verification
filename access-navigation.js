var HSAccessNavigation=(()=>{
 'use strict';let menu,toggle,accessButton,authenticated=false;
 function updateAccess(valid){authenticated=Boolean(valid);if(accessButton)accessButton.textContent=authenticated?'ออกจากระบบ':'เข้าใช้งานระบบ';}
 function close(){if(!menu)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
 function init({onInspector,onManager,onLogout}){
  const get=id=>document.getElementById(id);menu=get('adminMenu');toggle=get('menuButton');if(!menu||!toggle)return;
  close();toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));});
  get('adminMenuEntry').addEventListener('click',()=>{close();onManager();});
  accessButton=get('accessLoginNav');updateAccess(false);
  accessButton.addEventListener('click',async()=>{close();if(accessButton.disabled)return;if(!authenticated){onInspector();return;}accessButton.disabled=true;try{await onLogout?.();}finally{accessButton.disabled=false;}});
  document.addEventListener('click',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!toggle.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){close();toggle.focus();}});
 }
 return {init,close,updateAccess};
})();
