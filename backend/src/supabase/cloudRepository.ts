import type { SupabaseClient } from "@supabase/supabase-js";
import { rebuildGraph } from "../graph/knowledgeGraph.js";
import type {
  ApiProviderName,
  ApiProviderSetting,
  Chunk,
  EntityNode,
  GraphEditLog,
  KnowledgeCard,
  MindWeaveDB,
  Project,
  PublicApiProviderSetting,
  RelationEdge,
  ReviewCard,
  Source,
  UserMemory
} from "../types.js";
import { createEmptyDatabase } from "../database/seed.js";
import { createId, slugify } from "../utils/text.js";
import { decryptSecret, encryptSecret } from "../security/crypto.js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "mindweave-documents";

interface PersistOptions {
  eventAction?: string;
  eventTargetId?: string;
  eventDetail?: string;
}

export class CloudRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async loadState(userId: string): Promise<MindWeaveDB> {
    const [documents, chunks, summaries, nodes, edges, projects, tags, stopwords, events] = await Promise.all([
      this.selectActive("documents", userId),
      this.selectActive("document_chunks", userId),
      this.selectActive("summaries", userId),
      this.selectActive("graph_nodes", userId),
      this.selectActive("graph_edges", userId),
      this.selectActive("projects", userId),
      this.selectActive("tags", userId),
      this.selectActive("user_stopwords", userId),
      this.selectEvents(userId)
    ]);

    if (!documents.length && !projects.length && !nodes.length) {
      return createEmptyDatabase();
    }

    const summaryByDocument = new Map(summaries.map((row) => [row.document_id, row]));
    const sources = documents.map((row) => toSource(row, summaryByDocument.get(row.id)));
    const knowledgeCards = summaries.flatMap((row) => ((row.knowledge_cards as KnowledgeCard[] | null) ?? []));
    const reviewCards = summaries.flatMap((row) => ((row.review_cards as ReviewCard[] | null) ?? []));
    const userMemory = toUserMemory(stopwords);

    const db = {
      sources,
      chunks: chunks.map(toChunk),
      knowledgeCards,
      reviewCards,
      nodes: nodes.map((row) => (row.node_data ?? row.data) as EntityNode),
      edges: edges.map((row) => (row.edge_data ?? row.data) as RelationEdge),
      projects: projects.length ? projects.map(toProject) : createEmptyDatabase().projects,
      tags: tags.map((row) => row.name).filter(Boolean).sort(),
      userMemory,
      editLog: events.map(toEditLog),
      updatedAt: latestUpdatedAt([documents, chunks, summaries, nodes, edges, projects, tags, stopwords])
    };

