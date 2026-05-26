# AI Provider

## 配置入口

登录后进入 `设置 / 模型设置`，可配置：

- `provider_name`
- `API Base URL`
- `API Key`
- `Chat 模型名称`
- `Embedding 模型名称`
- `Vision 模型名称`
- `ASR 模型名称`
- 是否启用

支持 Provider：OpenAI-compatible API、DeepSeek、Qwen/通义千问、Moonshot/Kimi、Gemini、Claude-compatible API、自定义 Endpoint。

## 安全

前端只提交 API Key，不读取已保存明文。后端用 `APP_ENCRYPTION_KEY` 派生 AES-256-GCM 密钥后加密保存到 `api_provider_settings.encrypted_api_key`。

TODO：生产环境建议把密钥迁移到 KMS/Vault，并支持密钥轮换。

## 抽象层

后端统一接口在 `backend/src/ai/provider.ts`：

- `chat()`
- `summarize()`
- `extractEntities()`
- `extractRelations()`
- `generateEmbeddings()`
- `transcribeAudio()`
- `analyzeImage()`

当前资料库问答已优先调用启用的用户 Provider；未配置或调用失败时回退本地规则。摘要、实体抽取、关系抽取仍保留本地规则主路径，后续可逐步切到 Provider。
