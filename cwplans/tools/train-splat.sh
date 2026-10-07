#!/usr/bin/env bash
# train-splat.sh - train a 3D Gaussian Splat on the CPU from a nerfstudio dataset
# with OpenSplat, then write .ply, .splat and (if splat-transform works) .sog
# next to the dataset. Runs in the background by default (nohup + setsid) and
# survives the shell that started it.
#
# USAGE
#   magpie/cwplans/tools/train-splat.sh DATASET [options]
#     DATASET   folder with transforms.json (+ the "ply_file_path" it names,
#               e.g. sparse_pc.ply) and the images. A COLMAP folder
#               (sparse/0/*.txt|bin) also works when transforms.json is absent.
#   options (defaults in brackets):
#     -n N        training iterations [7000]
#     -d F        image downscale factor; 1 = full 960x540, 2 = 480x270 [2]
#     --sh N      spherical-harmonics degree, 1-3 (OpenSplat refuses 0); lower
#                 = less memory, faster, a smaller .ply, less view-dependent
#                 colour [3]
#     --max-g N   cap on the number of gaussians [1500000]
#     --densify-until N   stop densifying at this step; OpenSplat's default is
#                 min(15000, N/2) [default]
#     --refine-every N    densify/prune every N steps [500]
#     --save-every N      also write splat_<step>.ply every N steps [off]
#     --name NAME         output basename in DATASET [splat-n<N>-d<F>]
#     --val IMAGE         hold out IMAGE (file name only) and print its PSNR
#     --resume PLY        continue training from an earlier OpenSplat .ply
#     --fg                run in the foreground (no nohup)
#     -- ARGS             pass the rest straight to opensplat
#
# OUTPUT (all in DATASET)
#   NAME.ply      OpenSplat's 3DGS .ply, in the dataset's own coordinates and
#                 metres (OpenSplat normalises internally and undoes it on save;
#                 --center is NOT used)
#   NAME.splat    antimatter15 32-byte format, via ply-to-splat.mjs
#   NAME.sog      PlayCanvas SOG, via @playcanvas/splat-transform -g cpu
#   NAME.log      everything opensplat printed ("Step N: loss [p%]", "Densify
#                 N: ... total G") plus a PROGRESS line every 30 s
#   NAME.progress the latest progress line only: step, s/step, ETA, RSS, gaussians
#   NAME.pid      pid of the opensplat process while it runs
#   Follow it with:  tail -f DATASET/NAME.log   or   cat DATASET/NAME.progress
#   Stop it with:    kill $(cat DATASET/NAME.pid)
#
# POSES: transforms.json "transform_matrix" is camera-to-world in the OpenGL /
# nerfstudio convention (camera +x right, +y up, looking along -z). OpenSplat
# reads it as is and flips y and z itself; give it NO conversion. Checked with
# magpie/cwplans/tools/splat-pose-test.py (boxes land where they were drawn; a
# dataset written in the OpenCV convention fails that check).
#
# SPEED: see the MEASURED block below (also printed by --help).
#
# INSTALL (once per container; nothing is committed):
#   apt-get install -y libopencv-dev unzip cmake g++
#   curl -L -o /opt/libtorch.zip https://download.pytorch.org/libtorch/cpu/libtorch-cxx11-abi-shared-with-deps-2.5.1%2Bcpu.zip
#   (cd /opt && unzip -q libtorch.zip && rm libtorch.zip)
#   git clone https://github.com/pierotofy/OpenSplat /opt/opensplat
#   cd /opt/opensplat && mkdir build && cd build &&
#     cmake -DCMAKE_PREFIX_PATH=/opt/libtorch -DGPU_RUNTIME=CPU -DCMAKE_BUILD_TYPE=Release .. && make -j4
#   mkdir -p /opt/splat-tools && cd /opt/splat-tools && npm init -y && npm i @playcanvas/splat-transform
# Override locations with OPENSPLAT=/path/to/opensplat SPLAT_TRANSFORM=/path/to/splat-transform.
set -u

MEASURED='
MEASURED, October 2026, this container (4 cores, no GPU), OpenSplat 1.2.2 CPU,
libtorch 2.5.1. Another agent ran Chromium at the same time (load 4-11), so
wall times are pessimistic; cpu-s/step is the contention-free number and a free
4-core run gets about 2.5 cores of it (wall ~ cpu-s / 2.5).
  res        gaussians  wall s/step  cpu-s/step  peak RSS
  480x270    13k        0.21         0.62        0.3 GB
  480x270    183k       0.55-0.97    1.48        1.1 GB   (cw-photo-480, 480 frames)
  480x270    300k       2.16         2.01        1.0 GB
  480x270    1.0M       4.37         5.61        2.3 GB
  960x540    13k        1.09         2.34        0.8 GB
  960x540    300k       2.97         4.32        1.3 GB
