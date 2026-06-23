import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

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
  rawText?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  authorName?: string;
  finalUrl?: string;
  metadataFetchedAt?: string;
  metadataError?: string;
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
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const STORAGE_KEY = 'favorite-vault-items-v2';
const LEGACY_STORAGE_KEY = 'favorite-vault-items-v1';
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
};

const platformLabels: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  threads: 'Threads',
  facebook: 'Facebook',
  bilibili: 'Bilibili',
  other: '其他',
};

const metadataErrorLabels: Record<string, string> = {
  missing_url: '沒有網址，這就像叫外送但不給地址。',
  invalid_url: '網址格式不對。',
  unsupported_protocol: '只支援 http / https。',
  blocked_host: '這個網址被安全規則擋下來。',
  fetch_failed: '抓取失敗，對方網站可能擋機器人或需要登入。',
  timeout: '抓取逾時，對方網站慢得像行政流程。',
  fetch_error: '抓取時發生錯誤。',
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
    if (host.includes('threads.net')) return 'threads';
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook';
    if (host.includes('bilibili.com') || host.includes('b23.tv')) return 'bilibili';
  } catch {
    return 'other';
  }

  return 'other';
}

function parseTags(input: string) {
  return input
    .split(/[#,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);
}

function loadItems(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems(items: FavoriteItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function fallbackTitle(url: string) {
  const platform = detectPlatform(url);
  const label = platformLabels[platform];
  return `${label} 收藏`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('zh-Hant-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
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

function metadataErrorText(error?: string) {
  if (!error) return '';
  return metadataErrorLabels[error] ?? error;
}

function isRealTitle(title: string, url: string) {
  return title.trim() && title !== fallbackTitle(url);
}

async function requestMetadata(url: string): Promise<MetadataResponse> {
  const response = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
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
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('shareUrl') ?? '';
    const sharedTitle = params.get('shareTitle') ?? '';
    const sharedText = params.get('shareText') ?? '';

    if (!sharedUrl && !sharedTitle && !sharedText) return;

    const bestUrl = normalizeUrl(sharedUrl || extractFirstUrl(sharedText));
    setDraft({
      ...EMPTY_DRAFT,
      url: bestUrl,
      title: sharedTitle,
      rawText: sharedText,
      sourceAction: 'share-target',
    });
    setIsComposerOpen(true);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const allTags = useMemo(() => {
    return Array.from(new Set(items.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [items]);

  const stats = useMemo(() => {
    return items.reduce<Record<Platform, number>>(
      (acc, item) => {
        acc[item.platform] += 1;
        return acc;
      },
      { youtube: 0, instagram: 0, threads: 0, facebook: 0, bilibili: 0, other: 0 },
    );
  }, [items]);

  const aiSeed = useMemo(() => {
    const recentItems = items.slice(0, 20);
    const tagCounts = new Map<string, number>();
    const platformCounts = new Map<Platform, number>();

    for (const item of recentItems) {
      platformCounts.set(item.platform, (platformCounts.get(item.platform) ?? 0) + 1);
      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => `#${tag}`);

    const topPlatform = Array.from(platformCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      topTags,
      topPlatform: topPlatform ? platformLabels[topPlatform] : '',
      metadataCount: items.filter((item) => item.description || item.imageUrl || item.siteName).length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return items
      .filter((item) => platformFilter === 'all' || item.platform === platformFilter)
      .filter((item) => {
        if (!keyword) return true;
        const haystack = [
          item.title,
          item.url,
          item.note,
          item.rawText,
          item.description,
          item.siteName,
          item.authorName,
          item.platform,
          ...item.tags,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, platformFilter, query]);

  function openComposer() {
    setDraft(EMPTY_DRAFT);
    setIsComposerOpen(true);
  }

  function updateDraft(field: keyof DraftState, value: string) {
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
        siteName: metadata.siteName || current.siteName,
        authorName: metadata.author || current.authorName,
        metadataError: '',
      }));
    } catch (error) {
      setDraft((current) => ({ ...current, metadataError: metadataErrorText((error as Error).message) }));
    } finally {
      setIsMetadataLoading(false);
    }
  }

  async function enrichExistingItem(item: FavoriteItem) {
    try {
      const metadata = await requestMetadata(item.url);
      setItems((current) =>
        current.map((candidate) => {
          if (candidate.id !== item.id) return candidate;

          return {
            ...candidate,
            finalUrl: metadata.finalUrl || candidate.finalUrl,
            title: isRealTitle(candidate.title, candidate.url) ? candidate.title : metadata.title || candidate.title,
            description: metadata.description || candidate.description,
            imageUrl: metadata.image || candidate.imageUrl,
            siteName: metadata.siteName || candidate.siteName,
            authorName: metadata.author || candidate.authorName,
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedUrl = normalizeUrl(draft.url || extractFirstUrl(draft.rawText));
    if (!normalizedUrl) return;

    const item: FavoriteItem = {
      id: createId(),
      url: normalizedUrl,
      title: draft.title.trim() || fallbackTitle(normalizedUrl),
      note: draft.note.trim(),
      tags: parseTags(draft.tags),
      platform: detectPlatform(normalizedUrl),
      sourceAction: draft.sourceAction,
      createdAt: new Date().toISOString(),
      rawText: draft.rawText.trim() || undefined,
      description: draft.description.trim() || undefined,
      imageUrl: draft.imageUrl.trim() || undefined,
      siteName: draft.siteName.trim() || undefined,
      authorName: draft.authorName.trim() || undefined,
      finalUrl: draft.finalUrl.trim() || undefined,
      metadataFetchedAt: draft.description || draft.imageUrl || draft.siteName ? new Date().toISOString() : undefined,
      metadataError: draft.metadataError || undefined,
    };

    setItems((current) => [item, ...current]);
    setDraft(EMPTY_DRAFT);
    setIsComposerOpen(false);
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
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

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as FavoriteItem[];
        if (!Array.isArray(imported)) return;

        const byUrl = new Map(items.map((item) => [item.url, item]));
        for (const item of imported) {
          if (!item.url || !item.id) continue;
          byUrl.set(item.url, item);
        }
        setItems(Array.from(byUrl.values()));
      } catch {
        alert('匯入失敗：這不是有效的 Favorite Vault JSON。');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Personal collection PWA</p>
          <h1>Favorite Vault</h1>
          <p>
            把 Threads、IG、FB、YouTube、Bilibili 這些平台上你順手收藏或按愛心的內容，先用分享連結集中起來。
            現在會嘗試抓標題、描述、縮圖和站名，至少不要只留一堆網址屍體。
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={openComposer}>
            ＋ 新增收藏
          </button>
          {installPrompt && (
            <button className="ghost-button" type="button" onClick={handleInstall}>
              安裝成 App
            </button>
          )}
        </div>
      </section>

      {items.length > 0 && (
        <section className="insight-card">
          <div>
            <p className="eyebrow">AI-ready profile</p>
            <h2>個人化資料正在長出來</h2>
            <p>
              已解析 {aiSeed.metadataCount} / {items.length} 筆 metadata。
              {aiSeed.topPlatform ? ` 最近偏多來自 ${aiSeed.topPlatform}。` : ''}
              {aiSeed.topTags.length > 0 ? ` 常見標籤：${aiSeed.topTags.join('、')}。` : ' 加一點標籤，之後 AI 才不會像算命仙一樣亂猜。'}
            </p>
          </div>
        </section>
      )}

      <section className="toolbar-card">
        <label className="search-box">
          <span>搜尋</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋標題、描述、網址、筆記、標籤..."
          />
        </label>

        <label className="select-box">
          <span>平台</span>
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as Platform | 'all')}>
            <option value="all">全部</option>
            {Object.entries(platformLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="toolbar-actions">
          <button type="button" onClick={exportJson} disabled={items.length === 0}>
            匯出 JSON
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            匯入 JSON
          </button>
          <input ref={importInputRef} className="hidden-input" type="file" accept="application/json" onChange={handleImportFile} />
        </div>
      </section>

      <section className="stats-grid" aria-label="收藏統計">
        <article>
          <strong>{items.length}</strong>
          <span>總收藏</span>
        </article>
        {Object.entries(platformLabels).map(([platform, label]) => (
          <article key={platform}>
            <strong>{stats[platform as Platform]}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      {allTags.length > 0 && (
        <section className="tag-cloud" aria-label="標籤">
          {allTags.map((tag) => (
            <button key={tag} type="button" onClick={() => setQuery(tag)}>
              #{tag}
            </button>
          ))}
        </section>
      )}

      <section className="content-grid">
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <h2>還沒有東西，收藏庫空得像平台 API 的良心。</h2>
            <p>先按「新增收藏」貼一個連結。安裝成 PWA 後，手機分享選單也可以直接丟進來。</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <article className="item-card" key={item.id}>
              {item.imageUrl && (
                <a className="thumbnail-link" href={item.url} target="_blank" rel="noreferrer" aria-label={`開啟 ${item.title}`}>
                  <img src={item.imageUrl} alt="" loading="lazy" />
                </a>
              )}
              <div className="item-card-body">
                <div className="item-card-header">
                  <span className={`platform-pill platform-${item.platform}`}>{platformLabels[item.platform]}</span>
                  <span className="date-text">{formatDate(item.createdAt)}</span>
                </div>
                <h2>{item.title}</h2>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.finalUrl || item.url}
                </a>
                {(item.siteName || item.authorName) && (
                  <p className="meta-text">
                    {[item.siteName, item.authorName].filter(Boolean).join(' · ')}
                  </p>
                )}
                {item.description && <p className="description-text">{item.description}</p>}
                {item.note && <p className="note-text">{item.note}</p>}
                {item.metadataError && <p className="error-text">解析失敗：{item.metadataError}</p>}
                {item.tags.length > 0 && (
                  <div className="item-tags">
                    {item.tags.map((tag) => (
                      <button key={tag} type="button" onClick={() => setQuery(tag)}>
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className="item-footer">
                  <span>{item.sourceAction === 'share-target' ? '分享匯入' : item.sourceAction === 'imported' ? '檔案匯入' : '手動新增'}</span>
                  <div className="item-actions">
                    <button type="button" onClick={() => enrichExistingItem(item)}>
                      解析
                    </button>
                    <button type="button" onClick={() => removeItem(item.id)}>
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {isComposerOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsComposerOpen(false)}>
          <form className="composer" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
            <div className="composer-header">
              <div>
                <p className="eyebrow">Save item</p>
                <h2>新增收藏</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setIsComposerOpen(false)} aria-label="關閉">
                ×
              </button>
            </div>

            <label>
              <span>網址</span>
              <input
                required
                value={draft.url}
                onChange={(event) => updateDraft('url', event.target.value)}
                placeholder="貼上分享連結，例如 YouTube / Threads / Bilibili"
              />
            </label>

            <div className="metadata-actions">
              <button type="button" onClick={fetchMetadataForDraft} disabled={isMetadataLoading || !draft.url.trim()}>
                {isMetadataLoading ? '解析中...' : '解析連結'}
              </button>
              <span>會嘗試抓標題、描述、縮圖、站名。被平台擋就沒輒，平台不是你家倉庫。</span>
            </div>

            <label>
              <span>標題</span>
              <input
                value={draft.title}
                onChange={(event) => updateDraft('title', event.target.value)}
                placeholder="按解析連結後會自動帶入"
              />
            </label>

            {(draft.description || draft.imageUrl || draft.siteName || draft.metadataError) && (
              <section className="metadata-preview">
                {draft.imageUrl && <img src={draft.imageUrl} alt="" />}
                <div>
                  <p className="eyebrow">Metadata</p>
                  {draft.siteName && <p className="meta-text">{draft.siteName}</p>}
                  {draft.description && <p>{draft.description}</p>}
                  {draft.metadataError && <p className="error-text">{draft.metadataError}</p>}
                </div>
              </section>
            )}

            <label>
              <span>標籤</span>
              <input
                value={draft.tags}
                onChange={(event) => updateDraft('tags', event.target.value)}
                placeholder="AI, 旅遊, 搞笑, 顯卡"
              />
            </label>

            <label>
              <span>筆記</span>
              <textarea
                value={draft.note}
                onChange={(event) => updateDraft('note', event.target.value)}
                placeholder="你為什麼存這個？不要讓未來的你像考古學家一樣痛苦。"
              />
            </label>

            {draft.rawText && (
              <details className="raw-share">
                <summary>分享原文</summary>
                <p>{draft.rawText}</p>
              </details>
            )}

            <div className="composer-actions">
              <button type="button" onClick={() => setIsComposerOpen(false)}>
                取消
              </button>
              <button className="primary-button" type="submit">
                存起來
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
