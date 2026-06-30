import type { Platform } from '../types';
import { PLATFORM_LABEL, PLATFORM_ORDER } from '../lib/platform';

type StatChipsProps = {
  total: number;
  counts: Record<Platform, number>;
  needsLlmCount: number;
};

export function StatChips({ total, counts, needsLlmCount }: StatChipsProps) {
  return (
    <div className="stat-chips" role="list" aria-label="收藏統計">
      <div className="stat-chip stat-chip--total" role="listitem">
        <span className="stat-chip__num">{total}</span>
        <span className="stat-chip__label">總收藏</span>
      </div>
      {needsLlmCount > 0 && (
        <div className="stat-chip stat-chip--review" role="listitem">
          <span className="stat-chip__num">{needsLlmCount}</span>
          <span className="stat-chip__label">待 LLM</span>
        </div>
      )}
      {PLATFORM_ORDER.filter((platform) => counts[platform] > 0).map((platform) => (
        <div className="stat-chip" role="listitem" key={platform}>
          <span className="stat-chip__num">{counts[platform]}</span>
          <span className="stat-chip__label">{PLATFORM_LABEL[platform]}</span>
        </div>
      ))}
    </div>
  );
}
