# Hotspot Data Folder

Place GeoJSON files here:
- hotspot_2564.geojson
- hotspot_2565.geojson
- hotspot_2566.geojson
- hotspot_2567.geojson
- hotspot_2568.geojson

## Required GeoJSON Properties
Each Point feature should have:
| Property     | Type   | Example            |
|-------------|--------|--------------------|
| acq_date    | string | "2568-03-15"       |
| acq_time    | string | "0530"             |
| province    | string | "เชียงใหม่"         |
| district    | string | "แม่แจ่ม"           |
| crop_type   | string | "นาข้าว"          |
| brightness  | number | 325.8              |
| confidence  | string | "high"/"nominal"/"low" |
สำหรับชุดข้อมูลปี 2569 จาก `2026-9-3 HS2026.xlsx` ใช้เฉพาะ `Province = กำแพงเพชร`, `LandType = พื้นที่เกษตร` และ PlantType 4 กลุ่ม ได้แก่ `นาข้าว`, `อ้อย`, `เกษตรอื่น ๆ`, `อื่น ๆ` โดยตรวจยอดกับ Pivot Table `hsPlant2026` ก่อนบันทึกข้อมูลรายจุดจาก `hsAll`

## Sources
- FIRMS NASA: https://firms.modaps.eosdis.nasa.gov/
- GISTDA: https://www.gistda.or.th/
