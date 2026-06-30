import type { DraftState, ExtensionPayload, Platform } from '../types';

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  threads: 'Threads',
  facebook: 'Facebook',
  bilibili: 'Bilibili',
  other: '其他',
};

export const PLATFORM_ORDER: Platform[] = ['youtube', 'instagram', 'threads', 'facebook', 'bilibili', 'other'];
export const SOCIAL_PLATFORMS: Platform[] = ['instagram', 'threads', 'facebook'];
export const PENDING_CATEGORY = '待整理';
export const LEGACY_SOCIAL_CATEGORY = '社群 / 貼文';

export const EMPTY_DRAFT: DraftState = {
  url: '',
  title: '',
  note: '',
  tags: '',
  rawText: '',
  sourceAction: 'manual',
  description: '',
  imageUrl: '',
  siteName: '',
  authorName: '',
  finalUrl: '',
  metadataError: '',
  contentText: '',
  contentLength: 0,
  extractionMethod: '',
  canonicalUrl: '',
  summary: '',
  category: '',
};

export function extractFirstUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? '';
}

export function normalizeUrl(input: string) {
  const trimmed = input.trim();
  const extracted = extractFirstUrl(trimmed) || trimmed;

  try {
    const url = new URL(extracted);
    url.hash = '';
    return url.toString();
  } catch {
    return extracted;
  }
}

export function detectPlatform(input: string): Platform {
  try {
    const host = new URL(input).hostname.replace(/^www\./, '').toLowerCase();

    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('threads.net') || host.includes('threads.com')) return 'threads';
    if (host.includes('facebook.com') || host.includes('fb.watch') || host.includes('fb.com')) return 'facebook';
    if (host.includes('bilibili.com') || host.includes('b23.tv')) return 'bilibili';
  } catch {
    return 'other';
  }

  return 'other';
}

export function isSocialPlatform(platform: Platform) {
  return SOCIAL_PLATFORMS.includes(platform);
}

export function normalizeCategory(category: string | undefined, platform: Platform) {
  const trimmed = (category || '').trim();
  if (!trimmed) return '';
  if (trimmed === LEGACY_SOCIAL_CATEGORY && isSocialPlatform(platform)) return PENDING_CATEGORY;
  return trimmed;
}

