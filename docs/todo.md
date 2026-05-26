# TODO 与限制

- 同步冲突当前是 last-write-wins，尚未做字段级冲突合并。
- 摘要、实体抽取、关系抽取已预留统一 AI Provider，但默认仍走本地规则 fallback。
- Gemini embeddings、Claude 原生 Messages API、多模态图片二进制上传仍需完善。
- API Key 当前为应用级 AES-GCM 加密；生产建议接入 KMS/Vault。
- PWA 只做基础静态资源离线缓存，离线时上传、同步和 AI 功能不可用。
- 还没有批量迁移本地 JSON 历史数据的 CLI。
- 还没有自动化端到端测试；当前 smoke test 为构建和 `/api/health`。
- 大型知识库需要分页、增量同步和更细粒度 upsert。
