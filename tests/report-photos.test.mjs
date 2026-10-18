import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const report=createRequire(import.meta.url)('../report.js');
const photo='data:image/png;base64,iVBORw0KGgo=';
test('report only embeds strict inline raster photos and escapes captions and reasons',()=>{
 const html=report.buildReportHtml({rows:[{hsId:'HS-1',verification:{photoMissingReason:'<script>bad</script>'},reportPhotoStatus:'loaded',reportPhotos:[{dataUrl:photo,caption:'<img onerror=bad>'},{dataUrl:'https://drive.google.com/private?token=secret'},{dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}]}]});
 assert.ok(html.includes(`src="${photo}"`));assert.ok(html.includes('&lt;img onerror=bad&gt;'));assert.ok(html.includes('โหลดภาพหลักฐานไม่สำเร็จหรือไม่ครบ'));assert.ok(!html.includes('drive.google.com'));assert.ok(!html.includes('svg+xml'));assert.ok(!html.includes('<script>'));
 for(const value of ['data:image/png;base64,','data:image/png;base64,abcd" onerror="bad','blob:photo','javascript:alert(1)'])assert.equal(report.safePhotoDataUrl(value),'');
});
test('report distinguishes confirmed absence from failed or unavailable photos',()=>{
 const build=row=>report.buildReportHtml({rows:[row]});
 assert.match(build({reportPhotoStatus:'empty',verification:{photoMissingReason:'field_safety'}}),/ไม่มีภาพแนบ.*ไม่ปลอดภัยที่จะถ่ายภาพ/s);
 assert.doesNotMatch(build({reportPhotoStatus:'error'}),/ไม่มีภาพแนบ/);
 assert.match(build({}),/ยังไม่ได้โหลดภาพหลักฐาน/);
});
test('print button waits for image decode and font readiness and prints report only',async()=>{
 let finishDecode,printed=0,click;const button={disabled:true,addEventListener:(type,handler)=>{click=handler;}};
 const image={complete:true,naturalWidth:10,decode:()=>new Promise(resolve=>{finishDecode=resolve;})};
 const document={documentElement:{},images:[image],fonts:{ready:Promise.resolve()},getElementById:()=>button};
 vm.runInNewContext(fs.readFileSync(new URL('../report-view.js',import.meta.url),'utf8'),{document,HSReport:{...report,readReportSnapshot:async raw=>JSON.parse(raw)},sessionStorage:{getItem:()=>JSON.stringify({rows:[]})},window:{print:()=>printed++}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(button.disabled,true);assert.equal(click,undefined);finishDecode();await new Promise(resolve=>setImmediate(resolve));assert.equal(button.disabled,false);click();assert.equal(printed,1);
 const html=report.buildReportHtml({rows:[]});assert.match(html,/id="reportPrintButton" disabled/);assert.match(html,/@media print[^}]*\{body/);assert.match(html,/\.toolbar\{display:none\}/);
});
test('broken images retain an explicit failure explanation before printing',async()=>{
 let warning,click;const button={disabled:true,addEventListener:(_,handler)=>click=handler};
 const image={complete:true,naturalWidth:0,decode:async()=>{throw Error('bad image');},replaceWith:node=>warning=node};
 const document={documentElement:{},images:[image],createElement:()=>({}),getElementById:()=>button};
 vm.runInNewContext(fs.readFileSync(new URL('../report-view.js',import.meta.url),'utf8'),{document,HSReport:{...report,readReportSnapshot:async raw=>JSON.parse(raw)},sessionStorage:{getItem:()=>JSON.stringify({rows:[]})},window:{print:()=>{}}});
 await new Promise(resolve=>setImmediate(resolve));assert.match(warning.textContent,/แสดงภาพไม่ได้/);assert.equal(button.disabled,false);assert.equal(typeof click,'function');
});

 test('snapshot reader rejects expired legacy and stored pointers',async()=>{
 await assert.rejects(report.readReportSnapshot(JSON.stringify({generatedAt:'2000-01-01',rows:[]})),/หมดอายุ/);
 await assert.rejects(report.readReportSnapshot(JSON.stringify({storage:'indexeddb',createdAt:Date.now()-3600001})),/หมดอายุ/);
 const options={generatedAt:new Date().toISOString(),rows:[]};assert.deepEqual(await report.readReportSnapshot(JSON.stringify(options)),options);
 });
test('photo snapshots persist in IndexedDB with tiny pointer; failed storage never navigates',async()=>{
 const source=fs.readFileSync(new URL('../report.js',import.meta.url),'utf8');let stored,pointer,navigated=0,fail=false;
 const indexedDB={open(){const request={};queueMicrotask(()=>{if(fail){request.error=Error('quota');request.onerror();return;}request.result={close(){},transaction(){const transaction={objectStore:()=>({put(value){stored=value;return {};},get(){const operation={};queueMicrotask(()=>{operation.result=stored;operation.onsuccess();});return operation;}})};setImmediate(()=>transaction.oncomplete());return transaction;}};request.onsuccess();});return request;}};
 const context={module:{exports:{}},indexedDB,sessionStorage:{setItem:(_,value)=>pointer=value},window:{location:{href:'https://example.org/app/',assign:()=>navigated++}},URL};vm.runInNewContext(source,context);const api=context.module.exports;
 const options={rows:[{reportPhotos:[{dataUrl:photo}]}]};await api.openReport(options);assert.equal(navigated,1);assert.ok(pointer.length<100);assert.equal(stored.options,options);assert.equal(await api.readReportSnapshot(pointer),options);
 fail=true;await assert.rejects(api.openReport(options),/จัดเก็บรายงานไม่สำเร็จ/);assert.equal(navigated,1);
 await api.openReport({rows:[]});assert.equal(JSON.parse(pointer).storage,'session');assert.equal(navigated,2);
});
test('report scope displays exact inclusive month range without all-fiscal-years label',()=>{
 const filters={scope:'ทั้งประเทศ',startMonth:'2025-10',endMonth:'2026-03'};
 const model=report.reportModel([],filters);assert.match(model.scope,/2025-10 ถึง 2026-03 \(รวมทั้งสองเดือน\)/);assert.equal(model.year,'ตามช่วงเดือนที่เลือก');
 const html=report.buildReportHtml({rows:[],filters});assert.ok(!html.includes('ทุกปีงบประมาณ'));assert.ok(html.includes('2025-10 ถึง 2026-03'));
 assert.match(report.reportModel([],{district:'เมือง',startMonth:'2025-10',endMonth:'2026-03'}).scope,/เมือง · ช่วงเดือน 2025-10/);
});

test('inaccessible is counted in printed follow-up totals',()=>{assert.equal(report.reportModel([{status:'verified',verification:{result:'inaccessible'}}]).followup,1)});
