/* Inclusive acquisition-month range in Bangkok; fiscal defaults follow newest imported data. */
var HSPeriod=(()=>{const fiscal=typeof HSFiscal!=='undefined'?HSFiscal:require('./fiscal-period.js');
const valid=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));
function defaults(rows,now=new Date()){const months=rows.map(r=>fiscal.date(r.acquiredAt||r.acquired_at)).filter(Boolean).map(d=>d.slice(0,7)).sort();const end=months.at(-1)||fiscal.date(now).slice(0,7);const y=Number(end.slice(0,4))-(Number(end.slice(5))<10?1:0);return {startMonth:y+'-10',endMonth:end};}
function matches(row,start,end){const d=fiscal.date(row.acquiredAt||row.acquired_at||row.hs_date).slice(0,7);return Boolean(d)&&(!start||d>=start)&&(!end||d<=end);}
function error(start,end){if(Boolean(start)!==Boolean(end))return 'กรุณาเลือกทั้งเดือนเริ่มต้นและสิ้นสุด';if((start&&!valid(start))||(end&&!valid(end)))return 'กรุณาเลือกเดือนและปีให้ถูกต้อง';if(start&&end&&start>end)return 'เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด';return '';}
function label(start,end){const fmt=m=>{if(!m)return 'ไม่จำกัด';const [y,month]=m.split('-').map(Number);return new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(Date.UTC(y,month-1,2)));};return fmt(start)+' ถึง '+fmt(end);}
return {valid,defaults,matches,error,label};
})();
if(typeof module!=='undefined')module.exports=HSPeriod;
