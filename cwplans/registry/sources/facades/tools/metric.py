"""Aspect correction for an affine-rectified patch, from the vanishing points and a focal length.
Returns sy/sx: multiply rectified vertical pixel lengths by this ratio (relative to horizontal) for metric aspect."""
import json,sys,numpy as np,cv2
sys.path.insert(0,'.')
import facade
def aspect(src,roi,f_ratio=None):
    img=cv2.imread(src); h,w=img.shape[:2]
    out,Ha,info=facade.rectify(img,roi)
    vv=np.array(info['vp_vertical']+[1.0]) if info['vp_vertical']!='inf' else None
    vh=np.array(info['vp_horizontal']+[1.0]) if info['vp_horizontal']!='inf' else None
    c=np.array([w/2,h/2]); L=max(w,h)
    f_orth=None
    if vv is not None and vh is not None:
        d=-np.dot(vv[:2]-c,vh[:2]-c)
        if d>0: f_orth=float(np.sqrt(d))
    fs={'orth':f_orth,'iphone26':0.722*L,'wide13':0.361*L}
    res={}
    for name,f in fs.items():
        if not f: continue
        K=np.array([[f,0,c[0]],[0,f,c[1]],[0,0,1]]); Ki=np.linalg.inv(K)
        r2=Ki@vv; r2/=np.linalg.norm(r2)
        r1=Ki@vh; r1/=np.linalg.norm(r1); r1=r1-np.dot(r1,r2)*r2; r1/=np.linalg.norm(r1)
        r3=np.cross(r1,r2)
        Hm=np.linalg.inv(K@np.c_[r1,r2,r3])
        T=Hm@np.linalg.inv(Ha)
        # local linear part at rect centre
        rc=np.array([out.shape[1]/2,out.shape[0]/2,1.0])
        def m(p): q=T@p; return q[:2]/q[2]
        p0=m(rc); px=m(rc+[1,0,0]); py=m(rc+[0,1,0])
        sx=np.linalg.norm(px-p0); sy=np.linalg.norm(py-p0)
        res[name]=dict(f_px=round(f,1),f_over_long=round(f/L,3),aspect_sy_over_sx=round(float(sy/sx),3))
    return res
if __name__=='__main__':
    rois=json.load(open('rois.json')); meas=json.load(open('meas.json')); out={}
    for k in sys.argv[1:] or meas:
        c=rois[k]; img=cv2.imread(c['src']); h,w=img.shape[:2]; f=c['roi']
        roi=[int(f[0]*w),int(f[1]*h),int(f[2]*w),int(f[3]*h)]
        try: out[k]=aspect(c['src'],roi)
        except Exception as e: out[k]={'error':str(e)}
        print(k,out[k])
    json.dump(out,open('aspect.json','w'),indent=1)
