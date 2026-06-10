import { md, preprocessMarkdown, applyTheme } from './markdown';
import { makeWeChatCompatible } from './wechatCompat';
import { normalizePunctuation } from './punctuation';

// markdown -> themed HTML with inline styles (for on-screen preview)
// normalizePunctuation is idempotent, so re-running it on markdown that was
// already normalized at extraction time is harmless.
export function renderThemed(markdown: string, themeId: string): string {
    const html = md.render(preprocessMarkdown(normalizePunctuation(markdown)));
    return applyTheme(html, themeId);
}

// markdown -> WeChat-editor-safe HTML (what goes onto the clipboard)
export async function renderForWeChat(markdown: string, themeId: string): Promise<string> {
    const themed = renderThemed(markdown, themeId);
    return makeWeChatCompatible(themed, themeId);
}
