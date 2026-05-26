import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { MindWeaveStore } from "./database/store.js";
import { parseSourceInput } from "./ingestion/parser.js";
import { answerQuestion, searchChunks } from "./retrieval/vectorStore.js";
import { requireUser, type AuthenticatedRequest } from "./auth.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin.js";
import { CloudRepository } from "./supabase/cloudRepository.js";
import { createAIProvider, LocalRuleProvider } from "./ai/provider.js";
import { truncate } from "./utils/text.js";
import { encryptSecret } from "./security/crypto.js";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});
const runtimeBuild = "qa-timeout-20260526-2";
const localStore = new MindWeaveStore();
const cloud = isSupabaseConfigured() ? new CloudRepository(getSupabaseAdmin()) : null;
const port = Number(process.env.PORT ?? 4141);
const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);
const retrievalStateTimeoutMs = numberFromEnv("RETRIEVAL_STATE_TIMEOUT_MS", 12_000);
const providerSettingTimeoutMs = numberFromEnv("PROVIDER_SETTING_TIMEOUT_MS", 8_000);
const askProviderTimeoutMs = numberFromEnv("ASK_PROVIDER_TIMEOUT_MS", 6_000);
const askResponseDeadlineMs = numberFromEnv("ASK_RESPONSE_DEADLINE_MS", 110_000);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "5mb" }));

app.use((_req, res, next) => {
  res.setHeader("X-MindWeave-Build", runtimeBuild);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "MindWeave API",
    cloud: Boolean(cloud),
    build: runtimeBuild,
    timeouts: {
      retrievalStateTimeoutMs,
      providerSettingTimeoutMs,
      askProviderTimeoutMs,
      askResponseDeadlineMs
    }
  });
});

app.use("/api", requireUser);

app.get("/api/state", async (req, res) => {
  try {
    const { db } = await getRequestState(req as unknown as AuthenticatedRequest);
    res.json(toDashboardState(db));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "加载知识库失败。") });
  }
});

app.post("/api/sync", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { store } = await getRequestState(authReq);
    await persistRequestState(authReq, store, {
      eventAction: "sync_state",
      eventTargetId: "workspace",
      eventDetail: "手动同步并修复云端图谱覆盖。"
    });
    res.json({ ...toDashboardState(store.getState()), sync: { status: "synced", strategy: "last-write-wins" } });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "同步失败。") });
  }
});

app.get("/api/sources/:id", async (req, res) => {
  try {
    const { db } = await getRequestState(req as unknown as AuthenticatedRequest);
    const source = db.sources.find((item) => item.id === req.params.id);
    if (!source) return res.status(404).json({ error: "没有找到该资料。" });
    res.json({
      source,
      chunks: db.chunks.filter((chunk) => chunk.sourceId === source.id),
      knowledgeCards: db.knowledgeCards.filter((card) => card.sourceIds.includes(source.id)),
      reviewCards: db.reviewCards.filter((card) => card.sourceId === source.id)
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "加载资料失败。") });
  }
});

app.post("/api/sources", upload.single("file"), async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { store, db } = await getRequestState(authReq);
    const parsed = await parseSourceInput({
      file: req.file,
      url: req.body.url,
      rawText: req.body.rawText,
      title: req.body.title
    });
    if (cloud && req.file) {
      parsed.storagePath = await cloud.uploadSourceFile(authReq.auth.userId, req.file);
    }
    const projectId = req.body.projectId || db.projects[0]?.id || "project_ai_research";
    const source = store.addParsedSource(parsed, projectId);
    await persistRequestState(authReq, store, {
      eventAction: "upload_source",
      eventTargetId: source.id,
      eventDetail: `上传资料：${source.title}`
    });
    res.status(201).json({ source });
  } catch (error) {
    console.error("Source import failed:", errorMessage(error, "导入失败。"));
    res.status(400).json({ error: errorMessage(error, "导入失败。") });
  }
});