    return repairMissingGraphCoverage(db);
  }

  async persistState(userId: string, db: MindWeaveDB, options: PersistOptions = {}) {
    const version = Date.now();
    const updatedAt = new Date().toISOString();

    await Promise.all([
      this.replaceRows(
        "documents",
        userId,
        db.sources.map((source) => source.id),
        db.sources.map((source) => sourceToRow(userId, source, version, updatedAt))
      ),
      this.replaceRows(
        "document_chunks",
        userId,
        db.chunks.map((chunk) => chunk.id),
        db.chunks.map((chunk) => chunkToRow(userId, chunk, version, updatedAt))
      ),
      this.replaceRows(
        "summaries",
        userId,
        db.sources.map((source) => `summary:${source.id}`),
        db.sources.map((source) => summaryToRow(userId, source, db.knowledgeCards, db.reviewCards, version, updatedAt))
      ),
      this.replaceRows(
        "graph_nodes",
        userId,
        db.nodes.map((node) => node.id),
        db.nodes.map((node) => nodeToRow(userId, node, version, updatedAt))
      ),
      this.replaceRows(
        "graph_edges",
        userId,
        db.edges.map((edge) => edge.id),
        db.edges.map((edge) => edgeToRow(userId, edge, version, updatedAt))
      ),
      this.replaceRows(
        "projects",
        userId,
        db.projects.map((project) => project.id),
        db.projects.map((project) => projectToRow(userId, project, version, updatedAt))
      ),
      this.replaceRows(
        "tags",
        userId,
        db.tags.map((tag) => tagId(tag)),
        db.tags.map((tag) => tagToRow(userId, tag, version, updatedAt))
      ),
      this.replaceRows(
        "user_stopwords",
        userId,
        ["memory", ...db.userMemory.customStopwords.map((word) => stopwordId(word))],
        [
          memoryToRow(userId, db.userMemory, version, updatedAt),
          ...db.userMemory.customStopwords.map((word) => stopwordToRow(userId, word, version, updatedAt))
        ]
      )
    ]);

    await this.insertSyncEvent(userId, {
      action: options.eventAction ?? db.editLog[0]?.action ?? "sync_state",
      targetId: options.eventTargetId ?? db.editLog[0]?.targetId ?? "workspace",
      detail: options.eventDetail ?? db.editLog[0]?.detail ?? "同步云端知识库。",
      createdAt: updatedAt
    });
  }

  async uploadSourceFile(userId: string, file: Express.Multer.File) {
    const safeName = file.originalname.replace(/[^\w.\-\u3400-\u9fff]+/g, "_").slice(0, 120);
    const objectPath = `${userId}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeName}`;
    const { error } = await this.supabase.storage.from(BUCKET).upload(objectPath, file.buffer, {
      contentType: file.mimetype || "application/octet-stream",
      upsert: false
    });
    if (error) throw new Error(`文件上传到 Supabase Storage 失败：${error.message}`);
    return objectPath;
  }

  async listProviderSettings(userId: string): Promise<PublicApiProviderSetting[]> {
    const rows = await this.selectActive("api_provider_settings", userId);
    return rows.map((row) => ({
      id: row.id,
      providerName: row.provider_name,
      baseUrl: row.base_url,
      chatModel: row.chat_model,
      embeddingModel: row.embedding_model,
      visionModel: row.vision_model ?? undefined,
      asrModel: row.asr_model ?? undefined,
      enabled: Boolean(row.enabled),
      hasApiKey: Boolean(row.encrypted_api_key),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async getActiveProviderSetting(userId: string): Promise<ApiProviderSetting | null> {
    const { data, error } = await this.supabase
      .from("api_provider_settings")
      .select("*")
      .eq("user_id", userId)
      .eq("enabled", true)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = data?.[0];
    return row ? rowToProviderSetting(row) : null;
  }

  async upsertProviderSetting(
    userId: string,
    input: {
      id?: string;
      providerName: ApiProviderName;
      baseUrl: string;
      apiKey?: string;
      chatModel: string;
      embeddingModel: string;
      visionModel?: string;
      asrModel?: string;
      enabled: boolean;
    }
  ): Promise<PublicApiProviderSetting> {
    const now = new Date().toISOString();
    const id = input.id || createId("provider");
    let encryptedApiKey: string | undefined;
    if (input.apiKey?.trim()) {
      encryptedApiKey = encryptSecret(input.apiKey.trim());
    } else if (input.id) {
      const existing = await this.getProviderSetting(userId, input.id);
      encryptedApiKey = existing?.apiKeyEncrypted;
    }

    const row = {
      id,
      user_id: userId,
      provider_name: input.providerName,
      base_url: input.baseUrl,
      encrypted_api_key: encryptedApiKey,
      chat_model: input.chatModel,
      embedding_model: input.embeddingModel,
      vision_model: input.visionModel || null,
      asr_model: input.asrModel || null,
      enabled: input.enabled,
      updated_at: now,
      version: Date.now()
    };

    const { error } = await this.supabase.from("api_provider_settings").upsert(row, { onConflict: "user_id,id" });
    if (error) throw new Error(error.message);
    await this.insertSyncEvent(userId, {
      action: "upsert_ai_provider",
      targetId: id,
      detail: `更新模型设置：${input.providerName}`,
      createdAt: now
    });
    return (await this.listProviderSettings(userId)).find((item) => item.id === id)!;
  }

  async getProviderSetting(userId: string, id: string): Promise<ApiProviderSetting | null> {
    const { data, error } = await this.supabase
      .from("api_provider_settings")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToProviderSetting(data) : null;
  }

  private async replaceRows(table: string, userId: string, activeIds: string[], rows: Array<Record<string, unknown>>) {
    const uniqueRows = uniqueRowsById(rows).map((row) => sanitizeForPostgres(row) as Record<string, unknown>);
    if (uniqueRows.length) {
      const { error } = await this.supabase.from(table).upsert(uniqueRows, { onConflict: "user_id,id" });
      if (error) throw new Error(`${table} 写入失败：${error.message}`);
    }

    const { data, error } = await this.supabase.from(table).select("id").eq("user_id", userId).is("deleted_at", null);
    if (error) throw new Error(`${table} 查询失败：${error.message}`);

    const active = new Set(activeIds);
    const missing = (data ?? []).map((row) => row.id as string).filter((id) => !active.has(id));
    if (missing.length) {
      const { error: updateError } = await this.supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: Date.now() })
        .eq("user_id", userId)
        .in("id", missing);
      if (updateError) throw new Error(`${table} 软删除失败：${updateError.message}`);
    }
  }

  private async selectActive(table: string, userId: string) {
    const { data, error } = await this.supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private async selectEvents(userId: string) {
    const { data, error } = await this.supabase
      .from("sync_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private async insertSyncEvent(userId: string, event: Omit<GraphEditLog, "id">) {
    const { error } = await this.supabase.from("sync_events").insert({
      id: createId("sync"),
      user_id: userId,
      action: event.action,
      target_id: event.targetId,
      detail: event.detail,
      created_at: event.createdAt,
      updated_at: event.createdAt,
      version: Date.now()
    });
    if (error) throw new Error(error.message);
  }
}

function uniqueRowsById(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
    if (!id) continue;
    map.set(id, row);
  }
  return Array.from(map.values());
}

function repairMissingGraphCoverage(db: MindWeaveDB): MindWeaveDB {
  const activeNodeIds = new Set(db.nodes.filter((node) => node.status !== "ignored").map((node) => node.id));
  const hasMissingSourceGraph = db.sources.some((source) => !activeNodeIds.has(`source:${source.id}`));
  if (!hasMissingSourceGraph) return db;

  const graph = rebuildGraph(db.sources, {
    chunks: db.chunks,
    userMemory: db.userMemory,
    previousNodes: db.nodes,
    previousEdges: db.edges
  });

  return {
    ...db,
    nodes: graph.nodes,
    edges: graph.edges,
    updatedAt: new Date().toISOString()
  };
}

function sanitizeForPostgres(value: unknown): unknown {
  if (typeof value === "string") return sanitizePostgresString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForPostgres(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeForPostgres(item)]));
  }
  return value;
}

