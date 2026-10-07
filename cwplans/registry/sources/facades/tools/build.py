import json,cv2,os,shutil
R='/home/user/glitchcan-minigam/magpie/cwplans/data/raw/facades'
rois=json.load(open('rois.json')); asp=json.load(open('aspect.json')); meas=json.load(open('meas.json'))
H={'cwb-0413':(195,50),'cwb-0577':(233,75),'cwb-0451':(220,58),'cwb-0715':(214.5,68),'cwb-0590':(205,57),'cwb-0520':(200,45),'cwb-0417':(200,45),'cwb-0647':(187.2,55),'cwb-0813':(182,54),'cwb-0712':(192.4,56),'cwb-0645':(168,50),'cwb-0424':(156,32),'cwb-0582':(153,33),'cwb-0585':(153,33),'cwb-0589':(151,32),'cwb-0701':(121,39),'cwb-0525':(130,23),'cwb-0317':(111,33)}
# key: (cwb, bay_px, floor_px, aspect_mode, face, face_m, face_px, face_how)
S={
'ocs-a':('cwb-0413',50,59.1,'orth','W',59.0,993,'Cabot Square fountain in the foreground; HSBC to the left (north), Citi to the right (south)'),
'ocs-b':('cwb-0413',37,31.3,'orth','S',None,None,'Thomson Reuters building (30 South Colonnade, south-west of the tower) on the left; a sister shot by the same view (39878263614) is geotagged 72 m SSW'),
'hsbc-cabot':('cwb-0417',17.6,39.9,'iphone26','W',59.4,712,'same Cabot Square view as ocs-a'),
'hsbc-e':('cwb-0417',33,77,'iphone26','unknown',None,None,'no geotag; sunlit face at 14:29 in March, so probably S or W'),
'citi-cabot':('cwb-0520',53,41,'orth','W',None,None,'same Cabot Square view as ocs-a'),
'citi-top':('cwb-0520',129,96,'iphone26','unknown',None,None,'no geotag'),
'pinnacle-edge':('cwb-0577',None,57.3,'orth','N or S',None,None,'narrow end face; OSM footprint narrow sides (24.5 m) face north and south'),
'pinnacle-mercury':('cwb-0577',20,50,'iphone26','E or W',48.6,1029,'long face; OSM footprint long sides (48.6 m) face east and west'),
'hampton-sqp':('cwb-0715',None,32,'orth','N',None,None,'dock water in the foreground; South Dock lies north of the tower'),
'newf-diagrid':('cwb-0451',65,173,'iphone26','W',None,None,'Flickr geotag 108 m west of the tower centroid'),
'newf-dock':('cwb-0451',None,29,'iphone26','E',None,None,'view west along Middle Dock with the DLR bridge in the foreground'),
'wardian-a':('cwb-0645',85,75,'iphone26','unknown',None,None,'no geotag'),
'amory':('cwb-0813',51,54,'orth','unknown',None,None,'no geotag'),
'ocp':('cwb-0424',77,112,'iphone26','unknown',None,None,'no geotag; Barclays sign on this face'),
'novotel':('cwb-0701',None,99,'orth','N',None,None,'Flickr geotag 17 m from the centroid, bearing 169 (close range, low confidence)'),
'opd':('cwb-0590',None,55,'orth','unknown',None,None,'cylindrical tower; a homography only flattens a narrow vertical strip'),
'ubs10':('cwb-0589',67,49,'orth','S',None,None,'HSBC crown visible to the north-east; dock railing in the foreground'),
'harcourt':('cwb-0712',42,None,'orth','unknown',33.0,586,'no geotag'),
'bank25':('cwb-0582',46,58,'orth','N',None,None,'Flickr geotag 22 m north of the centroid (close range)'),
'bank25-b':('cwb-0582',19,40,'orth','unknown',None,None,'seen from beyond the DLR viaduct; no geotag'),
'bank40':('cwb-0585',90,95,'orth','W',None,None,'Flickr geotag 23 m north-west of the centroid (close range)'),
'ch25':('cwb-0525',47,38,'iphone26','unknown',None,None,'no geotag; seen across water'),
'wiq1':('cwb-0317',43,104,'iphone26','E',None,None,'Flickr geotag 16 m from the centroid (close range, low confidence)'),
}
out={}
for k,(b,bpx,fpx,mode,face,fm,fpxw,how) in S.items():
    a=asp[k]; am=a.get(mode) or a['iphone26']
    if mode=='orth' and not (0.5<=am['f_over_long']<=1.5): am=a['iphone26']; mode='iphone26'
    ar=am['aspect_sy_over_sx']
    h,n=H[b]; floor_assumed=round(h/n,2)
    r=dict(building=b,src=rois[k]['src'],face=face,face_how=how,bay_px=bpx,floor_px=fpx,aspect=ar,aspect_from=mode,f_over_long=am['f_over_long'],floor_m_assumed=floor_assumed,colours=meas[k]['colours'],patch_px=meas[k]['patch_px'])
    if bpx and fpx: r['bay_m_from_floor']=round(floor_assumed*bpx/(fpx*ar),2)
    if fm and fpxw and bpx:
        r['bays_across_face']=round(fpxw/bpx,1); r['bay_m_from_width']=round(fm*bpx/fpxw,2)
        if fpx: r['floor_m_measured']=round(r['bay_m_from_width']*fpx*ar/bpx,2)
    # write metric-aspect patch
    p=cv2.imread(f'work/{k}-patch.jpg'); hh,ww=p.shape[:2]
    p2=cv2.resize(p,(ww,int(round(hh*ar))),interpolation=cv2.INTER_CUBIC)
    s=min(1.0,2048/max(p2.shape[:2])); 
    if s<1: p2=cv2.resize(p2,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
    os.makedirs(f'{R}/{b}',exist_ok=True)
    fn=f'{R}/{b}/rect-{k}.jpg'; cv2.imwrite(fn,p2,[cv2.IMWRITE_JPEG_QUALITY,90]); r['rect_file']=fn.split('magpie/cwplans/')[1]; r['rect_px']=[p2.shape[1],p2.shape[0]]
    out[k]=r
    print(k,b,face,'bay_w',r.get('bay_m_from_width'),'bay_f',r.get('bay_m_from_floor'),'floor_meas',r.get('floor_m_measured'),'floor_ass',floor_assumed,'asp',ar,mode)
json.dump(out,open('results.json','w'),indent=1)
