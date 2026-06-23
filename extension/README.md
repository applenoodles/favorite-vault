# Favorite Vault Saver Extension

Chrome Extension MVP for capturing the current desktop browser page into Favorite Vault.

## What it captures

- Current URL
- Page title
- Open Graph / Twitter metadata
- First large image fallback
- Selected text, if any
- Selected text first, if any
- Social-page `article` text for Threads / Instagram / Facebook
- Readable text from `article`, `main`, or `body` as fallback
- Rough author guess
- Summary-only payload for the PWA, so the app stores a digest instead of a garbage heap

## How it sends data

The popup stores a payload in `chrome.storage.local`, opens:

```txt
https://lting.dpdns.org/?extensionImport=<id>
```

Then `vault-bridge.js`, which runs only on `https://lting.dpdns.org/*`, reads the payload and posts it into the PWA. The PWA opens the Add Item sheet with summary, category, and suggested tags prefilled. The captured text is used as summary material, not kept as long-term raw content by default.

This avoids putting long article text into the URL, because URLs are not cargo trains, despite what rushed developers keep pretending.

## Install locally

1. Open Chrome
2. Go to `chrome://extensions`
3. Enable Developer mode
4. Click **Load unpacked**
5. Select this `extension` folder
6. Open any webpage
7. Click the extension icon
8. Click **Save current page**

## Current limitation

This MVP still saves into the PWA's current localStorage. True desktop-to-mobile sync requires a cloud database layer such as Supabase, Cloudflare D1, or KV-backed API endpoints.