function sanitizePostgresString(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "");
}

function toSource(row: any, summaryRow?: any): Source {
  const stored = (row.source_data ?? {}) as Partial<Source>;
  return {
    ...stored,
    id: row.id,
    type: row.type,
    title: row.title,
    author: row.author ?? stored.author,
    url: row.url ?? stored.url,
    filePath: row.file_path ?? stored.filePath,
    storagePath: row.storage_path ?? stored.storagePath,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version,
    projectId: row.project_id ?? stored.projectId ?? "project_ai_research",
    tags: row.tags ?? stored.tags ?? [],
    keywords: row.keywords ?? stored.keywords ?? [],
    concepts: row.concepts ?? stored.concepts ?? [],
    oneLineSummary: row.one_line_summary ?? stored.oneLineSummary ?? "",
    summary: summaryRow?.summary_data ?? stored.summary ?? { background: "", keyPoints: [], evidence: [], takeaways: [] },
    content: row.content ?? stored.content ?? "",
    userNote: row.user_note ?? stored.userNote,
    processingReport: row.processing_report ?? stored.processingReport,
    knowledgeCardIds: row.knowledge_card_ids ?? stored.knowledgeCardIds ?? [],
    chunkIds: row.chunk_ids ?? stored.chunkIds ?? []
  };
}

function toChunk(row: any): Chunk {
  const stored = (row.chunk_data ?? {}) as Partial<Chunk>;
  return {
    ...stored,
    id: row.id,
    sourceId: row.document_id,
    text: row.text,
    index: row.chunk_index,
    page: row.page ?? undefined,
    timestamp: row.timestamp_label ?? undefined,
    embedding: row.embedding ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version
  };
}

function toProject(row: any): Project {
  const stored = (row.project_data ?? {}) as Partial<Project>;
  return {
    ...stored,
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version
  };
}

function toUserMemory(rows: any[]): UserMemory {
  const memoryRow = rows.find((row) => row.id === "memory");
  if (memoryRow?.memory_data) return memoryRow.memory_data as UserMemory;
  const words = rows.map((row) => row.word).filter(Boolean);
  return {
    customStopwords: words,
    ignoredNodeNames: words,
    entityAliases: [],
    deletedNodeIds: [],
    deletedEdgeIds: [],
    confirmedNodeIds: []
  };
}

function toEditLog(row: any): GraphEditLog {
  return {
    id: row.id,
    action: row.action,
    targetId: row.target_id,
    detail: row.detail,
    createdAt: row.created_at
  };
}

