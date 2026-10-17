/* Local image derivative: metadata is separate; original bytes are never uploaded. */
var HSImage = (() => {
'use strict';
const MAX_BYTES=1000000,MAX_EDGE=1920,MAX_SOURCE_BYTES=30*1024*1024;
function dimensions(width,height,edge=MAX_EDGE){if(!(width>0&&height>0))throw Error('ขนาดภาพไม่ถูกต้อง');const ratio=Math.min(1,edge/Math.max(width,height));return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};}
async function compress(file,metadata){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('รองรับภาพ JPEG, PNG และ WebP เท่านั้น');
 if(file.size>MAX_SOURCE_BYTES)throw Error('ภาพต้นฉบับต้องไม่เกิน 30 MB');
 const originalBytes=await file.arrayBuffer();let originalSha256=null;
 if(globalThis.crypto?.subtle)originalSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',originalBytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const url=URL.createObjectURL(file);let bitmap;
 try {bitmap=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('อ่านภาพไม่ได้ กรุณาเลือกภาพ JPEG หรือ PNG'));img.src=url;});
 let size=dimensions(bitmap.naturalWidth,bitmap.naturalHeight),blob;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('อุปกรณ์นี้ไม่รองรับการย่อภาพ');
 for(let round=0;round<12;round++){
  canvas.width=size.width;canvas.height=size.height;ctx.fillStyle='#fff';ctx.fillRect(0,0,size.width,size.height);ctx.drawImage(bitmap,0,0,size.width,size.height);
  for(const quality of [.86,.76,.66,.56,.46]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob)throw Error('สร้างภาพย่อไม่ได้');if(blob.size<=MAX_BYTES)break;}
  if(blob.size<=MAX_BYTES)break;size=dimensions(size.width,size.height,Math.max(1,Math.floor(Math.max(size.width,size.height)*.75)));
 }
 if(!blob||blob.size>MAX_BYTES)throw Error('ไม่สามารถย่อภาพให้ต่ำกว่า 1 MB กรุณาเลือกภาพอื่น');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('อ่านภาพย่อไม่ได้'));reader.readAsDataURL(blob);});
 return {blob,base64:data.split(',')[1],preview:data,mimeType:'image/jpeg',size:blob.size,width:size.width,height:size.height,metadata,originalSha256,originalSize:file.size,derivative:true};
 }finally{URL.revokeObjectURL(url);}
}
return {compress,dimensions,MAX_BYTES,MAX_EDGE,MAX_SOURCE_BYTES};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=HSImage;
