function listAdminAccounts_(actor){requireSuperAdmin_(actor);const accounts=readAuthAccounts_();return {items:Object.keys(accounts).map(function(k){return accounts[k];}).filter(function(a){return a.profile&&a.profile.role==='admin';}).map(function(a){return {username:a.username,displayName:a.profile.displayName,assignedProvinceCode:a.profile.assignedProvinceCode,active:a.active!==false};})};}
function createProvincialAdmin_(actor,payload){
 requireSuperAdmin_(actor);payload=payload||{};
 return withScriptLock_(function(){const key=normalizeUsername_(payload.username),accounts=readAuthAccounts_(),code=cleanText_(payload.assignedProvinceCode,2),name=cleanText_(payload.displayName,120),password=String(payload.password||'');
 assert_(!authAccountByKey_(accounts,key),'ACCOUNT_EXISTS','ชื่อผู้ใช้นี้มีอยู่แล้ว');assert_(HSNational.provinces[code]&&name,'VALIDATION_ERROR','ระบุชื่อและจังหวัดให้ครบ');assert_(password.length>=10&&password.length<=256,'VALIDATION_ERROR','รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร');assert_(Object.keys(accounts).length<500,'REGISTRATION_CAPACITY','พื้นที่บัญชีเต็ม กรุณาติดต่อผู้ดูแลระบบ');
 const result=setupPasswordAccount(key,password,{role:'admin',displayName:name,assignedProvinceCode:code,agencyLevel:'province',agency:'สำนักงานเกษตรจังหวัด'+HSNational.provinces[code]});
 appendLog_(actor,uuid_(),'createProvincialAdmin','account',key,'success',{provinceCode:code});return {created:true,profile:result.profile};});
}
function changeOwnCredentials_(actor,payload){
 requireAdmin_(actor);payload=payload||{};
 return withScriptLock_(function(){const key=normalizeUsername_(actor.username),accounts=readAuthAccounts_(),account=authAccountByKey_(accounts,key);
 assert_(account&&account.active!==false&&account.authMethod!=='phone_only','UNAUTHORIZED','กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน');
 assertLoginAllowed_(key);const candidate=passwordHash_(String(payload.currentPassword||''),account.salt,account.iterations);
 if(!secureEquals_(candidate,account.hash)){recordLoginFailure_(key);throw new ApiError('INVALID_CREDENTIALS','รหัสผ่านปัจจุบันไม่ถูกต้อง');}clearLoginFailures_(key);
 const nextKey=payload.newUsername?normalizeUsername_(payload.newUsername):key,password=String(payload.newPassword||'');
 assert_(['__proto__','prototype','constructor'].indexOf(nextKey)<0,'VALIDATION_ERROR','ชื่อผู้ใช้นี้สงวนไว้');assert_(nextKey===key||!authAccountByKey_(accounts,nextKey),'ACCOUNT_EXISTS','ชื่อผู้ใช้นี้มีอยู่แล้ว');assert_(!password||password.length>=10&&password.length<=256,'VALIDATION_ERROR','รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร');
 if(nextKey===key&&!password)return {changed:false,requiresRelogin:false};
 const updated=JSON.parse(JSON.stringify(account));updated.username=nextKey;updated.sessionVersion=uuid_();
 if(password){updated.salt=(uuid_()+uuid_()).replace(/-/g,'');updated.iterations=APP.AUTH_HASH_ITERATIONS;updated.hash=passwordHash_(password,updated.salt,updated.iterations);}
 const props=PropertiesService.getScriptProperties(),oldProperty='AUTH_ACCOUNT_V2_'+key;
 if(nextKey===key)props.setProperty(oldProperty,JSON.stringify(updated));
 else{const disabled=JSON.parse(JSON.stringify(account));disabled.active=false;disabled.sessionVersion=uuid_();props.setProperty(oldProperty,JSON.stringify(disabled));try{props.setProperty('AUTH_ACCOUNT_V2_'+nextKey,JSON.stringify(updated));}catch(error){props.setProperty(oldProperty,JSON.stringify(account));throw error;}}
 appendLog_(actor,uuid_(),'changeOwnCredentials','account',actor.id,'success',{usernameChanged:nextKey!==key,passwordChanged:Boolean(password)});return {changed:true,requiresRelogin:true};});
}
