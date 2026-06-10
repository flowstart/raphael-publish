import { THEMES } from '../lib/themes';
import { renderForWeChat } from '../lib/pipeline';
import { copyRichText } from '../lib/clipboard';
import { findAdapter, extractMarkdown, type SiteAdapter } from '../lib/sites';

const FALLBACK_QUICK_THEMES = ['apple', 'claude', 'sspai', 'wechat'];

interface Settings {
    quickThemes: string[];
    defaultTheme: string;
}

let settings: Settings = {
    quickThemes: [...FALLBACK_QUICK_THEMES],
    defaultTheme: FALLBACK_QUICK_THEMES[0],
};

async function loadSettings() {
    try {
        const stored = await chrome.storage.sync.get(['quickThemes', 'defaultTheme']);
        if (Array.isArray(stored.quickThemes)) {
            const valid = stored.quickThemes.filter((id: string) => THEMES.some(t => t.id === id));
            if (valid.length >= 1 && valid.length <= 4) settings.quickThemes = valid;
        }
        if (typeof stored.defaultTheme === 'string' && THEMES.some(t => t.id === stored.defaultTheme)) {
            settings.defaultTheme = stored.defaultTheme;
        }
    } catch (_) { /* use defaults */ }
}

function themeName(id: string): string {
    return THEMES.find(t => t.id === id)?.name || id;
}

function showToast(text: string) {
    document.querySelectorAll('.rclip-toast').forEach(el => el.remove());
    const toast = document.createElement('div');
    toast.className = 'rclip-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('rclip-toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('rclip-toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 2200);
}

function closeAllMenus() {
    document.querySelectorAll('.rclip-menu').forEach(el => ((el as HTMLElement).hidden = true));
}

// Capture phase: the chat apps stopPropagation() inside their own handlers,
// so a bubble-phase listener on document would never fire.
document.addEventListener(
    'click',
    e => {
        if (!(e.target as HTMLElement | null)?.closest?.('.rclip-bar')) closeAllMenus();
    },
    true
);

document.addEventListener(
    'keydown',
    e => {
        if (e.key === 'Escape') closeAllMenus();
    },
    true
);

async function doCopy(msg: HTMLElement, adapter: SiteAdapter, themeId: string, mainBtn: HTMLButtonElement) {
    const original = mainBtn.textContent;
    mainBtn.textContent = '排版中…';
    mainBtn.disabled = true;
    try {
        const markdown = extractMarkdown(msg, adapter);
        if (!markdown.trim()) {
            showToast('没有提取到正文内容');
            return;
        }
        const html = await renderForWeChat(markdown, themeId);
        const ok = await copyRichText(html, markdown);
        showToast(ok ? `已按「${themeName(themeId)}」排版复制，可直接粘贴到公众号` : '复制失败，请重试');
    } catch (err) {
        console.error('[raphael-clip] copy failed', err);
        showToast('排版失败，请重试');
    } finally {
        mainBtn.textContent = original;
        mainBtn.disabled = false;
        updateMainLabel(mainBtn);
    }
}

function updateMainLabel(mainBtn: HTMLButtonElement) {
    mainBtn.textContent = `复制排版 · ${themeName(settings.defaultTheme)}`;
}

function saveDefaultTheme(themeId: string) {
    settings.defaultTheme = themeId;
    try {
        chrome.storage.sync.set({ defaultTheme: themeId });
    } catch (_) { /* ignore */ }
}

function buildBar(msg: HTMLElement, adapter: SiteAdapter): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'rclip-bar';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'rclip-main';
    mainBtn.type = 'button';
    updateMainLabel(mainBtn);
    mainBtn.addEventListener('click', () => doCopy(msg, adapter, settings.defaultTheme, mainBtn));

    const caret = document.createElement('button');
    caret.className = 'rclip-caret';
    caret.type = 'button';
    caret.textContent = '▾';

    const menu = document.createElement('div');
    menu.className = 'rclip-menu';
    menu.hidden = true;

    caret.addEventListener('click', () => {
        const willOpen = menu.hidden;
        closeAllMenus();
        if (willOpen) {
            renderMenu(menu, msg, adapter, mainBtn);
            menu.hidden = false;
        }
    });

    bar.append(mainBtn, caret, menu);
    return bar;
}

function renderMenu(menu: HTMLElement, msg: HTMLElement, adapter: SiteAdapter, mainBtn: HTMLButtonElement) {
    menu.innerHTML = '';
    settings.quickThemes.forEach(id => {
        const item = document.createElement('button');
        item.className = 'rclip-item' + (id === settings.defaultTheme ? ' rclip-item-active' : '');
        item.type = 'button';
        item.textContent = themeName(id);
        item.addEventListener('click', () => {
            menu.hidden = true;
            saveDefaultTheme(id);
            updateMainLabel(mainBtn);
            doCopy(msg, adapter, id, mainBtn);
        });
        menu.appendChild(item);
    });

    const sep = document.createElement('div');
    sep.className = 'rclip-sep';
    menu.appendChild(sep);

    const more = document.createElement('button');
    more.className = 'rclip-item rclip-more';
    more.type = 'button';
    more.textContent = '更多排版与设置…';
    more.addEventListener('click', async () => {
        menu.hidden = true;
        try {
            const markdown = extractMarkdown(msg, adapter);
            await chrome.storage.local.set({
                previewPayload: { markdown, themeId: settings.defaultTheme, at: Date.now() },
            });
            await chrome.runtime.sendMessage({ type: 'openPreview' });
        } catch (err) {
            console.error('[raphael-clip] open preview failed', err);
            showToast('打开预览页失败');
        }
    });
    menu.appendChild(more);
}

const injected = new WeakSet<HTMLElement>();

function scan(adapter: SiteAdapter) {
    adapter.findMessages().forEach(msg => {
        if (injected.has(msg)) return;
        injected.add(msg);
        try {
            adapter.mount(msg, buildBar(msg, adapter));
        } catch (err) {
            console.error('[raphael-clip] mount failed', err);
        }
    });
}

async function init() {
    const adapter = findAdapter(location.hostname);
    if (!adapter) return;

    await loadSettings();
    try {
        chrome.storage.onChanged.addListener((changes: any, area: string) => {
            if (area !== 'sync') return;
            if (Array.isArray(changes.quickThemes?.newValue)) {
                const valid = changes.quickThemes.newValue.filter((id: string) => THEMES.some(t => t.id === id));
                if (valid.length >= 1 && valid.length <= 4) settings.quickThemes = valid;
            }
            if (changes.defaultTheme?.newValue) {
                settings.defaultTheme = changes.defaultTheme.newValue;
                document.querySelectorAll<HTMLButtonElement>('.rclip-main').forEach(btn => updateMainLabel(btn));
            }
        });
    } catch (_) { /* ignore */ }

    scan(adapter);
    let pending = false;
    const observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        setTimeout(() => {
            pending = false;
            scan(adapter);
        }, 600);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

init();
