// AI chat output frequently mixes half-width punctuation (", : ,") into
// Chinese prose. Normalize to full-width, but ONLY in Chinese context, and
// never inside code blocks, inline code, or markdown link/image targets.

// CJK chars + CJK/fullwidth punctuation — "Chinese context" for our purposes.
const CJK = '\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef\\u2018\\u2019\\u201c\\u201d\\u2026';
const CJK_RE = new RegExp(`[${CJK}]`);

const FULL: Record<string, string> = {
    ',': '，',
    ':': '：',
    ';': '；',
    '!': '！',
    '?': '？',
};

// `!` must not touch image syntax `![alt](...)`.
const PUNCT = '(?:[,;:?]|!(?!\\[))';

// Followed by CJK (possibly through opening emphasis markers): eat spaces on both sides.
const BEFORE_CJK = new RegExp(`[ \\t]*(${PUNCT})[ \\t]*(?=[*_~]{0,3}[${CJK}])`, 'g');
// Preceded by CJK (possibly through closing emphasis markers): eat leading space.
const AFTER_CJK = new RegExp(`(?<=[${CJK}][*_~]{0,3})[ \\t]*(${PUNCT})`, 'g');

function convertSegment(text: string): string {
    text = text.replace(BEFORE_CJK, (_m, p) => FULL[p]);
    text = text.replace(AFTER_CJK, (_m, p) => FULL[p]);
    // Straight double quotes -> Chinese quotes when the quoted run or its
    // direct neighbours are Chinese. Single quotes are left alone (apostrophes).
    text = text.replace(/"([^"\n]{0,160}?)"/g, (m, inner, off: number, whole: string) => {
        const prev = whole[off - 1] || '';
        const next = whole[off + m.length] || '';
        if (CJK_RE.test(inner) || CJK_RE.test(prev) || CJK_RE.test(next)) {
            return `“${inner}”`;
        }
        return m;
    });
    // Drop stray spaces right after full-width punctuation.
    text = text.replace(/([，：；！？”])[ \t]+/g, '$1');
    return text;
}

export function normalizePunctuation(markdown: string): string {
    const stash: string[] = [];
    // NUL never appears in chat-extracted markdown, so it is a safe sentinel.
    const hide = (m: string) => {
        stash.push(m);
        return `\u0000${stash.length - 1}\u0000`;
    };

    let text = markdown
        .replace(/```[\s\S]*?(?:```|$)/g, hide) // fenced code blocks
        .replace(/`[^`\n]*`/g, hide) // inline code
        .replace(/\]\([^)\n]*\)/g, hide); // link / image targets (URLs, titles)

    text = convertSegment(text);

    return text.replace(/\u0000(\d+)\u0000/g, (_m, i) => stash[Number(i)]);
}