Step cost depends on resolution and gaussian count, not on the number of images.
Densification (OpenSplat multi-view scoring) grew cw-photo-480 slowly: 182,830
-> 183,082 at step 500 -> 184,539 at step 750 (refine-every 250).
Estimates at -d 2 on cw-photo-480 (wall, free machine / shared machine):
  2000 iters  ~20 min / ~35 min
  7000 iters  ~1.5 h  / ~3 h   (more if densification grows the count)
  30000 iters ~7-25 h / 15-40 h (depends on how far the count grows; cap --max-g)
At -d 1 (960x540) multiply by about 2-3.
DO NOT pass --val-render to opensplat: it leaks memory (about 40 MB per
validation render at 480x270, 160 MB at 960x540). A 960x540 run with it was
killed by the OOM killer at 12.7 GB after 718 steps. --val alone is safe.'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENSPLAT="${OPENSPLAT:-/opt/opensplat/build/opensplat}"
SPLAT_TRANSFORM="${SPLAT_TRANSFORM:-/opt/splat-tools/node_modules/.bin/splat-transform}"

usage() { sed -n '2,/^set -u/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' | sed '$d'; echo "$MEASURED"; }

[ $# -ge 1 ] || { usage; exit 2; }
case "$1" in -h|--help) usage; exit 0;; esac

DATASET="$(cd "$1" 2>/dev/null && pwd)" || { echo "no such dataset folder: $1" >&2; exit 2; }
shift
ITERS=7000; DOWN=2; SH=3; MAXG=1500000; DENSIFY_UNTIL=""; REFINE=500; SAVE_EVERY=""; NAME=""; VAL=""; RESUME=""; FG=0; WORKER=0
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    -n) ITERS="$2"; shift 2;;
    -d) DOWN="$2"; shift 2;;
    --sh) SH="$2"; shift 2;;
    --max-g) MAXG="$2"; shift 2;;
    --densify-until) DENSIFY_UNTIL="$2"; shift 2;;
    --refine-every) REFINE="$2"; shift 2;;
    --save-every) SAVE_EVERY="$2"; shift 2;;
    --name) NAME="$2"; shift 2;;
    --val) VAL="$2"; shift 2;;
    --resume) RESUME="$2"; shift 2;;
    --fg) FG=1; shift;;
    --worker) WORKER=1; shift;;
    --) shift; EXTRA=("$@"); break;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2;;
  esac
done
NAME="${NAME:-splat-n${ITERS}-d${DOWN}}"
LOG="$DATASET/$NAME.log"; PROG="$DATASET/$NAME.progress"; PIDF="$DATASET/$NAME.pid"

if [ "$WORKER" = 0 ]; then
  [ -x "$OPENSPLAT" ] || { echo "opensplat not found at $OPENSPLAT (see INSTALL in --help)" >&2; exit 1; }
  if [ ! -f "$DATASET/transforms.json" ] && [ ! -d "$DATASET/sparse" ]; then
    echo "$DATASET has neither transforms.json nor sparse/ (COLMAP)" >&2; exit 1
  fi
  if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
    echo "a run named $NAME is already going (pid $(cat "$PIDF")); pick another --name" >&2; exit 1
  fi
  ARGS=(-n "$ITERS" -d "$DOWN" --sh "$SH" --max-g "$MAXG" --refine-every "$REFINE" --name "$NAME")
  [ -n "$DENSIFY_UNTIL" ] && ARGS+=(--densify-until "$DENSIFY_UNTIL")
  [ -n "$SAVE_EVERY" ] && ARGS+=(--save-every "$SAVE_EVERY")
  [ -n "$VAL" ] && ARGS+=(--val "$VAL")
  [ -n "$RESUME" ] && ARGS+=(--resume "$RESUME")
  : > "$LOG"
  if [ "$FG" = 1 ]; then
    "${BASH_SOURCE[0]}" "$DATASET" "${ARGS[@]}" --worker -- "${EXTRA[@]}" >> "$LOG" 2>&1 < /dev/null &
    w=$!; trap 'kill "$w" 2>/dev/null' INT TERM
    tail --pid="$w" -n +1 -f "$LOG"; wait "$w"; exit $?
  fi
  nohup setsid "${BASH_SOURCE[0]}" "$DATASET" "${ARGS[@]}" --worker -- "${EXTRA[@]}" >> "$LOG" 2>&1 < /dev/null &
  echo "started in background (launcher pid $!)"
  echo "  log:      $LOG"
  echo "  progress: $PROG"
  echo "  output:   $DATASET/$NAME.ply / .splat / .sog"
  exit 0
