import { useEffect } from 'react';
import type { FormEvent } from 'react';
import type { DraftState } from '../types';
import { cleanSummarySource, detectPlatform, generateSummary, hostOf, inferCategory } from '../lib/platform';

type AddItemModalProps = {
  draft: DraftState;
  isParsing: boolean;
  isEditing: boolean;
  onUpdate: (field: keyof DraftState, value: string | number) => void;
  onParse: () => Promise<void>;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AddItemModal({
  draft,
  isParsing,
  isEditing,
  onUpdate,
  onParse,
  onClose,
  onSubmit,
}: AddItemModalProps) {
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
  const hasPreview = draft.description || draft.imageUrl || draft.siteName || draft.title || draft.metadataError || draft.contentText;

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={isEditing ? '編輯收藏' : '新增收藏'} onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <h2 className="sheet__title">{isEditing ? '編輯收藏' : '新增收藏'}</h2>
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
                {draft.contentText && (
                  <span className="preview__content">已取得內容 {draft.contentLength ? `${draft.contentLength.toLocaleString()} 字` : ''}</span>
                )}
                {draft.category && <span className="preview__content">分類：{draft.category}</span>}
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

          <div className="field field-grid">
            <label>
              <span className="field__label">分類</span>
              <input
                className="input"
                placeholder="例：AI / 工具"
                value={draft.category}
                onChange={(event) => onUpdate('category', event.target.value)}
              />
            </label>
            <label>
              <span className="field__label">標籤</span>
              <input
                className="input"
                placeholder="用空白或逗號分隔，例：AI 工具 影片"
                value={draft.tags}
                onChange={(event) => onUpdate('tags', event.target.value)}
              />
            </label>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="summary-input">
              摘要
            </label>
            <textarea
              id="summary-input"
              className="input textarea"
              rows={3}
              placeholder="可自動產生，也可以手動改。"
              value={draft.summary}
              onChange={(event) => onUpdate('summary', event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="content-input">
              摘要材料 / 手動補內容
            </label>
            <textarea
              id="content-input"
              className="input textarea textarea--content"
              rows={6}
              placeholder="IG / Threads 抓不到時，把貼文內容複製貼上；它只用來產生摘要、分類、標籤，存檔不保留整坨原文。"
              value={draft.contentText}
              onChange={(event) => {
                const value = event.target.value;
                const cleaned = cleanSummarySource(value);
                onUpdate('contentText', cleaned);
                onUpdate('contentLength', cleaned.length);
                onUpdate('summary', generateSummary(cleaned, draft.description || draft.title));
                if (!draft.category.trim()) onUpdate('category', inferCategory(cleaned, detectPlatform(draft.url)));
              }}
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
            {isEditing ? '儲存修改' : '存到資料盒'}
          </button>
        </div>
      </form>
    </div>
  );
}