app.patch("/api/sources/:id", (req, res) =>
  mutate(req, res, (store) => ({ source: store.updateSource(req.params.id, req.body) }), {
    eventAction: "update_source",
    eventTargetId: req.params.id,
    eventDetail: "更新资料信息"
  })
);

app.delete("/api/sources/:id", (req, res) =>
  mutate(req, res, (store) => {
    store.deleteSource(req.params.id);
    return { ok: true };
  }, {
    eventAction: "delete_source",
    eventTargetId: req.params.id,
    eventDetail: "软删除资料并重建图谱"
  })
);

app.post("/api/graph/nodes", (req, res) =>
  mutate(req, res, (store) => ({ node: store.addNode(req.body) }), {
    eventAction: "add_node",
    eventTargetId: "graph",
    eventDetail: "新增节点"
  }, 201)
);

app.patch("/api/graph/nodes/:id", (req, res) =>
  mutate(req, res, (store) => ({ node: store.updateNode(req.params.id, req.body) }), {
    eventAction: "update_node",
    eventTargetId: req.params.id,
    eventDetail: "更新节点"
  })
);

app.post("/api/graph/nodes/:id/confirm", (req, res) =>
  mutate(req, res, (store) => ({ node: store.updateNode(req.params.id, { status: "confirmed" }) }), {
    eventAction: "confirm_node",
    eventTargetId: req.params.id,
    eventDetail: "确认节点"
  })
);

app.delete("/api/graph/nodes/:id", (req, res) =>
  mutate(req, res, (store) => {
    store.deleteNode(req.params.id, req.query.stopword !== "false");
    return { ok: true };
  }, {
    eventAction: "delete_node",
    eventTargetId: req.params.id,
    eventDetail: "软删除节点"
  })
);

app.post("/api/graph/nodes/merge", (req, res) =>
  mutate(req, res, (store) => ({ node: store.mergeNodes(req.body.sourceNodeId, req.body.targetNodeId, req.body.canonicalName) }), {
    eventAction: "merge_node",
    eventTargetId: req.body.targetNodeId,
    eventDetail: "合并节点"
  })
);

app.post("/api/graph/edges", (req, res) =>
  mutate(req, res, (store) => ({ edge: store.addEdge(req.body) }), {
    eventAction: "add_edge",
    eventTargetId: "graph",
    eventDetail: "新增关系"
  }, 201)
);

app.patch("/api/graph/edges/:id", (req, res) =>
  mutate(req, res, (store) => ({ edge: store.updateEdge(req.params.id, req.body) }), {
    eventAction: "update_edge",
    eventTargetId: req.params.id,
    eventDetail: "更新关系"
  })
);

app.delete("/api/graph/edges/:id", (req, res) =>
  mutate(req, res, (store) => {
    store.deleteEdge(req.params.id);
    return { ok: true };
  }, {
    eventAction: "delete_edge",
    eventTargetId: req.params.id,
    eventDetail: "软删除关系"
  })
);

app.post("/api/rules/stopwords", (req, res) =>
  mutate(req, res, (store) => {
    const word = String(req.body.word ?? "").trim();
    if (!word) throw new Error("请输入停用词。");
    return { userMemory: store.addStopword(word) };
  }, {
    eventAction: "add_stopword",
    eventTargetId: String(req.body.word ?? ""),
    eventDetail: "保存停用词"
  })
);

app.delete("/api/rules/stopwords/:word", (req, res) =>
  mutate(req, res, (store) => ({ userMemory: store.removeStopword(req.params.word) }), {
    eventAction: "remove_stopword",
    eventTargetId: req.params.word,
    eventDetail: "移除停用词"
  })
);

