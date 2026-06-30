import type { CollectionFilter, Platform } from '../types';
import { PLATFORM_LABEL, PLATFORM_ORDER } from '../lib/platform';

type ToolbarProps = {
  query: string;
  onQuery: (value: string) => void;
  platformFilter: CollectionFilter;
  onPlatform: (platform: CollectionFilter) => void;
  counts: Record<Platform, number>;
  needsLlmCount: number;
  onExport: () => void;
  onImportClick: () => void;
  onLlmExport: () => void;
  onLlmImportClick: () => void;
};

export function Toolbar({ query, onQuery, platformFilter, onPlatform, counts, needsLlmCount, onExport, onImportClick, onLlmExport, onLlmImportClick }: ToolbarProps) {
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

      <div className="toolbar__filters" role="tablist" aria-label="收藏篩選">
        <button className={`chip-btn ${platformFilter === 'all' ? 'is-active' : ''}`} type="button" onClick={() => onPlatform('all')} aria-pressed={platformFilter === 'all'}>
          全部
        </button>
        {needsLlmCount > 0 && (
          <button className={`chip-btn chip-btn--review ${platformFilter === 'needs_llm' ? 'is-active' : ''}`} type="button" onClick={() => onPlatform('needs_llm')} aria-pressed={platformFilter === 'needs_llm'}>
            待 LLM {needsLlmCount}
          </button>
        )}
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
