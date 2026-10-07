import json,os
D=os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))  # cwplans/registry/sources/facades
res=json.load(open('results.json')); fp=json.load(open('footprints.json'))
P=json.load(open(f'{D}/photos.json'))
pages={}
for i in P['images']:
    if i['building']: pages.setdefault(i['building'],[]).append(i['page'])
WP='https://en.wikipedia.org/wiki/'
def col(k,g,f,s): # pick cluster hex by index from a patch's k-means result
    c=res[k]['colours']; return [c[g]['hex'] if g is not None else None, c[f]['hex'] if f is not None else None, c[s]['hex'] if s is not None else None]
B={}
def add(cid,**kw):
    kw.setdefault('measured',[]); kw.setdefault('judged',[]); kw.setdefault('sources',[])
    kw['sources']=list(dict.fromkeys(kw['sources']+pages.get(cid,[])))
    f=fp.get(cid,{})
    if f.get('side_a_m'): kw['footprint_obb_m']=dict(side_a=f['side_a_m'],side_a_bearing=f['side_a_bearing'],side_b=f['side_b_m'],side_b_bearing=f['side_b_bearing'],from_osm=f['osm'],note='oriented bounding box of the OSM outline (ODbL); used only as a scale for bay widths')
    B[cid]=kw
def m(k): r=res[k]; return {x:r.get(x) for x in ('bay_px','floor_px','aspect','aspect_from','bay_m_from_floor','bay_m_from_width','bays_across_face','floor_m_measured','floor_m_assumed','face','rect_file')}
g,f,s=col('ocs-a',2,0,0)
add('cwb-0413',name='One Canada Square',wikidata='Q503477',architect='César Pelli & Associates (with Adamson Associates, Frederick Gibberd Coombes)',completed=1991,floors=50,height_m=235,
 cladding='stainless steel with a linen finish; punched square windows (each with a central mullion) in a regular grid; re-entrant stepped corners',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=2.97,floor_m=4.07,emphasis='grid',
 crown='40 m square-based stainless steel pyramid with an aircraft warning beacon at the apex',setbacks='none on the shaft; stepped (notched) corners full height',
 night_lighting='pyramid lit by programmable fluorescent tubes; office windows lit in a grid',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m','floor_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],
 measurement=dict(patches=[m('ocs-a'),m('ocs-b')],check='19.9 window bays measured across the west face against 19.8 known (3,960 windows / 50 floors / 4 faces): +0.5%. Bay 59.0 m / 19.9 = 2.97 m. Floor height from the metric aspect: 4.07 m (ocs-a) and 4.0 m (ocs-b) against an assumed 3.9 m ((235 - 40 m pyramid) / 50): +2 to +4%.',colour_note='k-means (overcast light): #bdc5c3 steel 52%, #6e7e78 glass with sky reflection 33%, #434f4b glass in shade 16%'),
 sources=[WP+'One_Canada_Square'])
g,f,s=col('pinnacle-edge',0,2,1)
add('cwb-0577',name='Landmark Pinnacle',wikidata='Q16258428',architect='Squire and Partners',completed=2020,floors=75,height_m=234,height_note='Wikipedia gives 233 m and 76 storeys (75 habitable)',
 cladding='full-height unitised glass curtain wall, dark blue-grey and highly reflective; narrow vertical panels about 0.95 m; dark recessed vertical slots on the corners and in the centre of the end faces with light metal edge bands',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=0.95,floor_m=3.02,emphasis='horizontal',
 crown='flat top with a glass balustrade around the sky garden on level 75; plant screened by glazing',setbacks='none; slender rectangular slab with chamfered/slotted corners',
 night_lighting='residential windows lit irregularly; red aviation lights on the roof (seen in other towers nearby, not confirmed here)',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m','floor_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],
 measurement=dict(patches=[m('pinnacle-edge'),m('pinnacle-mercury')],check='panel width 0.94 m from the face width (48.6 m OSM long side / 51.5 panels) and 0.97 m from the assumed floor height (233 / 75 = 3.11 m) and the metric aspect: agree within 3%. Measured floor height 3.02 m against 3.11 m assumed: -3%.'),
 sources=[WP+'Landmark_Pinnacle'])
