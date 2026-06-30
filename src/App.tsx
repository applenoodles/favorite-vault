import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { AddItemModal as AddItemModalView } from './components/AddItemModal';
import { AppHeader as AppHeaderView } from './components/AppHeader';
import { CloudSyncPanel as CloudSyncPanelView } from './components/CloudSyncPanel';
import { EmptyState as EmptyStateView } from './components/EmptyState';
import { ItemCard as ItemCardView } from './components/ItemCard';
import { StatChips as StatChipsView } from './components/StatChips';
import { Toolbar as ToolbarView } from './components/Toolbar';
import { VaultProfileCard as VaultProfileCardView } from './components/VaultProfileCard';

import type { BeforeInstallPromptEvent, CollectionFilter, DraftState, ExtensionPayload, FavoriteItem, LlmBatchResultItem, Platform } from './types';
import { buildLlmBatchMarkdown, getLlmBatchCandidates, needsLlmPass, parseLlmBatchResults } from './lib/llmBatch';
import { metadataErrorText, requestMetadata } from './lib/metadata';
import { deleteCloudItem, requestCloudItemPayloads, requestCloudItems, upsertCloudItem } from './lib/notionSync';
import { createId, loadItems, mergeItems, needsCleanup, normalizeImportedItem, saveItems } from './lib/storage';
import {
  EMPTY_DRAFT,
  PLATFORM_ORDER,
  PENDING_CATEGORY,
  buildDraftFromPayload,
  cleanSummarySource,
  detectPlatform,
  deriveItemTitle,
  extractFirstUrl,
  generateSummary,
  hostOf,
  inferCategory,
  isRealTitle,
  normalizeCategory,
  normalizeUrl,
  parseTags,
  suggestTags,
} from './lib/platform';

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [items, setItems] = useState<FavoriteItem[]>(() => loadItems());
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<CollectionFilter>('all');
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

  async function cleanupCloudItems() {
    setIsCloudLoading(true);
    setCloudStatus('清理 Notion 舊資料中...');
    try {
      const payloads = await requestCloudItemPayloads(vaultKey);
      const normalizedItems = payloads.map(normalizeImportedItem).filter(Boolean) as FavoriteItem[];
      const cleanupItems = normalizedItems.filter((item) => {
        const rawItem = payloads.find((payload) => payload.id === item.id || payload.notionPageId === item.notionPageId);
        return rawItem ? needsCleanup(rawItem, item) : false;
      });

      for (const item of cleanupItems) {
        await upsertCloudItem(vaultKey, item);
      }

      setItems((current) => mergeItems(current, normalizedItems));
      setCloudStatus(cleanupItems.length > 0 ? `已清理並回寫 ${cleanupItems.length} 筆 Notion 舊資料` : 'Notion 沒有需要清理的舊資料');
    } catch (error) {
      setCloudStatus(`清理失敗：${metadataErrorText((error as Error).message)}`);
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
      .filter((item) => platformFilter === 'all' || (platformFilter === 'needs_llm' ? needsLlmPass(item) : item.platform === platformFilter))
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

  const needsLlmCount = useMemo(() => items.filter(needsLlmPass).length, [items]);

  const openComposer = useCallback(() => {
    setEditingItemId(null);
    setDraft(EMPTY_DRAFT);
    setIsComposerOpen(true);
  }, []);

  function itemToDraft(item: FavoriteItem): DraftState {
    return {
      ...EMPTY_DRAFT,
      url: item.url,
      title: item.title,
      note: item.note,
      tags: item.tags.join(' '),
      rawText: item.rawText || '',
      sourceAction: item.sourceAction,
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      siteName: item.siteName || '',
      authorName: item.authorName || '',
      finalUrl: item.finalUrl || '',
      metadataError: item.metadataError || '',
      contentText: item.contentText || '',
      contentLength: item.contentLength || 0,
      extractionMethod: item.extractionMethod || '',
      canonicalUrl: item.canonicalUrl || '',
      summary: item.summary || '',
      category: item.category || '',
    };
  }

  function openEditor(item: FavoriteItem) {
    setEditingItemId(item.id);
    setDraft(itemToDraft(item));
    setIsComposerOpen(true);
  }

  function closeComposer() {
    setEditingItemId(null);
    setDraft(EMPTY_DRAFT);
    setIsComposerOpen(false);
  }

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

    const existingItem = editingItemId ? items.find((candidate) => candidate.id === editingItemId) : undefined;
    const rawText = draft.rawText.trim();
    const contentText = cleanSummarySource(draft.contentText.trim());
    const summarySource = contentText || rawText || draft.description.trim();
    const summary = cleanSummarySource(draft.summary.trim()) || generateSummary(summarySource, draft.description || draft.title);
    const category = normalizeCategory(draft.category.trim() || inferCategory([draft.title, draft.description, summary, normalizedUrl].filter(Boolean).join('\n'), detectPlatform(normalizedUrl)), detectPlatform(normalizedUrl));
    const title = deriveItemTitle(draft.title.trim(), normalizedUrl, summary, draft.description);

    const item: FavoriteItem = {
      id: existingItem?.id || createId(),
      url: normalizedUrl,
      title,
      note: draft.note.trim(),
      tags: parseTags(draft.tags),
      platform: detectPlatform(normalizedUrl),
      sourceAction: existingItem?.sourceAction || draft.sourceAction,
      createdAt: existingItem?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rawText: rawText || undefined,
      description: draft.description.trim() || undefined,
      imageUrl: draft.imageUrl.trim() || undefined,
      siteName: draft.siteName.trim() || hostOf(draft.finalUrl || normalizedUrl),
      authorName: draft.authorName.trim() || undefined,
      finalUrl: draft.finalUrl.trim() || undefined,
      metadataFetchedAt: draft.description || draft.imageUrl || draft.siteName || summary ? new Date().toISOString() : undefined,
      metadataError: draft.metadataError || undefined,
      contentText: contentText || undefined,
      contentLength: contentText ? contentText.length : undefined,
      extractionMethod: draft.extractionMethod || undefined,
      canonicalUrl: draft.canonicalUrl || undefined,
      summary: summary || undefined,
      category: category || undefined,
    };

    setItems((current) => (existingItem ? current.map((candidate) => (candidate.id === existingItem.id ? item : candidate)) : [item, ...current]));
    setDraft(EMPTY_DRAFT);
    setEditingItemId(null);
    setIsComposerOpen(false);

    if (vaultKey.trim()) {
      try {
        const saved = await upsertCloudItem(vaultKey.trim(), item);
        setItems((current) => current.map((candidate) => (candidate.id === item.id ? saved : candidate)));
        setCloudStatus(existingItem ? '已更新到雲端' : '已儲存到雲端');
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

  function exportSingleLlmItem(item: FavoriteItem) {
    const now = new Date().toISOString().slice(0, 10);
    const shortId = item.id.slice(0, 8) || 'item';
    const filename = 'favorite-vault-llm-item-' + shortId + '-' + now + '.md';
    downloadFile(filename, buildLlmBatchMarkdown([item]), 'text/markdown;charset=utf-8');
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
        <AppHeaderView canInstall={Boolean(installPrompt)} onInstall={handleInstall} onAdd={openComposer} />

        <CloudSyncPanelView
          cloudStatus={cloudStatus}
          isCloudLoading={isCloudLoading}
          onPull={() => loadFromCloud({ mergeLocal: false })}
          onPush={pushLocalToCloud}
          onCleanup={cleanupCloudItems}
        />

        <VaultProfileCardView profile={profile} />

        <StatChipsView total={items.length} counts={platformCounts} needsLlmCount={needsLlmCount} />

        <ToolbarView
          query={query}
          onQuery={setQuery}
          platformFilter={platformFilter}
          onPlatform={setPlatformFilter}
          counts={platformCounts}
          needsLlmCount={needsLlmCount}
          onExport={exportJson}
          onImportClick={() => importInputRef.current?.click()}
          onLlmExport={exportLlmBatch}
          onLlmImportClick={() => llmImportInputRef.current?.click()}
        />
        <input ref={importInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={handleImportFile} />
        <input ref={llmImportInputRef} className="hidden-input" type="file" accept="application/json,.json,.md,.txt,text/markdown,text/plain" onChange={handleLlmImportFile} />

        {filteredItems.length === 0 ? (
          <EmptyStateView hasItems={items.length > 0} onAdd={openComposer} />
        ) : (
          <ul className="item-grid" aria-label="收藏清單">
            {filteredItems.map((item) => (
              <ItemCardView key={item.id} item={item} onDelete={() => removeItem(item.id)} onEdit={() => openEditor(item)} onReparse={() => enrichExistingItem(item)} onLlmExport={() => exportSingleLlmItem(item)} />
            ))}
          </ul>
        )}
      </div>

      {isComposerOpen && (
        <AddItemModalView
          draft={draft}
          isParsing={isMetadataLoading}
          onUpdate={updateDraft}
          onParse={fetchMetadataForDraft}
          onClose={closeComposer}
          onSubmit={handleSubmit}
          isEditing={Boolean(editingItemId)}
        />
      )}
    </div>
  );
}
