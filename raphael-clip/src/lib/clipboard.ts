export async function copyRichText(html: string, plain: string): Promise<boolean> {
    try {
        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([plain], { type: 'text/plain' }),
            }),
        ]);
        return true;
    } catch (e) {
        // Fallback: select a hidden contenteditable and execCommand('copy')
        const host = document.createElement('div');
        host.contentEditable = 'true';
        host.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;';
        host.innerHTML = html;
        document.body.appendChild(host);
        const range = document.createRange();
        range.selectNodeContents(host);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch (_) {
            ok = false;
        }
        sel?.removeAllRanges();
        host.remove();
        return ok;
    }
}
