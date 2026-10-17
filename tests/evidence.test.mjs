import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), E=require('../evidence.js');
function fixture({south=false,west=false,den=1,degree=16,offset=true}={}){
 const b=Buffer.alloc(512);let cursor=200; b.write('II',0);b.writeUInt16LE(42,2);b.writeUInt32LE(8,4);
 function ifd(at,entries){b.writeUInt16LE(entries.length,at);entries.forEach(([tag,type,count,data],i)=>{let p=at+2+12*i;b.writeUInt16LE(tag,p);b.writeUInt16LE(type,p+2);b.writeUInt32LE(count,p+4);if(typeof data==='number')b.writeUInt32LE(data,p+8);else if(data.length<=4)data.copy(b,p+8);else {b.writeUInt32LE(cursor,p+8);data.copy(b,cursor);cursor+=data.length;}});}
 function rational(values){let v=Buffer.alloc(values.length*8);values.forEach((x,i)=>{v.writeUInt32LE(x,i*8);v.writeUInt32LE(den,i*8+4);});return v;}
 const text=s=>Buffer.from(s+'\0');
 ifd(8,[[34853,4,1,50],[34665,4,1,140]]);
 ifd(50,[[1,2,2,text(south?'S':'N')],[2,5,3,rational([degree,30,0])],[3,2,2,text(west?'W':'E')],[4,5,3,rational([99,30,0])]]);
 ifd(140,offset?[[36867,2,20,text('2026:10:15 10:30:00')],[36881,2,7,text('+07:00')]]:[[36867,2,20,text('2026:10:15 10:30:00')]]);
 const payload=Buffer.concat([Buffer.from('Exif\0\0'),b.subarray(0,cursor)]),head=Buffer.from([255,216,255,225,0,0]);head.writeUInt16BE(payload.length+2,4);return Buffer.concat([head,payload,Buffer.from([255,217])]);
}
test('real JPEG EXIF DMS signs and timezone offset',()=>{let m=E.inspectBytes(fixture({south:true,west:true}));assert.equal(m.parseStatus,'parsed');assert.equal(m.latitude,-16.5);assert.equal(m.longitude,-99.5);assert.equal(m.capturedAt,'2026-10-15T03:30:00.000Z');assert.equal(m.timeZoneKnown,true);assert.ok(m.warnings.some(s=>s.includes('กล้อง')));});
test('timezone missing stays unknown',()=>{let m=E.inspectBytes(fixture({offset:false}));assert.equal(m.timeZoneKnown,false);assert.equal(m.capturedAt,'2026-10-15T10:30:00');});
test('bad denominator and coordinate bounds fail safely',()=>{for(const options of [{den:0},{degree:91}]) assert.equal(E.inspectBytes(fixture(options)).parseStatus,'malformed');});
test('truncation, unsupported and missing metadata',()=>{assert.equal(E.inspectBytes(fixture().subarray(0,25)).parseStatus,'malformed');assert.equal(E.inspectBytes([137,80,78,71]).parseStatus,'unsupported');assert.equal(E.inspectBytes([255,216,255,217]).parseStatus,'no_metadata');});
test('no unproven default satellite radius',()=>{let a=E.assess({hs:{latitude:16,longitude:99},metadata:{latitude:16,longitude:99}});assert.equal(a.status,'insufficient');assert.equal(a.distanceM,0);});
test('explicit policy and separate camera coordinates',()=>{const hs={latitude:16,longitude:99,spatialRadiusM:100};assert.equal(E.assess({hs,metadata:{latitude:16,longitude:99}}).status,'consistent');assert.equal(E.assess({hs,metadata:{latitude:17,longitude:99}}).status,'review');});
test('device comparison requires known contemporaneous photo time',()=>{let input={hs:{latitude:16,longitude:99,spatialRadiusM:100},metadata:{latitude:16,longitude:99,timeZoneKnown:true,capturedAt:'2026-10-15T03:30:00Z'},captureLocation:{latitude:17,longitude:99},captureAt:'2026-10-16T03:30:00Z',policy:{deviceToleranceM:100}};assert.equal(E.assess(input).deviceDistanceM,null);input.captureAt='2026-10-15T03:30:30Z';assert.equal(E.assess(input).status,'review');input.metadata.timeZoneKnown=false;assert.equal(E.assess(input).deviceDistanceM,null);});
test('server/browser parser files are identical',async()=>{const fs=await import('node:fs/promises');assert.deepEqual(await fs.readFile(new URL('../evidence.js',import.meta.url)),await fs.readFile(new URL('../apps-script/Evidence.gs',import.meta.url)));});
test('Apps Script signed byte arrays retain EXIF',()=>{let signed=Array.from(fixture(),x=>x>127?x-256:x);assert.equal(E.inspectBytes(signed).latitude,16.5);});
test('unknown timezone never produces device distance or time delta',()=>{let a=E.assess({hs:{latitude:16,longitude:99,acquiredAt:'2026-10-15T03:00:00Z'},metadata:{latitude:16,longitude:99,capturedAt:'2026-10-15T10:00:00',timeZoneKnown:false},captureLocation:{latitude:16,longitude:99},captureAt:'2026-10-15T03:00:00Z'});assert.equal(a.deviceDistanceM,null);assert.equal(a.timeDeltaHours,null);});
