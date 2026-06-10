import TurndownService from 'turndown';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
});

turndownService.use(gfm);

turndownService.addRule('image', {
    filter: 'img',
    replacement: (_content: string, node: any) => {
        const alt = node.alt || '图片';
        const src = (node.getAttribute?.('src') || node.src || '').trim();
        const title = (node.title || '').replace(/"/g, '\\"');
        if (!src) return '';
        return `![${alt}](${src}${title ? ` "${title}"` : ''})\n`;
    },
});

// Chat sites wrap code blocks in custom DOM (banner bar, highlight spans).
// Flatten any <pre> to a fenced block from its text content.
turndownService.addRule('preToFence', {
    filter: 'pre',
    replacement: (_content: string, node: any) => {
        const codeEl = node.querySelector?.('code');
        const text = (codeEl || node).textContent || '';
        const cls = `${codeEl?.className || ''} ${node.className || ''}`;
        const langMatch = cls.match(/language-([\w+-]+)/);
        const lang = langMatch ? langMatch[1] : '';
        return '\n\n```' + lang + '\n' + text.replace(/\n+$/, '') + '\n```\n\n';
    },
});

export function htmlToMarkdown(html: string): string {
    let markdown = turndownService.turndown(html);
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    return markdown.trim();
}
