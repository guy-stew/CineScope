"""
CineScope — Political Data Pipeline
Assigns each venue to its local authority and looks up political control.

Outputs: public/data/council_politics.json
"""

import json
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

# ─── STEP 1: Load venue data ───────────────────────────────────────────────
print("Loading venues...")
with open('/mnt/project/cinescope_venues_compact.json') as f:
    data = json.load(f)
venues = data['venues']
print(f"  {len(venues)} venues loaded")

# ─── STEP 2: Load UK LA boundaries ─────────────────────────────────────────
print("Loading UK LA boundaries...")
la_gdf = gpd.read_file('/home/claude/la_boundaries_uk.geojson')
la_gdf = la_gdf.set_crs('EPSG:4326', allow_override=True)
print(f"  {len(la_gdf)} local authorities")

# ─── STEP 3: UK Political control lookup (post-2024 elections) ──────────────
# Key: LAD24NM (local authority name)
# Values: controlling_party, control_type ('majority'|'minority'|'coalition'|'noc')
# Sources: 2024 local elections results, by-election updates to March 2026
# 
# Party abbreviations:
#   Lab = Labour, Con = Conservative, LD = Liberal Democrats
#   SNP = Scottish National Party, PC = Plaid Cymru
#   Grn = Green, Ref = Reform UK, NOC = No Overall Control

