# 部署说明

完整逐步验收清单见 `docs/final-deployment-checklist.md`。推荐最终组合：

- 前端：Vercel
- 后端：Render Web Service
- 数据库 / Auth / Storage：Supabase

## Supabase 项目

1. 新建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/migrations/202605210001_mindweave_cloud_schema.sql`。
3. Auth -> Providers 开启 Email。
4. Auth -> URL Configuration 添加前端生产域名。
5. Storage 中确认 `mindweave-documents` bucket 存在且为 private。

## 后端

推荐部署到 Render Web Service。Root Directory 使用仓库根目录。

必填环境变量：

```bash
PORT=10000
CORS_ORIGIN=https://your-web.example.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=mindweave-documents
APP_ENCRYPTION_KEY=...
ALLOW_LOCAL_FALLBACK=false
```

`SUPABASE_SERVICE_ROLE_KEY` 只能配置在后端平台，不能放到前端平台。

构建与启动：

```bash
npm ci && npm run build
npm start
```

部署后访问：

```text
https://your-api.example.com/api/health
```

确认返回 `cloud=true`。

## 前端

推荐部署到 Vercel。Root Directory 使用仓库根目录，Output Directory 使用 `dist/frontend`。

```bash
npm ci
npm run build
```

前端环境变量：

```bash
VITE_API_BASE_URL=https://your-api.example.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

`VITE_API_BASE_URL` 必须是公网后端根地址，不要带 `/api`。前端不能配置 `SUPABASE_SERVICE_ROLE_KEY`。

手机端和电脑端都访问前端生产域名；不要配置为电脑 localhost 或局域网 IP。前端域名确定后，回到后端把 `CORS_ORIGIN` 改成正式前端域名并重新部署。
