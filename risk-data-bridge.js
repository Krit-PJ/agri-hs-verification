(function(root){
  'use strict';
  let livePromise, sourcePriority=0;
  function status(message,error=false){const el=document.getElementById('sharedDataStatus');if(el){el.textContent=message;el.dataset.error=String(error);}document.dispatchEvent(new CustomEvent('hs:source-status',{detail:{message,error}}));}
  function geoJSON(rows,year){return {type:'FeatureCollection',metadata:{dataset_year_be:year},features:rows.filter(r=>Number(r.datasetYearBe||r.dataset_year_be||r.season_be||r.yearBe)===Number(year)).map(r=>({type:'Feature',geometry:{type:'Point',coordinates:[r.longitude,r.latitude]},properties:{hs_id:r.hsId,hsID:r.hsId,__date:r.acquiredAt,acq_date:r.acquiredAt,Date:r.acquiredAt,acq_time:r.time,Time:r.time,year_be:r.calendarYearBe||Number(String(r.acquiredAt).slice(0,4))+543,season_be:Number(year),dataset_year_be:Number(year),province:r.province,Province:r.province,__province:r.province,district:r.district,Amphoe:r.district,__district:r.district,subdistrict:r.tambon,Tambon:r.tambon,__subdistrict:r.tambon,village:r.village,BaanN:r.village,__village:r.village,land_type:r.landType,LandType:r.landType,plant_type:r.plantType,PlantType:r.plantType,crop_type:r.plantType,__crop:r.plantType,__plant_type:r.plantType,source_sheet:r.sourceSheet,status:r.status}}))};}
  async function live(endpoint){const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'bootstrap',payload:{filters:{}},token:sessionStorage.getItem('hsverify.sessionToken')||undefined}),redirect:'follow',cache:'no-store'});const body=await response.json();if(!response.ok||body.ok!==true)throw new Error(body.error?.message||'เชื่อมฐาน HS ไม่สำเร็จ');const d=body.data;const rows=Array.isArray(d)?d:d?.hotspots?.items||d?.hotspots||d?.items||d?.rows||d?.hs||d?.data;if(!Array.isArray(rows))throw new Error('ฐาน HS ส่งรายการไม่ถูกต้อง');return root.HSData.normalizeRows(rows).rows;}
  root.HSData.loadSharedGeoJSON=async function(year,options={}){
    try{
      const endpoint=localStorage.getItem('hsverify.apiEndpoint');
      if(endpoint){sourcePriority=2;livePromise ||= live(endpoint);const rows=await livePromise;status('ใช้ฐาน HS เดียวกับระบบตรวจสอบ (ข้อมูลสด)');return geoJSON(rows,year);}
      const saved=localStorage.getItem('hsverify.sharedDataset');if(saved){const imported=JSON.parse(saved);if(Number(imported.yearBe)===Number(year)){sourcePriority=1;const rows=root.HSData.normalizeRows(imported.rows,{datasetYearBe:imported.yearBe}).rows;status(`ใช้ข้อมูลนำเข้าร่วมกัน: ${imported.sourceName||'ไฟล์ในเครื่อง'} · ปี ${year} (ปีอื่นใช้ชุดอ้างอิง)`);return geoJSON(rows,year);}}
      const response=await fetch(options.packagedPath,{cache:'no-store'});if(!response.ok)throw new Error('อ่านข้อมูล HS ที่บรรจุไว้ไม่สำเร็จ');if(!sourcePriority)status('ใช้ชุดข้อมูลอ้างอิงจากแผนที่ความเสี่ยงเดียวกัน');return response.json();
    }catch(error){status(`โหลดฐาน HS ไม่สำเร็จ: ${error.message} — ไม่ใช้ข้อมูลเก่าแทน`,true);throw error;}
  };
  root.HSData.prepareRiskConfig=async function(config){
    const endpoint=localStorage.getItem('hsverify.apiEndpoint');let years=[];
    if(endpoint){livePromise ||= live(endpoint);years=[...new Set((await livePromise).map(r=>Number(r.datasetYearBe)))];}
    else {const saved=JSON.parse(localStorage.getItem('hsverify.sharedDataset')||'null');if(saved)years=[Number(saved.yearBe)];else {const response=await fetch('../data/risk-datasets.json',{cache:'no-store'});if(!response.ok)throw new Error('อ่านทะเบียนปีร่วมไม่สำเร็จ');const manifest=await response.json();years=(manifest.datasets||[]).map(d=>Number(d.yearBe));}}
    years.filter(Number.isFinite).forEach(year=>{config.DATA.hotspot[year] ||= `data/hotspot/hotspot_${year}.geojson`;});
    if(years.length)config.CURRENT_YEAR_BE=Math.max(...years);
  };
  root.HSData.toRiskGeoJSON=geoJSON;
})(globalThis);
