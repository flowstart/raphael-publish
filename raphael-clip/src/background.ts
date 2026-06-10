// Service worker: opens the preview page and proxies image fetches so the
// content script can convert cross-origin images to base64 (page CSP/CORS
// would block a direct fetch from the content script).

function bufferToDataUrl(buf: ArrayBuffer, contentType: string): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
}

chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: (r: any) => void) => {
    if (msg?.type === 'fetchImage' && typeof msg.url === 'string') {
        fetch(msg.url)
            .then(async r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const ct = r.headers.get('content-type') || 'image/png';
                sendResponse({ dataUrl: bufferToDataUrl(await r.arrayBuffer(), ct) });
            })
            .catch(() => sendResponse({ dataUrl: null }));
        return true; // async response
    }
    if (msg?.type === 'openPreview') {
        chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') });
        sendResponse({ ok: true });
        return false;
    }
    return false;
});

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') });
});
