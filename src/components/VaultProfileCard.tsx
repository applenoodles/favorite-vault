import type { Platform } from '../types';
import { PLATFORM_LABEL } from '../lib/platform';

type VaultProfileCardProps = {
  profile: {
    parsed: number;
    total: number;
    topPlatform: Platform | '';
    frequentTags: string[];
  };
};

export function VaultProfileCard({ profile }: VaultProfileCardProps) {
  return (
    <section className="profile-card" aria-label="收藏輪廓">
      <div className="profile-card__head">
        <span className="profile-card__eyebrow">收藏輪廓</span>
      </div>
      <div className="profile-card__rows">
        <div className="profile-row">
          <span className="profile-row__label">Parsed metadata</span>
          <span className="profile-row__value">
            {profile.parsed} / {profile.total}
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-row__label">Top platform</span>
          <span className="profile-row__value">{profile.topPlatform ? PLATFORM_LABEL[profile.topPlatform] : '—'}</span>
        </div>
        <div className="profile-row profile-row--tags">
          <span className="profile-row__label">Frequent tags</span>
          <span className="profile-row__value">
            {profile.frequentTags.length > 0 ? (
              <span className="tag-row">
                {profile.frequentTags.map((tag) => (
                  <span className="tag tag--soft" key={tag}>
                    #{tag}
                  </span>
                ))}
              </span>
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>
      <p className="profile-card__hint">
        這些 metadata 之後可以用來做摘要、語意搜尋和個人化推薦。你存的每一筆，都在累積一個 AI 能理解的個人資料庫。
      </p>
    </section>
  );
}
