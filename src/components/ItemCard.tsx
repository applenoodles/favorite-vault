import { useState } from 'react';
import type { FavoriteItem } from '../types';
import { PLATFORM_LABEL, formatDate, hostOf } from '../lib/platform';
import { needsLlmPass } from '../lib/llmBatch';

type ItemCardProps = {
  item: FavoriteItem;
  onDelete: () => void;
  onEdit: () => void;
  onReparse: () => Promise<void>;
  onLlmExport: () => void;
};

export function ItemCard({ item, onDelete, onEdit, onReparse, onLlmExport }: ItemCardProps) {
  const [parsing, setParsing] = useState(false);
  const link = item.finalUrl || item.url;
  const needsReview = needsLlmPass(item);

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
          {needsReview && <span className="category-pill">needs LLM</span>}
        </div>

        <h3 className="card__title">
          <a href={link} target="_blank" rel="noopener noreferrer">
            {item.title || hostOf(link) || '未命名收藏'}
          </a>
        </h3>

        {item.description && <p className="card__desc">{item.description}</p>}

        {(item.summary || item.category) && (
          <div className="card__summary">
            {item.category && <span className="category-pill">{item.category}</span>}
            {item.summary && <p>{item.summary}</p>}
          </div>
        )}

        {item.contentText && (
          <details className="card__content">
            <summary>
              已抽取內文 {item.contentLength ? `${item.contentLength.toLocaleString()} 字` : ''}
              {item.extractionMethod ? ` · ${item.extractionMethod}` : ''}
            </summary>
            <p>{item.contentText.slice(0, 1200)}</p>
          </details>
        )}

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
          <button className="btn btn--quiet btn--sm" type="button" onClick={onEdit}>
            編輯
          </button>
          <button className="btn btn--quiet btn--sm" type="button" onClick={handleReparse} disabled={parsing}>
            {parsing ? '解析中…' : '解析'}
          </button>
          <button className="btn btn--quiet btn--sm" type="button" onClick={onLlmExport}>
            單筆 LLM
          </button>
          <button className="btn btn--danger btn--sm" type="button" onClick={onDelete}>
            刪除
          </button>
        </div>
      </div>
    </li>
  );
}