function sourceToRow(userId: string, source: Source, version: number, updatedAt: string) {
  return {
    id: source.id,
    user_id: userId,
    type: source.type,
    title: source.title,
    author: source.author ?? null,
    url: source.url ?? null,
    file_path: source.filePath ?? null,
    storage_path: source.storagePath ?? null,
    project_id: source.projectId,
    tags: source.tags ?? [],
    keywords: source.keywords ?? [],
    concepts: source.concepts ?? [],
    one_line_summary: source.oneLineSummary,
    content: source.content,
    user_note: source.userNote ?? null,
    processing_report: source.processingReport ?? null,
    knowledge_card_ids: source.knowledgeCardIds ?? [],
    chunk_ids: source.chunkIds ?? [],
    source_data: { ...source, updatedAt, version },
    created_at: source.createdAt,
    updated_at: updatedAt,
    deleted_at: null,
    version
  };
}

function chunkToRow(userId: string, chunk: Chunk, version: number, updatedAt: string) {
  return {
    id: chunk.id,
    user_id: userId,
    document_id: chunk.sourceId,
    text: chunk.text,
    chunk_index: chunk.index,
    page: chunk.page ?? null,
    timestamp_label: chunk.timestamp ?? null,
    embedding: chunk.embedding ?? null,
    chunk_data: { ...chunk, updatedAt, version },
    created_at: chunk.createdAt ?? updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    version
  };
}

function summaryToRow(userId: string, source: Source, cards: KnowledgeCard[], reviewCards: ReviewCard[], version: number, updatedAt: string) {
  return {
    id: `summary:${source.id}`,
    user_id: userId,
    document_id: source.id,
    one_line_summary: source.oneLineSummary,
    summary_data: source.summary,
    knowledge_cards: cards.filter((card) => card.sourceIds.includes(source.id)),
    review_cards: reviewCards.filter((card) => card.sourceId === source.id),
    created_at: source.createdAt,
    updated_at: updatedAt,
    deleted_at: null,
    version
  };
}

function nodeToRow(userId: string, node: EntityNode, version: number, updatedAt: string) {
  return {
    id: node.id,
    user_id: userId,
    name: node.name,
    node_type: node.nodeType,
    status: node.status,
    origin: node.origin,
    source_ids: node.sourceIds,
    node_data: { ...node, updatedAt, version },
    created_at: node.updatedAt ?? updatedAt,
    updated_at: node.updatedAt ?? updatedAt,
    deleted_at: null,
    version
  };
}

function edgeToRow(userId: string, edge: RelationEdge, version: number, updatedAt: string) {
  return {
    id: edge.id,
    user_id: userId,
    source_node: edge.sourceNode,
    target_node: edge.targetNode,
    relation_type: edge.relationType,
    status: edge.status,
    origin: edge.origin,
    source_ids: edge.sourceIds,
    edge_data: { ...edge, updatedAt, version },
    created_at: edge.updatedAt ?? updatedAt,
    updated_at: edge.updatedAt ?? updatedAt,
    deleted_at: null,
    version
  };
}

function projectToRow(userId: string, project: Project, version: number, updatedAt: string) {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    description: project.description,
    tags: project.tags,
    project_data: { ...project, updatedAt, version },
    created_at: project.createdAt,
    updated_at: updatedAt,
    deleted_at: null,
    version
  };
}

function tagToRow(userId: string, tag: string, version: number, updatedAt: string) {
  return {
    id: tagId(tag),
    user_id: userId,
    name: tag,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    version
  };
}

function memoryToRow(userId: string, memory: UserMemory, version: number, updatedAt: string) {
  return {
    id: "memory",
    user_id: userId,
    word: null,
    memory_data: memory,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    version
  };
}

function stopwordToRow(userId: string, word: string, version: number, updatedAt: string) {
  return {
    id: stopwordId(word),
    user_id: userId,
    word,
    memory_data: null,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    version
  };
}

function rowToProviderSetting(row: any): ApiProviderSetting {
  return {
    id: row.id,
    userId: row.user_id,
    providerName: row.provider_name,
    baseUrl: row.base_url,
    apiKeyEncrypted: row.encrypted_api_key ?? undefined,
    chatModel: row.chat_model,
    embeddingModel: row.embedding_model,
    visionModel: row.vision_model ?? undefined,
    asrModel: row.asr_model ?? undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version
  };
}

function latestUpdatedAt(groups: any[][]) {
  return (
    groups
      .flat()
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date().toISOString()
  );
}

function tagId(tag: string) {
  return `tag:${slugify(tag)}`;
}

function stopwordId(word: string) {
  return `stopword:${slugify(word)}`;
}

export function decryptProviderApiKey(setting: ApiProviderSetting | null) {
  return decryptSecret(setting?.apiKeyEncrypted);
}
