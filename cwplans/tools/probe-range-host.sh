#!/bin/bash
# Probe one public URL for what a range-reading web page needs: Range (206, Content-Range, suffix ranges), CORS
# (Allow-Origin, Expose-Headers, the preflight for Range), caching (Cache-Control, ETag), compression and its interaction
# with Range, redirects, and time to first byte (5 samples). Read requests only, and never a whole large file: the
# no-Range compression check is a HEAD. Hosting study: https://github.com/danbri/londat/blob/main/docs/hosting-options.md
#   bash cwplans/tools/probe-range-host.sh <name> <url> [origin]
name="$1"; url="$2"; O="Origin: ${3:-https://danbri.github.io}"
echo "=================== $name"; echo "URL $url"
echo "--- GET Range bytes=0-1023 (redirects followed, the headers of every hop)"
curl -s -L -o /dev/null -D - -H "$O" -H "Range: bytes=0-1023" "$url" | grep -i -E '^(HTTP/|location|content-range|content-length|content-encoding|content-type|accept-ranges|access-control-allow-origin|access-control-expose-headers|cache-control|etag|age|x-cache|cf-cache-status|server|expires)' | sed 's/\(location: .\{0,110\}\).*/\1.../I'
echo "--- suffix Range bytes=-512 (last hop)"
curl -s -L -o /dev/null -D - -H "$O" -H "Range: bytes=-512" "$url" | grep -i -E '^(HTTP/|content-range|content-length)' | tail -2
echo "--- Range with Accept-Encoding: gzip, br (last hop; a browser sends identity with a Range)"
curl -s -L -o /dev/null -D - -H "$O" -H "Accept-Encoding: gzip, br" -H "Range: bytes=0-1023" "$url" | grep -i -E '^(HTTP/|content-range|content-length|content-encoding)' | tail -4
echo "--- HEAD with Accept-Encoding: gzip, br (no Range)"
curl -s -L -I -H "$O" -H "Accept-Encoding: gzip, br" "$url" | grep -i -E '^(HTTP/|content-length|content-encoding)' | tail -3
echo "--- preflight OPTIONS (Access-Control-Request-Headers: range)"
curl -s -o /dev/null -D - -X OPTIONS -H "$O" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: range" "$url" | grep -i -E '^(HTTP/|access-control-)'
echo "--- time to first byte, total (s), redirects, status: 5 range GETs"
for i in 1 2 3 4 5; do curl -s -L -o /dev/null -H "Range: bytes=0-1023" -w "%{time_starttransfer} %{time_total} %{num_redirects} %{http_code}\n" "$url"; done