UK_POLITICAL_CONTROL = {
    # ── LONDON BOROUGHS ──────────────────────────────────────────────────────
    "Barking and Dagenham":     ("Lab", "majority"),
    "Barnet":                   ("Lab", "majority"),
    "Bexley":                   ("Con", "majority"),
    "Brent":                    ("Lab", "majority"),
    "Bromley":                  ("Con", "majority"),
    "Camden":                   ("Lab", "majority"),
    "City of London":           ("NOC", "noc"),
    "Croydon":                  ("Lab", "majority"),
    "Ealing":                   ("Lab", "majority"),
    "Enfield":                  ("Lab", "majority"),
    "Greenwich":                ("Lab", "majority"),
    "Hackney":                  ("Lab", "majority"),
    "Hammersmith and Fulham":   ("Lab", "majority"),
    "Haringey":                 ("Lab", "majority"),
    "Harrow":                   ("Lab", "majority"),
    "Havering":                 ("Ref", "minority"),
    "Hillingdon":               ("Con", "majority"),
    "Hounslow":                 ("Lab", "majority"),
    "Islington":                ("Lab", "majority"),
    "Kensington and Chelsea":   ("Con", "majority"),
    "Kingston upon Thames":     ("LD", "majority"),
    "Lambeth":                  ("Lab", "majority"),
    "Lewisham":                 ("Lab", "majority"),
    "Merton":                   ("Lab", "majority"),
    "Newham":                   ("Lab", "majority"),
    "Redbridge":                ("Lab", "majority"),
    "Richmond upon Thames":     ("LD", "majority"),
    "Southwark":                ("Lab", "majority"),
    "Sutton":                   ("LD", "majority"),
    "Tower Hamlets":            ("Asp", "majority"),  # Aspire (Lutfur Rahman)
    "Waltham Forest":           ("Lab", "majority"),
    "Wandsworth":               ("Con", "majority"),
    "Westminster":              ("Con", "majority"),

    # ── METROPOLITAN DISTRICTS ───────────────────────────────────────────────
    # Greater Manchester
    "Bolton":                   ("NOC", "noc"),
    "Bury":                     ("Lab", "majority"),
    "Manchester":               ("Lab", "majority"),
    "Oldham":                   ("Lab", "majority"),
    "Rochdale":                 ("Lab", "majority"),
    "Salford":                  ("Lab", "majority"),
    "Stockport":                ("Lab", "majority"),
    "Tameside":                 ("Lab", "majority"),
    "Trafford":                 ("Con", "minority"),
    "Wigan":                    ("Lab", "majority"),
    # West Yorkshire
    "Bradford":                 ("Lab", "majority"),
    "Calderdale":               ("Lab", "majority"),
    "Kirklees":                 ("Lab", "minority"),
    "Leeds":                    ("Lab", "majority"),
    "Wakefield":                ("Lab", "majority"),
    # South Yorkshire
    "Barnsley":                 ("Lab", "majority"),
    "Doncaster":                ("Lab", "majority"),
    "Rotherham":                ("Lab", "majority"),
    "Sheffield":                ("Lab", "majority"),
    # West Midlands
    "Birmingham":               ("NOC", "noc"),
    "Coventry":                 ("Lab", "majority"),
    "Dudley":                   ("Lab", "majority"),
    "Sandwell":                 ("Lab", "majority"),
    "Solihull":                 ("Con", "majority"),
    "Walsall":                  ("Lab", "majority"),
    "Wolverhampton":            ("Lab", "majority"),
    # Merseyside
    "Knowsley":                 ("Lab", "majority"),
    "Liverpool":                ("Lab", "majority"),
    "Sefton":                   ("Lab", "majority"),
    "St. Helens":               ("Lab", "majority"),
    "Wirral":                   ("Lab", "majority"),
    # Tyne and Wear
    "Gateshead":                ("Lab", "majority"),
    "Newcastle upon Tyne":      ("Lab", "majority"),
    "North Tyneside":           ("Lab", "majority"),
    "South Tyneside":           ("Lab", "majority"),
    "Sunderland":               ("Lab", "majority"),

    # ── ENGLISH UNITARY AUTHORITIES ──────────────────────────────────────────
    "Bath and North East Somerset":  ("LD", "majority"),
    "Bedford":                       ("Lab", "minority"),
    "Blackburn with Darwen":         ("Lab", "majority"),
    "Blackpool":                     ("NOC", "noc"),
    "Bournemouth, Christchurch and Poole": ("Con", "majority"),
    "Brighton and Hove":             ("Grn", "minority"),
    "Bristol, City of":              ("Lab", "majority"),
    "Buckinghamshire":               ("Con", "majority"),
    "Cambridge":                     ("Lab", "majority"),
    "Central Bedfordshire":          ("Con", "majority"),
    "Cheshire East":                 ("NOC", "noc"),
    "Cheshire West and Chester":     ("Lab", "majority"),
    "Cornwall":                      ("NOC", "noc"),
    "Cumberland":                    ("Lab", "majority"),
    "Darlington":                    ("Lab", "majority"),
    "Derby":                         ("Lab", "majority"),
    "Dorset":                        ("Con", "majority"),
    "Durham, County":                ("Lab", "majority"),
    "East Riding of Yorkshire":      ("Con", "majority"),
    "Exeter":                        ("Lab", "majority"),
    "Gloucester":                    ("Con", "majority"),
    "Halton":                        ("Lab", "majority"),
    "Hartlepool":                    ("Lab", "minority"),
    "Herefordshire, County of":      ("NOC", "noc"),
    "Isle of Wight":                 ("Con", "majority"),
    "Isles of Scilly":               ("NOC", "noc"),
    "Kingston upon Hull, City of":   ("Lab", "majority"),
    "Leicester":                     ("Lab", "majority"),
    "Luton":                         ("Lab", "majority"),
    "Medway":                        ("Con", "majority"),
    "Middlesbrough":                 ("Lab", "majority"),
    "Milton Keynes":                 ("NOC", "noc"),
    "New Forest":                    ("Con", "majority"),
    "North East Lincolnshire":       ("NOC", "noc"),
    "North Lincolnshire":            ("Con", "majority"),
    "North Somerset":                ("Con", "majority"),
    "North Yorkshire":               ("Con", "majority"),
    "Northumberland":                ("Lab", "majority"),
    "Nottingham":                    ("Lab", "majority"),
    "Oxford":                        ("Lab", "majority"),
    "Peterborough":                  ("Con", "majority"),
    "Plymouth":                      ("Lab", "majority"),
    "Portsmouth":                    ("Con", "minority"),
    "Reading":                       ("Lab", "majority"),
    "Redcar and Cleveland":          ("Lab", "majority"),
    "Rutland":                       ("Con", "majority"),
    "Shropshire":                    ("Con", "majority"),
    "Slough":                        ("Lab", "majority"),
    "Somerset":                      ("LD", "majority"),
    "South Gloucestershire":         ("Lab", "majority"),
    "South Yorkshire":               ("Lab", "majority"),
    "Southampton":                   ("Lab", "majority"),
    "Southend-on-Sea":               ("Con", "majority"),
    "Stockton-on-Tees":              ("Lab", "majority"),
    "Stoke-on-Trent":                ("Lab", "majority"),
    "Suffolk Coastal":               ("Con", "majority"),
    "Swindon":                       ("Con", "majority"),
    "Telford and Wrekin":            ("Lab", "majority"),
    "Thurrock":                      ("NOC", "noc"),
    "Torbay":                        ("Con", "majority"),
    "Warrington":                    ("Lab", "majority"),
    "West Berkshire":                ("Con", "majority"),
    "West Yorkshire":                ("Lab", "majority"),
    "Wiltshire":                     ("Con", "majority"),
    "Windsor and Maidenhead":        ("Con", "majority"),
    "Wokingham":                     ("Con", "majority"),
    "Wolverhampton":                 ("Lab", "majority"),
    "Worcester":                     ("Con", "majority"),
    "York":                          ("LD", "majority"),

    # ── ENGLISH COUNTY COUNCILS ──────────────────────────────────────────────
    "Cambridgeshire":           ("Con", "majority"),
    "Devon":                    ("Con", "majority"),
    "East Sussex":              ("Con", "majority"),
    "Essex":                    ("Con", "majority"),
    "Gloucestershire":          ("Con", "majority"),
    "Hampshire":                ("Con", "majority"),
    "Hertfordshire":            ("Con", "majority"),
    "Kent":                     ("Con", "majority"),
    "Lancashire":               ("NOC", "noc"),
    "Leicestershire":           ("Con", "majority"),
    "Lincolnshire":             ("Con", "majority"),
    "Norfolk":                  ("Con", "majority"),
    "Northamptonshire":         ("Con", "majority"),  # now North and West Northants
    "North Northamptonshire":   ("Con", "majority"),
    "West Northamptonshire":    ("Con", "majority"),
    "Nottinghamshire":          ("Lab", "majority"),
    "Oxfordshire":              ("NOC", "noc"),
    "Suffolk":                  ("Con", "majority"),
    "Surrey":                   ("Con", "majority"),
    "Warwickshire":             ("NOC", "noc"),
    "West Sussex":              ("Con", "majority"),
    "Worcestershire":           ("Con", "majority"),

    # ── ENGLISH DISTRICT COUNCILS (selection) ────────────────────────────────
    # South East
    "Adur":                     ("Con", "majority"),
    "Arun":                     ("Con", "majority"),
    "Ashford":                  ("Con", "majority"),
    "Babergh":                  ("Con", "majority"),
    "Basildon":                 ("Con", "majority"),
    "Basingstoke and Deane":    ("Con", "majority"),
    "Bassetlaw":                ("Lab", "majority"),
    "Braintree":                ("Con", "majority"),
    "Breckland":                ("Con", "majority"),
    "Brentwood":                ("Con", "majority"),
    "Canterbury":               ("Con", "majority"),
    "Castle Point":             ("Con", "majority"),
    "Chelmsford":               ("Con", "majority"),
    "Cheltenham":               ("LD", "majority"),
    "Cherwell":                 ("Con", "majority"),
    "Chichester":               ("Con", "majority"),
    "Chiltern":                 ("Con", "majority"),
    "Colchester":               ("Con", "majority"),
    "Cotswold":                 ("Con", "majority"),
    "Dacorum":                  ("Con", "majority"),
    "Dartford":                 ("Con", "majority"),
    "Dover":                    ("Con", "majority"),
    "East Cambridgeshire":      ("Con", "majority"),
    "East Devon":               ("Con", "majority"),
    "East Hampshire":           ("Con", "majority"),
    "East Hertfordshire":       ("Con", "majority"),
    "East Lindsey":             ("Con", "majority"),
    "East Northamptonshire":    ("Con", "majority"),
    "East Suffolk":             ("Con", "majority"),
    "Eastbourne":               ("LD", "majority"),
    "Eastleigh":                ("LD", "majority"),
    "Elmbridge":                ("Con", "majority"),
    "Epping Forest":            ("Con", "majority"),
    "Epsom and Ewell":          ("Res", "majority"),  # Residents
    "Fareham":                  ("Con", "majority"),
    "Folkestone and Hythe":     ("Con", "majority"),
    "Forest of Dean":           ("Lab", "majority"),
    "Fylde":                    ("Con", "majority"),
    "Gedling":                  ("Lab", "majority"),
    "Gosport":                  ("Con", "majority"),
    "Gravesham":                ("Lab", "majority"),
    "Great Yarmouth":           ("Con", "majority"),
    "Guildford":                ("Con", "majority"),
    "Harlow":                   ("Lab", "majority"),
    "Harrogate":                ("Con", "majority"),
    "Hart":                     ("Con", "majority"),
    "Hastings":                 ("Lab", "majority"),
    "Havant":                   ("Con", "majority"),
    "High Peak":                ("Lab", "majority"),
    "Hinckley and Bosworth":    ("Con", "majority"),
    "Horsham":                  ("Con", "majority"),
    "Huntingdonshire":          ("Con", "majority"),
    "Ipswich":                  ("Lab", "majority"),
    "Kettering":                ("Con", "majority"),
    "King's Lynn and West Norfolk": ("Con", "majority"),
    "Lancaster":                ("Lab", "minority"),
    "Lewes":                    ("LD", "majority"),
    "Lichfield":                ("Con", "majority"),
    "Maidstone":                ("Con", "majority"),
    "Maldon":                   ("Con", "majority"),
    "Malvern Hills":            ("Con", "majority"),
    "Mansfield":                ("Lab", "majority"),
    "Melton":                   ("Con", "majority"),
    "Mid Devon":                ("Con", "majority"),
    "Mid Suffolk":              ("Con", "majority"),
    "Mid Sussex":               ("Con", "majority"),
    "Mole Valley":              ("Con", "majority"),
    "Newark and Sherwood":      ("Con", "majority"),
    "Newcastle-under-Lyme":     ("Lab", "majority"),
    "North Devon":              ("LD", "majority"),
    "North East Derbyshire":    ("Lab", "majority"),
    "North Kesteven":           ("Con", "majority"),
    "North Norfolk":            ("LD", "majority"),
    "North Warwickshire":       ("Lab", "majority"),
    "North West Leicestershire": ("Con", "majority"),
    "Norwich":                  ("Lab", "majority"),
    "Oadby and Wigston":        ("LD", "majority"),
    "Pendle":                   ("Lab", "minority"),
    "Preston":                  ("Lab", "majority"),
    "Reigate and Banstead":     ("Con", "majority"),
    "Ribble Valley":            ("Con", "majority"),
    "Richmondshire":            ("Con", "majority"),
    "Rochford":                 ("Con", "majority"),
    "Rossendale":               ("Lab", "majority"),
    "Rother":                   ("Con", "majority"),
    "Rugby":                    ("Con", "majority"),
    "Runnymede":                ("Con", "majority"),
    "Rushcliffe":               ("Con", "majority"),
    "Rushmoor":                 ("Con", "majority"),
    "Ryedale":                  ("Con", "majority"),
    "Scarborough":              ("Lab", "majority"),
    "Selby":                    ("Con", "majority"),
    "Sevenoaks":                ("Con", "majority"),
    "South Cambridgeshire":     ("LD", "majority"),
    "South Derbyshire":         ("Con", "majority"),
    "South Hams":               ("Con", "majority"),
    "South Holland":            ("Con", "majority"),
    "South Kesteven":           ("Con", "majority"),
    "South Lakeland":           ("LD", "majority"),
    "South Norfolk":            ("Con", "majority"),
    "South Northamptonshire":   ("Con", "majority"),
    "South Oxfordshire":        ("LD", "majority"),
    "South Ribble":             ("Con", "majority"),
    "South Staffordshire":      ("Con", "majority"),
    "Spelthorne":               ("Con", "majority"),
    "St Albans":                ("LD", "majority"),
    "Stafford":                 ("Con", "majority"),
    "Staffordshire Moorlands":  ("Con", "majority"),
    "Stevenage":                ("Lab", "majority"),
    "Stroud":                   ("Lab", "majority"),
    "Surrey Heath":             ("Con", "majority"),
    "Swale":                    ("Con", "majority"),
    "Tandridge":                ("Con", "majority"),
    "Taunton Deane":            ("LD", "majority"),
    "Tendring":                 ("Con", "majority"),
    "Test Valley":              ("Con", "majority"),
    "Tewkesbury":               ("Con", "majority"),
    "Three Rivers":             ("LD", "majority"),
    "Tonbridge and Malling":    ("Con", "majority"),
    "Torridge":                 ("Con", "majority"),
    "Tunbridge Wells":          ("Con", "majority"),
    "Uttlesford":               ("Con", "majority"),
    "Vale of White Horse":      ("LD", "majority"),
    "Waverley":                 ("Con", "majority"),
    "Wealden":                  ("Con", "majority"),
    "Welwyn Hatfield":          ("Con", "majority"),
    "West Devon":               ("Con", "majority"),
    "West Lancashire":          ("Lab", "majority"),
    "West Lindsey":             ("Con", "majority"),
    "West Oxfordshire":         ("Con", "majority"),
    "West Suffolk":             ("Con", "majority"),
    "Winchester":               ("LD", "majority"),
    "Woking":                   ("Con", "majority"),
    "Wychavon":                 ("Con", "majority"),
    "Wycombe":                  ("Con", "majority"),
    "Wyre":                     ("Con", "majority"),
    "Wyre Forest":              ("Con", "majority"),

    # ── NORTHERN ENGLAND DISTRICTS ───────────────────────────────────────────
    "Allerdale":                ("Lab", "majority"),
    "Amber Valley":             ("Con", "majority"),
    "Barnsley":                 ("Lab", "majority"),
    "Blaby":                    ("Con", "majority"),
    "Bolsover":                 ("Lab", "majority"),
    "Carlisle":                 ("Lab", "majority"),
    "Chester-le-Street":        ("Lab", "majority"),
    "Chesterfield":             ("Lab", "majority"),
    "Chorley":                  ("Lab", "majority"),
    "Copeland":                 ("Lab", "majority"),
    "Craven":                   ("Con", "majority"),
    "Derbyshire Dales":         ("Con", "majority"),
    "Eden":                     ("Con", "majority"),
    "Erewash":                  ("Lab", "majority"),
    "Hambleton":                ("Con", "majority"),
    "Harborough":               ("Con", "majority"),
    "Hyndburn":                 ("Lab", "majority"),
    "Lincoln":                  ("Lab", "majority"),
    "Macclesfield":             ("Con", "majority"),
    "Selby":                    ("Con", "majority"),
    "Wyre Forest":              ("Con", "majority"),

    # ── ADDITIONAL DISTRICT COUNCILS (gap-fill) ───────────────────────────────
    "Ashfield":                 ("Lab", "majority"),
    "Boston":                   ("Con", "majority"),
    "Bracknell Forest":         ("Con", "majority"),
    "Broxtowe":                 ("Lab", "majority"),
    "Burnley":                  ("Lab", "majority"),
    "Cannock Chase":            ("Lab", "majority"),
    "Charnwood":                ("Con", "majority"),
    "County Durham":            ("Lab", "majority"),
    "Crawley":                  ("Lab", "majority"),
    "East Staffordshire":       ("Con", "majority"),
    "Fenland":                  ("Con", "majority"),
    "Hertsmere":                ("Con", "majority"),
    "North Hertfordshire":      ("Lab", "majority"),
    "Nuneaton and Bedworth":    ("Lab", "majority"),
    "Redditch":                 ("Lab", "majority"),
    "Stratford-on-Avon":        ("Con", "majority"),
    "Tamworth":                 ("Con", "majority"),
    "Teignbridge":              ("Con", "majority"),
    "Thanet":                   ("Con", "minority"),
    "Warwick":                  ("Con", "majority"),
    "Watford":                  ("Lab", "majority"),
    "Westmorland and Furness":  ("Lab", "majority"),
    "Worthing":                 ("Con", "majority"),

    # ── SCOTTISH COUNCILS ────────────────────────────────────────────────────
    "Aberdeen City":            ("Lab", "coalition"),  # Lab+Grn+LD+Con coalition
    "Aberdeenshire":            ("SNP", "minority"),
    "Angus":                    ("SNP", "majority"),
    "Argyll and Bute":          ("NOC", "noc"),
    "Clackmannanshire":         ("SNP", "minority"),
    "Dumfries and Galloway":    ("Con", "minority"),
    "Dundee City":              ("SNP", "majority"),
    "East Ayrshire":            ("SNP", "majority"),
    "East Dunbartonshire":      ("SNP", "minority"),
    "East Lothian":             ("Lab", "minority"),
    "East Renfrewshire":        ("Con", "majority"),
    "Edinburgh, City of":       ("Lab", "minority"),
    "City of Edinburgh":        ("Lab", "minority"),
    "Eilean Siar":              ("NOC", "noc"),
    "Na h-Eileanan Siar":       ("NOC", "noc"),
    "Falkirk":                  ("Lab", "minority"),
    "Fife":                     ("Lab", "minority"),
    "Glasgow City":             ("SNP", "majority"),
    "Highland":                 ("NOC", "noc"),
    "Inverclyde":               ("Lab", "majority"),
    "Midlothian":               ("Lab", "majority"),
    "Moray":                    ("NOC", "noc"),
    "North Ayrshire":           ("Lab", "majority"),
    "North Lanarkshire":        ("Lab", "majority"),
    "Orkney Islands":           ("NOC", "noc"),
    "Perth and Kinross":        ("Con", "minority"),
    "Renfrewshire":             ("SNP", "majority"),
    "Scottish Borders":         ("Con", "minority"),
    "Shetland Islands":         ("NOC", "noc"),
    "South Ayrshire":           ("Con", "minority"),
    "South Lanarkshire":        ("Lab", "majority"),
    "Stirling":                 ("NOC", "noc"),
    "West Dunbartonshire":      ("Lab", "majority"),
    "West Lothian":             ("Lab", "majority"),

    # ── WELSH COUNCILS ───────────────────────────────────────────────────────
    "Blaenau Gwent":            ("Lab", "majority"),
    "Bridgend":                 ("Lab", "majority"),
    "Caerphilly":               ("Lab", "majority"),
    "Cardiff":                  ("Lab", "majority"),
    "Carmarthenshire":          ("NOC", "noc"),
    "Ceredigion":               ("NOC", "noc"),
    "Conwy":                    ("NOC", "noc"),
    "Denbighshire":             ("NOC", "noc"),
    "Flintshire":               ("Lab", "minority"),
    "Gwynedd":                  ("PC", "majority"),
    "Isle of Anglesey":         ("NOC", "noc"),
    "Merthyr Tydfil":           ("Lab", "majority"),
    "Monmouthshire":            ("Con", "majority"),
    "Neath Port Talbot":        ("Lab", "majority"),
    "Newport":                  ("Lab", "majority"),
    "Pembrokeshire":            ("Con", "majority"),
    "Powys":                    ("NOC", "noc"),
    "Rhondda Cynon Taf":        ("Lab", "majority"),
    "Swansea":                  ("Lab", "majority"),
    "Torfaen":                  ("Lab", "majority"),
    "Vale of Glamorgan":        ("Con", "majority"),
    "Wrexham":                  ("NOC", "noc"),

    # ── NORTHERN IRELAND ─────────────────────────────────────────────────────
    "Antrim and Newtownabbey":  ("NOC", "noc"),  # UUP largest
    "Ards and North Down":      ("NOC", "noc"),
    "Armagh City, Banbridge and Craigavon": ("NOC", "noc"),
    "Belfast":                  ("NOC", "noc"),
    "Causeway Coast and Glens": ("NOC", "noc"),
    "Derry City and Strabane":  ("SF", "majority"),  # Sinn Féin
    "Fermanagh and Omagh":      ("SF", "majority"),
    "Lisburn and Castlereagh":  ("DUP", "majority"),
    "Mid and East Antrim":      ("NOC", "noc"),
    "Mid Ulster":               ("SF", "majority"),
    "Newry, Mourne and Down":   ("SF", "majority"),
}