g,f,s=col('newf-dock',0,1,2)
add('cwb-0451',name='Newfoundland',wikidata='Q15917518',architect='Horden Cherry Lee (design); Adamson Associates (executive)',completed=2021,floors=58,height_m=220,
 cladding='structural steel diagrid exoskeleton clad in light grey/white metal ("the diamond tower") over grey glazing with narrow panes (about 1.35 m) and dark spandrel panels; rounded corners on the long faces',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=1.35,floor_m=3.79,emphasis='grid',pattern='diagrid: diamonds about 3.5 across the narrow face; a crossing node every 8 to 9 floors (measured 1475 px / 173 px per floor in newf-diagrid)',
 crown='diagrid runs to the roof and closes in a triangulated band; flat roof',setbacks='none; plan tapers slightly towards the top (judged from the aerials)',
 night_lighting='diagrid lit in changing colours during the Winter Lights festival (Bex Walton, Flickr 50871287957, not downloaded); otherwise residential windows',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting','pattern'],assumed=['floor_m'],
 measurement=dict(patches=[m('newf-diagrid'),m('newf-dock')],note='newf-diagrid is a black-and-white photo: geometry only, no colour. Floor height 3.79 m = 220 / 58 includes the crown and podium, so it is an upper bound.'),
 sources=[WP+'Newfoundland,_London'])
g,f,s=col('hampton-sqp',0,1,2)
add('cwb-0715',name='Hampton Tower (South Quay Plaza 1)',wikidata='Q56300795',architect='Foster + Partners',completed=2021,floors=68,height_m=214,height_note='Wikipedia: 214.5 m',
 cladding='unitised curtain wall with triple glazing and stainless steel cladding (Yuanda); blue-grey glass with a dark horizontal louvre/vent band on each floor; faceted plan with deep black vertical slots dividing the faces; winter gardens',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=None,floor_m=3.15,emphasis='vertical',
 crown='top floors fully flush-glazed (no louvre band); stepped faceted top in tiers',setbacks='faces step back in tiers near the top (judged from Commons photo by Mortadella42)',
 night_lighting='residential windows; no feature lighting seen',
 measured=['glass_hex','frame_hex','spandrel_hex'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('hampton-sqp')],note='floor period measured (32 px, very clean) but no face width is visible to give a scale; bay not measured (panes too fine at this distance). Floor height 214.5 / 68 assumed.'),
 sources=[WP+'South_Quay_Plaza','https://www.yuanda-europe.com/en/projects/south-quay-plaza/'])
g,f,s=col('opd',0,1,2)
add('cwb-0590',name='One Park Drive',wikidata='Q29378816',architect='Herzog & de Meuron (Adamson Associates executive)',completed=2021,floors=57,height_m=205,
 cladding='cylindrical tower; three apartment types expressed as different window rhythms (deep loggias in an irregular checker pattern, bay windows, wide panoramic bands at the top); light grey/white frames and balcony edges, dark glass',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=None,floor_m=3.6,emphasis='grid',
 crown='flat top; the top floors (duplex penthouses, floors 55-57) have wider continuous glazing',setbacks='none; the pattern changes with height instead (checkerboard loggias low, larger openings high)',
 night_lighting='residential windows; dense irregular pattern',
 measured=['glass_hex','frame_hex','spandrel_hex'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('opd')],note='a cylinder cannot be rectified by one homography; the patch is only valid in a narrow vertical strip. Diameter about 43 m (OSM). Floor height 205 / 57 assumed.'),
 sources=[WP+'One_Park_Drive'])
