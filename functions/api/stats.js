// GET /api/stats: { id: { view, click, share, search, like } } for ranking. Cached for a minute.
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare("SELECT id, type, n FROM counts WHERE n > 0").all();
  const out = {};
  for (const r of results) (out[r.id] ??= {})[r.type] = r.n;
  return Response.json(out, { headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } });
}
