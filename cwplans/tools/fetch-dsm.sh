#!/bin/bash
# EA LiDAR DSM tiles over the Canary Wharf estate, one product per survey year (survey download service, OGL)
cd "$(dirname "$0")/../data/raw/dsm" 2>/dev/null || { mkdir -p "$(dirname "$0")/../data/raw/dsm"; cd "$(dirname "$0")/../data/raw/dsm"; }
B=https://environment.data.gov.uk/tiles/collections/survey
UA="glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)"
for t in TQ3575 TQ3580; do
 for u in lidar_tiles_dsm/1999/2 lidar_tiles_dsm/2003/1 lidar_tiles_dsm/2007/0.5 lidar_tiles_dsm/2012/1 lidar_tiles_dsm/2012/0.5 lidar_tiles_dsm/2015/1 national_lidar_programme_dsm/2018/1 national_lidar_programme_dsm/2020/1 lidar_composite_first_return_dsm/2022/1; do
  n=$(echo $u | tr / -)-$t.zip; [ -s $n ] || curl -sS -A "$UA" -m 1200 -o $n "$B/$u/$t" || echo "FAIL $n"
 done
done
ls -la; for z in *.zip; do echo "$z: $(unzip -l $z | tail -1)"; unzip -l $z | awk 'NR>3{print $4}' | head -3; done
