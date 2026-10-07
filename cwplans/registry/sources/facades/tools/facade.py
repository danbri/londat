"""Facade rectification and measurement.
usage: facade.py <img> <out_prefix> x0 y0 x1 y1  (ROI on the facade, original px)
Detects line segments (OpenCV LSD) in the ROI, fits the vertical vanishing point and the
horizontal vanishing point by RANSAC on segment lines, builds a rectifying homography,
warps the ROI, then measures horizontal and vertical periods by autocorrelation and
dominant colours by k-means. Prints JSON."""
import sys,json,cv2,numpy as np
from sklearn.cluster import KMeans
rng=np.random.default_rng(0)
def seg_lines(gray):
    lsd=cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    lines=lsd.detect(gray)[0]
    return np.zeros((0,4)) if lines is None else lines.reshape(-1,4)
def vp_ransac(segs,iters=3000,tol_deg=1.0):
    if len(segs)<2: return None,0
    p1=np.c_[segs[:,:2],np.ones(len(segs))]; p2=np.c_[segs[:,2:],np.ones(len(segs))]
    L=np.cross(p1,p2); L/=np.linalg.norm(L[:,:2],axis=1)[:,None]
    mid=(segs[:,:2]+segs[:,2:])/2; d=segs[:,2:]-segs[:,:2]; ln=np.linalg.norm(d,axis=1); d/=ln[:,None]
    best=(None,-1,None)
    for _ in range(iters):
        i,j=rng.choice(len(segs),2,replace=False)
        v=np.cross(L[i],L[j])
        if abs(v).max()==0: continue
        # direction from segment midpoint to vp
        if abs(v[2])>1e-9:
            vp=v[:2]/v[2]; dv=vp-mid
        else:
            dv=np.tile(v[:2],(len(segs),1))
        dv/=np.linalg.norm(dv,axis=1)[:,None]+1e-12
        ang=np.degrees(np.arccos(np.clip(abs((dv*d).sum(1)),0,1)))
        inl=ang<tol_deg; score=ln[inl].sum()
        if score>best[1]: best=(v,score,inl)
    v,score,inl=best
    # refine: least squares on inlier lines (smallest singular vector)
    A=L[inl]*ln[inl,None]
    _,_,vt=np.linalg.svd(A); v=vt[-1]
    return v/np.linalg.norm(v),int(inl.sum())
def rectify(img,roi):
    x0,y0,x1,y1=roi
    sub=img[y0:y1,x0:x1]
    gray=cv2.cvtColor(sub,cv2.COLOR_BGR2GRAY)
    segs=seg_lines(gray)
    d=segs[:,2:]-segs[:,:2]; ln=np.linalg.norm(d,axis=1); keep=ln>max(12,0.02*min(sub.shape[:2]))
    segs=segs[keep]; d=d[keep]
    ang=np.degrees(np.arctan2(d[:,1],d[:,0]))%180
    vert=segs[abs(ang-90)<25]; hori=segs[(ang<35)|(ang>145)]
    off=np.array([x0,y0,x0,y0])
    vv,nv=vp_ransac(vert+off); vh,nh=vp_ransac(hori+off)
    # homography: vanishing line to infinity
    l=np.cross(vv,vh); l=l/l[2] if abs(l[2])>1e-12 else l
    H1=np.array([[1,0,0],[0,1,0],[l[0],l[1],l[2] if abs(l[2])>1e-12 else 1]],float)
    a=H1@vv; b=H1@vh
    dv=a[:2]/np.linalg.norm(a[:2]); dh=b[:2]/np.linalg.norm(b[:2])
    if dv[1]<0: dv=-dv
    if dh[0]<0: dh=-dh
    M=np.linalg.inv(np.c_[dh,dv])   # maps dh->(1,0), dv->(0,1)
    A=np.eye(3); A[:2,:2]=M
    H=A@H1
    corners=np.array([[x0,y0,1],[x1,y0,1],[x1,y1,1],[x0,y1,1]],float)
    pc=(H@corners.T).T; pc=pc[:,:2]/pc[:,2:]
    F=np.eye(3)
    if pc[0,1]+pc[1,1] > pc[2,1]+pc[3,1]: F[1,1]=-1   # top must stay on top
    if pc[0,0]+pc[3,0] > pc[1,0]+pc[2,0]: F[0,0]=-1   # left must stay left
    H=F@H; pc=(H@corners.T).T; pc=pc[:,:2]/pc[:,2:]
    # scale so ROI height is preserved roughly
    mn=pc.min(0); mx=pc.max(0); s=(y1-y0)/(mx[1]-mn[1])
    S=np.array([[s,0,-mn[0]*s],[0,s,-mn[1]*s],[0,0,1]]); H=S@H
    W=int((mx[0]-mn[0])*s); Hh=int((mx[1]-mn[1])*s)
    if W*Hh>6e7 or W<10 or Hh<10: raise RuntimeError(f'bad warp size {W}x{Hh}')
    out=cv2.warpPerspective(img,H,(W,Hh),flags=cv2.INTER_CUBIC)
    pc2=(H@corners.T).T; pc2=pc2[:,:2]/pc2[:,2:]
    return out,H,dict(n_vertical_segments=nv,n_horizontal_segments=nh,vp_vertical=(vv[:2]/vv[2]).round(1).tolist() if abs(vv[2])>1e-9 else 'inf',vp_horizontal=(vh[:2]/vh[2]).round(1).tolist() if abs(vh[2])>1e-9 else 'inf',roi_quad_in_rect=pc2.round(1).tolist())
