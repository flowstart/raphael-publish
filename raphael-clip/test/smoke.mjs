import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

await build({
  entryPoints: ['test/entry.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'test/.bundle.mjs',
  logLevel: 'silent',
});

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;

const { extractMarkdown, deepseekAdapter, kimiAdapter, renderForWeChat, normalizePunctuation } = await import('./.bundle.mjs');

let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild;
}

// ---- DeepSeek extraction --------------------------------------------------
console.log('DeepSeek extraction:');
const dsMsg = el(`
<div class="ds-markdown ds-assistant-message-main-content">
  <p class="ds-markdown-paragraph"><span>你说得对，下面是修改后的版本：</span></p>
  <hr>
  <h1><span>他曾是全班倒数第一，20年后却让所有人刮目相看</span></h1>
  <p class="ds-markdown-paragraph"><span>“也许有一天我们再相逢，<strong>睁开眼睛</strong>看清楚。”</span></p>
</div>`);
const dsMd = extractMarkdown(dsMsg, deepseekAdapter);
check('提取出 H1 标题', dsMd.includes('# 他曾是全班倒数第一'));
check('保留加粗', dsMd.includes('**睁开眼睛**'));
check('保留正文段落', dsMd.includes('你说得对'));

// ---- Kimi extraction ------------------------------------------------------
console.log('Kimi extraction:');
const kimiMsg = el(`
<div class="segment-content-box">
  <div class="container-block"><div class="toolcall-container">搜索网页 Claude Fable 5 13 个结果</div></div>
  <div class="markdown-container"><div class="markdown">
    <h2>一、Fable 5 到底强在哪？</h2>
    <div class="paragraph">SWE-bench Pro <strong>80.3%</strong> 是什么概念？</div>
    <ul start="1"><li><div class="paragraph">第一点</div></li><li><div class="paragraph">第二点</div></li></ul>
    <div class="table markdown-table">
      <header class="table-actions"><span class="table-title">表格</span><div class="icon-button">复制</div><div class="icon-button">下载</div></header>
      <div class="table-container"><table>
        <thead><tr><th>场景</th><th>推荐模型</th></tr></thead>
        <tbody><tr><td>前沿编码</td><td><strong>Fable 5</strong></td></tr></tbody>
      </table></div>
    </div>
  </div></div>
  <div class="dbe8cf4a">本回答由 AI 生成，内容仅供参考，请仔细甄别。</div>
  <div class="segment-assistant-actions"><div class="icon-button">赞</div></div>
</div>`);
const kimiMd = extractMarkdown(kimiMsg, kimiAdapter);
check('提取出 H2 标题', kimiMd.includes('## 一、Fable 5 到底强在哪？'));
check('提取出表格', kimiMd.includes('| 场景 |') || kimiMd.includes('| 场景'), kimiMd);
check('提取出列表', kimiMd.includes('- ') || /\n-\s+第一点/.test(kimiMd) || kimiMd.includes('-   第一点'));
check('过滤了工具调用', !kimiMd.includes('搜索网页'));
check('过滤了表格操作栏', !kimiMd.includes('下载'));
check('过滤了 AI 声明', !kimiMd.includes('本回答由 AI 生成'));
check('过滤了点赞按钮', !kimiMd.includes('赞'));

// ---- Mount placement ------------------------------------------------------
console.log('Mount placement:');
const dsWrap = el(`
<div class="msg-wrap">
  <div class="ds-message"><div class="ds-markdown ds-assistant-message-main-content"><p>hi</p></div></div>
  <div class="ds-flex outer">
    <div class="ds-flex inner">
      <div role="button" class="ds-button ds-button--iconLabelTertiary ds-button--icon">a</div>
      <div role="button" class="ds-button ds-button--iconLabelTertiary ds-button--icon">b</div>
      <div role="button" class="ds-button ds-button--iconLabelTertiary ds-button--icon">c</div>
    </div>
    <div style="flex: 1 1 0%;"></div>
  </div>
</div>`);
document.body.appendChild(dsWrap);
const dsTarget = dsWrap.querySelector('.ds-assistant-message-main-content');
const dsBar = document.createElement('div');
dsBar.className = 'rclip-bar';
deepseekAdapter.mount(dsTarget, dsBar);
check('DeepSeek bar 注入图标行', dsBar.parentElement?.classList.contains('inner'), dsBar.parentElement?.className);

