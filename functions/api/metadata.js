const MAX_BYTES = 260_000;
const FETCH_TIMEOUT_MS = 8_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const targetUrl = requestUrl.searchParams.get('url');

  if (!targetUrl) {
    return json({ ok: false, error: 'missing_url' }, 400);
  }

  const validation = validateTargetUrl(targetUrl);
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(validation.url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'user-agent':
          'Mozilla/5.0 (compatible; FavoriteVaultBot/0.1; +https://lting.dpdns.org) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url || validation.url.toString();

    if (!response.ok) {
      return json({ ok: false, error: 'fetch_failed', status: response.status, finalUrl }, 502);
    }

    if (!isProbablyHtml(contentType)) {
      return json(
        {
          ok: true,
          inputUrl: validation.url.toString(),
          finalUrl,
          status: response.status,
          contentType,
          title: filenameFromUrl(finalUrl),
          description: '',
          image: '',
          siteName: hostFromUrl(finalUrl),
          author: '',
          limited: false,
        },
        200,
      );
    }

    const { text, limited } = await readLimitedText(response, MAX_BYTES);
    const metadata = extractMetadata(text, finalUrl);

    return json({
      ok: true,
      inputUrl: validation.url.toString(),
      finalUrl,
      status: response.status,
      contentType,
      limited,
      ...metadata,
    });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'timeout' : 'fetch_error';
    return json({ ok: false, error: message }, 504);
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateTargetUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: 'unsupported_protocol' };
  }

  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    return { ok: false, error: 'blocked_host' };
  }

  return { ok: true, url };
}

function isBlockedHostname(hostname) {
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) return true;
  if (hostname === '0.0.0.0' || hostname === '::1') return true;
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

function isProbablyHtml(contentType) {
  return !contentType || /text\/html|application\/xhtml\+xml|application\/xml/i.test(contentType);
}

async function readLimitedText(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return { text: text.slice(0, maxBytes), limited: text.length > maxBytes };
  }

  const chunks = [];
  let received = 0;
  let limited = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (received + value.byteLength > maxBytes) {
      chunks.push(value.slice(0, maxBytes - received));
      limited = true;
      break;
    }

    chunks.push(value);
    received += value.byteLength;
  }

  try {
    await reader.cancel();
  } catch {
    // Nothing useful to do here. The network has already made its opinion known.
  }

  const bytes = concatUint8Arrays(chunks);
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), limited };
}

function concatUint8Arrays(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function extractMetadata(html, baseUrl) {
  const title = firstNonEmpty([
    meta(html, 'property', 'og:title'),
    meta(html, 'name', 'twitter:title'),
    titleTag(html),
  ]);

  const description = firstNonEmpty([
    meta(html, 'property', 'og:description'),
    meta(html, 'name', 'twitter:description'),
    meta(html, 'name', 'description'),
  ]);

  const image = absolutize(
    firstNonEmpty([
      meta(html, 'property', 'og:image'),
      meta(html, 'property', 'og:image:url'),
      meta(html, 'name', 'twitter:image'),
      meta(html, 'name', 'thumbnail'),
    ]),
    baseUrl,
  );

  const siteName = firstNonEmpty([
    meta(html, 'property', 'og:site_name'),
    meta(html, 'name', 'application-name'),
    hostFromUrl(baseUrl),
  ]);

  const author = firstNonEmpty([
    meta(html, 'name', 'author'),
    meta(html, 'property', 'article:author'),
  ]);

  return {
    title: cleanText(title || filenameFromUrl(baseUrl)),
    description: cleanText(description),
    image,
    siteName: cleanText(siteName),
    author: cleanText(author),
  };
}

function meta(html, attrName, attrValue) {
  const escapedAttrValue = escapeRegExp(attrValue);
  const pattern = new RegExp(`<meta[^>]+${attrName}=["']${escapedAttrValue}["'][^>]*>`, 'i');
  const tag = html.match(pattern)?.[0] || '';
  if (!tag) return '';
  return decodeHtmlEntities(getAttribute(tag, 'content'));
}

function titleTag(html) {
  const value = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return decodeHtmlEntities(value);
}

function getAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return tag.match(pattern)?.[2] || '';
}

function firstNonEmpty(values) {
  return values.find((value) => value && value.trim())?.trim() || '';
}

function cleanText(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function absolutize(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function filenameFromUrl(raw) {
  try {
    const url = new URL(raw);
    const path = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname);
    return path || url.hostname;
  } catch {
    return raw;
  }
}

function hostFromUrl(raw) {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=300' : 'no-store',
    },
  });
}
