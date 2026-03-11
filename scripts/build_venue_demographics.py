#!/usr/bin/env python3
"""
CineScope — Venue Demographic Catchment Profile Builder
========================================================
For each venue, computes population-weighted demographic averages
from all census zones within a 15-mile (24.14 km) radius.

Outputs: venue_demographics.json
"""

import json
import csv
import math
import os
import io
from collections import defaultdict

# ─── Config ──────────────────────────────────────────────
CATCHMENT_RADIUS_KM = 24.14  # 15 miles
EARTH_RADIUS_KM = 6371.0

# ─── Haversine distance (km) ─────────────────────────────
def haversine(lat1, lng1, lat2, lng2):
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng / 2) ** 2)
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


# ─── Load venues ─────────────────────────────────────────
def load_venues(path):
    with open(path) as f:
        data = json.load(f)
    return data['venues']


# ─── England & Wales: Load MSOA demographics ─────────────
def load_ew_zones(base_dir):
    """Load MSOA centroids + all 5 demographic tables, return zone dicts."""
    print("Loading England & Wales MSOA data...")
    
    # 1. Centroids
    centroids = {}
    with open(os.path.join(base_dir, 'msoa_centroids.csv')) as f:
        reader = csv.DictReader(f)
        for row in reader:
            centroids[row['msoa21cd']] = {
                'lat': float(row['lat']),
                'lng': float(row['lng'])
            }
    print(f"  Centroids: {len(centroids)}")
    
    # 2. Age (TS007A) — aggregate to Under 25 / 25-44 / 45-64 / 65+
    age_data = {}
    with open(os.path.join(base_dir, 'census2021-ts007a-msoa.csv')) as f:
        reader = csv.reader(f)
        headers = next(reader)
        for row in reader:
            code = row[2]  # geography code
            total = safe_int(row[3])
            if total == 0:
                continue
            under25 = sum(safe_int(row[i]) for i in range(4, 9))   # 0-4,5-9,10-14,15-19,20-24
            age25_44 = sum(safe_int(row[i]) for i in range(9, 13)) # 25-29,30-34,35-39,40-44
            age45_64 = sum(safe_int(row[i]) for i in range(13, 17))# 45-49,50-54,55-59,60-64
            age65plus = sum(safe_int(row[i]) for i in range(17, 22))# 65-69,70-74,75-79,80-84,85+
            age_data[code] = {
                'total': total,
                'under_25': under25, 'age_25_44': age25_44,
                'age_45_64': age45_64, 'age_65_plus': age65plus
            }
    print(f"  Age: {len(age_data)} zones")
    
    # 3. Sex (TS008)
    sex_data = {}
    with open(os.path.join(base_dir, 'census2021-ts008-msoa.csv')) as f:
        reader = csv.reader(f)
        headers = next(reader)
        for row in reader:
            code = row[2]
            # Headers have embedded newlines, use position
            total = safe_int(row[3])
            female = safe_int(row[4])
            male = safe_int(row[5])
            if total > 0:
                sex_data[code] = {'total': total, 'male': male, 'female': female}
    print(f"  Sex: {len(sex_data)} zones")
    
    # 4. Ethnicity (TS021) — White / Asian / Black / Mixed / Other
    eth_data = {}
    with open(os.path.join(base_dir, 'census2021-ts021-msoa.csv')) as f:
        reader = csv.reader(f)
        headers = next(reader)
        for row in reader:
            code = row[2]
            total = safe_int(row[3])
            if total == 0:
                continue
            asian = safe_int(row[4])
            black = safe_int(row[10])
            mixed = safe_int(row[14])
            white = safe_int(row[19])
            other = safe_int(row[25])
            eth_data[code] = {
                'total': total,
                'white': white, 'asian': asian, 'black': black,
                'mixed': mixed, 'other': other
            }
    print(f"  Ethnicity: {len(eth_data)} zones")
    
    # 5. Religion (TS030) — Christian / Muslim / Hindu / No religion / Other
    rel_data = {}
    with open(os.path.join(base_dir, 'census2021-ts030-msoa.csv')) as f:
        reader = csv.reader(f)
        headers = next(reader)
        for row in reader:
            code = row[2]
            total = safe_int(row[3])
            if total == 0:
                continue
            no_religion = safe_int(row[4])
            christian = safe_int(row[5])
            buddhist = safe_int(row[6])
            hindu = safe_int(row[7])
            jewish = safe_int(row[8])
            muslim = safe_int(row[9])
            sikh = safe_int(row[10])
            other_rel = safe_int(row[11])
            not_answered = safe_int(row[12])
            rel_data[code] = {
                'total': total,
                'christian': christian, 'muslim': muslim, 'hindu': hindu,
                'no_religion': no_religion,
                'other': buddhist + jewish + sikh + other_rel + not_answered
            }
    print(f"  Religion: {len(rel_data)} zones")
    
    # 6. Tenure (TS054) — Owned / Rented
    ten_data = {}
    with open(os.path.join(base_dir, 'census2021-ts054-msoa.csv')) as f:
        reader = csv.reader(f)
        headers = next(reader)
        for row in reader:
            code = row[2]
            total = safe_int(row[3])
            if total == 0:
                continue
            owned = safe_int(row[4])
            shared = safe_int(row[7])
            social_rented = safe_int(row[9])
            private_rented = safe_int(row[12])
            rent_free = safe_int(row[15])
            ten_data[code] = {
                'total': total,
                'owned': owned + shared,
                'rented': social_rented + private_rented + rent_free
            }
    print(f"  Tenure: {len(ten_data)} zones")
    
    # Combine into zone objects
    zones = []
    for code, centroid in centroids.items():
        if code not in age_data:
            continue
        zone = {
            'code': code,
            'lat': centroid['lat'],
            'lng': centroid['lng'],
            'population': age_data[code]['total'],
            'jurisdiction': 'EW',
            'age': age_data.get(code),
            'sex': sex_data.get(code),
            'ethnicity': eth_data.get(code),
            'religion': rel_data.get(code),
            'tenure': ten_data.get(code)
        }
        zones.append(zone)
    
    print(f"  Combined: {len(zones)} zones with full data")
    return zones


