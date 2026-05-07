/**
 * 配置文件示例
 * 复制此文件为 config.js 并填入你的真实信息
 */

module.exports = {
  // Cookie 文件路径
  cookieFile: './1.txt',
  
  // 邮件配置（用于 Cookie 失效提醒）
  email: {
    host: 'smtp.163.com',
    port: 25,
    secure: false,
    auth: {
      user: 'your-email@163.com',    // 发件人邮箱
      pass: 'your-auth-code'          // 邮箱授权码
    }
  },
  
  // 收件人（接收 Cookie 失效提醒）
  alertEmail: 'your-qq@qq.com'
};
