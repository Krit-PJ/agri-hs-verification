const CONFIG = {
  MAP_CENTER: [16.47, 99.52], MAP_ZOOM: 9, MAP_MIN_ZOOM: 7, MAP_MAX_ZOOM: 18,
  CURRENT_YEAR_BE: 2569,
  DATA: {
    district_kpt: 'data/boundary/district_kpt.geojson',
    subdistrict_kpt: 'data/boundary/subdistrict_kpt.geojson',
    burnscar_kpt: 'data/burnscar/burnscar_kpt.geojson',
    crop_kpt: 'data/crop/crop_kpt.geojson',
    hotspot: {
      2566: 'data/hotspot/hotspot_2566.geojson',
      2567: 'data/hotspot/hotspot_2567.geojson',
      2568: 'data/hotspot/hotspot_2568.geojson',
      2569: 'data/hotspot/hotspot_2569.geojson'
    }
  },
  BASEMAPS: {
    osm:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    topo:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
  },
  YEAR_COLORS:{2566:'#8b5cf6',2567:'#06b6d4',2568:'#f59e0b',2569:'#ef4444'},
  YEAR_COLOR_FALLBACK:['#ef4444','#f59e0b','#06b6d4','#8b5cf6','#14b8a6'],
  RISK_LEVELS:[
    {label:'ต่ำ',class:'risk-low',color:'#2ecc71',min:0,max:25},
    {label:'ปานกลาง',class:'risk-medium',color:'#f1c40f',min:25,max:50},
    {label:'สูง',class:'risk-high',color:'#e67e22',min:50,max:75},
    {label:'สูงมาก',class:'risk-very-high',color:'#e74c3c',min:75,max:101}
  ],
  RISK_MODEL:{yearWeights:{2566:0.15,2567:0.25,2568:0.35,2569:0.40},weights:{hotspot:0.40,trend:0.20,crop:0.20,area:0.20}},
  CROP_RISK:{'นาข้าว':70,'อ้อย':80,'ข้าวโพดและไร่หมุนเวียน':90,'เกษตรอื่น ๆ':55,'พื้นที่ป่า':95,'อื่น ๆ':45},
  VISITOR_COUNTER:{endpoint:''}
};
