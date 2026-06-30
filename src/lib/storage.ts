import type { FavoriteItem } from '../types';
import { cleanSummarySource, deriveItemTitle, detectPlatform, normalizeCategory, normalizeUrl } from './platform';

const STORAGE_KEY = 'favorite-vault-items-v2';
const LEGACY_STORAGE_KEY = 'favorite-vault-items-v1';

export function createId() {
  if ('crypto' in window && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeImportedItem(item: Partial<FavoriteItem>): FavoriteItem | null {
  if (!item.url) return null;
  const url = normalizeUrl(item.url);
  const platform = item.platform || detectPlatform(url);
  const summary = cleanSummarySource(item.summary || '');
  const description = item.description?.trim() || '';
  const title = deriveItemTitle(item.title || '', url, summary, description);
  const category = normalizeCategory(item.category, platform);

  return {
    id: item.id || createId(),
    url,
    title,
    note: item.note || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    platform,
    sourceAction: item.sourceAction || 'imported',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt,
    rawText: item.rawText,
    description: description || undefined,
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
    summary: summary || undefined,
    category: category || undefined,
    notionPageId: item.notionPageId,
  };
}

export function loadItems(): FavoriteItem[] {
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

export function saveItems(items: FavoriteItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function mergeItems(localItems: FavoriteItem[], remoteItems: FavoriteItem[]) {
  const byId = new Map<string, FavoriteItem>();
  for (const item of [...localItems, ...remoteItems]) {
    const previous = byId.get(item.id);
    if (!previous || new Date(item.updatedAt || item.createdAt).getTime() >= new Date(previous.updatedAt || previous.createdAt).getTime()) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function needsCleanup(rawItem: Partial<FavoriteItem>, normalizedItem: FavoriteItem) {
  const normalizedTags = Array.isArray(rawItem.tags) ? rawItem.tags : [];
  return (
    (rawItem.title || '') !== normalizedItem.title ||
    (rawItem.category || '') !== (normalizedItem.category || '') ||
    (rawItem.summary || '') !== (normalizedItem.summary || '') ||
    (rawItem.description || '') !== (normalizedItem.description || '') ||
    (rawItem.platform || detectPlatform(rawItem.url || '')) !== normalizedItem.platform ||
    normalizedTags.join('\u0000') !== normalizedItem.tags.join('\u0000')
  );
}
