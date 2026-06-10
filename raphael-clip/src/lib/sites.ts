import { htmlToMarkdown } from './htmlToMarkdown';
import { normalizePunctuation } from './punctuation';

// Site adapters. Class names on these sites are partly obfuscated hashes that
// change between deploys — anchor only on the semantic-looking ones, and keep
// everything per-site in one place so a breakage is a one-line fix.

export interface SiteAdapter {
    id: string;
    matches(host: string): boolean;
    // One element per assistant reply; also serves as the extraction root.
    findMessages(): HTMLElement[];
    // Where to put our button bar for a given message.
    mount(msg: HTMLElement, bar: HTMLElement): void;
    // Selectors to strip from a cloned message before HTML -> Markdown.
    stripSelectors: string[];
}

// Find the native action-icon row (copy / regenerate / like...) that belongs
// to this message, so our button can sit on the same line. Returns null when
// the site DOM changed — callers must fall back to a standalone placement.
function isAfter(msg: HTMLElement, el: HTMLElement): boolean {
    return !el.contains(msg) && Boolean(msg.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
}

// DeepSeek action buttons carry `ds-button--icon` in their class list. Walk up
// from the message and locate the innermost container holding this message's
// own icon group (guarded so we never grab another message's row).
function deepseekActionRow(msg: HTMLElement): HTMLElement | null {
    let scope: HTMLElement | null = msg.parentElement;
    for (let depth = 0; depth < 4 && scope; depth++, scope = scope.parentElement) {
        const icons = Array.from(scope.querySelectorAll<HTMLElement>('[class*="ds-button--icon"]')).filter(el =>
            isAfter(msg, el)
        );
        if (icons.length < 2) continue;
        let row: HTMLElement | null = icons[0].parentElement;
        while (row && row !== scope && !row.contains(icons[icons.length - 1])) {
            row = row.parentElement;
        }
        if (row && isAfter(msg, row)) return row;
    }
    return null;
}

function kimiActionRow(msg: HTMLElement): HTMLElement | null {
    let scope: HTMLElement | null = msg.parentElement;
    for (let depth = 0; depth < 4 && scope; depth++, scope = scope.parentElement) {
        const row = scope.querySelector<HTMLElement>('.segment-assistant-actions-content');
        if (row && isAfter(msg, row)) return row;
    }
    return null;
}

export const deepseekAdapter: SiteAdapter = {
    id: 'deepseek',
    matches: host => host.endsWith('deepseek.com'),
    findMessages: () =>
        Array.from(document.querySelectorAll<HTMLElement>('.ds-markdown.ds-assistant-message-main-content')),
    mount: (msg, bar) => {
        const row = deepseekActionRow(msg);
        if (row) row.appendChild(bar);
        else msg.insertAdjacentElement('afterend', bar);
    },
    stripSelectors: [
        '.ds-think-content',
        '.ds-button',
        '[role="button"]',
        '[class*="code-block-banner"]',
        '[class*="code-block-footer"]',
        'svg',
    ],
};

export const kimiAdapter: SiteAdapter = {
    id: 'kimi',
    matches: host => host.endsWith('kimi.com') || host.endsWith('kimi.moonshot.cn'),
    findMessages: () =>
        Array.from(document.querySelectorAll<HTMLElement>('.segment-content-box')).filter(box =>
            box.querySelector('.markdown-container')
        ),
    mount: (msg, bar) => {
        const row = kimiActionRow(msg);
        if (row) row.appendChild(bar);
        else msg.appendChild(bar);
    },
    stripSelectors: [
        '.toolcall-container',
        '.container-block',
        '.segment-assistant-actions',
        '.okc-cards-container',
        'header.table-actions',
        '.table-actions',
        '.kimi-tooltip',
        '.icon-button',
        '[class*="code-header"]',
        'svg',
    ],
};

export const ADAPTERS = [deepseekAdapter, kimiAdapter];

export function findAdapter(host: string): SiteAdapter | undefined {
    return ADAPTERS.find(a => a.matches(host));
}

const AI_DISCLAIMER = /(本回答|内容)由\s*AI\s*生成|仅供参考，请仔细甄别/;

export function extractMarkdown(msg: HTMLElement, adapter: SiteAdapter): string {
    const clone = msg.cloneNode(true) as HTMLElement;

    clone.querySelectorAll('.rclip-bar, .rclip-toast').forEach(el => el.remove());
    adapter.stripSelectors.forEach(sel => {
        try {
            clone.querySelectorAll(sel).forEach(el => el.remove());
        } catch (_) { /* bad selector — skip */ }
    });

    // Safety net: drop small leaf-ish nodes that are just the AI disclaimer.
    clone.querySelectorAll('div, p, span').forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.length < 60 && AI_DISCLAIMER.test(text) && !el.querySelector('h1,h2,h3,table,pre')) {
            el.remove();
        }
    });

    return normalizePunctuation(htmlToMarkdown(clone.innerHTML));
}
