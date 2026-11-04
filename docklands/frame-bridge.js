// The page tools to the frame that holds this page, by postMessage (a fourth way in, beside window.docklands, WebMCP
// and the MCP server's page_call; the same list and the same callTool). Only the parent frame is answered; any other
// window or frame is ignored. Messages, all with target origin '*' (the parent's origin is not known; the tool list
// and the view are public):
//   page -> parent  {type:'webmcp.tools', api, tools:[{name, description, inputSchema, readOnly}]}  at start and on list
//   parent -> page  {type:'webmcp.list'}
//   parent -> page  {type:'webmcp.call', id, name, args}
//   page -> parent  {type:'webmcp.result', id, ok:true, value} | {type:'webmcp.result', id, ok:false, error}
// Skill: docklands-3d-page, "Page API, WebMCP and non-visual access"; README "The frame path".
export function bridgeToParent({ tools, callTool, version }) {
  if (typeof window === 'undefined' || window.parent === window) return null;
  const parent = window.parent;
  const list = tools.map(({ name, description, inputSchema, readOnly }) => ({ name, description, inputSchema, readOnly: !!readOnly }));
  const post = msg => { try { parent.postMessage(msg, '*'); } catch (e) { /* the parent is gone */ } };
  const state = { calls: 0, refused: 0 };
  const announce = () => post({ type: 'webmcp.tools', api: version, tools: list });
  window.addEventListener('message', async event => {
    const m = event.data;
    if (!m || typeof m !== 'object' || typeof m.type !== 'string' || !m.type.startsWith('webmcp.')) return;
    if (event.source !== parent) { state.refused++; return; }
    if (m.type === 'webmcp.list') { announce(); return; }
    if (m.type !== 'webmcp.call') return;
    state.calls++;
    const id = m.id;
    try {
      // JSON keeps the answer cloneable (no functions or class objects cross the frame).
      const value = JSON.parse(JSON.stringify(await callTool(String(m.name), m.args && typeof m.args === 'object' ? m.args : {}) ?? null));
      post({ type: 'webmcp.result', id, ok: true, value });
    } catch (e) {
      post({ type: 'webmcp.result', id, ok: false, error: String(e && e.message || e) });
    }
  });
  announce();
  return state;
}
