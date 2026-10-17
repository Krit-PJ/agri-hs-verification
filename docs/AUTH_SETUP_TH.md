# การตั้งค่าการเข้าสู่ระบบผู้ดูแล (v1.3)

ระบบรับชื่อผู้ใช้และรหัสผ่านผ่านคำขอ `login` โดยเก็บเฉพาะ salt และผลแฮชแบบวนซ้ำใน Script Properties รหัสผ่านจริงไม่ถูกเขียนลง source code, spreadsheet หรือ response จากเซิร์ฟเวอร์ ส่วน session token เป็นค่าสุ่ม อายุ 4 ชั่วโมง และเพิกถอนได้ด้วย `logout`

## บัญชีที่ต้องตั้งค่า

| ชื่อผู้ใช้ | สิทธิ์ |
|---|---|
| `620000` | `admin` |
| `Krit` | `super_admin` |

เอกสารนี้ไม่บันทึกรหัสผ่าน ให้กรอกค่าที่ได้รับจากช่องทางที่ปลอดภัยใน Script Properties ตามขั้นตอนด้านล่าง

## ตั้งค่าครั้งแรก

1. เปิด Apps Script ของระบบ แล้วไปที่ **Project Settings → Script Properties**
2. เพิ่ม property ชื่อ `BOOTSTRAP_ADMIN_PASSWORD` และใส่รหัสผ่านของบัญชี `620000`
3. เพิ่ม property ชื่อ `BOOTSTRAP_SUPER_ADMIN_PASSWORD` และใส่รหัสผ่านของบัญชี `Krit`
4. บันทึก จากนั้นเปิด editor และเรียกฟังก์ชัน `setupRequestedLoginAccounts()` หนึ่งครั้ง
5. ตรวจผลลัพธ์ว่ามี `configured: true` และบัญชีทั้งสองมี role ถูกต้อง ฟังก์ชันจะลบ bootstrap properties ที่เป็น plaintext ทันทีหลังสร้างบัญชีสำเร็จ
6. Deploy เวอร์ชันใหม่ของ Web App

ถ้าฟังก์ชันหยุดด้วยข้อผิดพลาดก่อนสำเร็จ ให้ตรวจว่า bootstrap properties ยังอยู่หรือไม่ แก้ค่า แล้วเรียกใหม่ เมื่อสำเร็จต้องไม่มี `BOOTSTRAP_ADMIN_PASSWORD` และ `BOOTSTRAP_SUPER_ADMIN_PASSWORD` เหลืออยู่

สามารถเพิ่มหรือเปลี่ยนรหัสผ่านบัญชีรายตัวจาก editor ด้วย:

```javascript
setupPasswordAccount('username', 'password-from-secure-channel', {
  displayName: 'ชื่อที่แสดง',
  role: 'admin'
});
```

การเรียกฟังก์ชันนี้กับชื่อผู้ใช้เดิมจะเปลี่ยน salt, hash และ session version ทำให้ session เก่าของบัญชีนั้นใช้ต่อไม่ได้ ควรใช้รหัสผ่านยาวและไม่ซ้ำกับระบบอื่น

## API สำหรับหน้าเว็บ

ส่ง `POST` แบบ `text/plain` ด้วย envelope เดิม การเข้าสู่ระบบไม่ต้องมี token:

```json
{"action":"login","payload":{"username":"620000","password":"<กรอกจากผู้ใช้>"}}
```

เมื่อสำเร็จ:

```json
{"ok":true,"requestId":"","data":{"token":"<opaque-session-token>","profile":{"username":"620000","role":"admin","displayName":"ผู้ดูแลระบบ"},"expiresAt":"<ISO-8601>"}}
```

คำขออื่นส่ง session token ใน field `token` ของ envelope เช่นเดิม เซิร์ฟเวอร์จะอ่าน role ล่าสุดจากบัญชีฝั่ง backend ทุกครั้ง ไม่เชื่อ role ที่ client ส่งมา

ออกจากระบบโดยส่ง:

```json
{"action":"logout","token":"<opaque-session-token>","payload":{}}
```

เมื่อสำเร็จ response คือ `data: {"loggedOut": true}` และ token เดิมใช้ต่อไม่ได้ ความพยายามเข้าสู่ระบบที่ผิดถูกจำกัด 5 ครั้งต่อชื่อผู้ใช้ในช่วง 15 นาที ข้อความผิดพลาดไม่เปิดเผยว่าชื่อผู้ใช้มีอยู่จริงหรือไม่

ระบบ token เดิมของเจ้าหน้าที่และ `ADMIN_TOKEN_HASH` ยังใช้งานร่วมกันได้ เพื่อให้การย้ายระบบไม่ตัดการทำงานเดิมทันที ห้ามวาง password หรือ session token ใน URL, log, source code หรือ spreadsheet
