export type Platform = 'youtube' | 'instagram' | 'threads' | 'facebook' | 'bilibili' | 'other';
export type SourceAction = 'manual' | 'share-target' | 'imported';
export type CollectionFilter = Platform | 'all' | 'needs_llm';

export interface FavoriteItem {
  id: string;
  url: string;
  title: string;
  note: string;
  tags: string[];
  platform: Platform;
  sourceAction: SourceAction;
  createdAt: string;
  updatedAt?: string;
  rawText?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  authorName?: string;
  finalUrl?: string;
  metadataFetchedAt?: string;
  metadataError?: string;
  contentText?: string;
  contentLength?: number;
  extractionMethod?: string;
  canonicalUrl?: string;
  summary?: string;
  category?: string;
  notionPageId?: string;
}

export interface DraftState {
  url: string;
  title: string;
  note: string;
  tags: string;
  rawText: string;
  sourceAction: SourceAction;
  description: string;
  imageUrl: string;
  siteName: string;
  authorName: string;
  finalUrl: string;
  metadataError: string;
  contentText: string;
  contentLength: number;
  extractionMethod: string;
  canonicalUrl: string;
  summary: string;
  category: string;
}

export interface ExtensionPayload {
  url?: string;
  title?: string;
  text?: string;
  selectedText?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  authorName?: string;
}

export interface MetadataResponse {
  ok: boolean;
  error?: string;
  inputUrl?: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
  limited?: boolean;
  contentText?: string;
  contentPreview?: string;
  contentLength?: number;
  extractionMethod?: string;
  canonicalUrl?: string;
}

export interface LlmBatchResultItem {
  id: string;
  title?: string;
  description?: string;
  summary?: string;
  category?: string;
  tags?: string[] | string;
  note?: string;
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
