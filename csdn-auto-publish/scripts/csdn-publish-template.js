/**
 * CSDN 博客自动发布模板
 * 
 * 使用方法：
 * 1. 修改下方三处配置（COOKIE_FILE、blogTitle、blogContent）
 * 2. 确保已安装 playwright: npm install playwright
 * 3. 运行: node csdn-publish-template.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ==================== 小白配置区（只需改这3处） ====================

// 1. Cookie 文件路径（从浏览器导出的 JSON 文件）
const COOKIE_FILE = path.resolve(process.cwd(), '1.txt');

// 2. 博客标题
const blogTitle = '在这里输入你的文章标题';

// 3. 博客正文（支持 HTML 格式）
const blogContent = `
<h2>第一章</h2>
<p>在这里输入你的文章内容...</p>

<h2>第二章</h2>
<p>可以使用 HTML 标签，如 <strong>加粗</strong>、<em>斜体</em>、<a href="https://example.com">链接</a></p>

<ul>
  <li>列表项 1</li>
  <li>列表项 2</li>
</ul>
`;

// ==================== 以下代码无需修改 ====================

const EDITOR_URL = 'https://mp.csdn.net/mp_blog/creation/editor?not_checkout=1';

/**
 * 加载并转换 Cookie
 * 处理 sameSite、expires 等字段的转换
 */
