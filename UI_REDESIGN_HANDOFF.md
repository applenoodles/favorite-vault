# Favorite Vault UI Redesign Handoff

這份文件給其他 AI / 設計工具爆改 UI 用。請優先改視覺，不要破壞目前 PWA、Share Target、metadata API、localStorage 資料結構。

## 使用者想要的方向

使用者覺得目前 UI 醜，想要類似 Claude 的米色、紙感、乾淨、溫暖、低對比介面。

關鍵詞：

```txt
Claude-like beige UI
warm neutral
paper texture
soft cards
editorial layout
reading app
personal archive
knowledge vault
calm productivity
less SaaS dashboard
less dark glassmorphism
```

不要走：

```txt
黑色玻璃擬態
賽博霓虹
過度 gradient
太像 crypto dashboard
太像工程 demo
```

## 目前技術

```txt
React + Vite + TypeScript
Cloudflare Pages
Cloudflare Pages Functions
PWA manifest
Service Worker
localStorage persistence
```

## UI 相關檔案

### 1. `src/App.tsx`

主要 UI、狀態、資料流都在這裡。

包含：

- FavoriteItem / DraftState type
- localStorage load/save
- 分享進來的 URL 處理
- 新增收藏 modal
- 收藏卡片列表
- metadata 解析按鈕
- metadata debug 展開區
- 搜尋、平台 filter、tag cloud
- JSON import/export

這是改版最重要檔案。

### 2. `src/styles.css`

目前所有樣式都在這裡。

可以整份重寫成 Claude 米色風格。建議不要動 class name，直接重寫樣式比較安全。

目前主要 class：

```txt
.app-shell
.hero-card
.hero-copy
.hero-actions
.toolbar-card
.insight-card
.stats-grid
.tag-cloud
.content-grid
.empty-state
.item-card
.item-card-body
.thumbnail-link
.platform-pill
.date-text
.meta-text
.description-text
.note-text
.error-text
.metadata-details
.metadata-preview
.metadata-preview-list
.item-tags
.item-footer
.item-actions
.modal-backdrop
.composer
.composer-header
.metadata-actions
.raw-share
.composer-actions
```

### 3. `index.html`

HTML shell，通常不用大改。

可以改：

- title
- meta description
- theme-color
- font preload，如果新增字體

### 4. `public/manifest.webmanifest`

PWA 設定。

包含：

- app name
- icon
- theme_color
- background_color
- share_target

如果改成米色 UI，建議同步改：

```json
"background_color": "#f7f0e6",
"theme_color": "#f3eadc"
```

但不要移除 share_target。

### 5. `public/service-worker.js`

PWA cache + share target handler。

不要隨便改，除非知道自己在幹嘛。

重點：

```txt
POST /share-target
→ 讀 title/text/url
→ redirect 到 /?shareUrl=...
```

### 6. `functions/api/metadata.js`

Cloudflare Pages Function，負責解析連結 metadata。

API：

```txt
GET /api/metadata?url=<encoded url>
```

回傳：

```json
{
  "ok": true,
  "inputUrl": "https://example.com/",
  "finalUrl": "https://example.com/",
  "status": 200,
  "contentType": "text/html",
  "limited": false,
  "title": "Example Domain",
  "description": "",
  "image": "",
  "siteName": "example.com",
  "author": ""
}
```

UI 會把這些欄位存成：

```txt
title
description
imageUrl
siteName
authorName
finalUrl
metadataFetchedAt
metadataError
```

## 資料模型

`FavoriteItem`：

```ts
interface FavoriteItem {
  id: string;
  url: string;
  title: string;
  note: string;
  tags: string[];
  platform: 'youtube' | 'instagram' | 'threads' | 'facebook' | 'bilibili' | 'other';
  sourceAction: 'manual' | 'share-target' | 'imported';
  createdAt: string;
  rawText?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  authorName?: string;
  finalUrl?: string;
  metadataFetchedAt?: string;
  metadataError?: string;
}
```

## 目前 metadata 顯示位置

### 新增 modal

貼 URL 後按「解析連結」，會顯示：

- 縮圖
- siteName
- description
- title
- author
- image
- finalUrl

### 收藏卡片

卡片會顯示：

- thumbnail
- platform
- title
- finalUrl / url
- siteName · authorName
- description
- note
- metadata error
- details 展開區：完整 metadata 欄位

## 建議新視覺方向

### Palette

```css
--bg: #f7f0e6;
--surface: #fffaf2;
--surface-muted: #f0e5d6;
--text: #2f261d;
--text-muted: #7a6b5c;
--border: #ded0bd;
--accent: #8b5e34;
--accent-soft: #ead8c0;
--danger: #9f3a2f;
```

### Typography

建議：

```css
font-family: ui-serif, Georgia, "Times New Roman", "Noto Serif TC", serif;
```

或更接近 Claude：

```css
font-family: Inter, ui-sans-serif, system-ui, "Noto Sans TC", sans-serif;
```

搭配較大的 line-height、少量 uppercase eyebrow。

### Layout

建議改成：

```txt
左側窄 sidebar：搜尋、平台篩選、統計
右側主區：收藏卡片 feed
頂部：簡潔標題 + 新增收藏
收藏卡片：像文章 preview，不像 dashboard widget
新增 modal：像筆記編輯器，不像表單監獄
```

### Card Style

```txt
米白底
細邊框
小陰影或完全無陰影
圓角 18-24px
thumbnail 比例 16:9
metadata details 改成小型 table / definition list
```

## 可以直接給其他 AI 的改版指令

```txt
請把這個 React PWA 的 UI 改成 Claude 風格的米色、紙感、溫暖介面。
保留所有現有功能與 class/data flow：PWA share target、localStorage、metadata parser、JSON import/export、搜尋、平台篩選、metadata details。
主要修改 src/App.tsx 與 src/styles.css，可以重排 layout，但不要移除功能。
目標感覺是個人知識收藏庫，不是 SaaS dashboard。使用 warm beige palette、soft paper cards、calm typography、清楚可讀的 metadata 區塊。
請優先讓 metadata 顯示更明顯，包括 title、description、siteName、author、image、finalUrl。
```

## 後續真正要做 AI 個性化

目前只是 metadata + localStorage。

下一階段應該加：

```txt
Cloudflare D1 / Supabase
OpenAI 或其他模型摘要
自動標籤
embedding
semantic search
recommendation endpoint
```

資料流：

```txt
收藏 URL
→ /api/metadata 抓 title/description/image
→ /api/summarize 產生 summary/tags
→ 存 DB
→ embedding
→ 使用者搜尋/提問時 retrieval
→ AI 根據收藏偏好推薦
```