app.get("/api/search", async (req, res) => {
  const startedAt = Date.now();
  const retrievalSignal = createTimeoutSignal(retrievalStateTimeoutMs);
  try {
    const query = String(req.query.q ?? "").trim();
    if (!query) return res.json({ results: [] });
    const authReq = req as unknown as AuthenticatedRequest;
    const db = await withTimeout(
      getRetrievalState(authReq, query, retrievalSignal.signal),
      retrievalStateTimeoutMs,
      "资料库检索加载超时，请稍后重试。"
    );
    const results = searchChunks(db, query, 10);
    console.info("Knowledge search completed", {
      userId: logUserId(authReq.auth.userId),
      queryLength: query.length,
      chunks: db.chunks.length,
      results: results.length,
      durationMs: Date.now() - startedAt
    });
    res.json({ results });
  } catch (error) {
    console.error("Knowledge search failed:", errorMessage(error, "搜索失败。"));
    res.status(500).json({ error: errorMessage(error, "搜索失败。") });
  } finally {
    retrievalSignal.cancel();
  }
});

app.post("/api/ask", async (req, res) => {
  const startedAt = Date.now();
  const responseDeadline = createResponseDeadline(res, askResponseDeadlineMs);
  const retrievalSignal = createTimeoutSignal(retrievalStateTimeoutMs);
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const question = String(req.body.question ?? "").trim();
    if (!question) return res.status(400).json({ error: "请输入问题。" });
    const [db, activeSetting] = await Promise.all([
      withTimeout(getRetrievalState(authReq, question, retrievalSignal.signal), retrievalStateTimeoutMs, "资料库问答加载超时，请稍后重试。"),
      cloud
        ? withTimeout(cloud.getActiveProviderSetting(authReq.auth.userId), providerSettingTimeoutMs, "模型配置读取超时，已回退到本地规则。").catch(
            (error) => {
              console.warn("AI provider setting unavailable:", errorMessage(error, "模型配置读取失败。"));
              return null;
            }
          )
        : Promise.resolve(null)
    ]);
    const fallback = answerQuestion(db, question);
    if (!fallback.citations.length || !cloud) {
      console.info("Knowledge ask completed with local fallback", {
        userId: logUserId(authReq.auth.userId),
        questionLength: question.length,
        chunks: db.chunks.length,
        citations: fallback.citations.length,
        durationMs: Date.now() - startedAt
      });
      return sendJson(res, { ...fallback, provider: "local-rule-fallback", fallback: true, timings: askTimings(startedAt, db) });
    }

    let provider;
    try {
      provider = createAIProvider(activeSetting);
    } catch (error) {
      console.warn("AI provider configuration invalid, using fallback:", errorMessage(error, "模型配置不可用。"));
      return sendJson(res, {
        ...fallback,
        answer: `${fallback.answer}\n\n外部模型配置不可用，已回退到本地规则。错误：${truncate(errorMessage(error, "模型配置不可用。"), 120)}`,
        provider: "local-rule-fallback",
        fallback: true,
        timings: askTimings(startedAt, db)
      });
    }
    if (provider instanceof LocalRuleProvider) {
      console.info("Knowledge ask completed with configured local fallback", {
        userId: logUserId(authReq.auth.userId),
        questionLength: question.length,
        chunks: db.chunks.length,
        citations: fallback.citations.length,
        durationMs: Date.now() - startedAt
      });
      return sendJson(res, { ...fallback, provider: provider.name, fallback: true, timings: askTimings(startedAt, db) });
    }

    try {
      const context = fallback.citations.map((citation, index) => `${index + 1}.《${citation.sourceTitle}》${citation.snippet}`).join("\n");
      const answer = await withTimeout(
        provider.chat([
          { role: "system", content: "你是 MindWeave 的资料库问答引擎。只能基于给定引用回答，不要编造来源。" },
          { role: "user", content: `问题：${question}\n\n引用：\n${context}` }
        ]),
        askProviderTimeoutMs,
        `外部模型响应超过 ${Math.round(askProviderTimeoutMs / 1000)} 秒。`
      );
      console.info("Knowledge ask completed with remote provider", {
        userId: logUserId(authReq.auth.userId),
        questionLength: question.length,
        chunks: db.chunks.length,
        citations: fallback.citations.length,
        provider: provider.name,
        durationMs: Date.now() - startedAt
      });
      sendJson(res, { ...fallback, answer: answer || fallback.answer, provider: provider.name, fallback: false, timings: askTimings(startedAt, db) });
    } catch (error) {
      console.warn("Knowledge ask provider failed, using fallback:", errorMessage(error, "模型调用失败。"));
      sendJson(res, {
        ...fallback,
        answer: `${fallback.answer}\n\n外部模型暂时不可用，已回退到本地规则。错误：${truncate(errorMessage(error, "模型调用失败。"), 120)}`,
        provider: provider.name,
        fallback: true,
        timings: askTimings(startedAt, db)
      });
    }
  } catch (error) {
    console.error("Knowledge ask failed:", errorMessage(error, "问答失败。"));
    sendJson(res.status(500), {
      answer: errorMessage(error, "问答失败。"),
      citations: [],
      relatedConcepts: [],
      provider: "error",
      fallback: true,
      error: errorMessage(error, "问答失败。"),
      timings: { durationMs: Date.now() - startedAt, build: runtimeBuild }
    });
  } finally {
    retrievalSignal.cancel();
    responseDeadline.cancel();
  }
});

