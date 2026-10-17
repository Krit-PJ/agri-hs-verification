/* Photo coordinates describe the camera position, not the photographed object. */
var HSEvidence = (function () {
  'use strict';
  function empty(status) { return {parseStatus:status,latitude:null,longitude:null,accuracyM:null,capturedAt:null,timeZoneKnown:false,rawDateTimeOriginal:null,timeSource:null,source:'none',warnings:[]}; }
  function inspectBytes(input) {
    var out=empty('unsupported'), b=input, n=b && b.length;
    if (!n || n<4) return empty('malformed');
    function u(i){ if(i<0||i>=n) throw Error('bounds'); return Number(b[i])&255; }
    if(u(0)!==255||u(1)!==216) return out;
    out.parseStatus='no_metadata';
    try {
      var p=2, segments=0;
      while(p<n && segments++<2048){
        if(u(p++)!==255) throw Error('marker');
        while(u(p)===255)p++;
        var marker=u(p++); if(marker===217||marker===218)break;
        if(marker===1||(marker>=208&&marker<=215))continue;
        var len=u(p)*256+u(p+1); if(len<2||p+len>n)throw Error('segment');
        if(marker===225&&len>=8&&u(p+2)===69&&u(p+3)===120&&u(p+4)===105&&u(p+5)===102&&u(p+6)===0&&u(p+7)===0){
          parseTiff(p+8,p+len); return out;
        }
        p+=len;
      }
      if(segments>=2048)throw Error('segment limit');
    } catch(e){ out=empty('malformed'); out.warnings.push('อ่านโครงสร้าง EXIF ไม่สำเร็จ'); }
    return out;
    function parseTiff(base,end){
      var little=u(base)===73&&u(base+1)===73;
      if(!little&&!(u(base)===77&&u(base+1)===77))throw Error('endian');
      function check(i,l){if(i<base||l<0||i+l>end)throw Error('tiff bounds');}
      function v16(i){check(i,2);return little?u(i)+u(i+1)*256:u(i)*256+u(i+1);}
      function v32(i){check(i,4);return little?u(i)+u(i+1)*256+u(i+2)*65536+u(i+3)*16777216:u(i)*16777216+u(i+1)*65536+u(i+2)*256+u(i+3);}
      if(v16(base+2)!==42)throw Error('tiff magic');
      var seen={}, countTotal=0;
      function ifd(offset){
        if(!offset)return {};
        if(seen['p'+offset])throw Error('ifd cycle'); seen['p'+offset]=true;
        var at=base+offset, count=v16(at), tags={};
        if(count>512||(countTotal+=count)>1024)throw Error('entry limit'); check(at+2,count*12+4);
        for(var i=0;i<count;i++){
          var e=at+2+i*12, tag=v16(e),type=v16(e+2), cnt=v32(e+4), size=({1:1,2:1,3:2,4:4,5:8,7:1})[type];
          if(!size)continue; if(cnt>65536)throw Error('value limit');
          var bytes=size*cnt, pos=bytes<=4?e+8:base+v32(e+8);check(pos,bytes);
          tags['t'+tag]={type:type,count:cnt,pos:pos};
        }return tags;
      }
      function nums(t){if(!t)return null;var a=[];for(var j=0;j<t.count;j++){var pos=t.pos+j*({1:1,3:2,4:4,5:8}[t.type]||1), value;
        if(t.type===5){var den=v32(pos+4);if(!den)throw Error('zero rational denominator');value=v32(pos)/den;}
        else value=t.type===3?v16(pos):t.type===4?v32(pos):u(pos);
        if(!isFinite(value))throw Error('nonfinite');a.push(value);
      }return a;}
      function str(t){if(!t||t.type!==2)return null;var s='';for(var j=0;j<t.count;j++){var c=u(t.pos+j);if(!c)break;s+=String.fromCharCode(c);}return s.trim();}
      var root=ifd(v32(base+4)), exifPtr=nums(root.t34665), gpsPtr=nums(root.t34853), ex=exifPtr?ifd(exifPtr[0]):{}, gps=gpsPtr?ifd(gpsPtr[0]):{};
      out.parseStatus='parsed';out.source='exif';out.warnings.push('EXIF แก้ไขได้; พิกัดเป็นตำแหน่งกล้อง ไม่ใช่ตำแหน่งวัตถุ');
      function coordinate(tag,refTag,positive,negative,max){var a=nums(gps['t'+tag]),ref=str(gps['t'+refTag]);if(!a&&!ref)return null;if(!a||a.length!==3||[positive,negative].indexOf(ref)<0||a[1]>=60||a[2]>=60)throw Error('coordinate');var val=a[0]+a[1]/60+a[2]/3600;if(val>max)throw Error('range');return ref===negative?-val:val;}
      out.latitude=coordinate(2,1,'N','S',90);out.longitude=coordinate(4,3,'E','W',180);
      if((out.latitude===null)!==(out.longitude===null)){out.latitude=null;out.longitude=null;out.warnings.push('พิกัด GPS ไม่ครบคู่');}
      var acc=nums(gps.t31);if(acc&&acc.length===1)out.accuracyM=acc[0];
      var raw=str(ex.t36867),offset=str(ex.t36881);out.rawDateTimeOriginal=raw;
      if(raw&&/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)){
        var iso=raw.slice(0,10).replace(/:/g,'-')+'T'+raw.slice(11);
        if(offset&&/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)){var dt=Date.parse(iso+offset);if(isFinite(dt)){out.capturedAt=new Date(dt).toISOString();out.timeZoneKnown=true;out.timeSource='DateTimeOriginal+OffsetTimeOriginal';}}
        else {out.capturedAt=iso;out.timeSource='DateTimeOriginal';out.warnings.push('ไม่ทราบเขตเวลาถ่ายภาพ');}
      }
      var gd=str(gps.t29),gt=nums(gps.t7);
      if(!out.timeZoneKnown&&gd&&/^\d{4}:\d{2}:\d{2}$/.test(gd)&&gt&&gt.length===3&&gt[0]<24&&gt[1]<60&&gt[2]<60){var utc=Date.parse(gd.replace(/:/g,'-')+'T00:00:00Z');if(isFinite(utc)){out.capturedAt=new Date(utc+(gt[0]*3600+gt[1]*60+gt[2])*1000).toISOString();out.timeZoneKnown=true;out.timeSource='GPS UTC';}}
    }
  }
  function validPoint(p){return p&&typeof p.latitude==='number'&&typeof p.longitude==='number'&&isFinite(p.latitude)&&isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;}
  function distance(a,b){var r=Math.PI/180,dlat=(b.latitude-a.latitude)*r,dlon=(b.longitude-a.longitude)*r,q=Math.sin(dlat/2)*Math.sin(dlat/2)+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)*Math.sin(dlon/2);return Math.round(6371008.8*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q))));}
  function knownTime(t){return typeof t==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(t)&&isFinite(Date.parse(t));}
  function assess(input){
    input=input||{};var hs=input.hs||{},m=input.metadata||{},policy=input.policy||{},out={status:'insufficient',distanceM:null,deviceDistanceM:null,reasons:[],policyVersion:'1.0',timeDeltaHours:null};
    if(!validPoint(hs)||!validPoint(m)){out.reasons.push('ไม่มีพิกัด HS หรือพิกัดภาพที่ครบและถูกต้อง');return out;}
    out.distanceM=distance(hs,m);var radius=hs.spatialRadiusM;
    if(!(typeof radius==='number'&&isFinite(radius)&&radius>0))out.reasons.push('ยังไม่มีเกณฑ์ระยะเชิงตำแหน่งของผลิตภัณฑ์ HS');
    else {out.status=out.distanceM<=radius?'consistent':'review';if(out.status==='review')out.reasons.push('พิกัดกล้องอยู่นอกเกณฑ์ระยะ HS; อาจถ่ายจากจุดปลอดภัย');}
    if(m.timeZoneKnown&&knownTime(m.capturedAt)&&knownTime(hs.acquiredAt)){out.timeDeltaHours=(Date.parse(m.capturedAt)-Date.parse(hs.acquiredAt))/3600000;if(out.timeDeltaHours<0){out.status='review';out.reasons.push('ภาพมีเวลาก่อนเหตุการณ์ HS');}}
    var loc=input.captureLocation,at=input.captureAt,windowSec=typeof policy.contemporaneousSeconds==='number'?Math.max(0,policy.contemporaneousSeconds):120;
    if(validPoint(loc)&&m.timeZoneKnown&&knownTime(m.capturedAt)&&knownTime(at)&&Math.abs(Date.parse(m.capturedAt)-Date.parse(at))<=windowSec*1000){out.deviceDistanceM=distance(m,loc);var limit=policy.deviceToleranceM;if(typeof limit==='number'&&isFinite(limit)&&limit>0&&out.deviceDistanceM>limit){out.status='review';out.reasons.push('พิกัดภาพต่างจากพิกัดอุปกรณ์ในช่วงเวลาเดียวกัน');}}
    out.reasons.push('ผลสอบทวนความสอดคล้อง ไม่ใช่การรับรองความแท้จริงของภาพ');return out;
  }
  return {inspectBytes:inspectBytes,assess:assess};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HSEvidence;