g,f,s=col('citi-cabot',0,1,2)
add('cwb-0520',name='Citigroup Centre (25 Canada Square)',wikidata='Q867663',architect='César Pelli & Associates (Adamson Associates executive)',completed=2001,floors=45,height_m=200,
 cladding='blue-green glass curtain wall with projecting stainless steel vertical fins about every 5 m and finer mullions between (about 3-4 panes per fin bay); lower blocks at the base',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=5.0,floor_m=4.44,emphasis='vertical',
 crown='set-back two-storey crown box with an open metal frame/cornice and "citi" signs on the faces',setbacks='crown set back from the shaft; stepped lower wings',
 night_lighting='illuminated citi logos on the crown',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('citi-cabot'),m('citi-top')],note='bay_m is the major fin spacing (5.0 and 5.4 m from two photos), derived from the assumed 4.44 m floor height (200/45, includes crown) and the metric aspect; low-medium confidence.'),
 sources=[WP+'Citigroup_Centre_(London)'])
g,f,s=col('hsbc-cabot',0,2,1)
add('cwb-0417',name='8 Canada Square (HSBC Tower)',wikidata='Q572887',architect='Foster + Partners',completed=2002,floors=45,height_m=200,
 cladding='about 4,900 glass panels; pale grey-green glass with alternating bands of vision glass and lighter opaque spandrel glass on every floor; fine vertical mullions about 1.5 m apart',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=1.47,floor_m=3.92,emphasis='horizontal',
 crown='flat top with plant behind a glazed band; HSBC lettering and red-and-white hexagon logo high on all four faces',setbacks='none',
 night_lighting='HSBC signs: black by day, lit white at night (LED polycarbonate since 2013-14)',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m','floor_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],
 measurement=dict(patches=[m('hsbc-cabot'),m('hsbc-e')],check='bay 1.47 m from the west face width (59.4 m OSM / 40.5 mullion bays); 1.57-1.66 m from the assumed floor height. Measured floor height 3.92 m against 4.44 m assumed (200/45 includes crown and plant): -12%.'),
 sources=[WP+'8_Canada_Square'])
g,f,s=col('wardian-a',2,1,0)
add('cwb-0647',name='Bagshaw Building (Wardian East)',wikidata=None,architect='Glenn Howells Architects',completed=2020,floors=55,height_m=184,height_note='Wikipedia: East tower 187.2 m, 55 storeys',
 cladding='same as Wardian West: continuous white/light-grey slab edges and balcony bands on every floor over dark glass; balconies with planting',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=2.95,floor_m=3.36,emphasis='horizontal',
 crown='flat top; top floors slightly set back behind the bands',setbacks='slab edges step in and out between floors, giving a ribbed profile; podium links the two towers',
 night_lighting='residential windows behind the bands',
 measured=[],judged=['cladding','emphasis','crown','setbacks','night_lighting','glass_hex','frame_hex','spandrel_hex','bay_m','floor_m'],
 measurement=dict(note='no usable rectified patch of the east tower (photo 55175159283 too steep and occluded by trees); values copied from Wardian West (cwb-0645) by judgement, both towers share one design.'),
 sources=[WP+'Wardian_London'])
g,f,s=col('amory',0,2,1)
add('cwb-0813',name='Amory Tower',wikidata='Q130758506',architect='Make Architects',completed=2021,floors=54,height_m=182,height_note='Wikipedia: 55 storeys; Wikidata: 53',
 cladding='dark blue-grey glass with vertical fins in a moiré pattern (fin spacing varies, about 0.65 m); cut-throughs for amenity floors',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=2.4,floor_m=3.37,emphasis='vertical',
 crown='flat top; slight lift of the upper floors (cut-through amenity level near the top)',setbacks='a recessed amenity cut-through low on the shaft (16th floor club) and corner reveals',
 night_lighting='residential windows',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('amory')],note='bay 2.35 m from the assumed floor height (182/54) and metric aspect; the moiré fin rhythm (about 0.65 m) is irregular by design.'),
 sources=[WP+'Amory_Tower'])
