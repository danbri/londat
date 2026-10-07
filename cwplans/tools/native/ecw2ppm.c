// ecw2ppm in.ecw out.ppm step : decode a whole ECW at 1/step resolution to binary PPM; print georef as JSON
#include <stdio.h>
#include <stdlib.h>
#include "NCSECWClient.h"
int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: ecw2ppm in.ecw out.ppm step\n"); return 2; }
  int step = atoi(argv[3]); NCSFileView *v = NULL; NCSFileViewFileInfo *fi = NULL;
  NCSecwInit();
  NCSError e = NCScbmOpenFileView(argv[1], &v, NULL);
  if (e != NCS_SUCCESS) { fprintf(stderr, "open: %s\n", NCSGetErrorText(e)); return 1; }
  NCScbmGetViewFileInfo(v, &fi);
  int W = fi->nSizeX / step, H = fi->nSizeY / step, nb = fi->nBands < 3 ? fi->nBands : 3;
  UINT32 bands[3] = {0, 1, 2};
  e = NCScbmSetFileView(v, nb, bands, 0, 0, fi->nSizeX - 1, fi->nSizeY - 1, W, H);
  if (e != NCS_SUCCESS) { fprintf(stderr, "setview: %s\n", NCSGetErrorText(e)); return 1; }
  FILE *f = fopen(argv[2], "wb"); fprintf(f, "P6\n%d %d\n255\n", W, H);
  unsigned char *line = (unsigned char *)malloc(W * 3);
  for (int y = 0; y < H; y++) {
    if (NCScbmReadViewLineRGB(v, line) != NCSECW_READ_OK) { fprintf(stderr, "read fail at %d\n", y); return 1; }
    fwrite(line, 1, W * 3, f);
  }
  fclose(f);
  printf("{\"w\":%d,\"h\":%d,\"x0\":%.3f,\"y0\":%.3f,\"dx\":%.4f,\"dy\":%.4f,\"bands\":%d,\"proj\":\"%s\",\"datum\":\"%s\"}\n", W, H,
    fi->fOriginX, fi->fOriginY, fi->fCellIncrementX * step, fi->fCellIncrementY * step, fi->nBands, fi->szProjection, fi->szDatum);
  NCScbmCloseFileView(v); NCSecwShutdown(); return 0;
}
