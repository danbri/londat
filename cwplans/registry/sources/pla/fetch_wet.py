#!/usr/bin/env python3
"""Fetch open data for the wet areas of the Docklands model (tidal Thames, docks, basins, creeks).

Run from the repository root:
    python3 magpie/cwplans/registry/sources/pla/fetch_wet.py            # all layers
    python3 magpie/cwplans/registry/sources/pla/fetch_wet.py soundings  # only the UKHO soundings

Needs curl and GDAL's ogr2ogr (clip to the box). Raw responses go to
magpie/cwplans/data/raw/registry/pla/ (not committed); clipped GeoJSON (WGS84) goes next to
this script. What each layer is, its licence and its datum: README.md in this folder.
"""
import json, os, re, subprocess, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.normpath(os.path.join(HERE, '../../../data/raw/registry/pla'))
UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)'
BOX = (-0.0950, 51.4740, 0.0150, 51.5220)  # W S E N, WGS84

PLA = 'https://services8.arcgis.com/QgdzYlEcjteGD0VH/arcgis/rest/services/'
CRT = 'https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services/'

# (output name, layer URL, fields to keep or '*', clip to box?)
LAYERS = [
    # Port of London Authority (ArcGIS Online org "Port Of London Authority", urlKey PortofLondon)
    ('pla_navigational_limit', PLA + 'PLA_Navigational_Limit/FeatureServer/930', 'objectid,jurisdicti', True),
    ('pla_navigation_channels', PLA + 'PLA_Navigation_Channels/FeatureServer/947', 'objectid', True),
    ('pla_mhwm', PLA + 'MHWM_PLA/FeatureServer/543', 'objectid,date,info,method,method_just,height,method_2,aer_vis,type_2', True),
    ('pla_hydrographic_product_areas', PLA + 'Hydrographic_Product_Areas/FeatureServer/873', 'FID,type,product_co,name,date,period,period_tex,scale,distributi,current_ed', False),
    ('pla_foreshore_digging_permit', PLA + 'Digging_Permit/FeatureServer/6', 'FID,Type,Archaeolog,Location,Permission,Document_R,OSRef,PermitType', True),
    ('pla_foreshore_standard_permit', PLA + 'Standard_Permit/FeatureServer/4', 'FID,Type,Permission,Document_R,Location,PermitType', True),
    ('pla_foreshore_restrictions', PLA + 'Restrictions/FeatureServer/46', 'FID,Archaeolog,Document_R,Location,Type,Permission', True),
    ('pla_port_masterplan_sites', PLA + 'Port_Master_Plan_Sites_New/FeatureServer/964', 'objectid,site_name,borough,site_type,existing_c,future_opp', True),
    ('pla_sediment_samples', PLA + 'Sediment_Samples/FeatureServer/784', '*', True),
    ('pla_vessel_licensing_areas', PLA + 'Vessel_Licensing_Areas/FeatureServer/69', 'OBJECTID,jurisdiction', True),
    ('pla_limits_1968_removed_by_hro', PLA + 'Areas_within_limits_in_1968_being_removed_from_limits_following_the_HRO/FeatureServer/68', 'OBJECTID,jurisdiction,name', True),
    # Canal & River Trust (ArcGIS Online org of owner CanalRiverTrust)
    ('crt_docks', CRT + 'Docks_Public/FeatureServer/3', 'objectid,sap_func_loc,sap_description,waterway_name', True),
    ('crt_waterway_basin', CRT + 'Waterway_Basin_View_Public/FeatureServer/0', 'OBJECTID,SAP_FUNC_LOC,SAP_DESCRIPTION', True),
    ('crt_locks', CRT + 'CRT_Locks_Public/FeatureServer/0', 'OBJECTID,SAP_FUNC_LOC,SAP_DESCRIPTION,ANGLE', True),
    ('crt_bridges', CRT + 'CRT_Bridges_Public/FeatureServer/0', 'OBJECTID,SAP_FUNC_LOC,SAP_DESCRIPTION,Angle', True),
    ('crt_canals', CRT + 'CRT_Canals_Public/FeatureServer/1', '*', True),
    ('crt_culverts', CRT + 'Culverts_Public/FeatureServer/5', '*', True),
    ('crt_mooring_sites', CRT + 'Mooring_Site_View_Public/FeatureServer/0', 'OBJECTID,SAP_FUNC_LOC,SAP_DESCRIPTION', True),
    ('crt_towpath', CRT + 'Towpath_Centre_Line_Public/FeatureServer/4', '*', True),
    ('crt_outfalls', CRT + 'Outfall_Discharge_Points_View_Public/FeatureServer/0', '*', True),
    ('crt_stop_plank_grooves', CRT + 'Stop_Plank_Grooves_View_Public/FeatureServer/0', '*', True),
]