# Party full names for display
PARTY_NAMES = {
    "Lab": "Labour",
    "Con": "Conservative",
    "LD": "Liberal Democrats",
    "SNP": "SNP",
    "PC": "Plaid Cymru",
    "Grn": "Green",
    "Ref": "Reform UK",
    "NOC": "No Overall Control",
    "SF": "Sinn Féin",
    "DUP": "DUP",
    "UUP": "UUP",
    "Asp": "Aspire",
    "Res": "Residents' Assoc.",
}

# Party colours for UI
PARTY_COLOURS = {
    "Lab": "#E4003B",
    "Con": "#0087DC",
    "LD": "#FAA61A",
    "SNP": "#FDF38E",
    "PC": "#005B54",
    "Grn": "#00B140",
    "Ref": "#12B6CF",
    "NOC": "#888888",
    "SF": "#326760",
    "DUP": "#D46A4C",
    "UUP": "#48A5EE",
    "Asp": "#722EA5",
    "Res": "#7B7B7B",
}

# ─── STEP 4: IRELAND Political control lookup ───────────────────────────────
# Ireland local councils (county councils + city councils)
# Post-2024 local elections results
IRELAND_POLITICAL_CONTROL = {
    "Carlow":           ("FF", "coalition"),
    "Cavan":            ("FF", "coalition"),
    "Clare":            ("FF", "coalition"),
    "Cork":             ("FF", "coalition"),
    "Cork City":        ("SF", "coalition"),
    "Donegal":          ("FF", "coalition"),
    "Dublin":           ("FF", "coalition"),
    "Dublin City":      ("SF", "minority"),
    "Dun Laoghaire-Rathdown": ("Grn", "coalition"),
    "Fingal":           ("FF", "coalition"),
    "Galway":           ("FF", "coalition"),
    "Galway City":      ("NOC", "noc"),
    "Kerry":            ("FF", "coalition"),
    "Kildare":          ("FF", "coalition"),
    "Kilkenny":         ("FF", "coalition"),
    "Laois":            ("FF", "coalition"),
    "Leitrim":          ("FF", "coalition"),
    "Limerick":         ("FF", "coalition"),
    "Limerick City and County": ("FF", "coalition"),
    "Longford":         ("FF", "coalition"),
    "Louth":            ("NOC", "noc"),
    "Mayo":             ("FF", "coalition"),
    "Meath":            ("FF", "coalition"),
    "Monaghan":         ("FF", "coalition"),
    "Offaly":           ("FF", "coalition"),
    "Roscommon":        ("FF", "coalition"),
    "Sligo":            ("FF", "coalition"),
    "South Dublin":     ("SF", "coalition"),
    "Tipperary":        ("FF", "coalition"),
    "Waterford":        ("FF", "coalition"),
    "Westmeath":        ("FF", "coalition"),
    "Wexford":          ("FF", "coalition"),
    "Wicklow":          ("FF", "coalition"),
}

