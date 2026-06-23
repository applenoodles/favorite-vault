# Favorite Vault

一個先離線可用的收藏 PWA。目標是把 Threads、Instagram、Facebook、YouTube、Bilibili 等平台的分享連結集中到自己的個人收藏資料庫。

## 目前功能

- 手動新增收藏連結
- PWA 安裝支援
- Android / Chrome PWA Share Target 支援
- 平台自動辨識：YouTube、Instagram、Threads、Facebook、Bilibili、其他
- Cloudflare Pages Function 解析 metadata：標題、描述、縮圖、站名、作者
- 搜尋標題、描述、網址、筆記、標籤
- 平台統計
- AI-ready profile 小摘要
- JSON 匯出 / 匯入
- 離線 fallback service worker

## 開發

```bash
npm install
npm run dev
```

打包：

```bash
npm run build
npm run preview
```

## 部署目標

目前建議部署到：

```txt
https://lting.dpdns.org
```

詳細部署與 DNS 設定看 [`DEPLOY.md`](./DEPLOY.md)。

## 手機分享入口怎麼測

PWA Share Target 通常需要：

1. 使用 HTTPS 或 localhost
2. 用 Chrome 開啟
3. 安裝成 PWA
4. 從 YouTube / Bilibili / Threads 等 app 按分享
5. 選 Favorite Vault

送進來後會打開新增收藏視窗，確認標題、標籤、筆記後存入 localStorage。

## 不用 Telegram 的 bot / 入口選項

### 1. PWA Share Target

最推薦的第一版。不用 bot、不用中間帳號，直接吃手機分享選單。

### 2. LINE Bot

台灣日常使用最順，但需要一個後端接 LINE webhook，還要做 LINE Developers channel。適合第二階段。

### 3. Discord Bot

比 LINE bot 開發簡單，適合丟連結到私人頻道再同步到資料庫。但手機分享到 Discord 仍多一步。

### 4. Email Inbox

建立一個收信地址，例如 `save@your-domain.com`，你把連結寄過去，後端解析 email。穩，但比較像 2008 年的人類努力假裝自己還有秩序。

### 5. Chrome Extension

桌面版最好用。可以在每個平台頁面加「存到 Favorite Vault」按鈕，或讀目前頁面 URL/title 後送進後端。

## Metadata API

Cloudflare Pages 部署後會提供：

```txt
GET /api/metadata?url=https%3A%2F%2Fexample.com
```

會回傳：

```json
{
  "ok": true,
  "title": "頁面標題",
  "description": "頁面描述",
  "image": "縮圖 URL",
  "siteName": "站名",
  "author": "作者",
  "finalUrl": "redirect 後網址"
}
```

注意：Instagram、Threads、Facebook、Bilibili 等平台可能會擋未登入或機器人請求，所以不是每個連結都能完整解析。這不是前端爛，是平台把門焊死。

## 下一步建議

1. 加 Supabase / Cloudflare D1，讓資料跨裝置同步
2. 加 AI 摘要與自動標籤
3. 加向量搜尋，讓 AI 能依收藏內容找相似素材
4. 加 Chrome extension
5. 加 LINE bot webhook
