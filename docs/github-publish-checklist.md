# MindWeave 上传 GitHub 清单

这份清单用于把 MindWeave 整理成 Render / Vercel 可以直接连接的 GitHub 仓库。

## 一、应该上传到 GitHub 的内容

如果用 `git add .`，在当前 `.gitignore` 生效后，应该上传这些核心内容：

```text
.env.example
.gitignore
package.json
package-lock.json
README.md
tsconfig.base.json
backend/
frontend/
supabase/
docs/
```

重点说明：

- `backend/src/`：后端源码，Render 需要它来构建 API。
- `frontend/src/`：前端源码，Vercel 需要它来构建网页。
- `frontend/public/`：PWA manifest、图标等静态资源。
- `supabase/migrations/`：Supabase 数据库建表脚本。
- `docs/final-deployment-checklist.md`：最终公网部署和手机/电脑验收步骤。
- `.env.example`：只放变量名和示例值，不放真实密钥。
- `package-lock.json`：应该上传，Render/Vercel 用它稳定安装依赖。

## 二、不要上传到 GitHub 的内容

这些文件不应该进 GitHub：

```text
.env
.env.*
node_modules/
dist/
backend/dist/
backend/database/*.json
*.log
.vercel/
.netlify/
MindWeave_AI_personal_knowledge_graph_product_brief.docx
mindweave_concept.png
```

原因：

- `.env` / `.env.*` 可能包含 Supabase service role key、API Key、加密密钥。
- `node_modules/` 可以由 `npm ci` 自动安装。
- `dist/`、`backend/dist/` 是构建产物，Render/Vercel 会重新生成。
- `backend/database/*.json` 是本地数据文件，不是云端正式数据。
- `*.log` 是本地运行日志。
- 根目录的 `.docx` 和概念图不是部署必需文件，如要公开仓库，建议不要上传。

## 三、本地初始化 Git 仓库

在项目根目录运行：

```bash
git init
git status
```

确认没有 `.env`、`node_modules/`、`dist/`、本地数据库 JSON、日志文件出现在待提交列表里。

## 四、第一次提交

```bash
git add .
git status
git commit -m "Prepare MindWeave for cloud deployment"
```

提交前再次看 `git status`，应该只包含源码、配置示例、文档、Supabase migration。

## 五、创建 GitHub 仓库并推送

在 GitHub 新建一个空仓库，例如：

```text
mindweave
```

不要在 GitHub 页面勾选自动生成 README、`.gitignore` 或 license，避免和本地文件冲突。

然后在本地运行：

```bash
git branch -M main
git remote add origin https://github.com/你的用户名/mindweave.git
git push -u origin main
```

如果你使用 SSH：

```bash
git remote add origin git@github.com:你的用户名/mindweave.git
git push -u origin main
```

## 六、推送后连接 Render / Vercel

### Render 后端

- 连接同一个 GitHub 仓库。
- Root Directory：仓库根目录，保持空白即可。
- Build Command：

```bash
npm ci && npm run build
```

- Start Command：

```bash
npm start
```

后端环境变量配置在 Render，不要提交到 GitHub。

### Vercel 前端

- 连接同一个 GitHub 仓库。
- Framework Preset：Vite。
- Root Directory：仓库根目录。
- Build Command：

```bash
npm run build
```

- Output Directory：

```text
dist/frontend
```

前端只配置 `VITE_` 开头的公开变量，不要配置 `SUPABASE_SERVICE_ROLE_KEY`。

## 七、提交前最后检查

运行：

```bash
npm run build
git status --short
```

然后确认：

- 构建通过。
- 没有真实密钥进入 Git。
- 没有 `node_modules/`。
- 没有 `dist/`。
- 没有 `.env`。
- 没有本地数据库 JSON。
- 有 `backend/`、`frontend/`、`supabase/`、`docs/`。
