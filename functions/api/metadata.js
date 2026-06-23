const MAX_BYTES = 700_000;
const MAX_CONTENT_CHARS = 24_000;
const FETCH_TIMEOUT_MS = 10_000;

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
          'Mozilla/5.0 (compatible; FavoriteVaultBot/0.2; +https://lting.dpdns.org) AppleWebKit/537.36 Chrome/120 Safari/537.36',
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
          contentText: '',
          contentPreview: '',
          contentLength: 0,
          extractionMethod: 'non_html',
          limited: false,
        },
        200,
      );
    }

    const { text, limited } = await readLimitedText(response, MAX_BYTES);
    const metadata = extractMetadata(text, finalUrl);
    const extracted = extractReadableContent(text, finalUrl);

    return json({
      ok: true,
      inputUrl: validation.url.toString(),
      finalUrl,
      status: response.status,
      contentType,
      limited,
      ...metadata,
      ...extracted,
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
    // The network has already made its little point.
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

function extractReadableContent(html, baseUrl) {
  const candidates = [
    { method: 'article', html: firstTagContent(html, 'article') },
    { method: 'main', html: firstTagContent(html, 'main') },
    { method: 'role_main', html: firstAttributeBlock(html, 'role', 'main') },
    { method: 'body', html: bodyContent(html) },
  ];

  let best = { method: 'none', text: '' };

  for (const candidate of candidates) {
    if (!candidate.html) continue;
    const text = htmlToReadableText(candidate.html);
    if (scoreReadableText(text) > scoreReadableText(best.text)) {
      best = { method: candidate.method, text };
    }
  }

  const jsonLdText = extractJsonLdText(html);
  if (scoreReadableText(jsonLdText) > scoreReadableText(best.text)) {
    best = { method: 'json_ld', text: jsonLdText };
  }

  const contentText = cleanReadableText(best.text).slice(0, MAX_CONTENT_CHARS);
  const contentPreview = contentText.slice(0, 600);

  return {
    contentText,
    contentPreview,
    contentLength: contentText.length,
    extractionMethod: contentText ? best.method : 'none',
    canonicalUrl: absolutize(canonicalUrl(html), baseUrl),
  };
}

function firstTagContent(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  return html.match(pattern)?.[1] || '';
}

function firstAttributeBlock(html, attrName, attrValue) {
  const escaped = escapeRegExp(attrValue);
  const pattern = new RegExp(`<([a-z0-9-]+)[^>]+${attrName}=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
  return html.match(pattern)?.[2] || '';
}

function bodyContent(html) {
  return html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
}

function htmlToReadableText(rawHtml) {
  return rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(p|div|section|article|li|br|h[1-6]|blockquote|pre|tr|td|th)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .split('\n')
    .map((line) => cleanText(line))
    .filter(isUsefulLine)
    .join('\n');
}

function extractJsonLdText(html) {
  const blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const parts = [];

  for (const block of blocks) {
    const raw = decodeHtmlEntities(block[1] || '').trim();
    try {
      collectJsonLdText(JSON.parse(raw), parts);
    } catch {
      // Many sites serve malformed JSON-LD because apparently civilization was optional.
    }
  }

  return cleanReadableText(parts.join('\n'));
}

function collectJsonLdText(value, parts) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdText(item, parts);
    return;
  }
  if (typeof value !== 'object') return;

  for (const key of ['headline', 'name', 'description', 'articleBody', 'text']) {
    if (typeof value[key] === 'string') parts.push(value[key]);
  }

  for (const key of ['@graph', 'mainEntity', 'hasPart', 'itemListElement']) {
    collectJsonLdText(value[key], parts);
  }
}

function isUsefulLine(line) {
  if (!line) return false;
  const normalized = line.trim();
  if (normalized.length < 24 && !/[。！？.!?]/.test(normalized)) return false;
  if (/^(cookie|privacy|terms|login|sign in|subscribe|share|menu)$/i.test(normalized)) return false;
  if (/^(登入|註冊|分享|訂閱|隱私|條款|選單|返回|更多|載入中)$/.test(normalized)) return false;
  return true;
}

function cleanReadableText(text) {
  const seen = new Set();
  return text
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function scoreReadableText(text) {
  if (!text) return 0;
  const lines = text.split('\n').filter(Boolean);
  const longLines = lines.filter((line) => line.length > 80).length;
  const punctuation = (text.match(/[。！？.!?，,]/g) || []).length;
  return text.length + longLines * 120 + punctuation * 5;
}

function canonicalUrl(html) {
  const tag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] || '';
  return getAttribute(tag, 'href');
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
  return decodeHtmlEntities(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}

function decodeHtmlEntities(value) {
  return String(value || '')
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
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
