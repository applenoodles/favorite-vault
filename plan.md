# Favorite Vault Refactor Plan

This plan is for the next coding agent. The goal is to refactor the large `src/App.tsx` into smaller typed modules without changing runtime behavior.

## Core rule

This is a move-only refactor first. Do not redesign features, rename storage keys, rewrite UI copy, change Notion schema, change API behavior, or alter the LLM prompt output format unless a build error forces a tiny mechanical fix.

The current app works as a React + Vite PWA with Cloudflare Pages Functions and a Chrome extension. Preserve the existing flows:

- Manual add link
- PWA share target query params
- Chrome extension payload via `window.postMessage`
- Metadata parsing through `/api/metadata`
- Local storage persistence
- Notion sync through `/api/notion-items`
- JSON export/import
- LLM batch export/import
- Existing filtering/search/statistics UI

## Target structure

Create these files:

```txt
src/types.ts
src/lib/platform.ts
src/lib/storage.ts
src/lib/metadata.ts
src/lib/llmBatch.ts
src/lib/notionSync.ts
src/components/CloudSyncPanel.tsx
src/components/AppHeader.tsx
src/components/VaultProfileCard.tsx
src/components/StatChips.tsx
src/components/Toolbar.tsx
src/components/ItemCard.tsx
src/components/EmptyState.tsx
src/components/AddItemModal.tsx
```

Keep `src/App.tsx` as the orchestrator for state, effects, handlers, and top-level composition.

## Important dependency direction

Avoid circular imports.

Recommended dependency graph:

```txt
types.ts
  ↑
lib/platform.ts
  ↑
lib/storage.ts
lib/metadata.ts
lib/notionSync.ts
lib/llmBatch.ts
  ↑
components/*
  ↑
App.tsx
```

Rules:

- `types.ts` imports nothing from app modules.
- `platform.ts` imports only types if needed, but should ideally import nothing.
- `storage.ts` may import from `types.ts` and `platform.ts`.
- `metadata.ts` may import from `types.ts`.
- `notionSync.ts` may import from `types.ts` and `storage.ts`.
- `llmBatch.ts` may import from `types.ts` and `platform.ts`.
- Components may import from `types.ts`, `platform.ts`, `metadata.ts`, and `llmBatch.ts` as needed.
- `App.tsx` imports everything. Nothing should import from `App.tsx`.

## Step 0: inventory before editing

Before editing, inspect `src/App.tsx` and confirm the functions/components still match this plan. If the code has already changed, update the plan mentally and preserve behavior.

Useful grep targets:

```txt
^type 
^interface 
^const [A-Z_]
^function 
export default function App
^function [A-Z]
```

## Step 1: create `src/types.ts`

Move these types and interfaces out of `src/App.tsx`:

```ts
type Platform = 'youtube' | 'instagram' | 'threads' | 'facebook' | 'bilibili' | 'other';
type SourceAction = 'manual' | 'share-target' | 'imported';
type CollectionFilter = Platform | 'all' | 'needs_llm';

interface FavoriteItem { ... }
interface DraftState { ... }
interface ExtensionPayload { ... }
interface MetadataResponse { ... }
interface LlmBatchResultItem { ... }

type BeforeInstallPromptEvent = Event & { ... };
```

Export all of them.

Then update `src/App.tsx` to import them with `import type`.

Do not move constants or functions in this step.

## Step 2: create `src/lib/platform.ts`

Move these constants and helpers from `src/App.tsx`:

```ts
PLATFORM_LABEL
PLATFORM_ORDER
SOCIAL_PLATFORMS
PENDING_CATEGORY
LEGACY_SOCIAL_CATEGORY
EMPTY_DRAFT

extractFirstUrl
normalizeUrl
detectPlatform
isSocialPlatform
normalizeCategory
parseTags
isUrlLikeText
cleanSummarySource
splitSentences
generateSummary
inferCategory
suggestTags
fallbackTitle
urlDescriptor
isGenericTitle
deriveItemTitle
isRealTitle
formatDate
hostOf
```

