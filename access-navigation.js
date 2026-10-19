var HSAccessNavigation=(()=>{
 'use strict';let menu,toggle;
 function close(){if(!menu)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
 function init({onInspector,onManager}){
  const get=id=>document.getElementById(id);menu=get('adminMenu');toggle=get('menuButton');if(!menu||!toggle)return;
  close();toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));});
  get('adminMenuEntry').addEventListener('click',()=>{close();onManager();});
  get('accessLoginNav').addEventListener('click',()=>{close();onInspector();});
  document.addEventListener('click',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!toggle.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){close();toggle.focus();}});
 }
 return {init,close};
})();
