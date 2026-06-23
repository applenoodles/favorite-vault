(() => {
  const params = new URLSearchParams(location.search);
  const id = params.get('extensionImport');
  if (!id) return;

  const key = `vault-payload:${id}`;
  chrome.storage.local.get(key, (result) => {
    const payload = result[key];
    if (!payload) return;

    let attempts = 0;
    const sendPayload = () => {
      attempts += 1;
      window.postMessage(
        {
          type: 'favorite-vault-extension-payload',
          payload,
        },
        window.location.origin,
      );

      if (attempts < 6) {
        window.setTimeout(sendPayload, 350);
      } else {
        chrome.storage.local.remove(key);
      }
    };

    sendPayload();
  });
})();
