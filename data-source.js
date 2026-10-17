/* Shared source adapters: preserve source IDs and dataset/season year. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HSData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024, MAX_ROWS = 5000;
  const aliases = {
    hsId:['hsId','hs_id','hsID','id','HS ID','ID','รหัสจุดความร้อน'],
    date:['acquiredAt','acquired_at','hs_date','date','Date','acq_date','__date','YYYY-MM-DD','วันที่'],
    time:['time','hs_time','Time','acq_time','เวลา'],
    latitude:['latitude','lat','Latitude','LATITUDE','y','ละติจูด'],
    longitude:['longitude','lng','lon','long','x','Longitude','LONGITUDE','ลองจิจูด'],
    province:['province','Province','ProvinceN','__province','จังหวัด'],
    district:['district','Amphoe','AmphoeN','amphoe','__district','อำเภอ'],
    tambon:['tambon','Tambon','TambonN','subdistrict','__subdistrict','ตำบล'],
    village:['village','BaanN','Village','__village','หมู่บ้าน'],
    landType:['landType','land_type','LandType','ประเภทพื้นที่'],
    plantType:['plantType','plant_type','PlantType','crop_type','__plant_type','__crop','ชนิดพืช'],
    datasetYearBe:['datasetYearBe','dataset_year_be','season_be','ปีชุดข้อมูล'],
    sourceSheet:['sourceSheet','source_sheet']
  };
  const trim = value => String(value ?? '').trim();
  function pick(row, key) {
    for (const name of aliases[key]) if (row[name] !== undefined && trim(row[name]) !== '') return row[name];
    return '';
  }
  function yearBE(value) { const n=Number(value); return Number.isInteger(n) && n>1900 ? (n<2400?n+543:n):null; }
  function dateISO(value) {
    if(value instanceof Date) return Number.isFinite(value.getTime()) ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` : '';
    if(typeof value==='number') { if(value<1||value>100000) return ''; return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10); }
    const raw=trim(value);
    if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) { const dt=new Date(raw); if(!Number.isFinite(dt.getTime()))return '';const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt);const part=t=>parts.find(p=>p.type===t).value;return `${part('year')}-${part('month')}-${part('day')}`; }
    let y,m,d;
    let match=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    if(match) [,y,m,d]=match;
    else { match=raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); if(!match)return ''; [,d,m,y]=match; }
    y=Number(y); if(y>2400)y-=543; m=Number(m);d=Number(d);
    const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  }
  function timeISO(value, acquired) {
    if(value instanceof Date)return `${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}`;
    if(typeof value==='number'&&value>=0&&value<1) {const minutes=Math.round(value*1440)%1440;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
    if (!trim(value) && /T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(trim(acquired))) { const dt=new Date(acquired);if(!Number.isFinite(dt.getTime()))return '';return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(dt); }
    let raw=trim(value)||((trim(acquired).match(/[T ](\d{2}:\d{2})/)||[])[1]||'');
    if(/^\d{3,4}$/.test(raw))raw=raw.padStart(4,'0').replace(/^(\d{2})(\d{2})$/,'$1:$2');
    const m=raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);return m&&Number(m[1])<24&&Number(m[2])<60?`${m[1].padStart(2,'0')}:${m[2]}`:'';
  }
  function crop(value) {const s=trim(value).replace(/\s+/g,'');return s==='เกษตรอื่นๆ'?'เกษตรอื่นๆ':s==='อื่นๆ'?'อื่นๆ':trim(value);}
  function normalizeRows(input, options={}) {
    if(options.national) return options.national.normalize(input,{...options,helpers:{dateISO,timeISO}});
    const metadata=input?.metadata||{};
    const source=input?.type==='FeatureCollection'?input.features:Array.isArray(input)?input:(input?.rows||input?.data||[]);
    if(!Array.isArray(source))throw new Error('ข้อมูลต้องเป็นตารางหรือ GeoJSON FeatureCollection');
    if(source.length>MAX_ROWS)throw new Error(`รองรับไม่เกิน ${MAX_ROWS} แถวต่อครั้ง`);
    const qa={total:source.length,accepted:0,outOfScope:0,invalid:0,duplicates:0,errors:[]}, rows=[], ids=new Set(), observations=new Set();
    for(let i=0;i<source.length;i++) {
      const feature=source[i],raw=feature?.type==='Feature'?feature.properties||{}:feature||{};
      let coords=feature?.geometry?.type==='Point'?feature.geometry.coordinates:null;
      if(!coords&&!trim(pick(raw,'latitude'))&&!trim(pick(raw,'longitude'))){const link=trim(raw.Maps||raw.maps||raw.map||raw.googlemaps||raw['พิกัด']);const m=link.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);if(m)coords=[Number(m[2]),Number(m[1])];}
      const acquiredAt=dateISO(pick(raw,'date')), time=timeISO(pick(raw,'time'),pick(raw,'date'));
      const row={hsId:trim(pick(raw,'hsId')),acquiredAt,time,latitude:Number(coords?.[1]??pick(raw,'latitude')),longitude:Number(coords?.[0]??pick(raw,'longitude')),province:trim(pick(raw,'province')),district:trim(pick(raw,'district')),tambon:trim(pick(raw,'tambon')),village:trim(pick(raw,'village')),landType:trim(pick(raw,'landType')),plantType:crop(pick(raw,'plantType')),datasetYearBe:yearBE(pick(raw,'datasetYearBe')||options.datasetYearBe||metadata.dataset_year_be||metadata.season_be),calendarYearBe:acquiredAt?Number(acquiredAt.slice(0,4))+543:null,sourceSheet:trim(pick(raw,'sourceSheet')||options.sourceSheet||metadata.source_sheet||'hsAll'),status:raw.status||'pending'};
      row.datasetYearBe = row.datasetYearBe || row.calendarYearBe;
      if(!row.hsId||!acquiredAt||!time||!row.district||!row.tambon||!trim(coords?.[1]??pick(raw,'latitude'))||!trim(coords?.[0]??pick(raw,'longitude'))||!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||Math.abs(row.latitude)>90||Math.abs(row.longitude)>180) {qa.invalid++;if(qa.errors.length<20)qa.errors.push({row:i+2,message:'ต้องมี HS ID, วันที่, เวลา, อำเภอ, ตำบล และพิกัดที่ถูกต้อง'});continue;}
      if(row.province!=='กำแพงเพชร'||row.landType!=='พื้นที่เกษตร'||!['นาข้าว','อ้อย','เกษตรอื่นๆ','อื่นๆ'].includes(row.plantType)) {qa.outOfScope++;continue;}
      const observation=`${acquiredAt}|${time}|${row.latitude}|${row.longitude}`;
      if(ids.has(row.hsId)||observations.has(observation)){qa.duplicates++;continue;}
      ids.add(row.hsId);observations.add(observation);rows.push(row);
    }
    qa.accepted=rows.length;return {rows,qa};
  }
  function parseCSV(text) {
    text=String(text).replace(/^\uFEFF/,''); const records=[];let record=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field==='')quoted=!quoted;else throw new Error('CSV มีเครื่องหมายคำพูดไม่ถูกต้อง');}else if(!quoted&&(c===','||c==='\n'||c==='\r')){record.push(field);field='';if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(record.some(x=>trim(x)))records.push(record);record=[];}}else field+=c;}
    if(quoted)throw new Error('CSV มีเครื่องหมายคำพูดปิดไม่ครบ');record.push(field);if(record.some(x=>trim(x)))records.push(record);
    const headers=(records.shift()||[]).map(trim);if(new Set(headers).size!==headers.length)throw new Error('CSV มีชื่อคอลัมน์ซ้ำ');
    return records.map((values,i)=>{if(values.length!==headers.length)throw new Error(`CSV แถว ${i+2} มีจำนวนคอลัมน์ไม่ตรงหัวตาราง`);return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));});
  }
  async function parseFile(file, options={}) {
    if(file.size>MAX_BYTES)throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
    const ext=file.name.toLowerCase().split('.').pop();let raw,summary=null;
    if(['json','geojson'].includes(ext))raw=JSON.parse(await file.text());
    else if(ext==='csv')raw=parseCSV(await file.text());
    else if(['xlsx','xls'].includes(ext)){
      const xlsx=options.XLSX||(typeof globalThis!=='undefined'?globalThis.XLSX:null);if(!xlsx)throw new Error('ยังโหลดตัวอ่าน Excel ไม่สำเร็จ โปรดลองใหม่หรือใช้ CSV');
      const book=xlsx.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      if(options.national){let names=book.SheetNames.includes('AllData')?['AllData']:book.SheetNames.filter(n=>options.national.detail(xlsx.utils.sheet_to_json(book.Sheets[n],{defval:'',raw:true})));if(!names.length)throw new Error('ไม่พบ AllData หรือชีตรายจุดที่มีหัวตารางครบ');raw=names.flatMap(n=>xlsx.utils.sheet_to_json(book.Sheets[n],{defval:'',raw:true}).map(r=>({...r,sourceSheet:n})));return options.rawOnly?{raw}:normalizeRows(raw,options);}
      const name=options.sheetName||(['hsAll','HS_Base','hsPlant2026'].find(n=>book.SheetNames.includes(n)))||book.SheetNames[0];
      if(!book.Sheets[name])throw new Error('ไม่พบชีตที่เลือก');raw=xlsx.utils.sheet_to_json(book.Sheets[name],{defval:'',raw:true});options={...options,sourceSheet:name};
      if(name!=='hsPlant2026'&&book.Sheets.hsPlant2026){summary=readPivot(xlsx.utils.sheet_to_json(book.Sheets.hsPlant2026,{header:1,defval:'',raw:true}));if(!summary)throw new Error('พบ hsPlant2026 แต่ไม่สามารถอ่านยอด Pivot จังหวัดและพืชทั้ง 4 ชนิดเพื่อเทียบได้');}
    }else throw new Error('รองรับ Excel (.xlsx/.xls), CSV, JSON และ GeoJSON');
    if(options.rawOnly)return {raw};
    const result=normalizeRows(raw,options);if(!result.rows.length)throw new Error('ไม่พบข้อมูล HS ที่ผ่าน QA ต้องมีข้อมูลรายจุดพร้อม HS ID วันที่ เวลา พิกัด และพื้นที่; hsPlant2026 แบบตารางสรุปไม่สามารถสร้างจุดแผนที่ได้');
    if(summary){const counts=Object.fromEntries(['นาข้าว','อ้อย','เกษตรอื่นๆ','อื่นๆ'].map(p=>[p,0]));result.rows.forEach(r=>counts[r.plantType]++);if(summary.total!==result.rows.length||Object.keys(counts).some(p=>counts[p]!==summary.byPlantType[p]))throw new Error('ยอดข้อมูลรายจุดไม่ตรง hsPlant2026 กรุณาตรวจฐานต้นทางก่อนนำเข้า');result.summary=summary;result.reconciliation={available:true,match:true};}return result;
  }
  function readPivot(values){const plants=['นาข้าว','อ้อย','เกษตรอื่นๆ','อื่นๆ'];for(let i=0;i<values.length;i++){const headers=values[i].map(v=>trim(v).replace(/\s+/g,'')),provinceColumn=headers.indexOf('จังหวัด'),columns=plants.map(p=>headers.indexOf(p));if(provinceColumn<0||columns.some(c=>c<0))continue;const data=values.slice(i+1).find(r=>trim(r[provinceColumn])==='กำแพงเพชร');if(!data)continue;const counts=columns.map(c=>Number(data[c]||0));if(counts.some(n=>!Number.isInteger(n)||n<0))throw new Error('ยอด Pivot ต้องเป็นจำนวนเต็มที่ไม่ติดลบ');return {total:counts.reduce((a,b)=>a+b,0),byPlantType:Object.fromEntries(plants.map((p,j)=>[p,counts[j]]))};}return null;}
  function parseSheetId(value) {const s=trim(value),m=s.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:[/?#]|$)/);if(m)return m[1];if(/^[A-Za-z0-9_-]{20,}$/.test(s))return s;throw new Error('ใช้ Google Sheet URL หรือ Spreadsheet ID ที่ถูกต้อง');}
  async function loadRiskDataset(options={}) {
    const fetcher=options.fetch||globalThis.fetch;
    const response=await fetcher(options.manifestUrl||'data/risk-datasets.json',{cache:'no-store'});if(!response.ok)throw new Error('อ่านทะเบียนชุดข้อมูล HS ไม่สำเร็จ');const manifest=await response.json();
    const datasets=manifest.datasets||manifest.years||[];const available=datasets.filter(d=>Number(d.yearBe||d.datasetYearBe||d.year_be));
    const latest=Math.max(...available.map(d=>Number(d.yearBe||d.datasetYearBe||d.year_be)));
    const yearBe=Number(options.yearBe)||latest, entry=available.find(d=>Number(d.yearBe||d.datasetYearBe||d.year_be)===yearBe);if(!entry)throw new Error('ไม่พบชุดข้อมูล HS ของปีที่เลือก');
    const dataResponse=await fetcher(entry.url,{cache:'no-store'});if(!dataResponse.ok)throw new Error('โหลดข้อมูล HS จากแผนที่ความเสี่ยงไม่สำเร็จ');const raw=await dataResponse.json();
    return {...normalizeRows(raw,{datasetYearBe:yearBe}),yearBe,metadata:raw.metadata||{},manifest,sourceUrl:entry.url};
  }
  return {MAX_BYTES,MAX_ROWS,normalizeRows,parseCSV,parseFile,parseSheetId,loadRiskDataset,dateISO,timeISO,readPivot};
});