Export everything used by other modules.

Notes:

- `EMPTY_DRAFT` depends on `DraftState`, so import it as a type from `../types`.
- `PLATFORM_LABEL` and `PLATFORM_ORDER` depend on `Platform`, so import type `Platform`.
- Keep all existing strings and regex behavior exactly the same.
- Do not change category labels.
- Do not change summary length limits.

After this step, update `App.tsx` imports and run TypeScript only after the next few extraction steps if running every step is too noisy.

## Step 3: create `src/lib/storage.ts`

Move these from `src/App.tsx`:

```ts
STORAGE_KEY
LEGACY_STORAGE_KEY
createId
normalizeImportedItem
loadItems
saveItems
mergeItems
needsCleanup
```

Imports likely needed:

```ts
import type { FavoriteItem } from '../types';
import {
  cleanSummarySource,
  deriveItemTitle,
  detectPlatform,
  normalizeCategory,
  normalizeUrl,
} from './platform';
```

Export functions used elsewhere:

```ts
createId
normalizeImportedItem
loadItems
saveItems
mergeItems
needsCleanup
```

Keep localStorage key names unchanged.

## Step 4: create `src/lib/metadata.ts`

Move these from `src/App.tsx`:

```ts
metadataErrorLabels
metadataErrorText
requestMetadata
```

Imports likely needed:

```ts
import type { MetadataResponse } from '../types';
```

Keep error labels exactly the same. Do not touch `functions/api/metadata.js` in this refactor.

## Step 5: create `src/lib/notionSync.ts`

Move these from `src/App.tsx`:

```ts
VAULT_KEY_STORAGE
loadVaultKey
saveVaultKey
requestCloudItemPayloads
requestCloudItems
upsertCloudItem
deleteCloudItem
```

Imports likely needed:

```ts
import type { FavoriteItem } from '../types';
import { normalizeImportedItem } from './storage';
```

Important:

- Keep the `_source` argument even though it is currently unused.
- Do not rename these functions yet.
- Do not remove `loadVaultKey` / `saveVaultKey` yet, even if unused.
- Do not change `/api/notion-items` request shapes.

## Step 6: create `src/lib/llmBatch.ts`

Move these from `src/App.tsx`:

```ts
needsLlmPass
getLlmBatchCandidates
getFetchStatus
buildLlmBatchMarkdown
extractJsonText
parseLlmBatchResults
```

Consider whether to move `downloadFile`. Preferred conservative choice:

- Keep `downloadFile` inside `App.tsx` for now because it is a tiny browser utility also used by JSON export.

Imports likely needed:

```ts
import type { FavoriteItem, LlmBatchResultItem } from '../types';
import {
  PLATFORM_LABEL,
  PENDING_CATEGORY,
  isGenericTitle,
  isUrlLikeText,
} from './platform';
```

Important:

- The Markdown prompt text returned by `buildLlmBatchMarkdown` must remain byte-for-byte functionally equivalent. Do not rewrite the prompt.
- The imported JSON parser behavior must remain the same.

## Step 7: split components

Move each JSX component from the bottom of `src/App.tsx` into its own file under `src/components/`.

Components to move:

```txt
CloudSyncPanel
AppHeader
VaultProfileCard
StatChips
Toolbar
ItemCard
EmptyState
AddItemModal
```

General rules:

- Preserve markup, class names, labels, button text, and behavior.
- Define explicit props types in each component file.
- Export each component as a named export.
- Prefer `import type` for type-only imports.
- Do not move `App` itself.
- Do not modify `src/styles.css` unless a class name typo appears from the move. It should not be needed.

Likely component dependencies:

### `CloudSyncPanel.tsx`

Props:

```ts
cloudStatus: string;
isCloudLoading: boolean;
onPull: () => Promise<void>;
onPush: () => Promise<void>;
onCleanup: () => Promise<void>;
```

### `AppHeader.tsx`

