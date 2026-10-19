var HSThaiPeriod=(()=>{
 const months=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
 function init(){for(const part of ['start','end']){const month=document.getElementById(part+'MonthThai'),year=document.getElementById(part+'YearThai'),iso=document.getElementById(part+'MonthFilter');if(!month||!year||!iso)continue;
 month.replaceChildren(new Option('เลือกเดือน',''),...months.map((name,i)=>new Option(name,String(i+1).padStart(2,'0'))));
 const change=()=>{iso.value=month.value&&year.value?year.value+'-'+month.value:!month.value&&!year.value?'':'incomplete';iso.dispatchEvent(new Event('change'));};month.onchange=change;year.onchange=change;}
 sync();}
 function sync(rows=[]){const current=new Date().getFullYear(),years=rows.map(r=>Number(String(r.acquiredAt||r.acquired_at||'').slice(0,4))).filter(y=>y>=1900&&y<=2300);for(const part of ['start','end']){const iso=document.getElementById(part+'MonthFilter'),month=document.getElementById(part+'MonthThai'),year=document.getElementById(part+'YearThai');if(!iso||!month||!year||iso.value==='incomplete')continue;const [y,m]=iso.value.split('-');const min=Math.min(current-5,...years,...(y?[Number(y)]:[])),max=Math.max(current+2,...years,...(y?[Number(y)]:[]));year.replaceChildren(new Option('เลือกปี พ.ศ.',''),...Array.from({length:max-min+1},(_,i)=>new Option('พ.ศ. '+(min+i+543),String(min+i))));month.value=m||'';year.value=y||'';}}
 return {init,sync,months};
})();
if(typeof module==='object')module.exports=HSThaiPeriod;