fi

# ---------------------------------------------------------------- worker ----
nimg=$(ls "$DATASET"/images 2>/dev/null | wc -l)
echo "== train-splat $(date -Is) dataset=$DATASET images=$nimg iters=$ITERS downscale=$DOWN sh=$SH max-gaussians=$MAXG refine-every=$REFINE densify-until=${DENSIFY_UNTIL:-default}"
CMD=("$OPENSPLAT" "$DATASET" -n "$ITERS" -d "$DOWN" --sh-degree "$SH" --max-gaussians "$MAXG"
     --refine-every "$REFINE" --densify-from "$REFINE" -o "$DATASET/$NAME.ply")
[ -n "$DENSIFY_UNTIL" ] && CMD+=(--densify-until "$DENSIFY_UNTIL")
[ -n "$SAVE_EVERY" ] && CMD+=(-s "$SAVE_EVERY")
[ -n "$VAL" ] && CMD+=(--val --val-image "$VAL")
[ -n "$RESUME" ] && CMD+=(--resume "$RESUME")
CMD+=("${EXTRA[@]}")
echo "== ${CMD[*]}"

t0=${EPOCHREALTIME/./}
nice -n 10 "${CMD[@]}" &
pid=$!
echo "$pid" > "$PIDF"
trap 'kill "$pid" 2>/dev/null' TERM INT

cputime() { awk '{print $14+$15}' "/proc/$1/stat" 2>/dev/null || echo 0; }  # utime+stime, clock ticks
TCK=$(getconf CLK_TCK)
last_step=0; last_t=$t0; last_c=$(cputime "$pid")
while kill -0 "$pid" 2>/dev/null; do
  sleep 30
  kill -0 "$pid" 2>/dev/null || break
  now=${EPOCHREALTIME/./}
  step=$(grep -a -o '^Step [0-9]*' "$LOG" | tail -1 | cut -d' ' -f2); step=${step:-0}
  gs=$(grep -a -o 'total [0-9]*\|remaining [0-9]*' "$LOG" | tail -1 | awk '{print $2}')
  rss=$(awk '/VmRSS/{printf "%.1f", $2/1048576}' "/proc/$pid/status" 2>/dev/null)
  hwm=$(awk '/VmHWM/{printf "%.1f", $2/1048576}' "/proc/$pid/status" 2>/dev/null)
  el=$(( (now - t0) / 1000000 ))
  c=$(cputime "$pid")
  if [ "$step" -gt "$last_step" ]; then
    sps=$(awk -v d=$((now - last_t)) -v s=$((step - last_step)) 'BEGIN{printf "%.2f", d/1e6/s}')
    cps=$(awk -v d=$((c - last_c)) -v s=$((step - last_step)) -v t="$TCK" 'BEGIN{printf "%.2f", d/t/s}')
    eta=$(awk -v r="$sps" -v left=$((ITERS - step)) 'BEGIN{t=r*left; printf "%dh%02dm", t/3600, (t%3600)/60}')
    last_step=$step; last_t=$now; last_c=$c
  else
    sps="?"; cps="?"; eta="?"
  fi
  line="PROGRESS $(date +%H:%M:%S) step $step/$ITERS elapsed ${el}s ${sps}s/step (${cps} cpu-s/step, load $(cut -d' ' -f1 /proc/loadavg)) eta $eta rss ${rss:-?}GB peak ${hwm:-?}GB gaussians ${gs:-initial}"
  echo "$line" > "$PROG"
  echo "$line"
done
wait "$pid"; rc=$?
rm -f "$PIDF"
el=$(( (${EPOCHREALTIME/./} - t0) / 1000000 ))
echo "== opensplat exited rc=$rc after ${el}s"
if [ "$rc" != 0 ] || [ ! -s "$DATASET/$NAME.ply" ]; then
  echo "DONE FAILED rc=$rc after ${el}s" > "$PROG"; exit "$rc"
fi

node "$HERE/ply-to-splat.mjs" "$DATASET/$NAME.ply" "$DATASET/$NAME.splat" || echo "== .splat conversion failed"
if [ -x "$SPLAT_TRANSFORM" ]; then ST=("$SPLAT_TRANSFORM"); else ST=(npx -y @playcanvas/splat-transform); fi
"${ST[@]}" --no-tty -w -g cpu "$DATASET/$NAME.ply" "$DATASET/$NAME.sog" || echo "== .sog conversion failed"
ls -la "$DATASET/$NAME".ply "$DATASET/$NAME".splat "$DATASET/$NAME".sog 2>/dev/null
echo "DONE ok after ${el}s: $DATASET/$NAME.ply" | tee "$PROG"
