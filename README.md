# 琢璞英语讲评工作台

Zhuopu English Review Workspace

面向高中英语教师的试卷讲评工作台：上传试卷，自动切分原文与题目，逐题生成讲评（考点、解题思路、干扰项分析、重难点词汇、长难句翻译、选项词汇解析），左侧原文与右侧题目分栏对照。

- 开发单位：北域工作室 Northland Studio（https://northland.dpdns.org/）
- 线上地址：https://zhuopu.xuanjian.top
- 技术栈：React（Vite，SSG 产物由 Express 托管）+ Express + SQLite（WAL）

## 功能

- 邮箱验证码登录，可另设密码；忘记密码走邮件重置链接
- 四种题型：完形填空、阅读理解、七选五、语法填空
- 输入格式：md / txt / docx / 图片 / PDF（图片与文档经七牛云对象存储，docx 与 PDF 由 MinerU 转为 Markdown）
- AI 讲评：DeepSeek 与 GLM 双适配层，后台可切换模型与 API Key
- 讲评模式（可含多篇原文）与单题临时讲评分开存放
- 讲评可重命名、导出 JSON、从 JSON 导入、生成分享链接给其他老师导入
- 讲评页：原文高亮定位当前题出处、重难点词汇虚线下划线点击查看词性/义项/用法、底部按篇汇总长难句
- 管理后台：token 吞吐统计（按日/模型/用途/用户）、模型与 Key 设置、激活码预留

## 目录结构

```
server/        Express 服务：认证、讲评、上传、AI、后台
  src/db/      SQLite 连接与迁移脚本（WAL）
  src/services 邮件、七牛、MinerU、LLM、解析、讲评
web/           React 前端（Vite），构建产物由 server 托管
  src/pages    首页、登录、我的讲评、讲评页、个人主页、管理后台
  public/      校徽与字体（随桌面端一起打包）
scripts/       安装辅助脚本（原生模块兜底等）
```

## 本地开发

```bash
pnpm install                 # 安装依赖（postinstall 会兜底下载 better-sqlite3 预编译包）
cp .env.example .env         # 填写 JWT_SECRET、SMTP 密码、七牛与 MinerU、模型 Key
pnpm --filter zhuopu-server migrate   # 初始化数据库
pnpm dev:server              # http://127.0.0.1:3901
pnpm dev:web                 # http://127.0.0.1:5173（代理 /api 到 3901）
```

生产构建：

```bash
pnpm build                   # 构建 server 与 web
pnpm --filter zhuopu-server start
```

## 环境变量

见 `.env.example`。关键项：`JWT_SECRET`、`SMTP_USER`/`SMTP_PASS`、`QINIU_*`、`MINERU_TOKEN`、`DEEPSEEK_API_KEY`、`GLM_API_KEY`、`DB_FILE`、`SITE_URL`。

## 部署

- 服务：pm2 托管 `node dist/index.js`，监听 127.0.0.1:3901
- 反向代理：nginx，域名 `zhuopu.xuanjian.top`，证书由 certbot（Cloudflare DNS 验证）签发
- 数据库：SQLite 文件（默认 `server/data/zhuopu.db`，WAL 模式）

## 约定

- 前端不使用 emoji；主题色 `#980B0E`
- 英文正文使用随包的 Crimson Text（`web/public/fonts`）
- 提交信息使用中文 Conventional Commits，例如 `feat:加入讲评导出 JSON`
- 变更记录见 [CHANGELOG.md](./CHANGELOG.md)

## 许可

未授权，版权归北域工作室所有。