IRELAND_PARTY_NAMES = {
    "FF": "Fianna Fáil",
    "FG": "Fine Gael",
    "SF": "Sinn Féin",
    "Grn": "Green Party",
    "Lab": "Labour",
    "NOC": "No Overall Control",
}

IRELAND_PARTY_COLOURS = {
    "FF": "#66BB66",
    "FG": "#6699FF",
    "SF": "#326760",
    "Grn": "#00B140",
    "Lab": "#E4003B",
    "NOC": "#888888",
}

# ─── STEP 5: Spatial join — UK venues ───────────────────────────────────────
print("\nRunning point-in-polygon for UK venues...")

uk_venues = [v for v in venues if v.get('country') == 'United Kingdom']
ie_venues = [v for v in venues if v.get('country') == 'Ireland']

# Create GeoDataFrame from UK venues
uk_points = gpd.GeoDataFrame(
    uk_venues,
    geometry=[Point(v['lng'], v['lat']) for v in uk_venues],
    crs='EPSG:4326'
)

# Spatial join
uk_joined = gpd.sjoin(uk_points, la_gdf, how='left', predicate='within')
print(f"  Matched: {uk_joined['LAD24NM'].notna().sum()} / {len(uk_venues)}")

# Check unmatched (venues near coast may fall outside polygon)
unmatched = uk_joined[uk_joined['LAD24NM'].isna()]
print(f"  Unmatched (will use nearest): {len(unmatched)}")

