#!/bin/bash
# Skill: magpie/cwplans/docklands/skills/blender-station-models/SKILL.md
# usage: step.sh steps/NN-name.py  -> runs lib + step inside Blender through the MCP execute_blender_code tool
W=${BLENDER_STATIONS_WORK:?set BLENDER_STATIONS_WORK to the work folder (copy of this folder + osm-stations.json)}
f=$W/.code-$$.py
printf 'import os\nos.environ["BLENDER_STATIONS_WORK"] = "%s"\nexec(open("%s/stations_lib.py").read())\nexec(open("%s").read())\n' "$W" "$W" "$(realpath $1)" > $f
python3 $W/mcp_call.py execute_blender_code @$f 2>>$W/mcp.log; rc=$?; rm -f $f; exit $rc
