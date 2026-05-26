# 知织 MindWeave Cloud

MindWeave 已从本地 localhost Demo 改造成可云端同步的个人知识管理 App：React/Vite 前端、Express 后端、Supabase Auth/Postgres/Storage、PWA 安装，并保留原有资料上传、摘要、图谱、节点/关系编辑和本地规则 fallback。

## 本地运行

```bash
npm install
cp .env.example .env
npm run build
npm start
```

开发模式可用：

```bash
npm run dev
```

开发模式下前端需要 `VITE_API_BASE_URL` 指向后端 API；生产和手机端必须使用公网云端 API，不要使用电脑 localhost 或局域网 IP。

## Supabase

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/migrations/202605210001_mindweave_cloud_schema.sql`。
3. Auth 开启 Email/Password，并配置站点 URL 与回调域名。
4. 确认 Storage bucket `mindweave-documents` 已创建。
5. 后端配置 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_STORAGE_BUCKET`。
6. 前端只配置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。

## 部署

- 最终公网部署与手机/电脑验收步骤见 `docs/final-deployment-checklist.md`。
- 前端：部署 `dist/frontend` 到 Vercel/Netlify/静态托管，设置 `VITE_API_BASE_URL` 为云端后端域名。
- 后端：部署 Node 服务，设置 `.env.example` 中 Backend 变量。
- 手机和电脑访问同一个前端域名，登录同一账号后读取同一份云端数据。

## 功能

- Supabase Auth 登录、注册、登出。
- 用户级 documents、chunks、summaries、graph_nodes、graph_edges、tags、projects、stopwords 隔离。
- 文件上传到 Supabase Storage，资料元数据写入 Supabase Postgres。
- 图谱节点/关系新增、修改、删除、合并会写入云端；删除使用 `deleted_at` 软删除。
- 启动和手动同步会拉取云端最新数据；当前冲突策略为 last-write-wins。
- 设置 / 模型设置支持 OpenAI-compatible、DeepSeek、Qwen、Moonshot、Gemini、Claude-compatible、自定义 Endpoint。
- API Key 后端加密保存，前端不读取已保存明文。
- 未配置模型时继续使用本地规则摘要、实体/关系与问答 fallback。
- PWA 支持基础离线缓存，可添加到手机主屏幕或桌面安装。

更多细节见 `docs/`。