const dsLonely = el('<div><div class="ds-markdown ds-assistant-message-main-content"><p>hi</p></div></div>');
document.body.appendChild(dsLonely);
const dsLonelyMsg = dsLonely.querySelector('.ds-assistant-message-main-content');
const dsBar2 = document.createElement('div');
deepseekAdapter.mount(dsLonelyMsg, dsBar2);
check('DeepSeek 无图标行时回退到消息后方', dsLonelyMsg.nextElementSibling === dsBar2);

const kimiWrap = el(`
<div class="segment">
  <div class="segment-content-box"><div class="markdown-container"><div class="markdown"><p>x</p></div></div></div>
  <div class="segment-assistant-actions"><div class="segment-assistant-actions-content"><div class="icon-button">copy</div></div></div>
</div>`);
document.body.appendChild(kimiWrap);
const kimiBox = kimiWrap.querySelector('.segment-content-box');
const kimiBar = document.createElement('div');
kimiAdapter.mount(kimiBox, kimiBar);
check('Kimi bar 注入操作行', kimiBar.parentElement?.classList.contains('segment-assistant-actions-content'));

const kimiLonely = el('<div class="segment-content-box"><div class="markdown-container"><div class="markdown"><p>x</p></div></div></div>');
document.body.appendChild(kimiLonely);
const kimiBar2 = document.createElement('div');
kimiAdapter.mount(kimiLonely, kimiBar2);
check('Kimi 无操作行时回退到盒内末尾', kimiLonely.lastElementChild === kimiBar2);

// ---- Punctuation normalization ---------------------------------------------
console.log('Punctuation normalization:');
const np = normalizePunctuation;
check('中文语境逗号/冒号/引号转全角',
  np('他说:"这很强",我信了') === '他说：“这很强”，我信了',
  np('他说:"这很强",我信了'));
check('加粗标记后的冒号转全角',
  np('**我的建议**:如果你需要') === '**我的建议**：如果你需要',
  np('**我的建议**:如果你需要'));
check('英文句子不动',
  np('SWE-bench Pro: 80.3%, "state of the art" result') === 'SWE-bench Pro: 80.3%, "state of the art" result');
check('数字与中文之间的逗号转全角',
  np('达到 80.3%,但价格翻倍') === '达到 80.3%，但价格翻倍',
  np('达到 80.3%,但价格翻倍'));
check('行内代码不动',
  np('运行`npm install:dev`,然后启动') === '运行`npm install:dev`，然后启动',
  np('运行`npm install:dev`,然后启动'));
check('代码块不动', (() => {
  const input = '前文,如下\n\n```js\nconst a = {b: 1, c: "x"};\n```\n\n后文:结束';
  const out = np(input);
  return out.includes('const a = {b: 1, c: "x"};') && out.startsWith('前文，如下') && out.endsWith('后文：结束');
})(), np('前文,如下\n\n```js\nconst a = {b: 1, c: "x"};\n```\n\n后文:结束'));
check('图片语法的感叹号不动',
  np('见下图![示意图](https://a.com/x.png)说明') === '见下图![示意图](https://a.com/x.png)说明',
  np('见下图![示意图](https://a.com/x.png)说明'));
check('链接 URL 与标题不动',
  np('参考[文档,注意](https://a.com?q=1 "标题:x")内容') === '参考[文档，注意](https://a.com?q=1 "标题:x")内容',
  np('参考[文档,注意](https://a.com?q=1 "标题:x")内容'));
check('幂等：二次处理结果不变', (() => {
  const once = np('他说:"很强",真的!');
  return np(once) === once;
})());
check('正文中的空格数字不被误还原',
  np('回合数减少 25 次,效率更高') === '回合数减少 25 次，效率更高',
  np('回合数减少 25 次,效率更高'));

// ---- Render pipeline ------------------------------------------------------
console.log('Render pipeline (theme: claude):');
const html = await renderForWeChat(kimiMd, 'claude');
check('根节点是 <section>', html.trim().startsWith('<section'));
check('包含内联样式', html.includes('style=') && html.includes('font-family'));
check('表格存在', html.includes('<table'));
check('正文内容存在', html.includes('80.3%'));

const html2 = await renderForWeChat(dsMd, 'apple');
check('Mac 主题渲染成功', html2.includes('<section') && html2.includes('他曾是全班倒数第一'));

console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
