import type { MetadataResponse } from '../types';

const LOCAL_METADATA_FALLBACK_ORIGIN = 'https://lting.dpdns.org';

export const metadataErrorLabels: Record<string, string> = {
  missing_url: '沒有網址，這就像叫外送但不給地址。',
  invalid_url: '網址格式不對。',
  unsupported_protocol: '只支援 http / https。',
  blocked_host: '這個網址被安全規則擋下來。',
  fetch_failed: '抓取失敗，對方網站可能擋機器人或需要登入。',
  timeout: '抓取逾時，對方網站慢得像行政流程。',
  fetch_error: '抓取時發生錯誤。',
  server_non_json: '解析服務回了非 JSON。',
  metadata_network_error: '連不到解析服務。',
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
  const { code, detail } = splitMetadataError(error);
  const label = metadataErrorLabels[code];
  if (!label) return error;
  return detail ? `${label}（${detail}）` : label;
}

export async function requestMetadata(url: string): Promise<MetadataResponse> {
  try {
    return await fetchMetadata(url, '');
  } catch (error) {
    if (!shouldFallbackToRemoteMetadata(error)) throw error;
    return fetchMetadata(url, LOCAL_METADATA_FALLBACK_ORIGIN);
  }
}

async function fetchMetadata(url: string, origin: string): Promise<MetadataResponse> {
  const endpoint = `${origin}/api/metadata?url=${encodeURIComponent(url)}`;
  let response: Response;

  try {
    response = await fetch(endpoint);
  } catch (error) {
    throw metadataError('metadata_network_error', `endpoint=${describeEndpoint(endpoint)} message=${errorMessage(error)}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const preview = await response.text().catch(() => '');
    throw metadataError(
      'server_non_json',
      `endpoint=${describeEndpoint(endpoint)} status=${response.status} content-type=${contentType || 'unknown'} body=${quotePreview(preview)}`,
    );
  }

  const data = (await response.json()) as MetadataResponse;

  if (!response.ok || !data.ok) {
    throw metadataError(data.error || `metadata_http_${response.status}`, `endpoint=${describeEndpoint(endpoint)} status=${response.status}`);
  }

  return data;
}

function shouldFallbackToRemoteMetadata(error: unknown) {
  const code = error instanceof Error ? splitMetadataError(error.message).code : '';
  return code === 'server_non_json' && isLocalDevelopmentOrigin();
}

function isLocalDevelopmentOrigin() {
  if (window.location.protocol === 'http:') return true;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
function metadataError(code: string, detail = '') {
  return new Error(detail ? `${code}: ${detail}` : code);
}

function splitMetadataError(error: string) {
  const separator = error.indexOf(': ');
  if (separator < 0) return { code: error, detail: '' };
  return { code: error.slice(0, separator), detail: error.slice(separator + 2) };
}

function describeEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpoint;
  }
}

function quotePreview(value: string) {
  return JSON.stringify(value.replace(/\s+/g, ' ').trim().slice(0, 240));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
