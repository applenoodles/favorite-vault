const MAX_BYTES = 1_600_000;
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

  if (!targetUrl) return json({ ok: false, error: 'missing_url' }, 400);

  const validation = validateTargetUrl(targetUrl);
  if (!validation.ok) return json({ ok: false, error: validation.error }, 400);

  const directPlatformData = await extractPlatformDataFromUrl(validation.url);
  if (directPlatformData) {
    return json({
      ok: true,
      inputUrl: validation.url.toString(),
      finalUrl: validation.url.toString(),
      status: 200,
      contentType: 'application/json; platform=direct',
      limited: false,
      ...directPlatformData,
    });
  }

  if (isBilibiliUrl(validation.url)) {
    return json({ ok: false, error: 'platform_fetch_failed', platform: 'bilibili' }, 502);
  }

  if (isMetaUrl(validation.url)) {
    return json({ ok: false, error: 'platform_login_wall', platform: hostFromUrl(validation.url.toString()) }, 403);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(validation.url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'user-agent':
          'Mozilla/5.0 (compatible; FavoriteVaultBot/0.3; +https://lting.dpdns.org) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url || validation.url.toString();

    if (!response.ok) return json({ ok: false, error: 'fetch_failed', status: response.status, finalUrl }, 502);

    if (!isProbablyHtml(contentType)) {
      return json({
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
        canonicalUrl: '',
        limited: false,
      });
    }

    const { text, limited } = await readLimitedText(response, MAX_BYTES);
    const metadata = extractMetadata(text, finalUrl);
    const platformData = extractPlatformData(text, finalUrl);
    const extracted = platformData || extractReadableContent(text, finalUrl);

    return json({
      ok: true,
      inputUrl: validation.url.toString(),
      finalUrl,
      status: response.status,
      contentType,
      limited,
      ...metadata,
      ...(platformData || {}),
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

  if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, error: 'unsupported_protocol' };
  if (isBlockedHostname(url.hostname.toLowerCase())) return { ok: false, error: 'blocked_host' };
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
  } catch {}

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
  const title = firstNonEmpty([meta(html, 'property', 'og:title'), meta(html, 'name', 'twitter:title'), titleTag(html)]);
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
  const siteName = firstNonEmpty([meta(html, 'property', 'og:site_name'), meta(html, 'name', 'application-name'), hostFromUrl(baseUrl)]);
  const author = firstNonEmpty([meta(html, 'name', 'author'), meta(html, 'property', 'article:author')]);

  return {
    title: cleanText(title || filenameFromUrl(baseUrl)),
    description: cleanText(description),
    image,
    siteName: cleanText(siteName),
    author: cleanText(author),
  };
}

function isYouTubeUrl(url) {
  const host = url.hostname.toLowerCase();
  return host.includes('youtube.com') || host.includes('youtu.be');
}

function isBilibiliUrl(url) {
  const host = url.hostname.toLowerCase();
  return host.includes('bilibili.com') || host.includes('b23.tv');
}

function isMetaUrl(url) {
  const host = url.hostname.toLowerCase();
  return host.includes('instagram.com') || host.includes('threads.net') || host.includes('threads.com') || host.includes('facebook.com') || host.includes('fb.watch');
}

async function extractPlatformDataFromUrl(url) {
  if (isYouTubeUrl(url)) return (await extractYouTubeOEmbedData(url)) || buildYouTubeFallbackExtract(url);
  if (isBilibiliUrl(url)) return extractBilibiliApiData(url);
  return null;
}

async function extractYouTubeOEmbedData(url) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url.toString())}&format=json`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; FavoriteVaultBot/0.3; +https://lting.dpdns.org)',
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const title = cleanText(payload.title || filenameFromUrl(url.toString()));
    const author = cleanText(payload.author_name || '');
    const image = absolutize(payload.thumbnail_url || '', url.toString());
    const contentText = cleanReadableText([title, author && `作者：${author}`].filter(Boolean).join('\n'));

    return makeExtracted({
      title,
      description: '',
      image,
      siteName: 'YouTube',
      author,
      contentText,
      extractionMethod: 'youtube_oembed',
      canonicalUrl: url.toString(),
    });
  } catch {
    return null;
  }
}

async function extractBilibiliApiData(url) {
  const bvid = extractBvid(url.toString());
  if (!bvid) return null;

  try {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {
      headers: {
        accept: 'application/json',
        referer: 'https://www.bilibili.com/',
        'user-agent': 'Mozilla/5.0 (compatible; FavoriteVaultBot/0.3; +https://lting.dpdns.org)',
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.code !== 0 || !payload?.data) return null;
    return buildBilibiliExtract(payload.data, url.toString(), 'bilibili_view_api');
  } catch {
    return null;
  }
}

function extractPlatformData(html, baseUrl) {
  const host = hostFromUrl(baseUrl).toLowerCase();
  if (host.includes('youtube.com') || host.includes('youtu.be')) return extractYouTubeData(html, baseUrl);
  if (host.includes('bilibili.com') || host.includes('b23.tv')) return extractBilibiliData(html, baseUrl);
  return null;
}

function extractYouTubeData(html, baseUrl) {
  const raw = extractBalancedJsonAfter(html, 'ytInitialPlayerResponse');
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    const details = data.videoDetails || {};
    const micro = data.microformat?.playerMicroformatRenderer || {};
    const title = cleanText(details.title || textRenderer(micro.title) || filenameFromUrl(baseUrl));
    const author = cleanText(details.author || micro.ownerChannelName || '');
    const description = cleanText(details.shortDescription || textRenderer(micro.description) || '');
    const image = largestThumbnail(details.thumbnail?.thumbnails || micro.thumbnail?.thumbnails || []);
    const contentText = cleanReadableText([title, author && `作者：${author}`, description].filter(Boolean).join('\n'));

    return makeExtracted({
      title,
      description,
      image,
      siteName: 'YouTube',
      author,
      contentText,
      extractionMethod: 'youtube_player_response',
      canonicalUrl: baseUrl,
    });
  } catch {
    return null;
  }
}

function buildYouTubeFallbackExtract(url) {
  const videoId = extractYouTubeVideoId(url.toString());
  const title = videoId ? `YouTube 影片 ${videoId}` : filenameFromUrl(url.toString());
  const image = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
  const contentText = cleanReadableText(title);

  return makeExtracted({
    title,
    description: '',
    image,
    siteName: 'YouTube',
    author: '',
    contentText,
    extractionMethod: 'youtube_url_fallback',
    canonicalUrl: url.toString(),
  });
}

function extractYouTubeVideoId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname.toLowerCase().includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
    return url.searchParams.get('v') || url.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || url.pathname.match(/\/embed\/([^/?#]+)/)?.[1] || '';
  } catch {
    return '';
  }
}

function extractBilibiliData(html, baseUrl) {
  const raw = html.match(/window\.__INITIAL_STATE__=([\s\S]*?);\(function/i)?.[1];
  if (!raw) return null;

  try {
    const state = JSON.parse(raw);
    const video = state.videoData || {};
    const tags = Array.isArray(state.tags) ? state.tags.map((tag) => tag.tag_name || tag.name).filter(Boolean) : [];
    return buildBilibiliExtract({ ...video, tags }, baseUrl, 'bilibili_initial_state');
  } catch {
    return null;
  }
}

function buildBilibiliExtract(video, baseUrl, method) {
  const owner = video.owner || {};
  const tags = Array.isArray(video.tags) ? video.tags.filter(Boolean) : [];
  const title = cleanText(video.title || filenameFromUrl(baseUrl));
  const author = cleanText(owner.name || '');
  const description = cleanText(video.desc || '');
  const image = absolutize(video.pic || '', baseUrl);
  const stats = video.stat
    ? [`播放：${video.stat.view || 0}`, `彈幕：${video.stat.danmaku || 0}`, `收藏：${video.stat.favorite || 0}`]
    : [];
  const contentText = cleanReadableText(
    [title, author && `作者：${author}`, description, tags.length && `標籤：${tags.join('、')}`, stats.join('，')]
      .filter(Boolean)
      .join('\n'),
  );

  return makeExtracted({
    title,
    description,
    image,
    siteName: 'Bilibili',
    author,
    contentText,
    extractionMethod: method,
    canonicalUrl: baseUrl,
  });
}

function extractBvid(rawUrl) {
  return rawUrl.match(/BV[a-zA-Z0-9]+/)?.[0] || '';
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
    if (scoreReadableText(text) > scoreReadableText(best.text)) best = { method: candidate.method, text };
  }

  const jsonLdText = extractJsonLdText(html);
  if (scoreReadableText(jsonLdText) > scoreReadableText(best.text)) best = { method: 'json_ld', text: jsonLdText };

  return makeExtracted({
    contentText: cleanReadableText(best.text),
    extractionMethod: best.text ? best.method : 'none',
    canonicalUrl: absolutize(canonicalUrl(html), baseUrl),
  });
}

function makeExtracted(data) {
  const contentText = cleanReadableText(data.contentText || '').slice(0, MAX_CONTENT_CHARS);
  return {
    ...data,
    contentText,
    contentPreview: contentText.slice(0, 600),
    contentLength: contentText.length,
    extractionMethod: contentText ? data.extractionMethod : 'none',
  };
}

function extractBalancedJsonAfter(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return '';
  const start = html.indexOf('{', markerIndex);
  if (start < 0) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    const code = html.charCodeAt(index);

    if (inString) {
      if (escaped) escaped = false;
      else if (code === 92) escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }

  return '';
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
    .replace(/<script\b[\s\S]*$/i, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<style\b[\s\S]*$/i, ' ')
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
    } catch {}
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
  for (const key of ['@graph', 'mainEntity', 'hasPart', 'itemListElement']) collectJsonLdText(value[key], parts);
}

function isUsefulLine(line) {
  if (!line) return false;
  const normalized = line.trim();
  if (normalized.length < 24 && !/[。！？.!?]/.test(normalized)) return false;
  if (/^(cookie|privacy|terms|login|sign in|subscribe|share|menu)$/i.test(normalized)) return false;
  if (/^(登入|註冊|分享|訂閱|隱私|條款|選單|返回|更多|載入中)$/.test(normalized)) return false;
  if (/ytInitial|var yt|window\.__|function\(|webpack|serviceTrackingParams/i.test(normalized)) return false;
  return true;
}

function cleanReadableText(text) {
  const seen = new Set();
  return String(text || '')
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

function textRenderer(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || '').join('');
  return '';
}

function largestThumbnail(thumbnails) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return '';
  const sorted = [...thumbnails].sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
  return sorted[0]?.url || '';
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
