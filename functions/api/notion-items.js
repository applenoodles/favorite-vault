const NOTION_VERSION = '2022-06-28';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestGet({ env }) {
  const config = getConfig(env);
  if (!config.ok) return json({ ok: false, error: config.error }, 500);

  const pages = await queryAllPages(config);
  const items = pages.map(pageToItem).filter(Boolean);
  return json({ ok: true, items });
}

export async function onRequestPost({ request, env }) {
  const config = getConfig(env);
  if (!config.ok) return json({ ok: false, error: config.error }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const item = body?.item;
  if (!item || typeof item !== 'object') return json({ ok: false, error: 'missing_item' }, 400);
  if (!item.id || !item.url) return json({ ok: false, error: 'invalid_item' }, 400);

  const existingPageId = item.notionPageId || (await findPageIdByItemId(config, item.id));
  const now = new Date().toISOString();
  const itemToStore = {
    ...item,
    updatedAt: now,
  };

  if (existingPageId) {
    const page = await notionFetch(config, `/v1/pages/${existingPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: itemToProperties(itemToStore) }),
    });
    return json({ ok: true, item: { ...itemToStore, notionPageId: page.id } });
  }

  const page = await notionFetch(config, '/v1/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: config.databaseId },
      properties: itemToProperties(itemToStore),
    }),
  });

  return json({ ok: true, item: { ...itemToStore, notionPageId: page.id } });
}

export async function onRequestDelete({ request, env }) {
  const config = getConfig(env);
  if (!config.ok) return json({ ok: false, error: config.error }, 500);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const pageId = url.searchParams.get('pageId');
  if (!id && !pageId) return json({ ok: false, error: 'missing_id' }, 400);

  const targetPageId = pageId || (await findPageIdByItemId(config, id));
  if (!targetPageId) return json({ ok: true, deleted: false });

  await notionFetch(config, `/v1/pages/${targetPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });

  return json({ ok: true, deleted: true });
}

function getConfig(env) {
  const token = env.NOTION_TOKEN || env.NOTION_API_KEY;
  const databaseId = env.NOTION_DATABASE_ID;
  if (!token || !databaseId) return { ok: false, error: 'missing_notion_config' };
  return { ok: true, token, databaseId };
}

async function notionFetch(config, path, init = {}) {
  const response = await fetch(`https://api.notion.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data?.code || data?.message || `notion_${response.status}`);
  }

  return data;
}

async function queryAllPages(config) {
  const results = [];
  let cursor;

  do {
    const data = await notionFetch(config, `/v1/databases/${config.databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      }),
    });
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && results.length < 1000);

  return results;
}

async function findPageIdByItemId(config, itemId) {
  if (!itemId) return '';
  const data = await notionFetch(config, `/v1/databases/${config.databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: 'Item ID',
        rich_text: { equals: itemId },
      },
    }),
  });
  return data.results?.[0]?.id || '';
}

function itemToProperties(item) {
  return {
    Name: titleProp(displayTitle(item)),
    URL: urlProp(item.finalUrl || item.url),
    Summary: richTextProp(item.summary || ''),
    Category: selectProp(item.category || '未分類'),
    Tags: multiSelectProp(item.tags || []),
    Platform: selectProp(platformLabel(item.platform)),
    Status: selectProp(isRefined(item) ? 'summarized' : 'needs_llm'),
    'Item ID': richTextProp(item.id),
    Description: richTextProp(item.description || ''),
    Note: richTextProp(item.note || ''),
    Author: richTextProp(item.authorName || ''),
    Site: richTextProp(item.siteName || ''),
    Created: dateProp(item.createdAt || new Date().toISOString()),
  };
}

function pageToItem(page) {
  const properties = page.properties || {};
  const url = readUrl(properties.URL) || readRichText(properties.URL);
  if (!url) return null;
  const id = readRichText(properties['Item ID']) || page.id;

  return {
    id,
    notionPageId: page.id,
    url,
    finalUrl: url,
    title: readTitle(properties.Name) || url,
    note: readRichText(properties.Note),
    tags: readMultiSelect(properties.Tags),
    platform: platformValue(readSelect(properties.Platform), url),
    sourceAction: 'imported',
    createdAt: readDate(properties.Created) || page.created_time || new Date().toISOString(),
    updatedAt: page.last_edited_time,
    description: readRichText(properties.Description),
    siteName: readRichText(properties.Site),
    authorName: readRichText(properties.Author),
    summary: readRichText(properties.Summary),
    category: readSelect(properties.Category),
  };
}

function displayTitle(item) {
  const title = String(item.title || '').trim();
  if (title && !isGenericTitle(title)) return title;
  const source = String(item.summary || item.description || '').trim();
  if (source.length >= 16) return source.slice(0, 48) + (source.length > 48 ? '…' : '');
  return `${platformLabel(item.platform)} needs LLM`;
}

function isRefined(item) {
  const category = String(item.category || '').trim();
  return Boolean(item.summary && category && category !== '待整理' && category !== '未分類' && !isGenericTitle(item.title || ''));
}

function isGenericTitle(title) {
  const normalized = String(title || '').trim().toLowerCase();
  if (!normalized) return true;
  if (['threads', 'instagram', 'facebook', 'youtube', 'bilibili', 'home', '首頁'].includes(normalized)) return true;
  if (normalized.endsWith('收藏') || normalized.includes('待整理')) return true;
  return false;
}

function titleProp(value) {
  return { title: value ? [{ text: { content: clamp(value, 1800) } }] : [] };
}

function richTextProp(value) {
  return { rich_text: value ? [{ text: { content: clamp(value, 1900) } }] : [] };
}

function urlProp(value) {
  return { url: value || null };
}

function selectProp(value) {
  return value ? { select: { name: clamp(value, 90) } } : { select: null };
}

function multiSelectProp(values) {
  const tags = Array.isArray(values) ? values : String(values || '').split(/[#,，、\s]+/);
  return {
    multi_select: tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((name) => ({ name: clamp(name, 90) })),
  };
}

function dateProp(value) {
  return value ? { date: { start: value } } : { date: null };
}

function readTitle(prop) {
  return prop?.title?.map((part) => part.plain_text || '').join('').trim() || '';
}

function readRichText(prop) {
  return prop?.rich_text?.map((part) => part.plain_text || '').join('').trim() || '';
}

function readUrl(prop) {
  return prop?.url || '';
}

function readSelect(prop) {
  return prop?.select?.name || '';
}

function readMultiSelect(prop) {
  return Array.isArray(prop?.multi_select) ? prop.multi_select.map((item) => item.name).filter(Boolean) : [];
}

function readDate(prop) {
  return prop?.date?.start || '';
}

function platformLabel(platform) {
  const map = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    threads: 'Threads',
    facebook: 'Facebook',
    bilibili: 'Bilibili',
    other: '其他',
  };
  return map[platform] || '其他';
}

function platformValue(label, url) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('youtube')) return 'youtube';
  if (normalized.includes('instagram')) return 'instagram';
  if (normalized.includes('threads')) return 'threads';
  if (normalized.includes('facebook')) return 'facebook';
  if (normalized.includes('bilibili')) return 'bilibili';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('threads')) return 'threads';
    if (host.includes('facebook') || host.includes('fb.watch')) return 'facebook';
    if (host.includes('bilibili') || host.includes('b23.tv')) return 'bilibili';
  } catch {}
  return 'other';
}

function clamp(value, max) {
  return String(value || '').slice(0, max);
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
