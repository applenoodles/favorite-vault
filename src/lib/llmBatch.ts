import type { FavoriteItem, LlmBatchResultItem } from '../types';
import { PLATFORM_LABEL, PENDING_CATEGORY, isGenericTitle, isUrlLikeText } from './platform';

export function needsLlmPass(item: FavoriteItem) {
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

export function getLlmBatchCandidates(items: FavoriteItem[]) {
  const candidates = items.filter(needsLlmPass);
  return (candidates.length > 0 ? candidates : items).slice(0, 80);
}

export function getFetchStatus(item: FavoriteItem) {
  if (item.metadataError) return 'failed';
  if (item.contentText || item.contentLength || (item.extractionMethod && item.extractionMethod !== 'none')) return 'success';
  if (item.description || item.siteName || item.authorName || item.imageUrl || item.metadataFetchedAt) return 'partial';
  return 'not_attempted';
}

export function buildLlmBatchMarkdown(items: FavoriteItem[]) {
  const batchItems = getLlmBatchCandidates(items).map((item) => ({
    id: item.id,
    url: item.finalUrl || item.url,
    originalUrl: item.url,
    platform: PLATFORM_LABEL[item.platform],
    title: isGenericTitle(item.title, item.url) ? '' : item.title,
    currentSummary: item.summary && !isUrlLikeText(item.summary) ? item.summary : '',
    currentCategory: item.category || '',
    currentTags: item.tags,
    description: item.description || '',
    siteName: item.siteName || '',
    authorName: item.authorName || '',
    rawText: item.rawText || '',
    contentText: item.contentText || '',
    contentLength: item.contentLength || 0,
    extractionMethod: item.extractionMethod || '',
    canonicalUrl: item.canonicalUrl || '',
    metadataError: item.metadataError || '',
    fetchStatus: getFetchStatus(item),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || '',
    note: item.note || '',
    reason: needsLlmPass(item) ? 'needs_review' : 'included_for_context',
  }));

  const prompt = new TextDecoder().decode(
    Uint8Array.from(
      atob(
        'IyBGYXZvcml0ZSBWYXVsdCBMTE0gQmF0Y2gKCuS9oOaYr+S4gOWAi+engeS6uuaUtuiXj+aVtOeQhuWKqeeQhuOAguiri+W5q+aIkeaVtOeQhuS4i+mdoueahOaUtuiXj+mgheebru+8jOiuk+Wug+WAkeiuiuaIkCBBSSDlj6/ku6XnkIbop6PjgIHlj6/ku6XmkJzlsIvjgIHlj6/ku6XkuYvlvozlgZrlgIvkurrljJbmjqjolqbnmoTos4fmlpnjgIIKCuS9oOWPr+S7peS+neavj+WAiyB1cmwg6Ieq6KGM6ZaL5ZWf6YCj57WQ44CB6Zax6K6A5Y6f5paH44CB55WZ6KiA44CB5Zue6KaG5Liy44CB55u46Zec5paH56ug5oiW6aCB6Z2i6ISI57Wh44CC6Iul6YCj57WQ54Sh5rOV6ZaL5ZWf77yM5bCx5YSq5YWI5qC55pOaIHJhd1RleHTjgIFjb250ZW50VGV4dOOAgWRlc2NyaXB0aW9u44CBY3VycmVudFN1bW1hcnkg5pW055CG44CC6IulIGZldGNoU3RhdHVzIOaYryBmYWlsZWQgLyBub3RfYXR0ZW1wdGVk77yM5LiU54++5pyJ5qyE5L2N5LiN6Laz5Lul5Yik5pa35YWn5a6577yM5LiN6KaB6IeG5ris77yb6KuL5L2/55So5L+d5a6I5qiZ6aGM44CB5L+d5a6I5YiG6aGe77yM5Lim5ZyoIG5vdGUg5qiZ6Ki744CM5Y6f5paH54Sh5rOV6K6A5Y+W77yM5YOF5qC55pOa54++5pyJ5qyE5L2N5pW055CG44CN44CC5LiN6KaB6Ly45Ye66ZW356+H5Y6f5paH77yM5LiN6KaB5aGeIFVJIOWeg+WcvuaWh+Wtl++8jOWPquS/neeVmeaRmOimgeOAgeWIhumhnuOAgeaomeexpOiIh+W/heimgeiqquaYjuOAggoK6KuL5Y+q6Ly45Ye65pyJ5pWIIEpTT07vvIzkuI3opoEgTWFya2Rvd27vvIzkuI3opoHop6Pph4vjgILmoLzlvI/lpoLkuIvvvJoKCnsKICAiaXRlbXMiOiBbCiAgICB7CiAgICAgICJpZCI6ICLljp/mnKznmoQgaWTvvIzlv4XloavvvIzkuI3lj6/mlLkiLAogICAgICAidGl0bGUiOiAi5b+F5aGr44CC6KuL55Si55Sf6IO96L6o6K2Y5Li76aGM55qE5qiZ6aGM77yM5LiN6KaB55SoIFRocmVhZHMg5pS26JeP44CBSW5zdGFncmFtIOaUtuiXj+OAgeW+heaVtOeQhiDpgJnnqK7lu6LmqJnpoYwiLAogICAgICAiZGVzY3JpcHRpb24iOiAi5Y+v6YG477yM55+t5o+P6L+wIiwKICAgICAgInN1bW1hcnkiOiAiODAg5YiwIDE4MCDlrZfvvIzoqqrmuIXmpZrpgJnnrYbmlLbol4/lnKjorJvku4DpurzjgIHngrrku4DpurzlgLzlvpfnlZnkuIsiLAogICAgICAiY2F0ZWdvcnkiOiAi5b+F5aGr44CC6KuL5L6d5Li76aGM5YiG6aGe77yM5L6L5aaCIEFJIC8g5bel5YW344CB5a2457+SIC8g55+l6K2Y44CB6Kit6KiIIC8gVUnjgIHlvbHpn7MgLyDlibXkvZzjgIHnlJ/mtLsgLyDmg7Pms5XjgIHlgaXlurcgLyDphqvnmYLjgIHml4XpgYogLyDlnLDpu57jgILkuI3opoHmiorlubPlj7DnlbbliIbpoZ7vvIzkuI3opoHnlKgg56S+576kIC8g6LK85paH77yM6Zmk6Z2e5YWn5a655pys6Lqr5piv5Zyo6KiO6KuW56S+576k5bmz5Y+w44CCIiwKICAgICAgInRhZ3MiOiBbIjMg5YiwIDgg5YCL55+t5qiZ57GkIl0sCiAgICAgICJub3RlIjogIuWPr+mBuO+8jOiLpeacieingOWvn+OAgea0nuWvn+aIluaPkOmGkuaJjeWhqyIKICAgIH0KICBdCn0KCiMjIEl0ZW1zCgo=',
      ),
      (char) => char.charCodeAt(0),
    ),
  );

  return `${prompt}${JSON.stringify(batchItems, null, 2)}\n`;
}

export function extractJsonText(input: string) {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const firstObject = input.indexOf('{');
  const firstArray = input.indexOf('[');
  const startCandidates = [firstObject, firstArray].filter((index) => index >= 0);
  if (startCandidates.length === 0) return input.trim();
  return input.slice(Math.min(...startCandidates)).trim();
}

export function parseLlmBatchResults(raw: string): LlmBatchResultItem[] {
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
