import type { FavoriteItem } from '../types';
import { normalizeImportedItem } from './storage';

const VAULT_KEY_STORAGE = 'favorite-vault-cloud-key-v1';

export function loadVaultKey() {
  return localStorage.getItem(VAULT_KEY_STORAGE) || '';
}

export function saveVaultKey(key: string) {
  localStorage.setItem(VAULT_KEY_STORAGE, key.trim());
}

export async function requestCloudItemPayloads(_source: string) {
  const response = await fetch('/api/notion-items');
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `notion_load_${response.status}`);
  return Array.isArray(data.items) ? (data.items as Partial<FavoriteItem>[]) : [];
}

export async function requestCloudItems(source: string) {
  return requestCloudItemPayloads(source).then((payloads) => payloads.map(normalizeImportedItem).filter(Boolean) as FavoriteItem[]);
}

export async function upsertCloudItem(_source: string, item: FavoriteItem) {
  const response = await fetch('/api/notion-items', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ item }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `notion_save_${response.status}`);
  return normalizeImportedItem(data.item) || item;
}

export async function deleteCloudItem(_source: string, id: string) {
  const response = await fetch(`/api/notion-items?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `notion_delete_${response.status}`);
}