g,f,s=col('harcourt',1,0,2)
add('cwb-0712',name='Harcourt Tower (Harcourt Gardens, South Quay Plaza 4)',wikidata=None,architect='Foster + Partners',completed=2024,floors=56,height_m=169,height_note='Wikipedia gives Harcourt Gardens 192.4 m, 56 storeys; the registry 169 m disagrees — not patched here',
 cladding='cream/off-white vertical fins (stone-coloured) about 2.4 m apart over dark grey glass; fins read grey when backlit',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=2.37,floor_m=3.44,emphasis='vertical',
 crown='fins rise above the roof as a castellated crown; open sky-garden storey a few floors below the top',setbacks='a recessed open sky-garden band near the top; shaft otherwise straight',
 night_lighting='residential windows; sky-garden band lit (judged)',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('harcourt')],note='fin spacing from the face width (OSM about 33 m / 14 fins); floor period not clean (fins dominate). floor_m = 192.4/56.'),
 sources=[WP+'South_Quay_Plaza'])
g,f,s=col('wardian-a',2,1,0)
add('cwb-0645',name='Wardian London (West tower)',wikidata='Q19870793',architect='Glenn Howells Architects',completed=2020,floors=50,height_m=168,
 cladding='continuous white/light-grey slab edges and balcony bands on every floor (balustrade panels about 1 m) over dark glass; deep shadow under each band',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=2.95,floor_m=3.36,emphasis='horizontal',
 crown='flat top',setbacks='slab edges vary slightly floor to floor (ribbed profile); podium links to the east tower',
 night_lighting='residential windows behind the bands',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('wardian-a')],note='bay 2.95 m (85 px period) from the assumed floor height 168/50; a 29 px period is the balustrade panel rhythm (about 1.0 m). Colour: #010506 is the deep shadow under the bands, not a material.'),
 sources=[WP+'Wardian_London'])
add('cwb-0658',name='40 Charter Street',wikidata='Q136227841',architect='Kohn Pedersen Fox',completed=None,completed_note='topped out; Wikipedia gives completion February 2027 (estimated)',floors=53,height_m=160,height_note='Wikipedia: 178.6 m',
 cladding='dark charcoal panels with punched windows in undulating (wavy) horizontal bands; Juliet balconies; rounded corners',
 glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis='horizontal',
 crown='flat top, the wave pattern continues to the parapet',setbacks='none; undulating plan outline',night_lighting=None,
 measured=[],judged=['cladding','emphasis','crown','setbacks'],
 measurement=dict(note='no open image found; facts from looking at Commons "40 Charter Street, 29 August 2025.jpg" (CC BY-SA 4.0, Coz4836).'),
 sources=[WP+'40_Charter_Street','https://commons.wikimedia.org/wiki/File:40_Charter_Street,_29_August_2025.jpg'])
g,f,s=col('ocp',0,1,2)
add('cwb-0424',name='One Churchill Place (Barclays)',wikidata='Q138768',architect='HOK',completed=2004,floors=32,height_m=156,
 cladding='blue-green glass curtain wall with lighter horizontal spandrel bands at every floor and paired vertical mullions; plant floors at the top',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=3.4,floor_m=4.88,emphasis='horizontal',
 crown='flat top with plant and building-maintenance cranes; BARCLAYS sign and eagle logo near the top',setbacks='none',
 night_lighting='Barclays sign lit',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('ocp')],note='bay 3.4 m is a two-pane module (77 px) from the assumed floor height 156/32 = 4.88 m (includes plant); medium confidence.'),
 sources=[WP+'One_Churchill_Place'])
g,f,s=col('bank25-b',1,2,0)
add('cwb-0582',name='25 Bank Street (J.P. Morgan)',wikidata='Q138752',architect='César Pelli (Adamson Associates)',completed=2004,floors=33,height_m=153,
 cladding='grey glass curtain wall with fine vertical mullions about 1.7 m apart and slightly lighter spandrel bands; flat, reflective',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=1.7,floor_m=4.64,emphasis='grid',
 crown='flat top with a J.P. Morgan sign (Lehman Brothers before 2010; CHASE sign seen in the 2026 aerial)',setbacks='stepped lower wing on one side',
 night_lighting='sign lit',
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('bank25'),m('bank25-b')],check='bay 1.74 m and 1.61 m from two photos (2011 and 2016), both from the assumed floor height 153/33: they differ by 8%.'),
 sources=[WP+'25_Bank_Street'])
