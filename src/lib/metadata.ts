import type { MetadataResponse } from '../types';

export const metadataErrorLabels: Record<string, string> = {
  missing_url: '沒有網址，這就像叫外送但不給地址。',
  invalid_url: '網址格式不對。',
  unsupported_protocol: '只支援 http / https。',
  blocked_host: '這個網址被安全規則擋下來。',
  fetch_failed: '抓取失敗，對方網站可能擋機器人或需要登入。',
  timeout: '抓取逾時，對方網站慢得像行政流程。',
  fetch_error: '抓取時發生錯誤。',
  server_non_json: '解析服務回了非 JSON，通常是平台或 Cloudflare 中途炸了。',
  platform_fetch_failed: '平台資料抓取失敗，這個站可能擋住伺服器請求。',
  platform_login_wall: '這個平台通常需要登入或阻擋伺服器抓取。請用分享原文、手動貼內文，或之後改用瀏覽器外掛抓當前頁面。',
  missing_notion_config: 'Notion 還沒設定 NOTION_TOKEN / NOTION_DATABASE_ID。',
  object_not_found: 'Notion 找不到 database。通常是 database 沒分享給 integration。',
  unauthorized: 'Notion token 無效或權限不足。',
  validation_error: 'Notion database 欄位名稱或型別不符合。',
  invalid_json: '雲端 API 收到無效 JSON。',
  invalid_item: '雲端 API 收到無效收藏資料。',
};

export function metadataErrorText(error?: string) {
  if (!error) return '';
  return metadataErrorLabels[error] ?? error;
}

export async function requestMetadata(url: string): Promise<MetadataResponse> {
  const response = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error('server_non_json');
  }

  const data = (await response.json()) as MetadataResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.error || `metadata_http_${response.status}`);
  }

  return data;
}