def period(profile,minp=4,maxp=None):
    p=profile-profile.mean(); n=len(p)
    maxp=maxp or n//3
    ac=np.correlate(p,p,'full')[n-1:]; ac/=ac[0]+1e-12
    # first strong local max beyond minp
    cand=[k for k in range(minp,min(maxp,n-1)) if ac[k]>ac[k-1] and ac[k]>=ac[k+1] and ac[k]>0.1]
    if not cand: return None,None
    k=max(cand[:4],key=lambda k:ac[k]) if len(cand)>1 else cand[0]
    # prefer the smallest lag whose ac is >= 0.8*best (fundamental)
    best=max(ac[c] for c in cand[:6])
    for c in cand:
        if ac[c]>=0.75*best: k=c;break
    # parabolic refine
    y0,y1,y2=ac[k-1],ac[k],ac[k+1]; den=y0-2*y1+y2
    kf=k+(0.5*(y0-y2)/den if den!=0 else 0)
    # FFT check
    F=np.abs(np.fft.rfft(p*np.hanning(n))); fr=np.fft.rfftfreq(n)
    sel=(fr>1/maxp)&(fr<1/minp); kf_fft=1/fr[sel][np.argmax(F[sel])] if sel.any() else None
    return float(kf),float(ac[k]),float(kf_fft) if kf_fft else None
def measure(patch):
    g=cv2.cvtColor(patch,cv2.COLOR_BGR2GRAY).astype(float)
    gx=np.abs(cv2.Sobel(g,cv2.CV_64F,1,0,ksize=3)); gy=np.abs(cv2.Sobel(g,cv2.CV_64F,0,1,ksize=3))
    colprof=gx.mean(0); rowprof=gy.mean(1)
    px=period(colprof); py=period(rowprof)
    return dict(bay_px=px[0],bay_ac=px[1],bay_px_fft=px[2],floor_px=py[0],floor_ac=py[1],floor_px_fft=py[2])
def colours(patch,k=3):
    lab=cv2.cvtColor(patch,cv2.COLOR_BGR2LAB).reshape(-1,3).astype(float)
    sel=lab[rng.choice(len(lab),min(len(lab),40000),replace=False)]
    km=KMeans(k,n_init=4,random_state=0).fit(sel)
    cnt=np.bincount(km.labels_,minlength=k)/len(sel)
    cen=km.cluster_centers_.astype(np.uint8).reshape(-1,1,3)
    rgb=cv2.cvtColor(cen,cv2.COLOR_LAB2RGB).reshape(-1,3)
    order=np.argsort(-cnt)
    return [dict(hex='#%02x%02x%02x'%tuple(rgb[i]),share=round(float(cnt[i]),3),L=round(float(km.cluster_centers_[i][0])*100/255,1)) for i in order]
if __name__=='__main__':
    img=cv2.imread(sys.argv[1]); outp=sys.argv[2]; roi=list(map(int,sys.argv[3:7]))
    out,H,info=rectify(img,roi)
    cv2.imwrite(outp+'-full.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,90])
    print(json.dumps(dict(info=info,size=[out.shape[1],out.shape[0]])))

def peaks(profile,minp=4,maxp=None,n=4):
    """Top autocorrelation peaks (lag px, ac) of a profile, for judging the fundamental."""
    p=profile-profile.mean(); N=len(p); maxp=maxp or N//2
    ac=np.correlate(p,p,'full')[N-1:]; ac/=ac[0]+1e-12
    c=[(k,ac[k]) for k in range(max(minp,1),min(maxp,N-1)) if ac[k]>ac[k-1] and ac[k]>=ac[k+1] and ac[k]>0.05]
    c.sort(key=lambda t:-t[1]); return [(int(k),round(float(a),2)) for k,a in c[:n]]
def profiles(patch):
    g=cv2.cvtColor(patch,cv2.COLOR_BGR2GRAY).astype(float)
    gx=np.abs(cv2.Sobel(g,cv2.CV_64F,1,0,ksize=3)); gy=np.abs(cv2.Sobel(g,cv2.CV_64F,0,1,ksize=3))
    return gx.mean(0),gy.mean(1)
