/* Calendar acquisition date, never dataset/season year. End month is inclusive. */
var HSFiscal = (() => {
  function date(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const d = new Date(value); if (!Number.isFinite(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const p = Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`;
  }
  function year(value) { const s=date(value);if(!s)return null;return Number(s.slice(0,4))+543+(Number(s.slice(5,7))>=10?1:0); }
  function start(fy) { return `${Number(fy)-544}-10`; }
  function months(fy) { const y=Number(fy)-544;return Array.from({length:12},(_,i)=>`${y+(i>=3?1:0)}-${String((i+9)%12+1).padStart(2,'0')}`); }
  function matches(row,fy,end) { const d=date(row.acquiredAt||row.acquired_at||row.hs_date);if(!d)return false;if(!fy)return true;const available=months(fy);if(!available.includes(end))return false;return d.slice(0,7)>=start(fy)&&d.slice(0,7)<=end; }
  function defaults(rows,now=new Date()) { const fy=Math.max(2570,year(now));const candidates=rows.map(r=>date(r.acquiredAt||r.acquired_at||r.hs_date).slice(0,7)).filter(m=>months(fy).includes(m)).sort();return {year:fy,endMonth:candidates.at(-1)||start(fy),hasData:candidates.length>0}; }
  return {date,year,start,months,matches,defaults};
})();
if(typeof module!=='undefined')module.exports=HSFiscal;
