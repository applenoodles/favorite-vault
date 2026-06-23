import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';

type Platform = 'youtube' | 'instagram' | 'threads' | 'facebook' | 'bilibili' | 'other';
type SourceAction = 'manual' | 'share-target' | 'imported';

interface FavoriteItem {
  id: string;
  url: string;
  title: string;
  note: string;
  tags: string[];
  platform: Platform;
  sourceAction: SourceAction;
  createdAt: string;
  updatedAt?: string;
  rawText?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  authorName?: string;
  finalUrl?: string;
  metadataFetchedAt?: string;
  metadataError?: string;
  contentText?: string;
  contentLength?: number;
  extractionMethod?: string;
  canonicalUrl?: string;
  summary?: string;
  category?: string;
  notionPageId?: string;
}

interface DraftState {
  url: string;
  title: string;
  note: string;
  tags: string;
  rawText: string;
  sourceAction: SourceAction;
  description: string;
  imageUrl: string;
  siteName: string;
  authorName: string;
  finalUrl: string;
  metadataError: string;
  contentText: string;
  contentLength: number;
  extractionMethod: string;
  canonicalUrl: string;
  summary: string;
  category: string;
}

interface ExtensionPayload {
  url?: string;
  title?: string;
  text?: string;
  selectedText?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  authorName?: string;
}

interface MetadataResponse {
  ok: boolean;
  error?: string;
  inputUrl?: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
  limited?: boolean;
  contentText?: string;
  contentPreview?: string;
  contentLength?: number;
  extractionMethod?: string;
  canonicalUrl?: string;
}

interface LlmBatchResultItem {
  id: string;
  title?: string;
  description?: string;
  summary?: string;
  category?: string;
  tags?: string[] | string;
  note?: string;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const STORAGE_KEY = 'favorite-vault-items-v2';
const LEGACY_STORAGE_KEY = 'favorite-vault-items-v1';
const VAULT_KEY_STORAGE = 'favorite-vault-cloud-key-v1';

const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  threads: 'Threads',
  facebook: 'Facebook',
  bilibili: 'Bilibili',
  other: '其他',
};

const PLATFORM_ORDER: Platform[] = ['youtube', 'instagram', 'threads', 'facebook', 'bilibili', 'other'];
const PENDING_CATEGORY = '待整理';