g,f,s=col('bank40',2,0,1)
add('cwb-0585',name='40 Bank Street',wikidata='Q138755',architect='César Pelli',completed=2003,floors=33,height_m=153,
 cladding='dark grey metal and glass grid with square punched-looking windows (similar order to One Canada Square but darker)',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=3.37,floor_m=4.64,emphasis='grid',
 crown='flat top',setbacks='stepped corner bays',night_lighting=None,
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks'],assumed=['floor_m'],
 measurement=dict(patches=[m('bank40')],note='photo from 2011 (newest open image found). bay from the assumed floor height 153/33.'),
 sources=[WP+'40_Bank_Street'])
g,f,s=col('ubs10',0,2,1)
add('cwb-0589',name='10 Upper Bank Street',wikidata='Q138760',architect='Kohn Pedersen Fox',completed=2003,floors=32,height_m=151,
 cladding='blue glass curtain wall on the main faces framed by silver full-height vertical fins at the edges; the side face is covered by dense vertical silver louvres',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=None,floor_m=4.72,emphasis='vertical',
 crown='glazed top storeys with a projecting silver fin frame at the corners',setbacks='corner fins project above the roof line',
 night_lighting=None,
 measured=['glass_hex'],judged=['cladding','emphasis','crown','setbacks','frame_hex','spandrel_hex'],assumed=['floor_m'],
 measurement=dict(patches=[m('ubs10')],note='blue sky reflection dominates the colour; the 67 px period (3.4 m) is probably a two-pane module, low confidence, not reported as bay_m. frame_hex #96b1dd is reflection, not the silver fin.'),
 sources=[WP+'10_Upper_Bank_Street'])
add('cwb-0659',name='50-60 Charter Street',wikidata=None,architect=None,completed=None,floors=None,height_m=151,cladding=None,glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis=None,crown=None,setbacks=None,night_lighting=None,
 measurement=dict(note='no image and no text source found in this pass'))
add('cwb-0592',name='10 Park Drive',wikidata=None,architect=None,completed=None,floors=None,height_m=149,
 cladding='dark glass with fine vertical lines (seen beside One Park Drive in the 2026 aerial 55427645026)',glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis='vertical',crown='flat top (aerial)',setbacks=None,night_lighting=None,judged=['cladding','emphasis','crown'],
 measurement=dict(note='seen only small in an aerial'))
add('cwb-0801',name='Pan Peninsula',wikidata='Q3070493',architect='Skidmore, Owings & Merrill (judged, not verified in a source this pass)',completed=2009,floors=48,height_m=147,
 cladding='two towers; white/silver glass curtain wall with projecting balconies and vertical white fins; East tower stepped profile',
 glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis='vertical',
 crown='stepped top with a lit crown band on the East tower',setbacks='stepped upper floors',night_lighting='crown band lit (judged from memory of the area, unverified)',judged=['architect','cladding','emphasis','crown','setbacks','night_lighting'],
 measurement=dict(note='two open photos (2012, 2015) are small or occluded; not rectified'),sources=[WP+'Pan_Peninsula'])
g,f,s=col('wiq1',0,2,1)
add('cwb-0514',name='One Bank Street',wikidata='Q131225851',architect=None,completed=2019,floors=28,height_m=143,
 cladding='curved glass facade with dense vertical light-grey fins, bowed in plan and section ("oddly shaped"); Société Générale logo on the top',
 glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis='vertical',
 crown='flat roof with photovoltaic panels (aerial 55427645026)',setbacks='curved setback profile on the west face',night_lighting='logo lit',
 judged=['cladding','emphasis','crown','setbacks','night_lighting'],
 measurement=dict(note='curved facade; homography rectification failed; photos 51155384484, 53252111692 kept as references'))
add('cwb-0641',name='22 Marsh Wall (Landmark East)',wikidata='Q4631317',architect='Squire and Partners',completed=2010,floors=44,height_m=140,cladding=None,glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis=None,crown=None,setbacks=None,night_lighting=None,
 measurement=dict(note='no open image found; Commons P18 is a 2009 CC BY-SA photo, not looked at in detail'),sources=[WP+'24_Marsh_Wall'])