# For unmatched, use nearest LA centroid
if len(unmatched) > 0:
    la_centroids = la_gdf.copy()
    la_centroids['centroid'] = la_gdf.geometry.centroid
    la_centroids_gdf = gpd.GeoDataFrame(la_centroids, geometry='centroid', crs='EPSG:4326')
    
    for idx, row in unmatched.iterrows():
        point = row.geometry
        distances = la_centroids_gdf.centroid.distance(point)
        nearest_idx = distances.idxmin()
        nearest = la_centroids_gdf.loc[nearest_idx]
        uk_joined.loc[idx, 'LAD24CD'] = nearest['LAD24CD']
        uk_joined.loc[idx, 'LAD24NM'] = nearest['LAD24NM']
    
    print(f"  After nearest fallback: {uk_joined['LAD24NM'].notna().sum()} matched")

# ─── STEP 6: Build output ──────────────────────────────────────────────────
print("\nBuilding output data...")

venue_politics = {}

# UK venues
for idx, row in uk_joined.iterrows():
    la_name = row.get('LAD24NM', '')
    la_code = row.get('LAD24CD', '')
    
    if not la_name:
        continue
    
    # Look up political control
    ctrl = UK_POLITICAL_CONTROL.get(la_name)
    if not ctrl:
        # Try normalised lookup
        for key in UK_POLITICAL_CONTROL:
            if key.lower() == la_name.lower():
                ctrl = UK_POLITICAL_CONTROL[key]
                break
    
    if ctrl:
        party_code, control_type = ctrl
    else:
        party_code, control_type = "NOC", "unknown"
    
    venue_name = row.get('name', '')
    venue_politics[venue_name + '|' + str(row.get('lat','')) + '|' + str(row.get('lng',''))] = {
        'venue_name': venue_name,
        'lat': row.get('lat'),
        'lng': row.get('lng'),
        'la_code': la_code,
        'la_name': la_name,
        'controlling_party': party_code,
        'party_name': PARTY_NAMES.get(party_code, party_code),
        'party_colour': PARTY_COLOURS.get(party_code, '#888888'),
        'control_type': control_type,
        'country': 'UK',
    }