UKHO = 'https://datahub.admiralty.co.uk/Bathy_Data/Prodbathy/bathymetry/'
SOUNDINGS = [
    # (output name, file in the UKHO folder, survey id, grid)
    ('ukho_thames_teddington_greenwich_25m', '2017 2018-117951 River Thames Teddington Lock to Greenwich Reach 25m.csv', 'RSDRA2018000117951', '25 m'),
    ('ukho_thames_greenwich_coalhouse_50m', '2017 2018-117951 River Thames Greenwich Reach to Coalhouse Point 50m.csv', 'RSDRA2018000117951', '50 m'),
    ('ukho_thames_hms_belfast_berth', '2015 2015-255836 River Thames HMS Belfast.csv', 'RSDRA2015000255836', 'single-beam points'),
]


def curl(url, out=None):
    time.sleep(0.6)  # at most 2 requests per second per host
    cmd = ['curl', '-sS', '-L', '--max-time', '180', '-A', UA, url]
    if out:
        cmd[1:1] = ['-o', out]
    r = subprocess.run(cmd, capture_output=True, text=not out)
    if r.returncode:
        raise RuntimeError('curl failed: %s %s' % (url, r.stderr))
    return r.stdout


def fetch_layer(name, url, fields, clip):
    q = {'where': '1=1', 'geometry': ','.join(map(str, BOX)), 'geometryType': 'esriGeometryEnvelope',
         'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'outFields': fields, 'outSR': 4326,
         'f': 'geojson', 'resultRecordCount': 1000}
    feats, off = [], 0
    while True:
        q['resultOffset'] = off
        d = json.loads(curl(url + '/query?' + urllib.parse.urlencode(q)))
        if 'error' in d:
            raise RuntimeError('%s: %s' % (name, d['error']))
        fs = d.get('features', [])
        feats += fs
        off += len(fs)
        if not fs or not (d.get('exceededTransferLimit') or d.get('properties', {}).get('exceededTransferLimit')):
            break
    raw = os.path.join(RAW, name + '.geojson')
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(raw, 'w'))
    out = os.path.join(HERE, name + '.geojson')
    if os.path.exists(out):
        os.remove(out)
    cmd = ['ogr2ogr', '-f', 'GeoJSON', '-lco', 'RFC7946=YES', '-lco', 'COORDINATE_PRECISION=7', out, raw]
    if clip:
        cmd[3:3] = ['-clipsrc'] + [str(v) for v in BOX]
    subprocess.run(cmd, check=True)
    n = len(json.load(open(out))['features'])
    print('%-36s %5d features (%d before clip)' % (name, n, len(feats)))
    return n


def fetch_soundings():
    for name, fn, survey, grid in SOUNDINGS:
        raw = os.path.join(RAW, 'ukho_' + fn.replace(' ', '_'))
        curl(UKHO + urllib.parse.quote(fn), raw)
        feats = []
        for line in open(raw):
            p = re.split(r'[,\s]+', line.strip())
            try:
                lat, lon, z = float(p[0]), float(p[1]), float(p[2])
            except (ValueError, IndexError):
                continue  # header line
            if BOX[1] <= lat <= BOX[3] and BOX[0] <= lon <= BOX[2]:
                # In these files a negative value is BELOW chart datum (checked against the
                # HMS Belfast berth survey); store it as a height above Admiralty Chart Datum.
                feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 7), round(lat, 7)]},
                              'properties': {'z_cd': z}})
        out = os.path.join(HERE, name + '.geojson')
        json.dump({'type': 'FeatureCollection',
                   'properties': {'survey': survey, 'grid': grid, 'vertical_datum': 'Admiralty Chart Datum (EPSG::50000)',
                                  'z_cd': 'height above chart datum in metres; negative = below chart datum',
                                  'source': UKHO + urllib.parse.quote(fn),
                                  'licence': 'Open Government Licence v3.0 (UKHO INSPIRE bathymetry); not for navigation'},
                   'features': feats}, open(out, 'w'), separators=(',', ':'))
        print('%-36s %5d points in box' % (name, len(feats)))


if __name__ == '__main__':
    os.makedirs(RAW, exist_ok=True)
    only = sys.argv[1:]
    if not only or 'soundings' in only:
        fetch_soundings()
    for spec in LAYERS:  # 'layers' = all; 'pla' or 'crt' = one provider
        if not only or 'layers' in only or spec[0].split('_')[0] in only:
            fetch_layer(*spec)