add('cwb-0963',name='Maine Tower (Harbour Central)',wikidata='Q20713829',architect=None,completed=2020,floors=41,height_m=140,
 cladding='blue glass in bronze-brown aluminium frames grouped into offset four-storey blocks; a recessed balcony column on the main face',
 glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis='grid',crown='open frame at the top (top storey frame without glass)',setbacks='blocks shift a little in and out',night_lighting=None,
 judged=['cladding','emphasis','crown','setbacks'],measurement=dict(note='reference-only: Commons "Harbour Central Maine Tower.jpg" (CC BY-SA 4.0, Caledonianl, 2019)'),sources=[WP+'Maine_Tower','https://commons.wikimedia.org/wiki/File:Harbour_Central_Maine_Tower.jpg'])
add('cwb-0830',name='One Thames Quay',wikidata=None,architect=None,completed=None,floors=46,height_m=139,cladding=None,glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis=None,crown=None,setbacks=None,night_lighting=None,measurement=dict(note='no image found in this pass'))
add('cwb-0343',name='Charrington Tower (Providence Tower)',wikidata='Q18161291',architect=None,completed=2019,floors=44,height_m=136,cladding=None,glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis=None,crown=None,setbacks=None,night_lighting=None,
 measurement=dict(note='Commons P18 is a 426 px CC BY-SA photo; not enough for facts'),sources=[WP+'Charrington_Tower'])
g,f,s=col('ch25',0,1,2)
add('cwb-0525',name='25 Churchill Place',wikidata='Q4632156',architect='Kohn Pedersen Fox',completed=2014,floors=23,height_m=130,
 cladding='pale blue glass curtain wall with white horizontal spandrel bands at each floor and white vertical mullion lines; white frame at the edges',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=None,floor_m=5.65,emphasis='horizontal',crown='flat top with a glazed plant screen',setbacks='none',night_lighting=None,
 measured=['glass_hex','frame_hex','spandrel_hex'],judged=['cladding','emphasis','crown','setbacks'],assumed=['floor_m'],
 measurement=dict(patches=[m('ch25')],note='bay not reported: the period/aspect gives 6.6 m, which is not plausible; floor_m = 130/23 includes a tall roof storey.'),sources=[WP+'25_Churchill_Place'])
add('cwb-0593',name='Vertus (10 George Street)',wikidata=None,architect=None,completed=None,floors=37,height_m=122,cladding=None,glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis=None,crown=None,setbacks=None,night_lighting=None,measurement=dict(note='no image found in this pass'))
g,f,s=col('novotel',1,2,0)
add('cwb-0701',name='Novotel London Canary Wharf',wikidata='Q111369012',architect=None,completed=2017,floors=39,height_m=121,
 cladding='glass tower in a random patchwork of light and mid blue panels; gold/yellow metal-clad lower block',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=None,floor_m=3.1,emphasis='grid',crown='NOVOTEL sign near the top; flat top with a frame',setbacks='lower gold block projects at the base',night_lighting='sign lit',
 measured=['glass_hex','frame_hex','spandrel_hex'],judged=['cladding','emphasis','crown','setbacks','night_lighting'],assumed=['floor_m'],
 measurement=dict(patches=[m('novotel')],note='photo taken looking steeply up from 17 m; aspect correction 2.7 is large; bay not reported'))
add('cwb-0966',name='Sirocco Tower',wikidata=None,architect=None,completed=None,floors=35,height_m=120,cladding=None,glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis=None,crown=None,setbacks=None,night_lighting=None,measurement=dict(note='no image found in this pass'))
g,f,s=col('wiq1',1,2,0)
add('cwb-0317',name='1 West India Quay',wikidata='Q2813525',architect='HOK',completed=2004,floors=33,height_m=111,
 cladding='curved (lens-shaped) glass curtain wall with continuous light-grey horizontal balcony/sunshade bands at every floor; mid-grey glass',
 glass_hex=g,frame_hex=f,spandrel_hex=s,bay_m=1.21,floor_m=3.36,emphasis='horizontal',crown='curved flat top',setbacks='none',night_lighting=None,
 measured=['glass_hex','frame_hex','spandrel_hex','bay_m'],judged=['cladding','emphasis','crown','setbacks'],assumed=['floor_m'],
 measurement=dict(patches=[m('wiq1')],note='curved face: only the flattest part was used; photo 2011.'),sources=[WP+'1_West_India_Quay'])
