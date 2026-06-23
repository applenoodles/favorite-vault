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

const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  threads: 'Threads',
  facebook: 'Facebook',
  bilibili: 'Bilibili',
  other: '其他',
};

const PLATFORM_ORDER: Platform[] = ['youtube', 'instagram', 'threads', 'facebook', 'bilibili', 'other'];

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
    rawText: item.rawText,
    description: item.description,
    imageUrl: item.imageUrl,
    siteName: item.siteName,
    authorName: item.authorName,
    finalUrl: item.finalUrl,
    metadataFetchedAt: item.metadataFetchedAt,
    metadataError: item.metadataError,
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

function fallbackTitle(url: string) {
  return `${PLATFORM_LABEL[detectPlatform(url)]} 收藏`;
}

function isRealTitle(title: string, url: string) {
  return title.trim() && title !== fallbackTitle(url);
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

function metadataErrorText(error?: string) {
  if (!error) return '';
  return metadataErrorLabels[error] ?? error;
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
    const sharedUrl = params.get('shareUrl') ?? params.get('url') ?? '';
    const sharedTitle = params.get('shareTitle') ?? params.get('title') ?? '';
    const sharedText = params.get('shareText') ?? params.get('text') ?? '';

    if (!sharedUrl && !sharedTitle && !sharedText) return;

    const bestUrl = normalizeUrl(sharedUrl || extractFirstUrl(sharedText));
    setDraft({
      ...EMPTY_DRAFT,
      url: bestUrl,
      title: sharedTitle,
      rawText: [sharedTitle, sharedText].filter(Boolean).join('\n'),
      sourceAction: 'share-target',
    });
    setIsComposerOpen(true);
    window.history.replaceState({}, document.title, window.location.pathname);
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
    const parsed = items.filter((item) => !item.metadataError && (item.siteName || item.imageUrl || item.description)).length;
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
        siteName: metadata.siteName || current.siteName || hostOf(metadata.finalUrl || normalizedUrl),
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
      siteName: draft.siteName.trim() || hostOf(draft.finalUrl || normalizedUrl),
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
        />
        <input ref={importInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={handleImportFile} />

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
}: {
  query: string;
  onQuery: (value: string) => void;
  platformFilter: Platform | 'all';
  onPlatform: (platform: Platform | 'all') => void;
  counts: Record<Platform, number>;
  onExport: () => void;
  onImportClick: () => void;
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
  onUpdate: (field: keyof DraftState, value: string) => void;
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
  const hasPreview = draft.description || draft.imageUrl || draft.siteName || draft.title || draft.metadataError;

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

          <div className="field">
            <label className="field__label" htmlFor="tags-input">
              標籤
            </label>
            <input
              id="tags-input"
              className="input"
              placeholder="用空白或逗號分隔，例：AI 工具 影片"
              value={draft.tags}
              onChange={(event) => onUpdate('tags', event.target.value)}
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
