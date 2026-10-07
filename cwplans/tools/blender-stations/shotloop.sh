#!/bin/bash
# Saves a capture of the Xvfb screen (:99) every 10 s, numbered and time-stamped.
OUT=${1:?outdir}; n=0
while [ ! -f "$OUT/.stop" ]; do
  n=$((n+1)); ts=$(date -u +%Y%m%dT%H%M%SZ)
  DISPLAY=:99 import -silent -window root -resize 1280x800 -quality 60 "$OUT/shot-$(printf %04d $n)-$ts.jpg" 2>/dev/null
  sleep 10
done