export function parseTags(input: string) {
  return input
    .split(/[#,，、\s]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);
}

export function isUrlLikeText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const compact = trimmed.replace(/\s+/g, '');
  return /^https?:\/\//i.test(compact) || /^www\./i.test(compact);
}

export function cleanSummarySource(text: string) {
  const boilerplate = [
    '為你推薦',
    '新串文',
    '搜尋',
    '訊息',
    '動態',
    '個人檔案',
    '洞察報告',
    '已儲存',
    '動態消息',
    '編輯',
    '追蹤中',
    '顯示更多',
    '更多',
    '有什麼新鮮事？',
    '發佈',
    '熱門',
    '查看動態',
    '回覆',
    '部分回覆已隱藏。',
    '查看全部',
    '附帶原始貼文的回覆內容',
    '原始貼文',
  ];

  let cleaned = text
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => !isUrlLikeText(line))
    .join('\n')
    .replace(/https?:\/\/\S+/gi, '\n');
  for (const word of boilerplate) {
    cleaned = cleaned.split(word).join('\n');
  }

  cleaned = cleaned
    .replace(/(\d+[,.]?\d*\s*萬?)(?=(\d+[,.]?\d*\s*萬?){1,})/g, '\n')
    .replace(/([\w.]{2,32})(\d+\s*(分鐘|小時|天|週|月)|剛才)/g, '\n$1 $2\n')
    .replace(/#([\p{L}\p{N}_]+)/gu, ' #$1')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/^\d+[,.]?\d*\s*萬?$/.test(line))
    .filter((line) => !/^\d+\s*(分鐘|小時|天|週|月)$/.test(line))
    .filter((line) => !/^(串文|次瀏覽|讚|分享|收藏)$/.test(line))
    .filter((line) => line.length > 8 || /[。！？!?]/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

export function splitSentences(text: string) {
  return cleanSummarySource(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => sentence.length > 12);
}

export function generateSummary(text: string, fallback = '') {
  const safeFallback = isUrlLikeText(fallback) ? '' : fallback;
  const source = cleanSummarySource(text).trim() || cleanSummarySource(safeFallback).trim();
  if (!source) return '';
  const sentences = splitSentences(source);
  const summary = (sentences.length > 0 ? sentences.slice(0, 3).join(' ') : source).slice(0, 360);
  return summary.trim();
}

export function inferCategory(input: string, platform: Platform) {
  const text = input.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['AI / 工具', /ai|人工智慧|llm|gpt|chatgpt|claude|模型|prompt|自動化|工具|workflow/],
    ['程式 / 開發', /react|typescript|javascript|python|api|github|cloudflare|chrome extension|前端|後端|程式|資料庫/],
    ['影音 / 創作', /youtube|bilibili|影片|剪輯|音樂|動畫|podcast|創作|字幕/],
    ['設計 / UI', /ui|ux|design|介面|設計|字體|排版|css|html/],
    ['學習 / 知識', /教學|學習|研究|論文|課程|知識|百科|wiki|大學|微積分/],
    ['旅遊 / 地點', /旅遊|旅行|自由行|大阪|京都|日本|沖繩|景點|行程/],
    ['生活 / 想法', /情侶|同居|生活|想法|關係|日常|溝通|伴侶/],
    ['健康 / 醫療', /醫學|醫療|手術|動脈瘤|健康|醫生|醫院|症狀/],
    ['食物 / 食譜', /食譜|餅乾|料理|食物|甜點|餐廳|吃/],
    ['運動 / 賽事', /世界盃|足球|籃球|比賽|球星|梅西|哈蘭德|姆巴佩/],
  ];

  for (const [label, pattern] of rules) {
    if (pattern.test(text)) return label;
  }

  if (platform === 'youtube' || platform === 'bilibili') return '影音 / 創作';
  return PENDING_CATEGORY;
}

export function suggestTags(text: string, platform: Platform) {
  const tags = new Set<string>();
  if (platform !== 'other') tags.add(PLATFORM_LABEL[platform]);
  const keywordTags: Array<[string, RegExp]> = [
    ['AI', /ai|人工智慧|llm|gpt|claude|模型/],
    ['工具', /tool|工具|workflow|自動化|extension/],
    ['前端', /react|vite|css|html|typescript|javascript/],
    ['設計', /ui|ux|design|設計|介面/],
    ['學習', /教學|學習|課程|筆記|研究/],
    ['影片', /youtube|bilibili|影片|video/],
  ];
  for (const [tag, pattern] of keywordTags) {
    if (pattern.test(text.toLowerCase())) tags.add(tag);
  }
  return Array.from(tags).slice(0, 6);
}

export function fallbackTitle(url: string) {
  const platform = detectPlatform(url);
  const descriptor = urlDescriptor(url);
  return `${PLATFORM_LABEL[platform]} 待整理${descriptor ? ` · ${descriptor}` : ''}`;
}

export function urlDescriptor(url: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const handle = parts.find((part) => part.startsWith('@'));
    if (handle) return handle;
    const last = parts[parts.length - 1];
    return last && last.length < 48 ? last : parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isGenericTitle(title: string, url = '') {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  const compact = normalized.replace(/\s+/g, '');
  if (/^https?:\/\//.test(compact) || /^www\./.test(compact)) return true;
  const generic = ['threads', 'instagram', 'facebook', 'youtube', 'bilibili', 'x', 'home', '首頁'];
  if (generic.includes(normalized)) return true;
  if (normalized.endsWith('收藏') || normalized.includes('待整理')) return true;
  if (url && normalized === fallbackTitle(url).toLowerCase()) return true;
  return false;
}

export function deriveItemTitle(rawTitle: string, url: string, summary = '', description = '') {
  if (!isGenericTitle(rawTitle, url)) return rawTitle.trim();
  const source = cleanSummarySource(summary || description);
  if (source.length >= 16) return source.slice(0, 48) + (source.length > 48 ? '…' : '');
  return fallbackTitle(url);
}

export function isRealTitle(title: string, url: string) {
  return title.trim() && !isGenericTitle(title, url);
}

export function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('zh-Hant-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function hostOf(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function buildDraftFromPayload(payload: ExtensionPayload): DraftState {
  const url = normalizeUrl(payload.url || extractFirstUrl(payload.text || '') || '');
  const content = (payload.selectedText || payload.text || '').trim();
  const platform = detectPlatform(url);
  const title = (payload.title || '').trim();
  const description = (payload.description || '').trim();
  const haystack = [title, description, content, url].filter(Boolean).join('\n');
  const tags = suggestTags(haystack, platform);

  return {
    ...EMPTY_DRAFT,
    url,
    title,
    description,
    imageUrl: payload.imageUrl || '',
    siteName: payload.siteName || hostOf(url),
    authorName: payload.authorName || '',
    rawText: content,
    contentText: cleanSummarySource(content),
    contentLength: cleanSummarySource(content).length,
    extractionMethod: content ? 'chrome_extension_dom' : '',
    summary: generateSummary(content, description || title),
    category: inferCategory(haystack, platform),
    tags: tags.join(' '),
    sourceAction: 'share-target',
  };
}
