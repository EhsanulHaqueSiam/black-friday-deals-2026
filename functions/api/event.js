// POST /api/event {id, type}: counts one engagement event for a deal (Cloudflare D1).
// Types: view, click (Get deal), share, search (opened from search), like / unlike.
const TYPES = new Set(["view", "click", "share", "search", "like", "unlike"]);
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const { id, type } = body ?? {};
  if (typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id) || !TYPES.has(type)) return new Response("bad event", { status: 400 });
  const col = type === "unlike" ? "like" : type;
  const inc = type === "unlike" ? -1 : 1;
  await env.DB.prepare("INSERT INTO counts (id, type, n) VALUES (?1, ?2, max(0, ?3)) ON CONFLICT(id, type) DO UPDATE SET n = max(0, n + ?3)").bind(id, col, inc).run();
  return new Response(null, { status: 204 });
}