Props:

```ts
canInstall: boolean;
onInstall: () => Promise<void>;
onAdd: () => void;
```

### `VaultProfileCard.tsx`

Use a local props type matching the `profile` object in `App.tsx`:

```ts
profile: {
  parsed: number;
  total: number;
  topPlatform: string;
  frequentTags: string[];
};
```

May need `PLATFORM_LABEL` and `Platform` if it displays platform label.

### `StatChips.tsx`

Props:

```ts
total: number;
counts: Record<Platform, number>;
needsLlmCount: number;
```

Needs `PLATFORM_LABEL`, `PLATFORM_ORDER`, and `Platform`.

### `Toolbar.tsx`

Props:

```ts
query: string;
onQuery: (value: string) => void;
platformFilter: CollectionFilter;
onPlatform: (value: CollectionFilter) => void;
counts: Record<Platform, number>;
needsLlmCount: number;
onExport: () => void;
onImportClick: () => void;
onLlmExport: () => void;
onLlmImportClick: () => void;
```

Needs `CollectionFilter`, `Platform`, `PLATFORM_LABEL`, `PLATFORM_ORDER`.

### `ItemCard.tsx`

Props:

```ts
item: FavoriteItem;
onDelete: () => void;
onEdit: () => void;
onReparse: () => Promise<void>;
onLlmExport: () => void;
```

Likely imports:

```ts
import type { FavoriteItem } from '../types';
import { PLATFORM_LABEL, formatDate, hostOf } from '../lib/platform';
import { metadataErrorText } from '../lib/metadata';
import { needsLlmPass } from '../lib/llmBatch';
```

### `EmptyState.tsx`

Props:

```ts
hasItems: boolean;
onAdd: () => void;
```

### `AddItemModal.tsx`

Props:

```ts
draft: DraftState;
isParsing: boolean;
onUpdate: (field: keyof DraftState, value: string | number) => void;
onParse: () => Promise<void>;
onClose: () => void;
onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
isEditing: boolean;
```

Likely imports:

```ts
import type { FormEvent } from 'react';
import type { DraftState } from '../types';
```

If the component uses platform labels or host helpers, import them from `../lib/platform`.

## Step 8: simplify `src/App.tsx`

After extraction, `App.tsx` should contain only:

- React imports
- CSS import
- type imports
- lib imports
- component imports
- `downloadFile` if kept there
- `App` component state/effects/handlers

`App.tsx` should no longer contain:

- Type/interface declarations
- Platform utility helpers
- Storage helpers
- Metadata request helper
- Notion request helper
- LLM batch parser/builder helpers
- Child component definitions

## Step 9: validation

Run:

```bash
npm run build
```

If build fails, fix only mechanical import/type/export errors.

After build passes, inspect the git diff and verify:

- No runtime logic was intentionally changed.
- No API endpoint paths changed.
- No storage keys changed.
- No user-facing copy changed unless TypeScript extraction required moving it unchanged.
- No files under `functions/api/` were modified.
- No files under `extension/` were modified.
- No files under `dist/` were modified.

## Expected final shape

`src/App.tsx` should read like an orchestrator, not a landfill:

```tsx
export default function App() {
  const [items, setItems] = useState<FavoriteItem[]>(() => loadItems());
  ...

  async function loadFromCloud(...) { ... }
  async function handleSubmit(...) { ... }
  ...

  return (
    <div className="app">
      ...
    </div>
  );
}
```

## Do not do these in this refactor

- Do not redesign the UI.
- Do not change styling.
- Do not migrate localStorage keys.
- Do not remove legacy constants.
- Do not rename Notion fields.
- Do not change `functions/api/notion-items.js`.
- Do not change `functions/api/metadata.js`.
- Do not change the Chrome extension.
- Do not rewrite the LLM prompt.
- Do not add a router, state manager, query library, or other dependency.
- Do not touch `dist/`.

## Suggested commit message

```txt
refactor: split Favorite Vault app into typed libs and components
```