app.post("/api/projects", (req, res) =>
  mutate(req, res, (store) => {
    const name = String(req.body.name ?? "").trim();
    if (!name) throw new Error("请输入项目名称。");
    return { project: store.addProject(name, req.body.description ?? "") };
  }, {
    eventAction: "create_project",
    eventTargetId: "project",
    eventDetail: "创建项目"
  }, 201)
);

app.get("/api/settings/ai-providers", async (req, res) => {
  try {
    if (!cloud) return res.json({ providers: [] });
    const providers = await cloud.listProviderSettings((req as unknown as AuthenticatedRequest).auth.userId);
    res.json({ providers });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "加载模型设置失败。") });
  }
});

app.post("/api/settings/ai-providers", async (req, res) => {
  try {
    if (!cloud) return res.status(503).json({ error: "请先配置 Supabase，模型设置需要云端账号数据。" });
    const payload = sanitizeProviderPayload(req.body);
    const provider = await cloud.upsertProviderSetting((req as unknown as AuthenticatedRequest).auth.userId, payload);
    res.status(201).json({ provider });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error, "保存模型设置失败。") });
  }
});

app.post("/api/settings/ai-providers/test", async (req, res) => {
  try {
    if (!cloud) return res.status(503).json({ error: "请先配置 Supabase。" });
    const payload = sanitizeProviderPayload(req.body);
    const setting = {
      id: payload.id || "test",
      userId: (req as unknown as AuthenticatedRequest).auth.userId,
      providerName: payload.providerName,
      baseUrl: payload.baseUrl,
      apiKeyEncrypted: payload.apiKey
        ? encryptSecret(payload.apiKey)
        : (await cloud.getProviderSetting((req as unknown as AuthenticatedRequest).auth.userId, payload.id || ""))?.apiKeyEncrypted,
      chatModel: payload.chatModel,
      embeddingModel: payload.embeddingModel,
      visionModel: payload.visionModel,
      asrModel: payload.asrModel,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: Date.now()
    };
    const provider = createAIProvider(setting);
    const message = await provider.chat([{ role: "user", content: "请用一句话回复 MindWeave connection ok。" }]);
    res.json({ ok: true, message: truncate(message, 180) });
  } catch (error) {
    res.status(400).json({ ok: false, error: errorMessage(error, "测试连接失败。") });
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "文件过大，单个文件请控制在 25MB 以内。" : `文件上传失败：${error.message}`;
    console.error("Upload middleware failed:", message);
    res.status(413).json({ error: message });
    return;
  }
  next(error);
});

const frontendDist = path.join(process.cwd(), "dist", "frontend");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`MindWeave API running on port ${port}`);
});

async function getRequestState(req: AuthenticatedRequest) {
  if (!cloud || req.auth.mode === "local") {
    const db = localStore.getState();
    return { store: localStore, db };
  }
  const db = await cloud.loadState(req.auth.userId);
  const store = new MindWeaveStore(db);
  return { store, db: store.getState() };
}

async function getRetrievalState(req: AuthenticatedRequest, query?: string, signal?: AbortSignal) {
  if (!cloud || req.auth.mode === "local") return localStore.getState();
  return cloud.loadRetrievalState(req.auth.userId, query, signal);
}

