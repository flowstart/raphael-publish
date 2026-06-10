import { THEMES, THEME_GROUPS } from '../lib/themes';
import { renderThemed, renderForWeChat } from '../lib/pipeline';
import { copyRichText } from '../lib/clipboard';

const SAMPLE_MD = `# Raphael Clip 排版预览

从 DeepSeek / Kimi 的回复点「更多排版与设置…」会把内容带到这里。

## 它能做什么

- **一键复制**：渲染为公众号编辑器可直接粘贴的格式
- *样式精准*：背景色、圆角、间距完整保留
- 列表和表格经过 DOM 重塑，微信里不塌陷

> 左侧切换 30 套主题实时预览，置顶 📌 的主题会出现在聊天页的下拉菜单里。

| 功能 | 状态 |
| --- | --- |
| 魔法粘贴 | ✅ |
| 主题切换 | ✅ |

\`\`\`js
console.log('hello, 公众号');
\`\`\`
`;

const FALLBACK_QUICK_THEMES = ['apple', 'claude', 'sspai', 'wechat'];
const MAX_PINNED = 4;

let markdown = SAMPLE_MD;
let currentTheme = FALLBACK_QUICK_THEMES[0];
let quickThemes = [...FALLBACK_QUICK_THEMES];

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const frame = $('#preview-frame');
const editor = $('#md-editor') as HTMLTextAreaElement;
const toastEl = $('#toast');

let toastTimer: any;
function toast(text: string) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// Pull display colors out of a theme's inline-style strings for the mini
// swatch: container background (may be a gradient — used verbatim), heading
// color as the accent stripe, body color for the "Aa" glyph.
function styleProp(style: string | undefined, prop: string): string | null {
    if (!style) return null;
    const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    // Theme styles carry `!important` (needed when pasted into WeChat), but
    // CSSOM rejects it in direct el.style assignments — strip it here.
    return m ? m[1].replace(/!important/g, '').trim() : null;
}

function swatchColors(theme: (typeof THEMES)[number]) {
    const s = theme.styles;
    const bg =
        styleProp(s.container, 'background') ||
        styleProp(s.container, 'background-color') ||
        '#ffffff';
    const accent =
        styleProp(s.h2, 'color') ||
        styleProp(s.h1, 'color') ||
        styleProp(s.strong, 'color') ||
        '#475569';
    const text = styleProp(s.container, 'color') || '#334155';
    return { bg, accent, text };
}

function renderPreview() {
    try {
        frame.innerHTML = renderThemed(markdown, currentTheme);
    } catch (err) {
        console.error(err);
        frame.innerHTML = '<p style="color:#b91c1c;padding:24px">渲染失败，请检查 Markdown 内容</p>';
    }
}

function selectTheme(id: string) {
    currentTheme = id;
    try {
        chrome.storage.sync.set({ defaultTheme: id });
    } catch (_) { /* standalone */ }
    renderThemeList();
    renderPreview();
}

function togglePin(id: string) {
    const idx = quickThemes.indexOf(id);
    if (idx >= 0) {
        if (quickThemes.length <= 1) {
            toast('至少保留一个快捷风格');
            return;
        }
        quickThemes.splice(idx, 1);
    } else {
        if (quickThemes.length >= MAX_PINNED) {
            toast(`快捷风格最多 ${MAX_PINNED} 个，先取消一个再置顶`);
            return;
        }
        quickThemes.push(id);
        toast(`已置顶「${THEMES.find(t => t.id === id)?.name}」(${quickThemes.length}/${MAX_PINNED})`);
    }
    try {
        chrome.storage.sync.set({ quickThemes });
    } catch (_) { /* standalone */ }
    renderThemeList();
}

function renderThemeList() {
    const list = $('#theme-list');
    list.innerHTML = '';
    THEME_GROUPS.forEach(group => {
        const label = document.createElement('div');
        label.className = 'group-label';
        label.textContent = group.label;
        list.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'theme-grid';
        group.themes.forEach(theme => {
            const { bg, accent, text } = swatchColors(theme);

            const card = document.createElement('div');
            card.className = 'theme-card' + (theme.id === currentTheme ? ' selected' : '');
            card.title = theme.description;

            const swatch = document.createElement('div');
            swatch.className = 'swatch';
            swatch.style.background = bg;

            const stripe = document.createElement('span');
            stripe.className = 'swatch-accent';
            stripe.style.background = accent;

            const aa = document.createElement('span');
            aa.className = 'swatch-aa';
            aa.style.color = text;
            aa.textContent = 'Aa';

            swatch.append(stripe, aa);

            const name = document.createElement('span');
            name.className = 'theme-name';
            name.textContent = theme.name;

            const pinned = quickThemes.includes(theme.id);
            const pin = document.createElement('button');
            pin.className = 'pin-btn' + (pinned ? ' pinned' : '');
            pin.type = 'button';
            pin.textContent = '📌';
            pin.title = pinned ? '取消置顶' : '置顶为快捷风格';
            pin.addEventListener('click', e => {
                e.stopPropagation();
                togglePin(theme.id);
            });

            card.append(swatch, name, pin);
            card.addEventListener('click', () => selectTheme(theme.id));
            grid.appendChild(card);
        });
        list.appendChild(grid);
    });
}

async function init() {
    try {
        const sync = await chrome.storage.sync.get(['quickThemes', 'defaultTheme']);
        if (Array.isArray(sync.quickThemes)) {
            const valid = sync.quickThemes.filter((id: string) => THEMES.some(t => t.id === id));
            if (valid.length >= 1 && valid.length <= MAX_PINNED) quickThemes = valid;
        }
        if (sync.defaultTheme && THEMES.some(t => t.id === sync.defaultTheme)) currentTheme = sync.defaultTheme;

        const local = await chrome.storage.local.get('previewPayload');
        const payload = local.previewPayload;
        // Only pick up a payload handed over recently (within 10 minutes).
        if (payload?.markdown && Date.now() - (payload.at || 0) < 10 * 60 * 1000) {
            markdown = payload.markdown;
            if (payload.themeId && THEMES.some(t => t.id === payload.themeId)) currentTheme = payload.themeId;
        }
    } catch (_) { /* standalone open without payload */ }

    editor.value = markdown;
    renderThemeList();
    renderPreview();

    let timer: any;
    editor.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            markdown = editor.value;
            renderPreview();
        }, 250);
    });

    const seg = $('#width-seg');
    seg.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const w = btn.dataset.w!;
            frame.style.width = w === '100%' ? '100%' : `${w}px`;
        });
    });

    const drawer = $('#drawer');
    const editorToggle = $('#editor-toggle');
    editorToggle.classList.add('active');
    editorToggle.addEventListener('click', () => {
        drawer.classList.toggle('collapsed');
        editorToggle.classList.toggle('active', !drawer.classList.contains('collapsed'));
    });

    const copyBtn = $('#copy-btn') as HTMLButtonElement;
    copyBtn.addEventListener('click', async () => {
        copyBtn.disabled = true;
        copyBtn.textContent = '排版中…';
        try {
            const html = await renderForWeChat(markdown, currentTheme);
            const ok = await copyRichText(html, markdown);
            toast(ok ? '已复制，去公众号编辑器直接粘贴即可' : '复制失败，请重试');
        } catch (err) {
            console.error(err);
            toast('排版失败');
        } finally {
            copyBtn.disabled = false;
            copyBtn.textContent = '复制到公众号';
        }
    });

    $('#copy-md-btn').addEventListener('click', async () => {
        await navigator.clipboard.writeText(markdown);
        toast('Markdown 已复制');
    });
}

init();
