const VAULT_URL = 'https://lting.dpdns.org/';
const MAX_TEXT_LENGTH = 24000;

const button = document.getElementById('save-button');
const statusEl = document.getElementById('status');

button.addEventListener('click', async () => {
  setStatus('擷取頁面中...');
  button.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) throw new Error('找不到目前分頁。');

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureCurrentPage,
      args: [MAX_TEXT_LENGTH],
    });

    const payload = {
      ...result,
      capturedAt: new Date().toISOString(),
      source: 'chrome-extension',
    };

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await chrome.storage.local.set({ [`vault-payload:${id}`]: payload });

    await chrome.tabs.create({ url: `${VAULT_URL}?extensionImport=${encodeURIComponent(id)}` });
    setStatus('已送到 Favorite Vault。');
    window.close();
  } catch (error) {
    setStatus(error?.message || '擷取失敗。');
    button.disabled = false;
  }
});

function setStatus(message) {
  statusEl.style.display = 'block';
  statusEl.textContent = message;
}

function captureCurrentPage(maxTextLength) {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script, style, noscript, svg, iframe, nav, footer, header, aside').forEach((node) => node.remove());

  const selectedText = String(window.getSelection?.() || '').trim();
  const articleText = readableTextFrom(document.querySelector('article'));
  const mainText = readableTextFrom(document.querySelector('main'));
  const bodyText = readableTextFrom(clone);
  const text = [selectedText, articleText, mainText, bodyText]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || '';

  const title = meta('property', 'og:title') || meta('name', 'twitter:title') || document.title || '';
  const description = meta('property', 'og:description') || meta('name', 'twitter:description') || meta('name', 'description') || '';
  const imageUrl = absolutize(meta('property', 'og:image') || meta('name', 'twitter:image') || firstLargeImage());
  const siteName = meta('property', 'og:site_name') || location.hostname.replace(/^www\./, '');
  const authorName = meta('name', 'author') || meta('property', 'article:author') || guessAuthor();

  return {
    url: location.href,
    title: clean(title),
    description: clean(description),
    imageUrl,
    siteName: clean(siteName),
    authorName: clean(authorName),
    selectedText: selectedText.slice(0, maxTextLength),
    text: cleanReadable(text).slice(0, maxTextLength),
  };

  function readableTextFrom(root) {
    if (!root) return '';
    return cleanReadable(root.innerText || root.textContent || '');
  }

  function cleanReadable(value) {
    const seen = new Set();
    return String(value || '')
      .split('\n')
      .map((line) => clean(line))
      .filter((line) => line.length > 0)
      .filter((line) => {
        const key = line.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function meta(attr, value) {
    return document.querySelector(`meta[${attr}="${value}"]`)?.getAttribute('content') || '';
  }

  function absolutize(value) {
    if (!value) return '';
    try {
      return new URL(value, location.href).toString();
    } catch {
      return value;
    }
  }

  function firstLargeImage() {
    const images = Array.from(document.images)
      .map((img) => ({ src: img.currentSrc || img.src, area: (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0) }))
      .filter((img) => img.src && img.area > 25000)
      .sort((a, b) => b.area - a.area);
    return images[0]?.src || '';
  }

  function guessAuthor() {
    const selectors = [
      '[rel="author"]',
      '[data-testid*="User-Name"]',
      'header a[href^="/@"]',
      'a[href^="/@"]',
      'a[href*="/profile/"]',
    ];
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return '';
  }
}