add('cwb-0737',name='Dollar Bay',wikidata='Q44750696',architect=None,completed=2017,floors=32,height_m=109,
 cladding='blue-green reflective glass; faceted, prism-like volumes',glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis='vertical',crown='angled faceted top',setbacks='faceted planes',night_lighting=None,
 judged=['cladding','emphasis','crown','setbacks'],measurement=dict(note='reference-only: Commons "Dollar Bay.jpg" (CC BY-SA 4.0, mattbuck, 2016, under construction)'),sources=['https://commons.wikimedia.org/wiki/File:Dollar_Bay.jpg'])
add('cwb-0459',name='33 Canada Square',wikidata='Q47661781',architect='Foster + Partners',completed=1999,floors=18,height_m=105,
 cladding='grey glass curtain wall with rounded glazed corners and fine mullions (Citi building beside 25 Canada Square)',glass_hex=None,frame_hex=None,spandrel_hex=None,bay_m=None,floor_m=None,emphasis='grid',crown='flat top',setbacks=None,night_lighting=None,
 judged=['cladding','emphasis','crown'],measurement=dict(note='one open photo (2011, close range, 6453670559) kept; not rectified'),sources=[WP+'Citigroup_Centre_(London)'])
order=['cwb-0413','cwb-0577','cwb-0451','cwb-0715','cwb-0590','cwb-0520','cwb-0417','cwb-0647','cwb-0813','cwb-0712','cwb-0645','cwb-0658','cwb-0424','cwb-0582','cwb-0585','cwb-0589','cwb-0659','cwb-0592','cwb-0801','cwb-0514','cwb-0641','cwb-0963','cwb-0830','cwb-0343','cwb-0525','cwb-0593','cwb-0701','cwb-0966','cwb-0317','cwb-0737','cwb-0459']
assert set(order)==set(B), set(order)^set(B)
out=dict(about='Facade facts for the Canary Wharf towers of 100 m and over (registry cwb- ids), for texturing the 3D model. Each building lists which fields were measured from open (CC0/PDM/CC BY) photos, which were judged by looking at photos (including CC BY-SA and other reference-only images: facts, not pixels), and which are assumptions.',
 checked='2026-10-03',
 method=dict(
  rectification='OpenCV LSD line segments inside a hand-chosen region of the facade; RANSAC vanishing points for near-vertical and near-horizontal segments; homography that sends the vanishing line to infinity and makes both directions axis-aligned (affine rectification). Orientation forced so the region keeps top and left.',
  metric_aspect='The affine result has an unknown aspect. A focal length (from the two vanishing points when plausible, else 0.722 x long side = 26 mm-equivalent phone lens) gives the plane orientation and a vertical/horizontal scale ratio; rect-*.jpg files are resampled with it. The ratio changed by less than 10% between 13 mm and 26 mm lenses for most photos.',
  periods='Mean absolute Sobel gradient per column and per row; autocorrelation peaks (FFT cross-check); the fundamental chosen by judgement after looking at the patch with period ticks.',
  metres='floor_m: height/floors (stated as assumed) unless a face width gives a scale; bay_m from OSM face width / bay count where the whole face is visible, else floor_m x bay_px / (floor_px x aspect). Where both exist they are compared in measurement.check.',
  colours='k-means (k=3) in Lab on the rectified patch; cluster roles (glass/frame/spandrel) assigned by judgement. Colours depend on light and sky reflection.'),
 error=dict(one_canada_square='bay count 19.9 vs 19.8 known (+0.5%); floor height +2 to +4% vs assumption',landmark_pinnacle='panel width two ways agree within 3%',hsbc='floor height -12% vs height/floors (which includes crown and plant)'),
 buildings={k:B[k] for k in order})
json.dump(out,open(f'{D}/facades.json','w'),indent=1,ensure_ascii=False)
print(len(B))
