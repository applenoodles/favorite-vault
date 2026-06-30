type AppHeaderProps = {
  canInstall: boolean;
  onInstall: () => void;
  onAdd: () => void;
};

export function AppHeader({ canInstall, onInstall, onAdd }: AppHeaderProps) {
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