function loadCookies(cookieFilePath) {
  console.log('📖 正在读取 Cookie 文件:', cookieFilePath);
  
  if (!fs.existsSync(cookieFilePath)) {
    throw new Error(`Cookie 文件不存在: ${cookieFilePath}\n请从浏览器导出 CSDN Cookie 并保存为 1.txt`);
  }
  
  const raw = fs.readFileSync(cookieFilePath, 'utf8');
  const cookies = JSON.parse(raw);
  
  console.log(`✅ 成功读取 ${cookies.length} 个 Cookie`);

  return cookies.map((cookie) => {
    const mapped = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
    };

    // 处理过期时间（支持两种格式）
    if (typeof cookie.expires === 'number') {
      mapped.expires = cookie.expires;
    } else if (typeof cookie.expirationDate === 'number') {
      mapped.expires = cookie.expirationDate;
    }

    // 处理 httpOnly
    if (typeof cookie.httpOnly === 'boolean') {
      mapped.httpOnly = cookie.httpOnly;
    }

    // 处理 secure
    if (typeof cookie.secure === 'boolean') {
      mapped.secure = cookie.secure;
    }

    // 关键：sameSite 字段转换（浏览器导出值 → Playwright 需要的值）
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

/**
 * 等待编辑器就绪
 * 检测两个条件：标题框可见 + CKEditor 加载完成
 */
async function waitForLoggedInEditor(page, timeoutMs = 60000) {
  console.log('⏳ 等待编辑器就绪（最多60秒）...');
  
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '';
  
  while (Date.now() < deadline) {
    const titleVisible = await page.locator('#txtTitle').isVisible().catch(() => false);
    const editorReady = await page.evaluate(() => {
      return Boolean(window.CKEDITOR?.instances?.editor);
    }).catch(() => false);

    const status = `标题框: ${titleVisible ? '✅' : '❌'}, 编辑器: ${editorReady ? '✅' : '❌'}`;
    if (status !== lastStatus) {
      console.log(`   ${status}`);
      lastStatus = status;
    }

    if (titleVisible && editorReady) {
      console.log('✅ 编辑器已就绪！');
      return { titleVisible, editorReady };
    }

    await page.waitForTimeout(1500);
  }

  throw new Error('编辑器加载超时（60秒）。可能是：1.Cookie 失效 2.网络问题 3.CSDN 页面改版');
}

/**
 * 写入标题
 * 必须触发 input 和 change 事件，否则页面不识别
 */
async function writeTitle(page, title) {
  console.log('📝 正在写入标题...');
  
  await page.evaluate((value) => {
    const titleEl = document.getElementById('txtTitle');
    if (!titleEl) {
      throw new Error('找不到标题输入框 (#txtTitle)，页面可能未正确加载');
    }
    
    // 设置值
    titleEl.value = value;
    
    // 关键：触发事件让页面识别内容变化
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    
    console.log('   标题已设置为:', value.substring(0, 30) + (value.length > 30 ? '...' : ''));
  }, title);
  
  console.log('✅ 标题写入完成');
}

/**
 * 写入正文
 * 必须使用 CKEditor API，不能直接操作 DOM
 */
async function writeBodyToCkEditor(page, html) {
  console.log('📝 正在写入正文...');
  
  await page.evaluate((content) => {
    // 获取 CKEditor 实例
    const editor = window.CKEDITOR?.instances?.editor;
    if (!editor) {
      throw new Error('CKEditor 未加载，无法写入正文');
    }
    
    // 使用官方 API 设置内容
    editor.setData(content);
    
    // 关键：同步到页面元素
    editor.updateElement();
    
    console.log('   正文已写入，长度:', content.length);
  }, html);
  
  console.log('✅ 正文写入完成');
}

/**
 * 点击保存草稿按钮
 * 通过按钮文字匹配，避免 class 变化导致失效
 */
async function clickSaveDraft(page) {
  console.log('💾 正在点击保存草稿...');
  
  await page.evaluate(() => {
    // 遍历所有 button 元素，通过 innerText 匹配
    const buttons = Array.from(document.querySelectorAll('button'));
    const saveButton = buttons.find(el => {
      const text = (el.innerText || el.textContent || '').trim();
      return text === '保存草稿';
    });
    
    if (!saveButton) {
      // 列出所有按钮文字，帮助排查
      const allTexts = buttons.map(el => (el.innerText || '').trim()).filter(t => t);
      throw new Error(`找不到"保存草稿"按钮。页面上的按钮有: ${allTexts.slice(0, 10).join(', ')}...`);
    }
    
    saveButton.click();
    console.log('   已点击保存草稿按钮');
  });
  
  console.log('✅ 保存草稿按钮已点击');
}

/**
 * 主函数
 */
async function main() {
  console.log('');
  console.log('========================================');
  console.log('CSDN 博客自动保存工具');
  console.log('========================================');
  console.log('');
  
  let browser;
  let screenshotPath = null;
  
  try {
    // 启动浏览器
    console.log('🚀 启动浏览器...');
    browser = await chromium.launch({ 
      headless: true,  // 无头模式，不显示窗口
      args: ['--no-sandbox']
    });
    
    const context = await browser.newContext({ 
      locale: 'zh-CN',
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
    // 加载并注入 Cookie
    const cookies = loadCookies(COOKIE_FILE);
    console.log('🔑 正在注入 Cookie...');
    await context.addCookies(cookies);
    console.log('✅ Cookie 注入完成\n');
    
    // 访问编辑器页面
    console.log('🌐 正在访问 CSDN 编辑器...');
    console.log('   URL:', EDITOR_URL);
    await page.goto(EDITOR_URL, { waitUntil: 'networkidle' });
    console.log('✅ 页面加载完成\n');
    
    // 等待编辑器就绪
    await waitForLoggedInEditor(page);
    console.log('');
    
    // 写入标题
    await writeTitle(page, blogTitle);
    await page.waitForTimeout(1000);
    
    // 写入正文
    await writeBodyToCkEditor(page, blogContent);
    await page.waitForTimeout(2000);
    
    // 保存截图（保存前）
    screenshotPath = `csdn_before_save_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('📸 已保存截图:', screenshotPath);
    
    // 点击保存草稿
    await clickSaveDraft(page);
    
    // 等待保存完成
    console.log('⏳ 等待保存完成（5秒）...');
    await page.waitForTimeout(5000);
    
    // 保存截图（保存后）
    const afterScreenshotPath = `csdn_after_save_${Date.now()}.png`;
    await page.screenshot({ path: afterScreenshotPath, fullPage: true });
    console.log('📸 已保存截图:', afterScreenshotPath);
    
    console.log('');
    console.log('========================================');
    console.log('🎉 草稿保存成功！');
    console.log('========================================');
    console.log('标题:', blogTitle);
    console.log('请登录 CSDN 创作中心查看草稿');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ 运行出错:', error.message);
    
    // 尝试截图记录错误状态
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const errorScreenshot = `csdn_error_${Date.now()}.png`;
          await pages[0].screenshot({ path: errorScreenshot, fullPage: true });
          console.error('📸 错误截图已保存:', errorScreenshot);
        }
      } catch (e) {
        // 截图失败不阻断错误处理
      }
    }
    
    console.error('');
    console.error('排查建议:');
    console.error('1. 检查 Cookie 文件是否存在且未过期');
    console.error('2. 检查网络连接是否正常');
    console.error('3. 查看截图了解页面状态');
    process.exit(1);
    
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      console.log('🔒 浏览器已关闭');
    }
  }
}

// 运行
main();