# ─── Scotland: Load OA demographics ──────────────────────
def load_scotland_zones(base_dir):
    """Load Scotland OA centroids + demographic tables."""
    print("Loading Scotland OA data...")
    
    # 1. Centroids (already converted to WGS84)
    centroids = {}
    with open(os.path.join(base_dir, 'scotland_oa_centroids.csv')) as f:
        reader = csv.DictReader(f)
        for row in reader:
            centroids[row['oa_code']] = {
                'lat': float(row['lat']),
                'lng': float(row['lng']),
                'population': int(row['population'])
            }
    print(f"  Centroids: {len(centroids)}")
    
    # Helper to parse Scotland census files (skip metadata rows)
    def parse_scotland_csv(filepath, skip_rows=5, verbose=False):
        """Parse Scotland Census CSV, returning header + data rows.
        Scotland files have metadata rows, then header row.
        If skip_rows is wrong, set verbose=True to debug."""
        with open(filepath, encoding='utf-8-sig') as f:
            # Read all lines, find the header row (starts with geographic code pattern)
            all_lines = f.readlines()
        
        # Strategy: skip_rows metadata lines, then header, then data
        # But verify by checking if the expected header row looks like headers
        header_line_idx = skip_rows - 1
        
        if verbose or True:  # Always print for debugging during this fix cycle
            print(f"\n    --- Parsing {os.path.basename(filepath)} ---")
            print(f"    Total lines: {len(all_lines)}")
            for i in range(min(skip_rows + 2, len(all_lines))):
                preview = all_lines[i].strip()[:120]
                marker = " <-- HEADER" if i == header_line_idx else ""
                marker = " <-- FIRST DATA" if i == skip_rows else marker
                print(f"    Line {i}: {preview}{marker}")
        
        # Parse from the identified header line
        text = ''.join(all_lines[header_line_idx:])
        reader = csv.reader(io.StringIO(text))
        headers = next(reader)
        
        if verbose or True:
            print(f"    Headers (first 15): {headers[:15]}")
        
        data = {}
        for row in reader:
            if row and row[0].strip('"').startswith('S'):
                code = row[0].strip('"')
                data[code] = [safe_int_dash(v) for v in row[1:]]
        
        if verbose or True:
            sample_code = list(data.keys())[:1]
            if sample_code:
                sample_vals = data[sample_code[0]][:15]
                print(f"    Sample ({sample_code[0]}): first 15 vals = {sample_vals}")
        
        return headers[1:], data
        
    # 2. Age (UV102b - Age 20 categories by sex)
    headers, age_raw = parse_scotland_csv(os.path.join(base_dir, 'UV102b - Age (20) by sex.csv'))
    age_data = {}
    for code, vals in age_raw.items():
        # UV102b has: All persons, then age bands by sex
        # First value is total, then age bands for all persons
        # Structure varies, let's use the population from centroid
        total = vals[0] if vals else 0
        if total == 0:
            continue
        # Approximate from whatever bands we have
        # UV102b has 20 age bands x 3 (M/F/T) = 60 values
        # Let's use total column values (every 3rd)
        # Actually, let's just use UV101b which has 6 age bands by sex
        pass
    
    headers_101, age_raw_101 = parse_scotland_csv(
        os.path.join(base_dir, 'UV101b - Usual resident population by sex by age (6).csv'))
    age_data = {}
    for code, vals in age_raw_101.items():
        # UV101b: Total, Male 0-15, Male 16-24, Male 25-44, Male 45-64, Male 65+, Male Total,
        #         Female 0-15, Female 16-24, Female 25-44, Female 45-64, Female 65+, Female Total
        if len(vals) < 13:
            continue
        total = vals[0]
        if total == 0:
            continue
        # Male bands: [1]=0-15, [2]=16-24, [3]=25-44, [4]=45-64, [5]=65+, [6]=total male
        # Female bands: [7]=0-15, [8]=16-24, [9]=25-44, [10]=45-64, [11]=65+, [12]=total female
        under25 = vals[1] + vals[2] + vals[7] + vals[8]  # 0-15 + 16-24 for M+F
        age25_44 = vals[3] + vals[9]
        age45_64 = vals[4] + vals[10]
        age65plus = vals[5] + vals[11]
        male_total = vals[6]
        female_total = vals[12]
        
        age_data[code] = {
            'total': total,
            'under_25': under25, 'age_25_44': age25_44,
            'age_45_64': age45_64, 'age_65_plus': age65plus,
            'male': male_total, 'female': female_total
        }
    print(f"  Age+Sex: {len(age_data)} zones")
    
    # Sanity check: flag if age percentages look wrong
    # (under_25 should typically be 25-35%, not 85%)
    if age_data:
        sample_codes = list(age_data.keys())[:5]
        print(f"\n  *** SCOTLAND AGE SANITY CHECK (first 5 zones) ***")
        print(f"  UV101b headers: {headers_101[:15]}")
        suspicious = False
        for sc in sample_codes:
            a = age_data[sc]
            t = a['total']
            if t > 0:
                pct_u25 = round(a['under_25'] / t * 100, 1)
                pct_25_44 = round(a['age_25_44'] / t * 100, 1)
                pct_45_64 = round(a['age_45_64'] / t * 100, 1)
                pct_65 = round(a['age_65_plus'] / t * 100, 1)
                total_pct = pct_u25 + pct_25_44 + pct_45_64 + pct_65
                flag = " *** SUSPICIOUS" if pct_u25 > 50 or pct_65 > 50 or abs(total_pct - 100) > 5 else ""
                if flag: suspicious = True
                print(f"    {sc}: <25={pct_u25}% 25-44={pct_25_44}% 45-64={pct_45_64}% 65+={pct_65}% (sum={total_pct}%){flag}")
                # Also print raw values for debugging
                raw = age_raw_101.get(sc, [])
                print(f"      Raw vals[0:15]: {raw[:15]}")
        
        if suspicious:
            print(f"\n  !!! WARNING: Age percentages look wrong — column indices may need adjustment !!!")
            print(f"  Check the UV101b headers above and verify [1]=Male 0-15, [2]=Male 16-24, etc.")
            print(f"  The header row might be: {headers_101[:15]}")
            print(f"  If the first header is 'Total' (not a geographic label), the indices are correct.")
            print(f"  If the first header is something else, adjust skip_rows in parse_scotland_csv().")
    
    # 3. Ethnicity (UV201)
    headers_201, eth_raw = parse_scotland_csv(os.path.join(base_dir, 'UV201 - Ethnic group.csv'))
    eth_data = {}
    for code, vals in eth_raw.items():
        if len(vals) < 25 or vals[0] == 0:
            continue
        total = vals[0]
        white = vals[1]     # White: Total
        mixed = vals[8]     # Mixed
        asian = vals[9]     # Asian total
        african = vals[15]  # African total
        caribbean = vals[18] # Caribbean or Black total
        other = vals[22]    # Other ethnic groups total
        eth_data[code] = {
            'total': total,
            'white': white, 'asian': asian,
            'black': african + caribbean,
            'mixed': mixed, 'other': other
        }
    print(f"  Ethnicity: {len(eth_data)} zones")
    
    # 4. Religion (UV205)
    headers_205, rel_raw = parse_scotland_csv(os.path.join(base_dir, 'UV205 - Religion.csv'))
    rel_data = {}
    for code, vals in rel_raw.items():
        if len(vals) < 10 or vals[0] == 0:
            continue
        total = vals[0]
        # Scotland religion categories: [1]=No religion, [2]=Church of Scotland,
        # [3]=Roman Catholic, [4]=Other Christian, [5]=Muslim, [6]=Hindu,
        # [7]=Buddhist, [8]=Sikh, [9]=Jewish, [10]=Pagan, [11]=Other, [12]=Not stated
        no_religion = vals[1]
        christian = vals[2] + vals[3] + vals[4]  # CoS + RC + Other Christian
        muslim = vals[5]
        hindu = vals[6]
        other_rel = sum(vals[7:]) if len(vals) > 7 else 0  # Buddhist, Sikh, Jewish, Pagan, Other, Not stated
        rel_data[code] = {
            'total': total,
            'christian': christian, 'muslim': muslim, 'hindu': hindu,
            'no_religion': no_religion, 'other': other_rel
        }
    print(f"  Religion: {len(rel_data)} zones")
    
    # 5. Tenure (UV403)
    headers_403, ten_raw = parse_scotland_csv(
        os.path.join(base_dir, 'UV403 - Household tenure - People.csv'))
    ten_data = {}
    for code, vals in ten_raw.items():
        if len(vals) < 5 or vals[0] == 0:
            continue
        total = vals[0]
        # [1]=Owner occupied, [2]=Social rented, [3]=Private rented, [4]=Lives rent free
        owned = vals[1]
        rented = vals[2] + vals[3] + vals[4] if len(vals) > 4 else vals[2] + vals[3]
        ten_data[code] = {
            'total': total,
            'owned': owned, 'rented': rented
        }
    print(f"  Tenure: {len(ten_data)} zones")
    
    # Combine
    zones = []
    for code, centroid in centroids.items():
        pop = centroid['population']
        if pop == 0 or code not in age_data:
            continue
        zone = {
            'code': code,
            'lat': centroid['lat'],
            'lng': centroid['lng'],
            'population': pop,
            'jurisdiction': 'SC',
            'age': age_data.get(code),
            'sex': {'total': age_data[code]['total'], 
                    'male': age_data[code].get('male', 0),
                    'female': age_data[code].get('female', 0)} if code in age_data else None,
            'ethnicity': eth_data.get(code),
            'religion': rel_data.get(code),
            'tenure': ten_data.get(code)
        }
        zones.append(zone)
    
    print(f"  Combined: {len(zones)} zones with data")
    return zones


