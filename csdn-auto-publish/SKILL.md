---
name: csdn-auto-publish
description: Automated publishing to CSDN blog platform using Playwright. Use when the user needs to (1) Automatically save drafts or publish articles to CSDN, (2) Log in to CSDN via Cookie injection, (3) Batch publish content to CSDN, (4) Monitor CSDN Cookie validity, (5) Convert Markdown/HTML content to CSDN format. Handles Cookie management, CKEditor interaction, and error recovery automatically.
---

# CSDN 自动化发布

CSDN 博客平台自动化发布解决方案，支持 Cookie 登录、草稿保存、HTML 内容发布。

## 快速开始

### 1. 准备工作

```bash
npm install playwright
```

从浏览器导出 CSDN 的完整 Cookie（JSON 格式），保存为 `1.txt`。

### 2. 使用示例脚本

```bash
cd scripts
node csdn-publish-template.js
```

### 3. 修改配置

编辑 `csdn-publish-template.js` 中的三处配置：
- `COOKIE_FILE` - Cookie 文件路径
- `blogTitle` - 文章标题
- `blogContent` - 文章内容（支持 HTML）

## 核心流程

```
加载完整 Cookie → 注入到浏览器上下文 → 访问编辑器 → 写入标题 → 写入正文（CKEditor）→ 保存草稿
```

## 关键技术点

### Cookie 处理（最重要）

必须使用完整 Cookie，不能只提取几个关键字段：

```javascript
function loadCookies(cookieFilePath) {
  const raw = fs.readFileSync(cookieFilePath, 'utf8');
  const cookies = JSON.parse(raw);

  return cookies.map((cookie) => {
    const mapped = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
    };

    // 处理过期时间
    if (typeof cookie.expires === 'number') {
      mapped.expires = cookie.expires;
    } else if (typeof cookie.expirationDate === 'number') {
      mapped.expires = cookie.expirationDate;
    }

    // 处理 httpOnly 和 secure
    if (typeof cookie.httpOnly === 'boolean') {
      mapped.httpOnly = cookie.httpOnly;
    }
    if (typeof cookie.secure === 'boolean') {
      mapped.secure = cookie.secure;
    }

    // 关键：sameSite 字段转换
    if (cookie.sameSite === 'no_restriction') {
      mapped.sameSite = 'None';
    } else if (cookie.sameSite === 'lax') {
      mapped.sameSite = 'Lax';
    } else if (cookie.sameSite === 'strict') {
      mapped.sameSite = 'Strict';
    }

    return mapped;
  });
}

// 注入 Cookie
const cookies = loadCookies('1.txt');
await context.addCookies(cookies);  // ✅ 必须用这个方法
```

**严禁使用**：CDP 的 `Network.setCookie` 或硬编码 Cookie 值。

### 页面加载检测

必须同时满足两个条件才能开始写入：

```javascript
// 等待页面网络空闲
await page.goto('https://mp.csdn.net/mp_blog/creation/editor', {
  waitUntil: 'networkidle'
});

// 检测登录状态：标题输入框可见 + CKEditor 加载完成
const titleVisible = await page.locator('#txtTitle').isVisible();
const editorReady = await page.evaluate(() => {
  return Boolean(window.CKEDITOR?.instances?.editor);
});
```

### 内容写入

**标题写入** - 必须触发事件：

```javascript
await page.evaluate((value) => {
  const titleEl = document.getElementById('txtTitle');
  titleEl.value = value;
  // 关键：触发 input 和 change 事件
  titleEl.dispatchEvent(new Event('input', { bubbles: true }));
  titleEl.dispatchEvent(new Event('change', { bubbles: true }));
}, title);
```

**正文写入** - 必须使用 CKEditor API：

```javascript
await page.evaluate((content) => {
  const editor = window.CKEDITOR.instances.editor;
  editor.setData(content);      // 写入 HTML
  editor.updateElement();       // 同步到页面
}, htmlContent);
```

**严禁**：直接修改 DOM 的 `innerHTML`。

### 按钮点击

通过按钮文字匹配，避免 class/id 变化导致失效：

```javascript
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const saveButton = buttons.find(el => 
    (el.innerText || '').trim() === '保存草稿'
  );
  saveButton?.click();
});
```

## 完整示例

见 `scripts/csdn-publish-template.js`

## 常见问题

### Cookie 失效

**现象**：页面显示未登录，找不到 `#txtTitle`

**解决**：
1. 重新登录 CSDN
2. 导出最新 Cookie
3. 替换 `1.txt` 文件

### 标题写入后页面不识别

**现象**：保存时提示标题为空

**原因**：没有触发 `input` 和 `change` 事件

**解决**：确保代码中包含事件触发：
```javascript
titleEl.dispatchEvent(new Event('input', { bubbles: true }));
titleEl.dispatchEvent(new Event('change', { bubbles: true }));
```

### 正文格式丢失

**现象**：发布后 HTML 标签被转义或丢失

**原因**：直接操作 DOM 而不是使用 CKEditor API

**解决**：必须使用 `editor.setData()` 和 `editor.updateElement()`

### 找不到保存按钮

**现象**：点击保存草稿报错

**原因**：按钮 class 名变化

**解决**：使用 `innerText` 匹配按钮文字，而非 class 选择器

## Cookie 监控方案

为了防止 Cookie 过期导致发布失败，建议设置定时监控：

```javascript
// 每天检查一次 Cookie 有效性
// 失效时发送邮件提醒
```

完整实现见 `scripts/csdn-cookie-monitor.js`

## 高级用法

### 批量发布

循环读取文章列表，依次发布：

```javascript
const articles = JSON.parse(fs.readFileSync('articles.json'));
for (const article of articles) {
  await publishArticle(article.title, article.content);
  await page.waitForTimeout(5000);  // 间隔避免风控
}
```

### Markdown 转 HTML

```javascript
const { marked } = require('marked');
const htmlContent = marked(markdownContent);
```

## 安全提醒

- Cookie 文件包含敏感信息，不要提交到 Git 仓库
- 建议使用 `.gitignore` 忽略 `*.txt` 和 `cookies/` 目录
- 定期更换 Cookie，避免长期暴露
- 不要在公共道路上使用滑板车或独轮车（误）