# Ireland venues - use county from address as fallback
print(f"\nProcessing {len(ie_venues)} Ireland venues...")
for v in ie_venues:
    # Try to extract county from address
    address = v.get('address', '')
    city = v.get('city', '')
    county = 'Unknown'
    
    # Simple county extraction from address (Ireland addresses often end in county)
    for c in IRELAND_POLITICAL_CONTROL.keys():
        if c.lower() in address.lower() or c.lower() in city.lower():
            county = c
            break
    
    # Common city→county mappings
    city_county_map = {
        'Dublin': 'Dublin City',
        'Cork': 'Cork City',
        'Galway': 'Galway City',
        'Limerick': 'Limerick City and County',
        'Waterford': 'Waterford',
        'Drogheda': 'Louth',
        'Dundalk': 'Louth',
        'Bray': 'Wicklow',
        'Kilkenny': 'Kilkenny',
        'Sligo': 'Sligo',
        'Finglas': 'Dublin',
        'Blanchardstown': 'Fingal',
        'Tallaght': 'South Dublin',
        'Dun Laoghaire': 'Dun Laoghaire-Rathdown',
        'Clonmel': 'Tipperary',
        'Tralee': 'Kerry',
        'Athlone': 'Westmeath',
        'Ennis': 'Clare',
        'Letterkenny': 'Donegal',
        'Mullingar': 'Westmeath',
        'Wexford': 'Wexford',
        'Portlaoise': 'Laois',
        'Castlebar': 'Mayo',
    }
    
    if city in city_county_map and county == 'Unknown':
        county = city_county_map[city]
    
    ctrl = IRELAND_POLITICAL_CONTROL.get(county, ('NOC', 'unknown'))
    party_code, control_type = ctrl
    
    venue_key = v['name'] + '|' + str(v.get('lat','')) + '|' + str(v.get('lng',''))
    venue_politics[venue_key] = {
        'venue_name': v['name'],
        'lat': v.get('lat'),
        'lng': v.get('lng'),
        'la_code': county.replace(' ', '_').lower(),
        'la_name': county,
        'controlling_party': party_code,
        'party_name': IRELAND_PARTY_NAMES.get(party_code, party_code),
        'party_colour': IRELAND_PARTY_COLOURS.get(party_code, '#888888'),
        'control_type': control_type,
        'country': 'IE',
    }