# ─── Ireland: Load SA demographics ───────────────────────
def load_ireland_zones(base_dir, centroids_path):
    """Load Ireland Small Area centroids + SAPS demographics."""
    print("Loading Ireland SA data...")
    
    # 1. Centroids — key by BOTH SA_PUB and GEOGID for flexible matching
    # GEOGID has 'A' prefix (e.g. 'A017010016'), SA_PUB does not ('017010016')
    # SAPS file may use either format depending on vintage
    centroids = {}
    with open(centroids_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            loc = {
                'lat': float(row['latitude']),
                'lng': float(row['longitude'])
            }
            # Index by SA_PUB (numeric) and GEOGID ('A' prefix)
            sa_pub = row['SA_PUB'].strip()
            geogid = row['GEOGID'].strip()
            centroids[sa_pub] = loc
            centroids[geogid] = loc  # Also index by 'A'-prefixed key
    print(f"  Centroids: {len(centroids) // 2} unique SAs (indexed by SA_PUB + GEOGID)")
    
    # 2. SAPS data
    saps_file = os.path.join(base_dir, 'SAPS_2022_Small_Area_270923.csv')
    
    age_data = {}
    sex_data = {}
    ten_data = {}
    
    with open(saps_file) as f:
        reader = csv.DictReader(f)
        skipped_reasons = {'slash': 0, 'ireland': 0, 'short': 0, 'empty_pop': 0}
        total_rows = 0
        sample_geogids = []
        
        for row in reader:
            total_rows += 1
            geogid = row.get('GEOGID', '').strip().strip('"')
            
            # Collect samples for diagnostic
            if len(sample_geogids) < 5:
                sample_geogids.append(geogid)
            
            # Skip non-SA rows (Ireland total, Electoral Districts with slashes)
            if '/' in geogid:
                skipped_reasons['slash'] += 1
                continue
            if geogid.upper() in ('IRELAND', 'IE0', ''):
                skipped_reasons['ireland'] += 1
                continue
            if len(geogid) < 5:
                skipped_reasons['short'] += 1
                continue
            
            # Total population
            total_m = safe_int(row.get('T1_1AGETM', 0))
            total_f = safe_int(row.get('T1_1AGETF', 0))
            total = safe_int(row.get('T1_1AGETT', 0))
            if total == 0:
                skipped_reasons['empty_pop'] += 1
                continue
            
            # Age breakdown (use T columns - total for both sexes)
            # Under 25: ages 0-24
            under25 = 0
            for age in range(0, 20):
                under25 += safe_int(row.get(f'T1_1AGE{age}T', 0))
            under25 += safe_int(row.get('T1_1AGE20_24T', 0))
            
            age25_44 = (safe_int(row.get('T1_1AGE25_29T', 0)) +
                       safe_int(row.get('T1_1AGE30_34T', 0)) +
                       safe_int(row.get('T1_1AGE35_39T', 0)) +
                       safe_int(row.get('T1_1AGE40_44T', 0)))
            
            age45_64 = (safe_int(row.get('T1_1AGE45_49T', 0)) +
                       safe_int(row.get('T1_1AGE50_54T', 0)) +
                       safe_int(row.get('T1_1AGE55_59T', 0)) +
                       safe_int(row.get('T1_1AGE60_64T', 0)))
            
            age65plus = (safe_int(row.get('T1_1AGE65_69T', 0)) +
                        safe_int(row.get('T1_1AGE70_74T', 0)) +
                        safe_int(row.get('T1_1AGE75_79T', 0)) +
                        safe_int(row.get('T1_1AGE80_84T', 0)) +
                        safe_int(row.get('T1_1AGEGE_85T', 0)))
            
            age_data[geogid] = {
                'total': total,
                'under_25': under25, 'age_25_44': age25_44,
                'age_45_64': age45_64, 'age_65_plus': age65plus
            }
            
            sex_data[geogid] = {
                'total': total, 'male': total_m, 'female': total_f
            }
            
            # Tenure: T5_1OP_P = Owner occupied (persons), etc.
            ten_total = safe_int(row.get('T5_1T_P', 0))
            owned = safe_int(row.get('T5_1OP_P', 0))
            if ten_total > 0:
                rented = ten_total - owned
                ten_data[geogid] = {
                    'total': ten_total, 'owned': owned, 'rented': rented
                }
    
    print(f"  SAPS diagnostics: {total_rows} total rows")
    print(f"    Sample GEOGIDs: {sample_geogids}")
    print(f"    Skipped: {skipped_reasons}")
    print(f"  Age: {len(age_data)}, Sex: {len(sex_data)}, Tenure: {len(ten_data)}")
    
    # Show sample keys from age_data vs centroids for match debugging
    age_keys_sample = list(age_data.keys())[:3]
    cent_keys_sample = list(centroids.keys())[:6]
    print(f"    Sample age_data keys: {age_keys_sample}")
    print(f"    Sample centroid keys: {cent_keys_sample}")
    
    # Combine — iterate over age_data keys (SAPS GEOGIDs) and look them up in centroids
    # This way we don't double-count from the dual-indexed centroids dict
    zones = []
    matched = 0
    for geogid in age_data:
        if geogid not in centroids:
            continue
        matched += 1
        centroid = centroids[geogid]
        zone = {
            'code': geogid,
            'lat': centroid['lat'],
            'lng': centroid['lng'],
            'population': age_data[geogid]['total'],
            'jurisdiction': 'IE',
            'age': age_data.get(geogid),
            'sex': sex_data.get(geogid),
            'ethnicity': None,  # Not in SAPS — needs separate CSO download
            'religion': None,   # Not in SAPS — needs separate CSO download
            'tenure': ten_data.get(geogid)
        }
        zones.append(zone)
    
    print(f"  Combined: {len(zones)} zones (matched {matched} of {len(age_data)} SAPS records to centroids)")
    return zones


# ─── Northern Ireland: Load DZ demographics ──────────────
def load_ni_zones(base_dir):
    """Load Northern Ireland Data Zone centroids + available demographics.
    
    DZ centroids should be in: census-2021-population-weighted-centroids-data-zone.csv
    DZ demographics (if downloaded): tables in ni_dz_*.csv or similar
    """
    print("Loading Northern Ireland DZ data...")
    
    # 1. Centroids
    centroids = {}
    centroids_file = os.path.join(base_dir, 'census-2021-population-weighted-centroids-data-zone.csv')
    if not os.path.exists(centroids_file):
        print(f"  *** NI centroids file not found: {centroids_file}")
        print(f"  Available files in {base_dir}:")
        if os.path.exists(base_dir):
            for fn in sorted(os.listdir(base_dir)):
                print(f"    {fn}")
        else:
            print(f"    Directory does not exist")
        return []
    
    with open(centroids_file) as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        print(f"  Centroid columns: {headers}")
        
        # NI centroid CSVs typically have: DZ2021_code, X, Y, lat, lng, population
        # Detect column names
        code_col = None
        lat_col = None
        lng_col = None
        pop_col = None
        
        for h in headers:
            hl = h.lower().strip()
            if 'dz' in hl and 'code' in hl:
                code_col = h
            elif hl in ('lat', 'latitude', 'y_lat'):
                lat_col = h
            elif hl in ('lng', 'lon', 'longitude', 'long', 'x_long'):
                lng_col = h
            elif hl in ('population', 'pop', 'usual_residents', 'total_pop', 'mid_2021'):
                pop_col = h
        
        # Fallback: try common NI centroid CSV formats
        if not code_col:
            for h in headers:
                if h.startswith('DZ') or 'zone' in h.lower():
                    code_col = h
                    break
        if not lat_col:
            for h in headers:
                if 'lat' in h.lower():
                    lat_col = h
                    break
        if not lng_col:
            for h in headers:
                if 'lon' in h.lower() or 'lng' in h.lower():
                    lng_col = h
                    break
        
        if not all([code_col, lat_col, lng_col]):
            print(f"  *** Could not identify centroid columns. Found: code={code_col}, lat={lat_col}, lng={lng_col}")
            print(f"  Headers: {headers}")
            return []
        
        print(f"  Using columns: code={code_col}, lat={lat_col}, lng={lng_col}, pop={pop_col}")
        
        for row in reader:
            try:
                code = row[code_col].strip().strip('"')
                lat = float(row[lat_col])
                lng = float(row[lng_col])
                pop = int(float(row[pop_col])) if pop_col and row.get(pop_col) else 0
                centroids[code] = {'lat': lat, 'lng': lng, 'population': pop}
            except (ValueError, KeyError) as e:
                continue
    
    print(f"  Centroids: {len(centroids)} Data Zones")
    
    # 2. Look for DZ-level demographic tables
    # NISRA publishes Census 2021 at DZ level as CSVs/Excel
    # Check for common filenames
    possible_files = [
        'ni_dz_age.csv', 'DZ2021_age.csv', 'census-2021-dz-age.csv',
        'ni_dz_demographics.csv', 'ni_usual_residents_dz.csv',
    ]
    found_demo = None
    for fn in possible_files:
        path = os.path.join(base_dir, fn)
        if os.path.exists(path):
            found_demo = path
            break
    
    # Also check for any CSVs with 'dz' in the name
    if not found_demo and os.path.exists(base_dir):
        for fn in os.listdir(base_dir):
            if 'dz' in fn.lower() and fn.endswith('.csv') and fn != os.path.basename(centroids_file):
                found_demo = os.path.join(base_dir, fn)
                print(f"  Found potential DZ demographics: {fn}")
                break
    
    if found_demo:
        print(f"  *** DZ demographic file found: {found_demo}")
        print(f"  *** TODO: Parse this file and extract age/sex/ethnicity/religion/tenure")
        print(f"  *** For now, creating population-only zones")
    else:
        print(f"  No DZ-level demographic tables found — creating population-only zones")
        print(f"  To add NI demographics, download DZ-level Census 2021 tables from:")
        print(f"    https://www.nisra.gov.uk/statistics/census/2021-census")
        print(f"  Place CSVs in: {base_dir}")
    
    # 3. Build basic zones (population from centroids, no detailed demographics)
    zones = []
    for code, centroid in centroids.items():
        pop = centroid.get('population', 0)
        if pop == 0:
            pop = 1  # Avoid division by zero; actual demographic ratios unknown
        
        zone = {
            'code': code,
            'lat': centroid['lat'],
            'lng': centroid['lng'],
            'population': pop,
            'jurisdiction': 'NI',
            'age': None,        # Pending — need DZ-level tables
            'sex': None,        # Pending
            'ethnicity': None,  # Pending
            'religion': None,   # Pending
            'tenure': None,     # Pending
        }
        zones.append(zone)
    
    print(f"  Combined: {len(zones)} zones (population only — demographics pending)")
    return zones


# ─── Compute catchment profiles ──────────────────────────
def compute_catchments(venues, zones, radius_km=CATCHMENT_RADIUS_KM):
    """For each venue, find all zones within radius and compute weighted averages."""
    print(f"\nComputing {radius_km:.1f}km catchments for {len(venues)} venues across {len(zones)} zones...")
    
    # Build spatial index (simple lat-band buckets for speed)
    lat_buckets = defaultdict(list)
    for z in zones:
        bucket = int(z['lat'] * 4)  # ~0.25 degree bands
        lat_buckets[bucket].append(z)
    
    results = {}
    for i, venue in enumerate(venues):
        if i % 100 == 0:
            print(f"  Processing venue {i+1}/{len(venues)}...")
        
        vlat, vlng = venue['lat'], venue['lng']
        venue_key = f"{venue['name']}|{vlat:.6f},{vlng:.6f}"
        
        # Search nearby buckets (within ~0.5 degree ≈ ~55km)
        bucket_range = 3  # ±0.75 degrees latitude
        center_bucket = int(vlat * 4)
        
        nearby_zones = []
        for b in range(center_bucket - bucket_range, center_bucket + bucket_range + 1):
            for z in lat_buckets.get(b, []):
                dist = haversine(vlat, vlng, z['lat'], z['lng'])
                if dist <= radius_km:
                    nearby_zones.append((z, dist))
        
        if not nearby_zones:
            results[venue_key] = None
            continue
        
        # Compute population-weighted averages
        profile = compute_weighted_profile(nearby_zones)
        profile['zones_count'] = len(nearby_zones)
        profile['catchment_population'] = sum(z['population'] for z, _ in nearby_zones)
        results[venue_key] = profile
    
    return results


def compute_weighted_profile(nearby_zones):
    """Compute population-weighted demographic averages from nearby zones."""
    
    # Accumulators
    age_acc = {'under_25': 0, 'age_25_44': 0, 'age_45_64': 0, 'age_65_plus': 0, 'total': 0}
    sex_acc = {'male': 0, 'female': 0, 'total': 0}
    eth_acc = {'white': 0, 'asian': 0, 'black': 0, 'mixed': 0, 'other': 0, 'total': 0}
    rel_acc = {'christian': 0, 'muslim': 0, 'hindu': 0, 'no_religion': 0, 'other': 0, 'total': 0}
    ten_acc = {'owned': 0, 'rented': 0, 'total': 0}
    
    for zone, dist in nearby_zones:
        pop = zone['population']
        
        # Age
        if zone.get('age'):
            a = zone['age']
            age_acc['under_25'] += a.get('under_25', 0)
            age_acc['age_25_44'] += a.get('age_25_44', 0)
            age_acc['age_45_64'] += a.get('age_45_64', 0)
            age_acc['age_65_plus'] += a.get('age_65_plus', 0)
            age_acc['total'] += a.get('total', 0)
        
        # Sex
        if zone.get('sex'):
            s = zone['sex']
            sex_acc['male'] += s.get('male', 0)
            sex_acc['female'] += s.get('female', 0)
            sex_acc['total'] += s.get('total', 0)
        
        # Ethnicity
        if zone.get('ethnicity'):
            e = zone['ethnicity']
            for k in ['white', 'asian', 'black', 'mixed', 'other', 'total']:
                eth_acc[k] += e.get(k, 0)
        
        # Religion
        if zone.get('religion'):
            r = zone['religion']
            for k in ['christian', 'muslim', 'hindu', 'no_religion', 'other', 'total']:
                rel_acc[k] += r.get(k, 0)
        
        # Tenure
        if zone.get('tenure'):
            t = zone['tenure']
            for k in ['owned', 'rented', 'total']:
                ten_acc[k] += t.get(k, 0)
    
    # Convert to percentages
    profile = {}
    
    if age_acc['total'] > 0:
        t = age_acc['total']
        profile['age'] = {
            'under_25': round(age_acc['under_25'] / t * 100, 1),
            'age_25_44': round(age_acc['age_25_44'] / t * 100, 1),
            'age_45_64': round(age_acc['age_45_64'] / t * 100, 1),
            'age_65_plus': round(age_acc['age_65_plus'] / t * 100, 1)
        }
    
    if sex_acc['total'] > 0:
        t = sex_acc['total']
        profile['sex'] = {
            'male': round(sex_acc['male'] / t * 100, 1),
            'female': round(sex_acc['female'] / t * 100, 1)
        }
    
    if eth_acc['total'] > 0:
        t = eth_acc['total']
        profile['ethnicity'] = {
            'white': round(eth_acc['white'] / t * 100, 1),
            'asian': round(eth_acc['asian'] / t * 100, 1),
            'black': round(eth_acc['black'] / t * 100, 1),
            'mixed': round(eth_acc['mixed'] / t * 100, 1),
            'other': round(eth_acc['other'] / t * 100, 1)
        }
    
    if rel_acc['total'] > 0:
        t = rel_acc['total']
        profile['religion'] = {
            'christian': round(rel_acc['christian'] / t * 100, 1),
            'muslim': round(rel_acc['muslim'] / t * 100, 1),
            'hindu': round(rel_acc['hindu'] / t * 100, 1),
            'no_religion': round(rel_acc['no_religion'] / t * 100, 1),
            'other': round(rel_acc['other'] / t * 100, 1)
        }
    
    if ten_acc['total'] > 0:
        t = ten_acc['total']
        profile['tenure'] = {
            'owned': round(ten_acc['owned'] / t * 100, 1),
            'rented': round(ten_acc['rented'] / t * 100, 1)
        }
    
    return profile


# ─── Utilities ────────────────────────────────────────────
def safe_int(val):
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0

def safe_int_dash(val):
    """Scotland census uses '-' for suppressed values."""
    val = val.strip().strip('"')
    if val in ('-', '', '..', '*'):
        return 0
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0


# ─── Main ─────────────────────────────────────────────────
def main():
    base = '/home/claude/demographics'
    venue_path = '/mnt/project/cinescope_venues_compact.json'
    ireland_centroids = '/mnt/project/ireland_sa_centroids.csv'
    output_path = '/home/claude/demographics/venue_demographics.json'
    
    # Load venues
    venues = load_venues(venue_path)
    print(f"Loaded {len(venues)} venues")
    
    # Load all zones from all jurisdictions
    all_zones = []
    
    # England & Wales
    ew_zones = load_ew_zones(os.path.join(base, 'england-wales'))
    all_zones.extend(ew_zones)
    
    # Scotland
    sc_zones = load_scotland_zones(os.path.join(base, 'scotland'))
    all_zones.extend(sc_zones)
    
    # Ireland (age, sex, tenure only — no ethnicity/religion yet)
    ie_zones = load_ireland_zones(os.path.join(base, 'ireland'), ireland_centroids)
    all_zones.extend(ie_zones)
    
    # Northern Ireland (population from centroids, demographics pending DZ tables)
    ni_zones = load_ni_zones(os.path.join(base, 'northern-ireland'))
    all_zones.extend(ni_zones)
    
    print(f"\nTotal zones loaded: {len(all_zones)}")
    print(f"  England & Wales: {len(ew_zones)}")
    print(f"  Scotland: {len(sc_zones)}")
    print(f"  Ireland: {len(ie_zones)}")
    print(f"  Northern Ireland: {len(ni_zones)}")
    
    # Compute catchments
    catchments = compute_catchments(venues, all_zones)
    
    # Build output keyed by venue name for easy lookup
    output = {
        'metadata': {
            'generated': '2026-03-11',
            'catchment_radius_miles': 15,
            'catchment_radius_km': CATCHMENT_RADIUS_KM,
            'total_venues': len(venues),
            'venues_with_profiles': sum(1 for v in catchments.values() if v is not None),
            'zones_used': {
                'england_wales_msoa': len(ew_zones),
                'scotland_oa': len(sc_zones),
                'ireland_sa': len(ie_zones),
                'northern_ireland_dz': len(ni_zones),
            },
            'dimensions': ['age', 'sex', 'ethnicity', 'religion', 'tenure'],
            'notes': {
                'ireland': 'Age, sex, tenure from SAPS. Ethnicity and religion pending separate CSO download.',
                'northern_ireland': f'{len(ni_zones)} DZ centroids loaded. Detailed demographics pending NISRA DZ-level tables.',
                'scotland': 'Age/sex from UV101b, ethnicity UV201, religion UV205, tenure UV403.',
            }
        },
        'venues': {}
    }
    
    for venue in venues:
        venue_key = f"{venue['name']}|{venue['lat']:.6f},{venue['lng']:.6f}"
        profile = catchments.get(venue_key)
        if profile:
            # Use a simpler key for the app: name + lat,lng
            app_key = f"{venue['name']}|{venue['lat']},{venue['lng']}"
            output['venues'][app_key] = profile
    
    # Save
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Output saved: {output_path}")
    print(f"Venues with profiles: {output['metadata']['venues_with_profiles']}/{len(venues)}")
    
    # Sample output
    print(f"\nSample profiles:")
    count = 0
    for key, profile in output['venues'].items():
        if profile and count < 3:
            name = key.split('|')[0]
            print(f"\n  {name}:")
            print(f"    Catchment pop: {profile['catchment_population']:,}")
            print(f"    Zones: {profile['zones_count']}")
            if 'age' in profile:
                print(f"    Age: {profile['age']}")
            if 'ethnicity' in profile:
                print(f"    Ethnicity: {profile['ethnicity']}")
            count += 1


if __name__ == '__main__':
    main()
