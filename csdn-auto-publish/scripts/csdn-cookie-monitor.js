/**
 * CSDN Cookie 自动监控脚本
 * 
 * 功能：定期检测 CSDN Cookie 是否有效，失效时发送邮件提醒
 * 
 * 使用方法：
 * 1. 配置下方的邮件参数（SMTP 服务器、账号、密码）
 * 2. 设置定时任务（如 cron）每 24 小时运行一次
 * 3. 运行: node csdn-cookie-monitor.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// ==================== 配置区 ====================

// Cookie 文件路径
const COOKIE_FILE = path.resolve(process.cwd(), '1.txt');

// CSDN 编辑器 URL（用于检测登录状态）
const CHECK_URL = 'https://mp.csdn.net/mp_blog/creation/editor?not_checkout=1';

// 邮件配置（以 163 邮箱为例）
const EMAIL_CONFIG = {
  host: 'smtp.163.com',      // SMTP 服务器
  port: 25,                   // SMTP 端口
  secure: false,              // 是否使用 SSL
  auth: {
    user: 'your-email@163.com',  // 发件人邮箱
    pass: 'your-auth-code'        // 邮箱授权码（不是登录密码）
  },
  tls: {
    rejectUnauthorized: false
  }
};

// 收件人邮箱
const ALERT_EMAIL = 'your-qq@qq.com';

// ==================== 以下代码无需修改 ====================

/**
 * 发送警报邮件
 */
async function sendAlertEmail(errorDetails, screenshotPath = null) {
  console.log('📧 正在发送警报邮件...');
  
  try {
    const transporter = nodemailer.createTransport(EMAIL_CONFIG);
    
    // 验证邮件服务器连接
    await transporter.verify();
    
    const attachments = [];
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      attachments.push({
        filename: 'csdn_cookie_error.png',
        path: screenshotPath,
        contentType: 'image/png'
      });
    }

    const mailOptions = {
      from: EMAIL_CONFIG.auth.user,
      to: ALERT_EMAIL,
      subject: '【紧急】CSDN Cookie 已失效 - 需要更新',
      html: `
        <h2 style="color: #e74c3c;">⚠️ CSDN Cookie 监控警报</h2>
        <p><strong>检测到 CSDN Cookie 已失效！</strong></p>
        
        <h3>📊 检测信息</h3>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
          <tr><td><strong>检测时间</strong></td><td>${new Date().toLocaleString('zh-CN')}</td></tr>
          <tr><td><strong>检测 URL</strong></td><td>${CHECK_URL}</td></tr>
          <tr><td><strong>Cookie 文件</strong></td><td>${COOKIE_FILE}</td></tr>
        </table>
        
        <h3>❌ 错误详情</h3>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${errorDetails}</pre>
        
        <h3>🔧 解决方案</h3>
        <ol>
          <li>使用浏览器登录 CSDN 账号</li>
          <li>导出最新的 Cookie（JSON 格式）</li>
          <li>将内容保存到 <code>1.txt</code> 文件，替换旧文件</li>
          <li>重新运行监控脚本验证</li>
        </ol>
        
        <hr>
        <p><em>此邮件由 CSDN Cookie 监控脚本自动发送</em></p>
        <p><em>下次检测时间：24 小时后</em></p>
      `,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ 警报邮件发送成功:', info.messageId);
    return true;
    
  } catch (error) {
    console.error('❌ 发送警报邮件失败:', error.message);
    if (error.code === 'EAUTH') {
      console.error('   提示：请检查邮箱账号和授权码是否正确');
      console.error('   163 邮箱需要在设置中开启 SMTP 并获取授权码');
    }
    return false;
  }
}

/**
 * 加载 Cookie
 */
function loadCookies(cookieFilePath) {
  if (!fs.existsSync(cookieFilePath)) {
    throw new Error(`Cookie 文件不存在: ${cookieFilePath}`);
  }
  
  const raw = fs.readFileSync(cookieFilePath, 'utf8');
  const cookies = JSON.parse(raw);

  return cookies.map((cookie) => {
    const mapped = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
    };

    if (typeof cookie.expires === 'number') {
      mapped.expires = cookie.expires;
    } else if (typeof cookie.expirationDate === 'number') {
      mapped.expires = cookie.expirationDate;
    }

    if (typeof cookie.httpOnly === 'boolean') {
      mapped.httpOnly = cookie.httpOnly;
    }

    if (typeof cookie.secure === 'boolean') {
      mapped.secure = cookie.secure;
    }

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
 * 检查 Cookie 有效性
 */
async function checkCookie() {
  console.log('');
  console.log('========================================');
  console.log('CSDN Cookie 监控检查');
  console.log('========================================');
  console.log('检查时间:', new Date().toLocaleString('zh-CN'));
  console.log('Cookie 文件:', COOKIE_FILE);
  console.log('');

  let browser;
  let errorScreenshot = null;
  
  try {
    // 启动浏览器
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox']
    });
    
    const context = await browser.newContext({ locale: 'zh-CN' });
    const page = await context.newPage();

    // 加载并注入 Cookie
    const cookies = loadCookies(COOKIE_FILE);
    console.log(`✅ 加载了 ${cookies.length} 个 cookies`);
    
    await context.addCookies(cookies);
    console.log('✅ Cookie 注入完成');

    // 访问编辑器页面
    console.log('🌐 正在访问 CSDN 编辑器...');
    await page.goto(CHECK_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // 检查登录状态
    const titleVisible = await page.locator('#txtTitle').isVisible().catch(() => false);
    const editorReady = await page.evaluate(() => {
      return Boolean(window.CKEDITOR?.instances?.editor);
    }).catch(() => false);

    console.log(`🔍 检测结果：标题框=${titleVisible}, 编辑器=${editorReady}`);

    if (titleVisible || editorReady) {
      console.log('');
      console.log('========================================');
      console.log('✅ Cookie 有效 - 检查通过');
      console.log('========================================');
      return { success: true, message: 'Cookie 有效' };
    } else {
      throw new Error('页面已加载但未检测到登录元素（标题框/编辑器），Cookie 可能已失效');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Cookie 检查失败:', error.message);
    
    // 截图记录错误状态
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          errorScreenshot = `csdn_cookie_error_${Date.now()}.png`;
          await pages[0].screenshot({ path: errorScreenshot, fullPage: true });
          console.log('📸 错误截图已保存:', errorScreenshot);
        }
      } catch (e) {
        console.error('截图失败:', e.message);
      }
    }

    // 发送警报邮件
    await sendAlertEmail(error.message, errorScreenshot);
    
    return { success: false, message: error.message };
    
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// 执行检查
checkCookie().then(result => {
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