const EMPTY_DRAFT: DraftState = {
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

const metadataErrorLabels: Record<string, string> = {
  missing_url: '沒有網址，這就像叫外送但不給地址。',
  invalid_url: '網址格式不對。',
  unsupported_protocol: '只支援 http / https。',
  blocked_host: '這個網址被安全規則擋下來。',
  fetch_failed: '抓取失敗，對方網站可能擋機器人或需要登入。',
  timeout: '抓取逾時，對方網站慢得像行政流程。',
  fetch_error: '抓取時發生錯誤。',
  server_non_json: '解析服務回了非 JSON，通常是平台或 Cloudflare 中途炸了。',
  platform_fetch_failed: '平台資料抓取失敗，這個站可能擋住伺服器請求。',
  platform_login_wall: '這個平台通常需要登入或阻擋伺服器抓取。請用分享原文、手動貼內文，或之後改用瀏覽器外掛抓當前頁面。',
  missing_notion_config: 'Notion 還沒設定 NOTION_TOKEN / NOTION_DATABASE_ID。',
  object_not_found: 'Notion 找不到 database。通常是 database 沒分享給 integration。',
  unauthorized: 'Notion token 無效或權限不足。',
  validation_error: 'Notion database 欄位名稱或型別不符合。',
  invalid_json: '雲端 API 收到無效 JSON。',
  invalid_item: '雲端 API 收到無效收藏資料。',
};

function createId() {
  if ('crypto' in window && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractFirstUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? '';
}

function normalizeUrl(input: string) {
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

function detectPlatform(input: string): Platform {
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

function parseTags(input: string) {
  return input
    .split(/[#,，、\s]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);
}

function cleanSummarySource(text: string) {
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

  let cleaned = text.replace(/\r/g, '\n');
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

function splitSentences(text: string) {
  return cleanSummarySource(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => sentence.length > 12);
}

function generateSummary(text: string, fallback = '') {
  const source = cleanSummarySource(text).trim() || cleanSummarySource(fallback).trim();
  if (!source) return '';
  const sentences = splitSentences(source);
  const summary = (sentences.length > 0 ? sentences.slice(0, 3).join(' ') : source).slice(0, 360);
  return summary.trim();
}

function inferCategory(input: string, platform: Platform) {
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

function suggestTags(text: string, platform: Platform) {
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

function buildDraftFromPayload(payload: ExtensionPayload): DraftState {
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

function normalizeImportedItem(item: Partial<FavoriteItem>): FavoriteItem | null {
  if (!item.url) return null;
  const url = normalizeUrl(item.url);

  return {
    id: item.id || createId(),
    url,
    title: item.title || fallbackTitle(url),
    note: item.note || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    platform: item.platform || detectPlatform(url),
    sourceAction: item.sourceAction || 'imported',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt,
    rawText: item.rawText,
    description: item.description,
    imageUrl: item.imageUrl,
    siteName: item.siteName,
    authorName: item.authorName,
    finalUrl: item.finalUrl,
    metadataFetchedAt: item.metadataFetchedAt,
    metadataError: item.metadataError,
    contentText: item.contentText,
    contentLength: item.contentLength,
    extractionMethod: item.extractionMethod,
    canonicalUrl: item.canonicalUrl,
    summary: item.summary,
    category: item.category,
    notionPageId: item.notionPageId,
  };
}

function loadItems(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<FavoriteItem>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeImportedItem).filter(Boolean) as FavoriteItem[];
  } catch {
    return [];
  }
}

function saveItems(items: FavoriteItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function mergeItems(localItems: FavoriteItem[], remoteItems: FavoriteItem[]) {
  const byId = new Map<string, FavoriteItem>();
  for (const item of [...localItems, ...remoteItems]) {
    const previous = byId.get(item.id);
    if (!previous || new Date(item.updatedAt || item.createdAt).getTime() >= new Date(previous.updatedAt || previous.createdAt).getTime()) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function loadVaultKey() {
  return localStorage.getItem(VAULT_KEY_STORAGE) || '';
}

function saveVaultKey(key: string) {
  localStorage.setItem(VAULT_KEY_STORAGE, key.trim());
}

async function requestCloudItems(_source: string) {
  const response = await fetch('/api/notion-items');
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `notion_load_${response.status}`);
  return (Array.isArray(data.items) ? data.items : []).map(normalizeImportedItem).filter(Boolean) as FavoriteItem[];
}

async function upsertCloudItem(_source: string, item: FavoriteItem) {
  const response = await fetch('/api/notion-items', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ item }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `notion_save_${response.status}`);
  return normalizeImportedItem(data.item) || item;
}

async function deleteCloudItem(_source: string, id: string) {
  const response = await fetch(`/api/notion-items?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `notion_delete_${response.status}`);
}

function fallbackTitle(url: string) {
  const platform = detectPlatform(url);
  const descriptor = urlDescriptor(url);
  return `${PLATFORM_LABEL[platform]} 待整理${descriptor ? ` · ${descriptor}` : ''}`;
}

function urlDescriptor(url: string) {
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

function isGenericTitle(title: string, url = '') {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  const generic = ['threads', 'instagram', 'facebook', 'youtube', 'bilibili', 'x', 'home', '首頁'];
  if (generic.includes(normalized)) return true;
  if (normalized.endsWith('收藏') || normalized.includes('待整理')) return true;
  if (url && normalized === fallbackTitle(url).toLowerCase()) return true;
  return false;
}

function deriveItemTitle(rawTitle: string, url: string, summary = '', description = '') {
  if (!isGenericTitle(rawTitle, url)) return rawTitle.trim();
  const source = cleanSummarySource(summary || description);
  if (source.length >= 16) return source.slice(0, 48) + (source.length > 48 ? '…' : '');
  return fallbackTitle(url);
}

function isRealTitle(title: string, url: string) {
  return title.trim() && !isGenericTitle(title, url);
}

function formatDate(iso: string) {
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

function hostOf(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function needsLlmPass(item: FavoriteItem) {
  return (
    !item.summary ||
    item.summary.length < 24 ||
    !item.category ||
    item.category === '未分類' ||
    item.category === PENDING_CATEGORY ||
    Boolean(item.metadataError) ||
    ['instagram', 'threads', 'facebook'].includes(item.platform) ||
    isGenericTitle(item.title, item.url)
  );
}

function getLlmBatchCandidates(items: FavoriteItem[]) {
  const candidates = items.filter(needsLlmPass);
  return (candidates.length > 0 ? candidates : items).slice(0, 80);
}

function buildLlmBatchMarkdown(items: FavoriteItem[]) {
  const batchItems = getLlmBatchCandidates(items).map((item) => ({
    id: item.id,
    url: item.finalUrl || item.url,
    platform: PLATFORM_LABEL[item.platform],
    title: item.title,
    currentSummary: item.summary || '',
    currentCategory: item.category || '',
    currentTags: item.tags,
    description: item.description || '',
    siteName: item.siteName || '',
    authorName: item.authorName || '',
    note: item.note || '',
    reason: needsLlmPass(item) ? 'needs_review' : 'included_for_context',
  }));

  return `# Favorite Vault LLM Batch

你是一個私人收藏整理助理。請幫我整理下面的收藏項目，讓它們變成 AI 可以理解、可以搜尋、可以之後做個人化推薦的資料。

你可以依每個 url 自行開啟連結、閱讀原文、留言、回覆串、相關文章或頁面脈絡。若連結無法開啟，就根據現有欄位整理。不要輸出長篇原文，不要塞 UI 垃圾文字，只保留摘要、分類、標籤與必要說明。

請只輸出有效 JSON，不要 Markdown，不要解釋。格式如下：

{
  "items": [
    {
      "id": "原本的 id，必填，不可改",
      "title": "必填。請產生能辨識主題的標題，不要用 Threads 收藏、Instagram 收藏、待整理 這種廢標題",
      "description": "可選，短描述",
      "summary": "80 到 180 字，說清楚這筆收藏在講什麼、為什麼值得留下",
      "category": "必填。請依主題分類，例如 AI / 工具、學習 / 知識、設計 / UI、影音 / 創作、生活 / 想法、健康 / 醫療、旅遊 / 地點。不要把平台當分類，不要用 社群 / 貼文，除非內容本身是在討論社群平台。",
      "tags": ["3 到 8 個短標籤"],
      "note": "可選，若有觀察、洞察或提醒才填"
    }
  ]
}

## Items

${JSON.stringify(batchItems, null, 2)}
`;
}

function extractJsonText(input: string) {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const firstObject = input.indexOf('{');
  const firstArray = input.indexOf('[');
  const startCandidates = [firstObject, firstArray].filter((index) => index >= 0);
  if (startCandidates.length === 0) return input.trim();
  return input.slice(Math.min(...startCandidates)).trim();
}

function parseLlmBatchResults(raw: string): LlmBatchResultItem[] {
  const parsed = JSON.parse(extractJsonText(raw)) as unknown;
  const value = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && 'items' in parsed
      ? (parsed as { items?: unknown }).items
      : [];

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is LlmBatchResultItem => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string')
    .map((item) => item);
}

function metadataErrorText(error?: string) {
  if (!error) return '';
  return metadataErrorLabels[error] ?? error;
}

async function requestMetadata(url: string): Promise<MetadataResponse> {
  const response = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error('server_non_json');
  }

  const data = (await response.json()) as MetadataResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.error || `metadata_http_${response.status}`);
  }

  return data;
}

export default function App() {
  const [items, setItems] = useState<FavoriteItem[]>(() => loadItems());
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [vaultKey] = useState('notion');
  const [cloudStatus, setCloudStatus] = useState('Notion 待同步');
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const llmImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveItems(items);
  }, [items]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    void loadFromCloud({ mergeLocal: true });
  }, []);

  async function loadFromCloud(options: { mergeLocal?: boolean } = {}) {
    setIsCloudLoading(true);
    setCloudStatus('Notion 同步中...');
    try {
      const remoteItems = await requestCloudItems(vaultKey);
      setItems((current) => (options.mergeLocal ? mergeItems(current, remoteItems) : remoteItems));
      setCloudStatus(`已同步 ${remoteItems.length} 筆 Notion 收藏`);
    } catch (error) {
      setCloudStatus(`雲端讀取失敗：${metadataErrorText((error as Error).message)}`);
    } finally {
      setIsCloudLoading(false);
    }
  }

  async function pushLocalToCloud() {
    setIsCloudLoading(true);
    setCloudStatus('本機資料上傳到 Notion 中...');
    try {
      for (const item of items) {
        await upsertCloudItem(vaultKey, item);
      }
      setCloudStatus(`已上傳 ${items.length} 筆本機收藏到 Notion`);
    } catch (error) {
      setCloudStatus(`上傳失敗：${metadataErrorText((error as Error).message)}`);
    } finally {
      setIsCloudLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('shareUrl') ?? params.get('url') ?? '';
    const sharedTitle = params.get('shareTitle') ?? params.get('title') ?? '';
    const sharedText = params.get('shareText') ?? params.get('text') ?? '';

    if (!sharedUrl && !sharedTitle && !sharedText) return;

    const bestUrl = normalizeUrl(sharedUrl || extractFirstUrl(sharedText));
    const content = [sharedTitle, sharedText].filter(Boolean).join('\n');
    const platform = detectPlatform(bestUrl);
    setDraft({
      ...EMPTY_DRAFT,
      url: bestUrl,
      title: sharedTitle,
      rawText: content,
      contentText: content,
      contentLength: content.length,
      summary: generateSummary(content, sharedTitle),
      category: inferCategory(content, platform),
      tags: suggestTags(content, platform).join(' '),
      sourceAction: 'share-target',
    });
    setIsComposerOpen(true);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    const handleExtensionPayload = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'favorite-vault-extension-payload') return;
      const payload = event.data.payload as ExtensionPayload;
      setDraft(buildDraftFromPayload(payload));
      setIsComposerOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    window.addEventListener('message', handleExtensionPayload);
    return () => window.removeEventListener('message', handleExtensionPayload);
  }, []);

  const platformCounts = useMemo(() => {
    return items.reduce<Record<Platform, number>>(
      (acc, item) => {
        acc[item.platform] += 1;
        return acc;
      },
      { youtube: 0, instagram: 0, threads: 0, facebook: 0, bilibili: 0, other: 0 },
    );
  }, [items]);

  const profile = useMemo(() => {
    const parsed = items.filter((item) => !item.metadataError && (item.siteName || item.imageUrl || item.description || item.contentText)).length;
    const topPlatform = PLATFORM_ORDER.map((platform) => [platform, platformCounts[platform]] as const)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    const tagFreq = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
      }
    }

    const frequentTags = Array.from(tagFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag);

    return { parsed, total: items.length, topPlatform: topPlatform || '', frequentTags };
  }, [items, platformCounts]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return items
      .filter((item) => platformFilter === 'all' || item.platform === platformFilter)
      .filter((item) => {
        if (!keyword) return true;
        const haystack = [
          item.title,
          item.url,
          item.finalUrl,
          item.note,
          item.rawText,
          item.description,
          item.summary,
          item.category,
          item.contentText,
          item.siteName,
          item.authorName,
          item.platform,
          ...item.tags,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, platformFilter, query]);

  const openComposer = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setIsComposerOpen(true);
  }, []);

  function updateDraft(field: keyof DraftState, value: string | number) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function fetchMetadataForDraft() {
    const normalizedUrl = normalizeUrl(draft.url || extractFirstUrl(draft.rawText));
    if (!normalizedUrl) return;

    setIsMetadataLoading(true);
    setDraft((current) => ({ ...current, url: normalizedUrl, metadataError: '' }));

    try {
      const metadata = await requestMetadata(normalizedUrl);
      setDraft((current) => ({
        ...current,
        url: normalizedUrl,
        finalUrl: metadata.finalUrl || normalizedUrl,
        title: current.title.trim() ? current.title : metadata.title || current.title,
        description: metadata.description || current.description,
        imageUrl: metadata.image || current.imageUrl,
        siteName: metadata.siteName || current.siteName || hostOf(metadata.finalUrl || normalizedUrl),
        authorName: metadata.author || current.authorName,
        contentText: metadata.contentText || current.contentText,
        contentLength: metadata.contentLength || current.contentLength,
        extractionMethod: metadata.extractionMethod || current.extractionMethod,
        canonicalUrl: metadata.canonicalUrl || current.canonicalUrl,
        summary: current.summary || generateSummary(metadata.contentText || metadata.description || '', metadata.title || ''),
        category: current.category && current.category !== PENDING_CATEGORY ? current.category : inferCategory([metadata.title, metadata.description, metadata.contentText, normalizedUrl].filter(Boolean).join('\n'), detectPlatform(normalizedUrl)),
        tags: current.tags || suggestTags([metadata.title, metadata.description, metadata.contentText, normalizedUrl].filter(Boolean).join('\n'), detectPlatform(normalizedUrl)).join(' '),
        metadataError: '',
      }));
    } catch (error) {
      setDraft((current) => ({ ...current, metadataError: metadataErrorText((error as Error).message) }));
    } finally {
      setIsMetadataLoading(false);
    }
  }

  async function enrichExistingItem(item: FavoriteItem) {
    setItems((current) => current.map((candidate) => (candidate.id === item.id ? { ...candidate, metadataError: '' } : candidate)));

    try {
      const metadata = await requestMetadata(item.finalUrl || item.url);
      setItems((current) =>
        current.map((candidate) => {
          if (candidate.id !== item.id) return candidate;

          return {
            ...candidate,
            finalUrl: metadata.finalUrl || candidate.finalUrl,
            title: isRealTitle(candidate.title, candidate.url) ? candidate.title : metadata.title || candidate.title,
            description: metadata.description || candidate.description,
            imageUrl: metadata.image || candidate.imageUrl,
            siteName: metadata.siteName || candidate.siteName || hostOf(metadata.finalUrl || candidate.url),
            authorName: metadata.author || candidate.authorName,
            contentText: metadata.contentText || candidate.contentText,
            contentLength: metadata.contentLength || candidate.contentLength,
            extractionMethod: metadata.extractionMethod || candidate.extractionMethod,
            canonicalUrl: metadata.canonicalUrl || candidate.canonicalUrl,
            summary: candidate.summary || generateSummary(metadata.contentText || metadata.description || '', metadata.title || candidate.title),
            category: candidate.category && candidate.category !== PENDING_CATEGORY ? candidate.category : inferCategory([metadata.title, metadata.description, metadata.contentText, candidate.url].filter(Boolean).join('\n'), candidate.platform),
            metadataFetchedAt: new Date().toISOString(),
            metadataError: '',
          };
        }),
      );
    } catch (error) {
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, metadataError: metadataErrorText((error as Error).message), metadataFetchedAt: new Date().toISOString() }
            : candidate,
        ),
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedUrl = normalizeUrl(draft.url || extractFirstUrl(draft.rawText));
    if (!normalizedUrl) return;

    const summarySource = draft.contentText.trim() || draft.rawText.trim() || draft.description.trim();
    const summary = draft.summary.trim() || generateSummary(summarySource, draft.description || draft.title);
    const category = draft.category.trim() || inferCategory([draft.title, draft.description, summary, normalizedUrl].filter(Boolean).join('\n'), detectPlatform(normalizedUrl));
    const title = deriveItemTitle(draft.title.trim(), normalizedUrl, summary, draft.description);

    const item: FavoriteItem = {
      id: createId(),
      url: normalizedUrl,
      title,
      note: draft.note.trim(),
      tags: parseTags(draft.tags),
      platform: detectPlatform(normalizedUrl),
      sourceAction: draft.sourceAction,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rawText: undefined,
      description: draft.description.trim() || undefined,
      imageUrl: draft.imageUrl.trim() || undefined,
      siteName: draft.siteName.trim() || hostOf(draft.finalUrl || normalizedUrl),
      authorName: draft.authorName.trim() || undefined,
      finalUrl: draft.finalUrl.trim() || undefined,
      metadataFetchedAt: draft.description || draft.imageUrl || draft.siteName || summary ? new Date().toISOString() : undefined,
      metadataError: draft.metadataError || undefined,
      contentText: undefined,
      contentLength: undefined,
      extractionMethod: draft.extractionMethod || undefined,
      canonicalUrl: draft.canonicalUrl || undefined,
      summary: summary || undefined,
      category: category || undefined,
    };

    setItems((current) => [item, ...current]);
    setDraft(EMPTY_DRAFT);
    setIsComposerOpen(false);

    if (vaultKey.trim()) {
      try {
        const saved = await upsertCloudItem(vaultKey.trim(), item);
        setItems((current) => current.map((candidate) => (candidate.id === item.id ? saved : candidate)));
        setCloudStatus('已儲存到雲端');
      } catch (error) {
        setCloudStatus(`雲端儲存失敗：${metadataErrorText((error as Error).message)}`);
      }
    }
  }

  async function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (!vaultKey.trim()) return;
    try {
      await deleteCloudItem(vaultKey.trim(), id);
      setCloudStatus('已從雲端刪除');
    } catch (error) {
      setCloudStatus(`雲端刪除失敗：${metadataErrorText((error as Error).message)}`);
    }
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function exportJson() {
    const now = new Date().toISOString().slice(0, 10);
    downloadFile(`favorite-vault-${now}.json`, JSON.stringify(items, null, 2), 'application/json');
  }

  function exportLlmBatch() {
    const now = new Date().toISOString().slice(0, 10);
    const candidates = getLlmBatchCandidates(items);
    if (candidates.length === 0) {
      alert('目前沒有收藏可以丟給 LLM。先存點東西，不然模型只能整理空氣。');
      return;
    }
    downloadFile(`favorite-vault-llm-batch-${now}.md`, buildLlmBatchMarkdown(items), 'text/markdown;charset=utf-8');
  }

  async function applyLlmResults(results: LlmBatchResultItem[]) {
    if (results.length === 0) {
      alert('沒有讀到 LLM 結果。請確認它回的是 JSON，別讓它又寫散文。');
      return;
    }

    const resultById = new Map(results.map((item) => [item.id, item]));
    const updatedItems: FavoriteItem[] = [];

    setItems((current) =>
      current.map((item) => {
        const result = resultById.get(item.id);
        if (!result) return item;

        const updated: FavoriteItem = {
          ...item,
          title: result.title?.trim() || item.title,
          description: result.description?.trim() || item.description,
          summary: result.summary?.trim() || item.summary,
          category: result.category?.trim() || item.category,
          tags: Array.isArray(result.tags) ? result.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : result.tags ? parseTags(result.tags) : item.tags,
          note: result.note?.trim() || item.note,
          metadataError: result.summary ? undefined : item.metadataError,
          updatedAt: new Date().toISOString(),
        };
        updatedItems.push(updated);
        return updated;
      }),
    );

    if (vaultKey.trim()) {
      try {
        for (const item of updatedItems) {
          await upsertCloudItem(vaultKey.trim(), item);
        }
        setCloudStatus(`已匯入 LLM 結果並同步 ${updatedItems.length} 筆`);
      } catch (error) {
        setCloudStatus(`LLM 結果已匯入本機，但雲端同步失敗：${metadataErrorText((error as Error).message)}`);
      }
    }
  }

  function handleLlmImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        void applyLlmResults(parseLlmBatchResults(String(reader.result)));
      } catch {
        alert('匯入失敗：LLM 回傳不是有效 JSON。');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as Partial<FavoriteItem>[];
        if (!Array.isArray(imported)) return;

        const byUrl = new Map(items.map((item) => [item.url, item]));
        for (const rawItem of imported) {
          const item = normalizeImportedItem({ ...rawItem, sourceAction: rawItem.sourceAction || 'imported' });
          if (!item) continue;
          byUrl.set(item.url, item);
        }
        setItems(Array.from(byUrl.values()));
      } catch {
        alert('匯入失敗：JSON 格式無法解析。');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app">
      <div className="container">
        <AppHeader canInstall={Boolean(installPrompt)} onInstall={handleInstall} onAdd={openComposer} />

        <CloudSyncPanel
          cloudStatus={cloudStatus}
          isCloudLoading={isCloudLoading}
          onPull={() => loadFromCloud({ mergeLocal: false })}
          onPush={pushLocalToCloud}
        />

        <VaultProfileCard profile={profile} />

        <StatChips total={items.length} counts={platformCounts} />

        <Toolbar
          query={query}
          onQuery={setQuery}
          platformFilter={platformFilter}
          onPlatform={setPlatformFilter}
          counts={platformCounts}
          onExport={exportJson}
          onImportClick={() => importInputRef.current?.click()}
          onLlmExport={exportLlmBatch}
          onLlmImportClick={() => llmImportInputRef.current?.click()}
        />
        <input ref={importInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={handleImportFile} />
        <input ref={llmImportInputRef} className="hidden-input" type="file" accept="application/json,.json,.md,.txt,text/markdown,text/plain" onChange={handleLlmImportFile} />

        {filteredItems.length === 0 ? (
          <EmptyState hasItems={items.length > 0} onAdd={openComposer} />
        ) : (
          <ul className="item-grid" aria-label="收藏清單">
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} onDelete={() => removeItem(item.id)} onReparse={() => enrichExistingItem(item)} />
            ))}
          </ul>
        )}
      </div>

      {isComposerOpen && (
        <AddItemModal
          draft={draft}
          isParsing={isMetadataLoading}
          onUpdate={updateDraft}
          onParse={fetchMetadataForDraft}
          onClose={() => setIsComposerOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function CloudSyncPanel({
  cloudStatus,
  isCloudLoading,
  onPull,
  onPush,
}: {
  cloudStatus: string;
  isCloudLoading: boolean;
  onPull: () => Promise<void>;
  onPush: () => Promise<void>;
}) {
  return (
    <section className="cloud-card" aria-label="雲端同步">
      <div className="cloud-card__copy">
        <span className="cloud-card__eyebrow">Notion sync</span>
        <strong>Notion database</strong>
        <p>{cloudStatus}</p>
      </div>
      <div className="cloud-card__controls cloud-card__controls--simple">
        <button className="btn btn--primary" type="button" onClick={onPull} disabled={isCloudLoading}>
          從 Notion 載入
        </button>
        <button className="btn btn--quiet" type="button" onClick={onPush} disabled={isCloudLoading}>
          上傳本機到 Notion
        </button>
      </div>
    </section>
  );
}

function AppHeader({
  canInstall,
  onInstall,
  onAdd,
}: {
  canInstall: boolean;
  onInstall: () => void;
  onAdd: () => void;
}) {
  return (
    <header className="app-header">
      <div className="app-header__text">
        <h1 className="app-title">Favorite Vault</h1>
        <p className="app-subtitle">把散落在各平台的收藏，整理成自己的私人知識庫。</p>
      </div>
      <div className="app-header__actions">
        <button className="btn btn--primary" type="button" onClick={onAdd}>
          新增收藏
        </button>
        {canInstall && (
          <button className="btn btn--ghost" type="button" onClick={onInstall}>
            安裝 App
          </button>
        )}
      </div>
    </header>
  );
}

function VaultProfileCard({
  profile,
}: {
  profile: {
    parsed: number;
    total: number;
    topPlatform: Platform | '';
    frequentTags: string[];
  };
}) {
  return (
    <section className="profile-card" aria-label="收藏輪廓">
      <div className="profile-card__head">
        <span className="profile-card__eyebrow">收藏輪廓</span>
      </div>
      <div className="profile-card__rows">
        <div className="profile-row">
          <span className="profile-row__label">Parsed metadata</span>
          <span className="profile-row__value">
            {profile.parsed} / {profile.total}
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-row__label">Top platform</span>
          <span className="profile-row__value">{profile.topPlatform ? PLATFORM_LABEL[profile.topPlatform] : '—'}</span>
        </div>
        <div className="profile-row profile-row--tags">
          <span className="profile-row__label">Frequent tags</span>
          <span className="profile-row__value">
            {profile.frequentTags.length > 0 ? (
              <span className="tag-row">
                {profile.frequentTags.map((tag) => (
                  <span className="tag tag--soft" key={tag}>
                    #{tag}
                  </span>
                ))}
              </span>
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>
      <p className="profile-card__hint">
        這些 metadata 之後可以用來做摘要、語意搜尋和個人化推薦。你存的每一筆，都在累積一個 AI 能理解的個人資料庫。
      </p>
    </section>
  );
}

function StatChips({ total, counts }: { total: number; counts: Record<Platform, number> }) {
  return (
    <div className="stat-chips" role="list" aria-label="收藏統計">
      <div className="stat-chip stat-chip--total" role="listitem">
        <span className="stat-chip__num">{total}</span>
        <span className="stat-chip__label">總收藏</span>
      </div>
      {PLATFORM_ORDER.filter((platform) => counts[platform] > 0).map((platform) => (
        <div className="stat-chip" role="listitem" key={platform}>
          <span className="stat-chip__num">{counts[platform]}</span>
          <span className="stat-chip__label">{PLATFORM_LABEL[platform]}</span>
        </div>
      ))}
    </div>
  );
}

function Toolbar({
  query,
  onQuery,
  platformFilter,
  onPlatform,
  counts,
  onExport,
  onImportClick,
  onLlmExport,
  onLlmImportClick,
}: {
  query: string;
  onQuery: (value: string) => void;
  platformFilter: Platform | 'all';
  onPlatform: (platform: Platform | 'all') => void;
  counts: Record<Platform, number>;
  onExport: () => void;
  onImportClick: () => void;
  onLlmExport: () => void;
  onLlmImportClick: () => void;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar__search">
        <svg className="toolbar__search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          className="toolbar__search-input"
          placeholder="搜尋標題、描述、筆記、標籤、作者…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          aria-label="搜尋收藏"
        />
      </div>

      <div className="toolbar__filters" role="tablist" aria-label="平台篩選">
        <button className={`chip-btn ${platformFilter === 'all' ? 'is-active' : ''}`} type="button" onClick={() => onPlatform('all')} aria-pressed={platformFilter === 'all'}>
          全部
        </button>
        {PLATFORM_ORDER.filter((platform) => counts[platform] > 0).map((platform) => (
          <button
            key={platform}
            className={`chip-btn ${platformFilter === platform ? 'is-active' : ''}`}
            type="button"
            onClick={() => onPlatform(platform)}
            aria-pressed={platformFilter === platform}
          >
            {PLATFORM_LABEL[platform]}
          </button>
        ))}
      </div>

      <div className="toolbar__io">
        <button className="btn btn--quiet" type="button" onClick={onLlmExport}>
          匯出 LLM 包
        </button>
        <button className="btn btn--quiet" type="button" onClick={onLlmImportClick}>
          匯入 LLM 結果
        </button>
        <button className="btn btn--quiet" type="button" onClick={onImportClick}>
          匯入 JSON
        </button>
        <button className="btn btn--quiet" type="button" onClick={onExport}>
          匯出 JSON
        </button>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onDelete,
  onReparse,
}: {
  item: FavoriteItem;
  onDelete: () => void;
  onReparse: () => Promise<void>;
}) {
  const [parsing, setParsing] = useState(false);
  const link = item.finalUrl || item.url;

  const handleReparse = async () => {
    setParsing(true);
    await onReparse();
    setParsing(false);
  };

  return (
    <li className="card">
      <a
        className={`card__thumb ${item.imageUrl ? '' : 'card__thumb--fallback'}`}
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`開啟收藏：${item.title || hostOf(link)}`}
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="card__thumb-letter">{(item.siteName || item.title || hostOf(link) || '•').charAt(0).toUpperCase()}</span>
        )}
        <span className={`badge badge--${item.platform}`}>{PLATFORM_LABEL[item.platform]}</span>
      </a>

      <div className="card__body">
        <div className="card__meta-top">
          <span className="card__site">{item.siteName || hostOf(link)}</span>
          {item.authorName && <span className="card__author">· {item.authorName}</span>}
        </div>

        <h3 className="card__title">
          <a href={link} target="_blank" rel="noopener noreferrer">
            {item.title || hostOf(link) || '未命名收藏'}
          </a>
        </h3>

        {item.description && <p className="card__desc">{item.description}</p>}

        {(item.summary || item.category) && (
          <div className="card__summary">
            {item.category && <span className="category-pill">{item.category}</span>}
            {item.summary && <p>{item.summary}</p>}
          </div>
        )}

        {item.contentText && (
          <details className="card__content">
            <summary>
              已抽取內文 {item.contentLength ? `${item.contentLength.toLocaleString()} 字` : ''}
              {item.extractionMethod ? ` · ${item.extractionMethod}` : ''}
            </summary>
            <p>{item.contentText.slice(0, 1200)}</p>
          </details>
        )}

        {item.note && (
          <p className="card__note">
            <span className="card__note-label">筆記</span>
            {item.note}
          </p>
        )}

        {item.tags.length > 0 && (
          <div className="tag-row">
            {item.tags.map((tag) => (
              <button className="tag tag-button" type="button" key={tag}>
                #{tag}
              </button>
            ))}
          </div>
        )}

        {item.metadataError && (
          <div className="card__error" role="status">
            <span className="card__error-dot" aria-hidden="true" />
            {item.metadataError}
          </div>
        )}

        <div className="card__foot">
          <a className="card__url" href={link} target="_blank" rel="noopener noreferrer">
            {hostOf(link)}
          </a>
          <time className="card__date">{formatDate(item.createdAt)}</time>
        </div>

        <div className="card__actions">
          <button className="btn btn--quiet btn--sm" type="button" onClick={handleReparse} disabled={parsing}>
            {parsing ? '解析中…' : '解析'}
          </button>
          <button className="btn btn--danger btn--sm" type="button" onClick={onDelete}>
            刪除
          </button>
        </div>
      </div>
    </li>
  );
}

function EmptyState({ hasItems, onAdd }: { hasItems: boolean; onAdd: () => void }) {
  if (hasItems) {
    return (
      <div className="empty empty--filtered">
        <p className="empty__title">沒有符合的收藏</p>
        <p className="empty__text">換個關鍵字或切換平台篩選試試。</p>
      </div>
    );
  }

  return (
    <div className="empty">
      <div className="empty__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48">
          <rect x="8" y="14" width="32" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 20 H40" stroke="currentColor" strokeWidth="2" />
          <path d="M16 14 V10 a2 2 0 0 1 2-2 h12 a2 2 0 0 1 2 2 v4" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="20" y1="28" x2="28" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="empty__title">你的資料盒還是空的</p>
      <p className="empty__text">先存一個連結，讓這裡開始長成你的私人資料庫。</p>
      <button className="btn btn--primary" type="button" onClick={onAdd}>
        新增收藏
      </button>
    </div>
  );
}

function AddItemModal({
  draft,
  isParsing,
  onUpdate,
  onParse,
  onClose,
  onSubmit,
}: {
  draft: DraftState;
  isParsing: boolean;
  onUpdate: (field: keyof DraftState, value: string | number) => void;
  onParse: () => Promise<void>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const previewUrl = draft.finalUrl || draft.url;
  const hasPreview = draft.description || draft.imageUrl || draft.siteName || draft.title || draft.metadataError || draft.contentText;

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="新增收藏" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <h2 className="sheet__title">新增收藏</h2>
          <button className="sheet__close" type="button" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>

        <div className="sheet__body">
          <div className="field">
            <label className="field__label" htmlFor="url-input">
              連結網址
            </label>
            <div className="field__url">
              <input
                id="url-input"
                className="input"
                required
                type="url"
                inputMode="url"
                placeholder="貼上 YouTube / IG / Threads / Bilibili / 任意連結"
                value={draft.url}
                onChange={(event) => onUpdate('url', event.target.value)}
              />
              <button className="btn btn--primary" type="button" onClick={onParse} disabled={!draft.url.trim() || isParsing}>
                {isParsing ? '解析中…' : '解析連結'}
              </button>
            </div>
            <p className="field__hint">貼上 → 解析 → 預覽 metadata → 補標籤與筆記 → 存起來</p>
          </div>

          {isParsing && (
            <div className="preview preview--loading">
              <div className="preview__thumb skeleton" />
              <div className="preview__lines">
                <div className="skeleton skeleton--line" />
                <div className="skeleton skeleton--line short" />
              </div>
            </div>
          )}

          {!isParsing && hasPreview && (
            <div className="preview">
              {draft.imageUrl ? (
                <div className="preview__thumb">
                  <img src={draft.imageUrl} alt="" />
                </div>
              ) : (
                <div className="preview__thumb preview__thumb--fallback">
                  <span>{(draft.siteName || hostOf(previewUrl) || '•').charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="preview__info">
                {(draft.siteName || hostOf(previewUrl)) && <span className="preview__site">{draft.siteName || hostOf(previewUrl)}</span>}
                <span className="preview__title">{draft.title || '（無標題）'}</span>
                {draft.description && <span className="preview__desc">{draft.description}</span>}
                {draft.contentText && (
                  <span className="preview__content">已取得內容 {draft.contentLength ? `${draft.contentLength.toLocaleString()} 字` : ''}</span>
                )}
                {draft.category && <span className="preview__content">分類：{draft.category}</span>}
                <span className="preview__url">{hostOf(previewUrl)}</span>
                {draft.metadataError && <span className="preview__error">{draft.metadataError}</span>}
              </div>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="title-input">
              標題
            </label>
            <input
              id="title-input"
              className="input"
              placeholder="自訂標題，可留空使用解析結果"
              value={draft.title}
              onChange={(event) => onUpdate('title', event.target.value)}
            />
          </div>

          <div className="field field-grid">
            <label>
              <span className="field__label">分類</span>
              <input
                className="input"
                placeholder="例：AI / 工具"
                value={draft.category}
                onChange={(event) => onUpdate('category', event.target.value)}
              />
            </label>
            <label>
              <span className="field__label">標籤</span>
              <input
                className="input"
                placeholder="用空白或逗號分隔，例：AI 工具 影片"
                value={draft.tags}
                onChange={(event) => onUpdate('tags', event.target.value)}
              />
            </label>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="summary-input">
              摘要
            </label>
            <textarea
              id="summary-input"
              className="input textarea"
              rows={3}
              placeholder="可自動產生，也可以手動改。"
              value={draft.summary}
              onChange={(event) => onUpdate('summary', event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="content-input">
              摘要材料 / 手動補內容
            </label>
            <textarea
              id="content-input"
              className="input textarea textarea--content"
              rows={6}
              placeholder="IG / Threads 抓不到時，把貼文內容複製貼上；它只用來產生摘要、分類、標籤，存檔不保留整坨原文。"
              value={draft.contentText}
              onChange={(event) => {
                const value = event.target.value;
                const cleaned = cleanSummarySource(value);
                onUpdate('contentText', cleaned);
                onUpdate('contentLength', cleaned.length);
                onUpdate('summary', generateSummary(cleaned, draft.description || draft.title));
                if (!draft.category.trim()) onUpdate('category', inferCategory(cleaned, detectPlatform(draft.url)));
              }}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="note-input">
              筆記
            </label>
            <textarea
              id="note-input"
              className="input textarea"
              rows={3}
              placeholder="為什麼想收藏？之後想做什麼？"
              value={draft.note}
              onChange={(event) => onUpdate('note', event.target.value)}
            />
          </div>

          {draft.rawText && (
            <details className="raw-details">
              <summary>分享原始文字</summary>
              <pre className="raw-details__text">{draft.rawText}</pre>
            </details>
          )}
        </div>

        <div className="sheet__foot">
          <button className="btn btn--quiet" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn btn--primary" type="submit" disabled={!draft.url.trim()}>
            存到資料盒
          </button>
        </div>
      </form>
    </div>
  );
}
