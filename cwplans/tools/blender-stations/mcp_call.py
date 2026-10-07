#!/usr/bin/env python3
"""Call one tool of the blender-mcp (mcp-for-blender) server over stdio.
usage: mcp_call.py TOOL [JSON-ARGS | @file.py (execute_blender_code)] [--png out.png]"""
import asyncio, json, sys, os, base64
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    tool = sys.argv[1]; arg = sys.argv[2] if len(sys.argv) > 2 else "{}"
    png = sys.argv[sys.argv.index("--png")+1] if "--png" in sys.argv else None
    if arg.startswith("@"):
        args = {"code": open(arg[1:]).read()}
    else:
        args = json.loads(arg)
    env = dict(os.environ, DISABLE_TELEMETRY="1", BLENDER_HOST="localhost", BLENDER_PORT="9876")
    params = StdioServerParameters(command="mcp-for-blender", args=[], env=env)
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            if tool == "list":
                for t in (await s.list_tools()).tools: print(t.name, "-", (t.description or "").split("\n")[0][:100])
                return
            res = await s.call_tool(tool, args)
            for c in res.content:
                if c.type == "text": print(c.text)
                elif c.type == "image":
                    if png:
                        open(png, "wb").write(base64.b64decode(c.data)); print("image ->", png)
                    else: print("[image]", c.mimeType, len(c.data))
            if res.isError: sys.exit(1)
asyncio.run(main())
