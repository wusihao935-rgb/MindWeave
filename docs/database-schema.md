# 数据库结构

迁移文件：`supabase/migrations/202605210001_mindweave_cloud_schema.sql`

核心表：

- `documents`：资料元数据、原文文本、Storage path、摘要快照。
- `document_chunks`：资料切片与本地 embedding JSON。
- `summaries`：结构化摘要、知识卡片、复习卡。
- `graph_nodes`：图谱节点 JSON 和索引字段。
- `graph_edges`：图谱关系 JSON 和索引字段。
- `tags`：用户标签。
- `projects`：项目空间。
- `user_stopwords`：停用词与纠错记忆。
- `api_provider_settings`：模型 Provider 配置，加密 API Key。
- `sync_events`：同步与编辑事件日志。

所有表都有 `id`、`user_id`、`created_at`、`updated_at`。关键表都有 `deleted_at` 和 `version`，用于软删除、基础同步和 last-write-wins。

RLS 已开启，策略按 `auth.uid() = user_id` 隔离。后端使用 service role key 写入，但会先用 Supabase Auth 校验 Bearer token，再按用户 ID 过滤数据。

Storage bucket：`mindweave-documents`，对象路径为 `{user_id}/yyyy-mm-dd/timestamp-filename`。
