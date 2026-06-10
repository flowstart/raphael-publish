# Raphael Clip - AI 回复一键公众号排版

Chrome 浏览器插件：在 **DeepSeek**（chat.deepseek.com）和 **Kimi**（kimi.com / kimi.moonshot.cn）的每条 AI 回复下方注入一个「复制排版」按钮，点击即把回复内容渲染成微信公众号编辑器可直接粘贴的排版格式。

排版引擎（30 套主题、微信兼容层）移植自开源项目 [raphael-publish](https://github.com/liuxiaopai-ai/raphael-publish)（MIT）。

## 安装（加载已构建的 dist/）

1. 打开 Chrome，地址栏进入 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选择本项目的 `dist/` 目录
4. 打开 DeepSeek 或 Kimi 的对话页（已打开的页面需刷新一次）

## 使用

- 每条 AI 回复的**原生操作图标行**（复制/重新生成旁）会出现 **「复制排版 · 主题名」** 按钮：
  - 点主按钮 → 按当前默认主题排版并复制，去公众号编辑器直接 `Cmd+V`
  - 点右侧 `▾` → 快捷主题（默认：Mac / Claude / 少数派 / 微信公众号原生），点哪个就按哪个复制，同时它成为新的默认主题
  - 「更多排版与设置…」→ 打开预览页：30 套带色板缩略图的主题卡片实时预览、微调 Markdown；卡片上 📌 **置顶**（最多 4 个）即设为聊天页下拉菜单的快捷主题
- 点浏览器工具栏的插件图标也可以直接打开预览页（空白内容，可手动粘贴 Markdown）

## 排版管线

```
回复 DOM → 净化（去思考块/工具调用/操作按钮/AI声明）
        → turndown 转 Markdown
        → markdown-it 渲染 + 主题内联样式 (applyTheme)
        → 微信兼容处理 (wechatCompat：section 包裹、列表/表格 DOM 重塑、图片转 Base64)
        → 以 text/html 写入剪贴板
```

## 开发

需要 Node 18+（本机默认是 v12，用 nvm 切换）：

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
npm install
npm run build   # 输出到 dist/
npm test        # jsdom 冒烟测试（提取 + 渲染管线）
```

## 站点适配维护

DeepSeek / Kimi 的部分类名是混淆哈希，会随版本变化。所有站点相关的选择器集中在
`src/lib/sites.ts`，按钮失效时通常只需更新其中的 `findMessages` 选择器或 `stripSelectors` 列表，然后 `npm run build` 并在 `chrome://extensions` 里点刷新。

| 站点 | 消息锚点 | 说明 |
| --- | --- | --- |
| DeepSeek | `.ds-markdown.ds-assistant-message-main-content` | 思考块 `.ds-think-content` 不在锚点内 |
| Kimi | `.segment-content-box`（需含 `.markdown-container`） | 过滤 `.toolcall-container` 等工具调用块 |

## 已知限制

- 不处理数学公式（KaTeX 会丢失），需要时再加
- Kimi 部分模型会把"思考过程"作为正文输出（与正文同在一个 markdown 容器），DOM 上无法区分，复制后请在公众号编辑器或预览页里手动删掉开头几段
