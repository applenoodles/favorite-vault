const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Vault-Key',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestGet({ request, env }) {
  const db = getDb(env);
  if (!db) return json({ ok: false, error: 'missing_d1_binding' }, 500);

  const vault = await vaultIdFromRequest(request);
  if (!vault.ok) return json({ ok: false, error: vault.error }, 401);

  const rows = await db
    .prepare(
      `SELECT data
       FROM favorite_items
       WHERE vault_id = ?
       ORDER BY updated_at DESC
       LIMIT 1000`,
    )
    .bind(vault.id)
    .all();

  const items = (rows.results || [])
    .map((row) => safeParse(row.data))
    .filter(Boolean);

  return json({ ok: true, items });
}

export async function onRequestPost({ request, env }) {
  const db = getDb(env);
  if (!db) return json({ ok: false, error: 'missing_d1_binding' }, 500);

  const vault = await vaultIdFromRequest(request);
  if (!vault.ok) return json({ ok: false, error: vault.error }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const item = body?.item;
  if (!item || typeof item !== 'object') return json({ ok: false, error: 'missing_item' }, 400);
  if (!item.id || !item.url) return json({ ok: false, error: 'invalid_item' }, 400);

  const now = new Date().toISOString();
  const createdAt = item.createdAt || now;
  const storedItem = {
    ...item,
    createdAt,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO favorite_items (id, vault_id, url, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         url = excluded.url,
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .bind(storedItem.id, vault.id, storedItem.url, JSON.stringify(storedItem), createdAt, now)
    .run();

  return json({ ok: true, item: storedItem });
}

export async function onRequestDelete({ request, env }) {
  const db = getDb(env);
  if (!db) return json({ ok: false, error: 'missing_d1_binding' }, 500);

  const vault = await vaultIdFromRequest(request);
  if (!vault.ok) return json({ ok: false, error: vault.error }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ ok: false, error: 'missing_id' }, 400);

  await db
    .prepare('DELETE FROM favorite_items WHERE vault_id = ? AND id = ?')
    .bind(vault.id, id)
    .run();

  return json({ ok: true });
}

function getDb(env) {
  return env.FAVORITE_DB || env.DB || null;
}

async function vaultIdFromRequest(request) {
  const key = request.headers.get('x-vault-key') || '';
  if (!key || key.trim().length < 8) return { ok: false, error: 'missing_vault_key' };

  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.trim()));
  const bytes = Array.from(new Uint8Array(hash));
  const id = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return { ok: true, id };
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