async function persistRequestState(req: AuthenticatedRequest, store: MindWeaveStore, options?: Parameters<CloudRepository["persistState"]>[2]) {
  if (!cloud || req.auth.mode === "local") return;
  // TODO: 冲突策略当前为 last-write-wins，后续引入字段级合并与冲突提示。
  await cloud.persistState(req.auth.userId, store.exportState(), options);
}

async function mutate(
  req: express.Request,
  res: express.Response,
  action: (store: MindWeaveStore) => Record<string, unknown>,
  event: { eventAction: string; eventTargetId: string; eventDetail: string },
  status = 200
) {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { store } = await getRequestState(authReq);
    const payload = action(store);
    await persistRequestState(authReq, store, event);
    res.status(status).json(payload);
  } catch (error) {
    res.status(status === 201 ? 400 : 404).json({ error: errorMessage(error, "操作失败。") });
  }
}

function toDashboardState(db) {
  return {
    ...db,
    stats: {
      sourceCount: db.sources.length,
      nodeCount: db.nodes.length,
      edgeCount: db.edges.length,
      cardCount: db.knowledgeCards.length,
      pendingNodeCount: db.nodes.filter((node) => node.status === "pending").length,
      confirmedNodeCount: db.nodes.filter((node) => node.status === "confirmed").length
    }
  };
}

function sanitizeProviderPayload(body: any) {
  const providerName = String(body.providerName || body.provider_name || "openai-compatible");
  const baseUrl = String(body.baseUrl || body.base_url || defaultBaseUrl(providerName)).trim();
  const chatModel = String(body.chatModel || body.chat_model || "").trim();
  const embeddingModel = String(body.embeddingModel || body.embedding_model || "").trim();
  if (!baseUrl) throw new Error("请输入 API Base URL。");
  if (!chatModel) throw new Error("请输入 Chat 模型名称。");
  if (!embeddingModel) throw new Error("请输入 Embedding 模型名称。");
  return {
    id: body.id ? String(body.id) : undefined,
    providerName: providerName as any,
    baseUrl,
    apiKey: body.apiKey ? String(body.apiKey) : undefined,
    chatModel,
    embeddingModel,
    visionModel: body.visionModel ? String(body.visionModel) : undefined,
    asrModel: body.asrModel ? String(body.asrModel) : undefined,
    enabled: Boolean(body.enabled)
  };
}

function defaultBaseUrl(providerName: string) {
  if (providerName === "deepseek") return "https://api.deepseek.com/v1";
  if (providerName === "qwen") return "https://dashscope.aliyuncs.com/compatible-mode/v1";
  if (providerName === "moonshot") return "https://api.moonshot.cn/v1";
  if (providerName === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  return "https://api.openai.com/v1";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer)
  };
}

function createResponseDeadline(res: express.Response, timeoutMs: number) {
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    res.status(504).json({
      answer: "资料库问答超过两分钟仍未完成，已中止本次请求。请稍后重试，或先用更短的问题搜索相关资料。",
      citations: [],
      relatedConcepts: [],
      provider: "deadline",
      fallback: true,
      error: "资料库问答响应超时。",
      timings: { durationMs: timeoutMs, build: runtimeBuild }
    });
  }, timeoutMs);
  return {
    cancel: () => clearTimeout(timer)
  };
}

function sendJson(res: express.Response, payload: unknown) {
  if (res.headersSent) return;
  res.json(payload);
}

function askTimings(startedAt: number, db: { chunks?: unknown[]; sources?: unknown[] }) {
  return {
    durationMs: Date.now() - startedAt,
    retrievedChunks: db.chunks?.length ?? 0,
    retrievedSources: db.sources?.length ?? 0,
    build: runtimeBuild
  };
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function logUserId(userId: string) {
  return userId.length > 8 ? `${userId.slice(0, 8)}...` : userId;
}

function parseCorsOrigin(value?: string) {
  const origins = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (!origins.length || origins.includes("*")) return true;
  return origins;
}
