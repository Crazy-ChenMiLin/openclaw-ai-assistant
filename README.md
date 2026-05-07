# OpenClaw AI 助教

OpenClaw AI 助教 - 自动化脚本和内容管理仓库

## 📁 目录结构

```
.
├── README.md                          # 项目介绍
├── csdn-auto-publish/                 # CSDN 自动化发布 Skill
│   ├── SKILL.md                       # 完整使用文档
│   └── scripts/
│       ├── csdn-publish-template.js   # 发布模板（开箱即用）
│       ├── csdn-cookie-monitor.js     # Cookie 监控脚本
│       └── config.example.js          # 配置示例
└── .gitignore                         # 忽略敏感文件
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install playwright nodemailer
```

### 2. 配置 Cookie

从浏览器导出 CSDN Cookie，保存为 `1.txt`。

### 3. 运行发布脚本

```bash
node csdn-auto-publish/scripts/csdn-publish-template.js
```

## ✨ 功能特性

| 功能 | 状态 | 说明 |
|------|------|------|
| CSDN 自动发布 | ✅ | 支持草稿保存 |
| Cookie 自动监控 | ✅ | 24小时检测一次 |
| 邮件失效提醒 | ✅ | Cookie失效时邮件通知 |
| 批量发布 | 🔄 | 支持多文章批量处理 |

## 📖 详细文档

详见 [csdn-auto-publish/SKILL.md](csdn-auto-publish/SKILL.md)

## 🔒 安全提示

- Cookie 文件包含敏感信息，已添加到 `.gitignore`
- 不要手动修改 `config.js`，使用 `config.example.js` 作为模板
- 定期更换 GitHub Token 和 Cookie

---

*由 OpenClaw AI 助手自动创建和管理*  
*创建时间：2026-05-07*
