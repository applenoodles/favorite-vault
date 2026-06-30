type CloudSyncPanelProps = {
  cloudStatus: string;
  isCloudLoading: boolean;
  onPull: () => Promise<void>;
  onPush: () => Promise<void>;
  onCleanup: () => Promise<void>;
};

export function CloudSyncPanel({ cloudStatus, isCloudLoading, onPull, onPush, onCleanup }: CloudSyncPanelProps) {
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
        <button className="btn btn--quiet" type="button" onClick={onCleanup} disabled={isCloudLoading}>
          清理舊資料
        </button>
      </div>
    </section>
  );
}
