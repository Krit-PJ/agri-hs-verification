import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url), HS=require('../data-source.js');
const row={hsId:'HS001',acquiredAt:'2025-12-02',time:'09:05',latitude:16.2,longitude:99.5,province:'กำแพงเพชร',district:'เมืองกำแพงเพชร',tambon:'นครชุม',village:'',landType:'พื้นที่เกษตร',plantType:'เกษตรอื่น ๆ',datasetYearBe:2569};
test('dataset/season year is distinct from acquisition calendar year',()=>{const r=HS.normalizeRows([row]).rows[0];assert.equal(r.datasetYearBe,2569);assert.equal(r.calendarYearBe,2568);assert.equal(r.plantType,'เกษตรอื่นๆ');});
test('scope, duplicate IDs and duplicate observations rejected',()=>{const q=HS.normalizeRows([row,{...row},{...row,hsId:'HS002'},{...row,hsId:'HS003',province:'ตาก'},{...row,hsId:'HS004',latitude:200}]).qa;assert.deepEqual([q.accepted,q.duplicates,q.outOfScope,q.invalid],[1,2,1,1]);});
test('CSV BOM, embedded newline, quotes and comma',()=>{assert.deepEqual(HS.parseCSV('\uFEFFID,หมายเหตุ\r\n1,"มี, \"\"รูป\"\"\nต่อ"'),[{ID:'1',หมายเหตุ:'มี, "รูป"\nต่อ'}]);assert.throws(()=>HS.parseCSV('a,b\n1'));assert.throws(()=>HS.parseCSV('a,b\n1,"broken'));});
test('Sheets URL validation',()=>{assert.equal(HS.parseSheetId('https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit#gid=0'),'abcdefghijklmnopqrstuvwxyz');assert.throws(()=>HS.parseSheetId('https://evil.test/spreadsheets/d/abc'));});
test('Excel dates, Thai Buddhist date and invalid day',()=>{assert.equal(HS.dateISO(46023),'2026-01-01');assert.equal(HS.dateISO('2/12/2568'),'2025-12-02');assert.equal(HS.dateISO('2026-02-30'),'');assert.equal(HS.timeISO(.5),'12:00');});
test('latest risk source normalizes all packaged 593 points preserving exact IDs',()=>{const raw=JSON.parse(fs.readFileSync(new URL('../risk/data/hotspot/hotspot_2569.geojson',import.meta.url)));const n=HS.normalizeRows(raw,{datasetYearBe:2569});assert.equal(n.rows.length,593);assert.equal(n.qa.invalid,0);assert.equal(n.qa.duplicates,0);assert.equal(n.rows[0].hsId,raw.features[0].properties.hs_id);});
test('loader selects latest and bypasses caches',async()=>{const calls=[];const f=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url==='manifest'?{datasets:[{yearBe:2568,url:'old'},{yearBe:2569,url:'new'}]}:{rows:[row]}};};const result=await HS.loadRiskDataset({manifestUrl:'manifest',fetch:f});assert.equal(result.yearBe,2569);assert.equal(calls[1].url,'new');assert.ok(calls.every(c=>c.options.cache==='no-store'));});
test('import rejects pivot and oversized files',async()=>{await assert.rejects(HS.parseFile({name:'pivot.csv',size:20,text:async()=> 'อำเภอ,นาข้าว\nเมือง,10'}),/ข้อมูลรายจุด/);await assert.rejects(HS.parseFile({name:'a.csv',size:HS.MAX_BYTES+1}),/10 MB/);});
test('Excel detail reconciles readable provincial pivot and rejects mismatch',async()=>{let count=1;const XLSX={read:()=>({SheetNames:['hsPlant2026','hsAll'],Sheets:{hsAll:'detail',hsPlant2026:'pivot'}}),utils:{sheet_to_json:(s)=>s==='detail'?[row]:[['จังหวัด','นาข้าว','อ้อย','เกษตรอื่น ๆ','อื่น ๆ'],['กำแพงเพชร',0,0,count,0]]}};const file={name:'HS.xlsx',size:1,arrayBuffer:async()=>new ArrayBuffer(0)};const result=await HS.parseFile(file,{XLSX});assert.equal(result.summary.total,1);assert.equal(result.reconciliation.match,true);count=2;await assert.rejects(HS.parseFile(file,{XLSX}),/ไม่ตรง/);});
test('seed and actual risk cohort match all identities and coordinates',()=>{const risk=HS.normalizeRows(JSON.parse(fs.readFileSync(new URL('../risk/data/hotspot/hotspot_2569.geojson',import.meta.url))),{datasetYearBe:2569}).rows;const seed=HS.normalizeRows(JSON.parse(fs.readFileSync(new URL('../data/hs-base.json',import.meta.url))),{datasetYearBe:2569}).rows;assert.equal(seed.length,593);const map=new Map(risk.map(r=>[r.hsId,r]));for(const r of seed){assert.ok(map.has(r.hsId));assert.equal(r.latitude,map.get(r.hsId).latitude);assert.equal(r.longitude,map.get(r.hsId).longitude);}});

test('UTC acquisition timestamps convert into Thailand date and time',()=>{
 assert.equal(HS.dateISO('2026-03-26T19:07:00Z'),'2026-03-27');
 assert.equal(HS.timeISO('', '2026-03-26T19:07:00Z'),'02:07');
});

