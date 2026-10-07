import sys,json,cv2
sys.path.insert(0,'.')
from facade import measure,colours
img=cv2.imread(sys.argv[1]); x0,y0,x1,y1=map(int,sys.argv[2:6]); out=sys.argv[6]
p=img[y0:y1,x0:x1]; cv2.imwrite(out,p,[cv2.IMWRITE_JPEG_QUALITY,90])
m=measure(p); m['patch_px']=[x1-x0,y1-y0]; m['colours']=colours(p,int(sys.argv[7]) if len(sys.argv)>7 else 3)
print(json.dumps(m))
