# Deploy Favorite Vault to lting.dpdns.org

目標網址：

```txt
https://lting.dpdns.org
```

## 推薦方案：Cloudflare Pages

這個專案是 Vite + React PWA，部署到 Cloudflare Pages 時設定如下：

```txt
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
Node version: 22
```

## 本機檢查

```bash
npm install
npm run build
```

成功後會產生：

```txt
dist/
```

## Cloudflare Pages 建站

1. 到 Cloudflare Dashboard
2. 進入 Workers & Pages
3. Create application
4. Pages
5. Connect to Git 或 Direct Upload
6. 專案名稱可用：`favorite-vault`
7. Build command 填：`npm run build`
8. Output directory 填：`dist`
9. Deploy

部署完成後 Cloudflare 會給一個暫時網址，例如：

```txt
favorite-vault.pages.dev
```

下面 DNS 的 target 要換成你實際拿到的 pages.dev 網址。

## 綁定 lting.dpdns.org

在 Cloudflare Pages 專案中：

```txt
Custom domains
→ Set up a domain
→ lting.dpdns.org
```

接著到 `dpdns.org` 的 DNS 管理頁新增 CNAME：

```txt
Type: CNAME
Name/Host: lting
Target/Value: favorite-vault.pages.dev
TTL: Auto 或 300
```

如果 `lting.dpdns.org` 已經是你能直接管理的完整 hostname，有些 DNS 後台會要你填：

```txt
Name/Host: @
Target/Value: favorite-vault.pages.dev
```

判斷方式：

- 如果你管理的是整個 `dpdns.org` zone，Name 填 `lting`
- 如果你管理的是 `lting.dpdns.org` 這個子網域本身，Name 填 `@`

## 驗證 DNS

```bash
nslookup lting.dpdns.org
```

或：

```bash
curl -I https://lting.dpdns.org
```

Cloudflare Pages 綁定成功後，HTTPS 憑證通常會自動配置。DNS 剛改完不一定立刻生效，等幾分鐘到數十分鐘都算正常。

## PWA 分享功能測試

1. 用手機 Chrome 打開 `https://lting.dpdns.org`
2. 安裝成 PWA
3. 從 YouTube / Bilibili / Threads 按分享
4. 選 Favorite Vault
5. 檢查新增收藏視窗是否有帶入 URL / title / text

## 之後要加後端時

建議新增：

```txt
api.lting.dpdns.org
```

用途：

- metadata 抓取
- 跨裝置同步
- LINE Bot webhook
- Chrome extension save endpoint
- AI 摘要與自動標籤
