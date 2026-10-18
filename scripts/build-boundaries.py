"""Build display-only WGS84 boundaries; never overwrite supplied GIS sources."""
import argparse, hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.boundary-tools'))
from shapely.geometry import shape, mapping

args = argparse.ArgumentParser()
args.add_argument('source', type=Path)
args.add_argument('--output', type=Path, default=Path('data/boundaries'))
opt = args.parse_args()
catalog = json.loads((opt.source / 'config/provinces.import-ready.json').read_text(encoding='utf-8-sig'))
coverage = json.loads((opt.source / 'reports/COVERAGE_AND_PENDING.json').read_text(encoding='utf-8-sig'))
coverage_by_code = {p['provinceCode']: p for p in coverage['provinces']}
out = opt.output
out.mkdir(parents=True, exist_ok=True)
index, overview, qa = [], [], []

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

def rounded(value):
    if isinstance(value, (list, tuple)): return [rounded(x) for x in value]
    return round(value, 6) if isinstance(value, float) else value

for entry in catalog:
    code, name = str(entry['provinceCode']), entry['provinceNameTH']
    record = {'code': code, 'name': name, 'levels': {}}
    c = coverage_by_code[code]
    record.update(partial=c['corePartial'], withheld={k:len(v) for k,v in c['withheldCoreCodes'].items()})
    for level, filename, tolerance in [('province', 'province.geojson', .0003), ('district', 'districts.geojson', .00015), ('subdistrict', 'subdistricts.geojson', .00008)]:
        source = opt.source / 'แผนที่รายจังหวัด' / name / filename
        raw = source.read_bytes()
        data = json.loads(raw.decode('utf-8-sig'))
        features = []
        for f in data['features']:
            p, geom = f['properties'], shape(f['geometry'])
            if geom.geom_type not in ('Polygon', 'MultiPolygon') or geom.is_empty:
                raise ValueError(f'Invalid polygon: {code}/{level}')
            if str(p.get('provinceCode')) != code: raise ValueError(f'Province mismatch: {code}')
            simplified = geom.simplify(tolerance, preserve_topology=True)
            if not simplified.is_valid: simplified = geom
            g = mapping(simplified)
            g = {'type': g['type'], 'coordinates': rounded(g['coordinates'])}
            # Retain source geometry if coordinate rounding would invalidate it.
            if not shape(g).is_valid: g = mapping(simplified)
            final = shape(g)
            if not final.is_valid or final.is_empty or not (90 < final.bounds[0] < final.bounds[2] < 110 and 0 < final.bounds[1] < final.bounds[3] < 25):
                raise ValueError(f'Invalid display geometry: {code}/{level}')
            props = {k: p[k] for k in ['areaCode', 'parentCode', 'nameTH', 'provinceCode', 'districtCode', 'subdistrictCode', '__province', '__district', '__subdistrict'] if k in p}
            features.append({'type': 'Feature', 'properties': props, 'geometry': g})
        fc = {'type': 'FeatureCollection', 'features': features}
        path = f'{code}/{level}.geojson'
        write(out / path, fc)
        record['levels'][level] = {'path': path, 'count': len(features), 'bytes': (out/path).stat().st_size}
        qa.append({'code': code, 'level': level, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'sourceBytes': len(raw), 'displayBytes': (out/path).stat().st_size, 'features': len(features), 'toleranceDegrees': tolerance})
        if level == 'province':
            overview.extend(features)
            boxes = [shape(f['geometry']).bounds for f in features]
            record['bbox'] = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
    index.append(record)
write(out/'index.json', {'version': '2026-10-v1', 'displayOnly': True, 'partialProvinceCount':coverage['corePartialProvinceCount'], 'provinces': index})
write(out/'provinces.geojson', {'type': 'FeatureCollection', 'features': overview})
write(out/'build-qa.json', {'source': 'User supplied checked import package', 'displayOnly': True, 'coordinateSystem': 'WGS84 longitude latitude', 'note': 'Simplified for display, not authoritative surveying or point-in-polygon validation. Source counts are not a completeness certification.', 'files': qa})
print(json.dumps({'provinces': len(index), 'features': len(overview), 'sourceMB': sum(x['sourceBytes'] for x in qa)/1e6, 'displayMB': sum(x['displayBytes'] for x in qa)/1e6}))