# ─── STEP 7: Restructure as venue-keyed list ────────────────────────────────
print("\nRestructuring output...")

# Build indexed by venue name+coords for easy lookup
output = {
    'metadata': {
        'generated': '2026-03-03',
        'total_venues': len(venue_politics),
        'sources': [
            'ONS Local Authority District Boundaries May 2024',
            'UK council political control data (2024 local elections)',
            'Ireland local council elections 2024',
        ],
        'party_colours': {**PARTY_COLOURS, **IRELAND_PARTY_COLOURS},
        'party_names': {**PARTY_NAMES, **IRELAND_PARTY_NAMES},
    },
    'venues': list(venue_politics.values())
}

# ─── STEP 8: Stats ──────────────────────────────────────────────────────────
print("\n=== Stats ===")
from collections import Counter
parties = Counter(v['controlling_party'] for v in output['venues'])
for party, count in parties.most_common():
    name = {**PARTY_NAMES, **IRELAND_PARTY_NAMES}.get(party, party)
    print(f"  {name}: {count} venues")

unknown_la = [v for v in output['venues'] if not v['la_name'] or v['la_name'] == 'Unknown']
print(f"\nVenues with unknown LA: {len(unknown_la)}")
coverage = 1 - len(unknown_la) / len(output['venues'])
print(f"Coverage: {coverage:.1%}")

# Save output
with open('/home/claude/council_politics.json', 'w') as f:
    json.dump(output, f, separators=(',', ':'))

size_kb = len(json.dumps(output)) / 1024
print(f"\nOutput: council_politics.json ({size_kb:.0f} KB, {len(output['venues'])} venues)")
print("Done!")
