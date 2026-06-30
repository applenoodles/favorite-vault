type EmptyStateProps = {
  hasItems: boolean;
  onAdd: () => void;
};

export function EmptyState({ hasItems, onAdd }: EmptyStateProps) {
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
