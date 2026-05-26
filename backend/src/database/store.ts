import fs from "node:fs";
import path from "node:path";
import type { EntityNode, MindWeaveDB, NodeType, Project, RelationEdge, RelationType, Source, UserMemory } from "../types.js";
import { analyzeParsedSource } from "../ai/analyzer.js";
import { rebuildGraph, slugConcept } from "../graph/knowledgeGraph.js";
import { embedText } from "../retrieval/vectorStore.js";
import { createSeedDatabase } from "./seed.js";
import { DEFAULT_STOPWORDS, createId, normalizeEntityName } from "../utils/text.js";

const DB_PATH = path.join(process.cwd(), "backend", "database", "mindweave.db.json");

const defaultMemory = (): UserMemory => ({
  customStopwords: [],
  ignoredNodeNames: [],
  entityAliases: [],
  deletedNodeIds: [],
  deletedEdgeIds: [],
  confirmedNodeIds: []
});

export class MindWeaveStore {
  private db: MindWeaveDB;
  private readonly persistToFile: boolean;

  constructor(initialState?: MindWeaveDB, options: { persistToFile?: boolean } = {}) {
    this.persistToFile = initialState ? options.persistToFile ?? false : true;
    this.db = initialState ? this.migrate(initialState) : this.load();
  }

  getState(): MindWeaveDB {
    return {
      ...this.db,
      nodes: this.db.nodes.filter((node) => node.status !== "ignored"),
      edges: this.db.edges.filter((edge) => edge.status !== "ignored")
    };
  }

  exportState(): MindWeaveDB {
    return structuredClone(this.db);
  }

  addParsedSource(parsed, projectId = "project_ai_research") {
    const analysis = analyzeParsedSource(parsed, projectId);
    this.db.sources.unshift(analysis.source);
    this.db.chunks.push(...analysis.chunks.map((chunk) => ({ ...chunk, embedding: embedText(chunk.text) })));
    this.db.knowledgeCards.unshift(...analysis.knowledgeCards);
    this.db.reviewCards.unshift(...analysis.reviewCards);
    this.recalculate("导入资料并生成可信图谱", analysis.source.id);
    return analysis.source;
  }

  addProject(name: string, description = ""): Project {
    const project: Project = {
      id: createId("project"),
      name,
      description,
      tags: [],
      createdAt: new Date().toISOString()
    };
    this.db.projects.push(project);
    this.log("create_project", project.id, `创建项目：${name}`);
    this.save();
    return project;
  }

  updateSource(id: string, updates: Partial<Pick<Source, "projectId" | "tags" | "title" | "userNote">>): Source {
    const source = this.db.sources.find((item) => item.id === id);
    if (!source) throw new Error("没有找到该资料。");
    Object.assign(source, updates);
    this.recalculate("更新资料信息", id);
    return source;
  }

  deleteSource(id: string): void {
    const source = this.db.sources.find((item) => item.id === id);
    if (!source) throw new Error("没有找到该资料。");
    const sourceNodeId = `source:${id}`;
    if (!this.db.userMemory.deletedNodeIds.includes(sourceNodeId)) this.db.userMemory.deletedNodeIds.push(sourceNodeId);
    this.db.sources = this.db.sources.filter((item) => item.id !== id);
    this.db.chunks = this.db.chunks.filter((chunk) => chunk.sourceId !== id);
    this.db.knowledgeCards = this.db.knowledgeCards.filter((card) => !card.sourceIds.includes(id));
    this.db.reviewCards = this.db.reviewCards.filter((card) => card.sourceId !== id);
    this.db.nodes = this.db.nodes.filter((node) => !node.sourceIds.includes(id) && node.id !== sourceNodeId);
    this.db.edges = this.db.edges.filter((edge) => !edge.sourceIds.includes(id));
    this.recalculate("删除资料并重建图谱", id);
  }

  addNode(input: { name: string; nodeType?: NodeType; description?: string; sourceId?: string }): EntityNode {
    const name = normalizeEntityName(input.name);
    if (!name) throw new Error("节点名称不能为空。");
    const id = `user:${createId("node")}`;
    const source = input.sourceId ? this.db.sources.find((item) => item.id === input.sourceId) : undefined;
    const node: EntityNode = {
      id,
      name,
      nodeType: input.nodeType ?? "concept",
      description: input.description || "用户手动新增的知识节点。",
      confidence: 1,
      sourceIds: source ? [source.id] : [],
      status: "confirmed",
      origin: "user_created",
      provenance: source
        ? [
            {
              sourceId: source.id,
              sourceTitle: source.title,
              snippet: source.oneLineSummary,
              occurrenceCount: 1
            }
          ]
        : [],
      occurrenceCount: 1,
      aliases: [],
      userEdited: true,
      updatedAt: new Date().toISOString()
    };
    this.db.nodes.push(node);
    this.log("add_node", node.id, `新增节点：${name}`);
    this.save();
    return node;
  }

  updateNode(
    id: string,
    updates: Partial<Pick<EntityNode, "name" | "nodeType" | "description" | "confidence" | "status">>
  ): EntityNode {
    const node = this.findNode(id);
    const oldName = node.name;
    Object.assign(node, updates, {
      userEdited: true,
      origin: node.origin === "user_created" ? node.origin : "user_edited",
      updatedAt: new Date().toISOString()
    });
    if (updates.name && updates.name !== oldName && node.nodeType !== "source") {
      this.rememberAlias(oldName, updates.name);
    }
    if (updates.status === "confirmed" && !this.db.userMemory.confirmedNodeIds.includes(id)) {
      this.db.userMemory.confirmedNodeIds.push(id);
    }
    this.log("update_node", id, `更新节点：${oldName} -> ${node.name}`);
    this.save();
    return node;
  }

  deleteNode(id: string, addToStopwords = true): void {
    const node = this.findNode(id);
    if (node.nodeType === "source" || id.startsWith("source:")) {
      this.deleteSource(id.replace("source:", ""));
      return;
    }
    node.status = "ignored";
    if (!this.db.userMemory.deletedNodeIds.includes(id)) this.db.userMemory.deletedNodeIds.push(id);
    if (addToStopwords) this.addStopword(node.name, false);
    this.db.edges = this.db.edges.filter((edge) => edge.sourceNode !== id && edge.targetNode !== id);
    this.db.nodes = this.db.nodes.filter((item) => item.id !== id);
    this.log("delete_node", id, `删除并忽略节点：${node.name}`);
    this.save();
  }

  mergeNodes(sourceNodeId: string, targetNodeId: string, canonicalName?: string): EntityNode {
    const sourceNode = this.findNode(sourceNodeId);
    const targetNode = this.findNode(targetNodeId);
    const name = normalizeEntityName(canonicalName || targetNode.name);
    this.rememberAlias(sourceNode.name, name);
    this.rememberAlias(targetNode.name, name);
    targetNode.name = name;
    targetNode.aliases = Array.from(new Set([...targetNode.aliases, sourceNode.name, ...sourceNode.aliases]));
    targetNode.sourceIds = Array.from(new Set([...targetNode.sourceIds, ...sourceNode.sourceIds]));
    targetNode.provenance = [...targetNode.provenance, ...sourceNode.provenance].slice(0, 8);
    targetNode.occurrenceCount += sourceNode.occurrenceCount;
    targetNode.confidence = Math.max(targetNode.confidence, sourceNode.confidence);
    targetNode.status = "confirmed";
    targetNode.userEdited = true;
    targetNode.updatedAt = new Date().toISOString();

    for (const edge of this.db.edges) {
      if (edge.sourceNode === sourceNodeId) edge.sourceNode = targetNodeId;
      if (edge.targetNode === sourceNodeId) edge.targetNode = targetNodeId;
      edge.userEdited = true;
    }

    sourceNode.status = "ignored";
    if (!this.db.userMemory.deletedNodeIds.includes(sourceNodeId)) this.db.userMemory.deletedNodeIds.push(sourceNodeId);
    this.log("merge_node", sourceNodeId, `合并节点：${sourceNode.name} -> ${name}`);
    this.recalculate("合并实体并应用纠错记忆", targetNodeId);
    return this.findNode(targetNodeId);
  }

  addEdge(input: {
    sourceNode: string;
    targetNode: string;
    relationType?: RelationType;
    evidence?: string;
    confidence?: number;
    strength?: number;
  }): RelationEdge {
    const sourceNode = this.findNode(input.sourceNode);
    const targetNode = this.findNode(input.targetNode);
    const id = `user_edge:${createId("edge")}`;
    const sourceIds = Array.from(new Set([...sourceNode.sourceIds, ...targetNode.sourceIds]));
    const edge: RelationEdge = {
      id,
      sourceNode: sourceNode.id,
      targetNode: targetNode.id,
      relationType: input.relationType ?? "关联",
      evidence: input.evidence || "用户手动建立的关系。",
      confidence: input.confidence ?? 1,
      sourceIds,
      status: "confirmed",
      origin: "user_created",
      strength: input.strength ?? 1,
      provenance: [...sourceNode.provenance, ...targetNode.provenance].slice(0, 4),
      userEdited: true,
      updatedAt: new Date().toISOString()
    };
    this.db.edges.push(edge);
    this.log("add_edge", edge.id, `新增关系：${sourceNode.name} -${edge.relationType}-> ${targetNode.name}`);
    this.save();
    return edge;
  }

  updateEdge(
    id: string,
    updates: Partial<Pick<RelationEdge, "relationType" | "evidence" | "confidence" | "strength" | "status">>
  ): RelationEdge {
    const edge = this.findEdge(id);
    Object.assign(edge, updates, {
      userEdited: true,
      origin: edge.origin === "user_created" ? edge.origin : "user_edited",
      updatedAt: new Date().toISOString()
    });
    this.log("update_edge", id, `更新关系：${edge.relationType}`);
    this.save();
    return edge;
  }

  deleteEdge(id: string): void {
    const edge = this.findEdge(id);
    edge.status = "ignored";
    if (!this.db.userMemory.deletedEdgeIds.includes(id)) this.db.userMemory.deletedEdgeIds.push(id);
    this.db.edges = this.db.edges.filter((item) => item.id !== id);
    this.log("delete_edge", id, "删除关系");
    this.save();
  }

  addStopword(word: string, shouldSave = true): UserMemory {
    const normalized = normalizeEntityName(word);
    if (!normalized) return this.db.userMemory;
    if (!this.db.userMemory.customStopwords.includes(normalized)) this.db.userMemory.customStopwords.push(normalized);
    if (!this.db.userMemory.ignoredNodeNames.includes(normalized)) this.db.userMemory.ignoredNodeNames.push(normalized);
    if (shouldSave) {
      this.recalculate("新增自定义停用词", normalized);
    }
    return this.db.userMemory;
  }

  removeStopword(word: string): UserMemory {
    const normalized = normalizeEntityName(word);
    this.db.userMemory.customStopwords = this.db.userMemory.customStopwords.filter((item) => item !== normalized);
    this.db.userMemory.ignoredNodeNames = this.db.userMemory.ignoredNodeNames.filter((item) => item !== normalized);
    this.recalculate("移除自定义停用词", normalized);
    return this.db.userMemory;
  }

  private recalculate(detail: string, targetId = "graph") {
    const graph = rebuildGraph(this.db.sources, {
      chunks: this.db.chunks,
      userMemory: this.db.userMemory,
      previousNodes: this.db.nodes,
      previousEdges: this.db.edges
    });
    this.db.nodes = graph.nodes;
    this.db.edges = graph.edges;
    this.applyProcessingReports();
    this.db.tags = Array.from(new Set(this.db.sources.flatMap((source) => source.tags))).sort();
    this.db.updatedAt = new Date().toISOString();
    this.log("recalculate_graph", targetId, detail, false);
    this.save();
  }

  private applyProcessingReports() {
    for (const source of this.db.sources) {
      const sourceNodes = this.db.nodes.filter((node) => node.sourceIds.includes(source.id) && node.nodeType !== "source");
      const sourceEdges = this.db.edges.filter((edge) => edge.sourceIds.includes(source.id));
      const pending = sourceNodes.filter((node) => node.status === "pending");
      if (!source.processingReport) continue;
      source.processingReport.extractedNodeCount = sourceNodes.length;
      source.processingReport.extractedEdgeCount = sourceEdges.length;
      source.processingReport.highConfidenceNodeCount = sourceNodes.filter((node) => node.confidence >= 0.72).length;
      source.processingReport.lowConfidenceNodeCount = pending.length;
      source.processingReport.pendingNodeNames = pending.map((node) => node.name);
      source.processingReport.steps = source.processingReport.steps.map((step) =>
        step.id === "graph" || step.id === "review" ? { ...step, status: "done" } : step
      );
    }
  }

  private load(): MindWeaveDB {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
      const seed = createSeedDatabase();
      fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), "utf-8");
      return seed;
    }

    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw) as MindWeaveDB;
    const migrated = this.migrate(parsed);
    this.db = migrated;
    this.recalculate("迁移旧数据并应用停用词过滤", "migration");
    return this.db;
  }

  private migrate(db: MindWeaveDB): MindWeaveDB {
    const userMemory = { ...defaultMemory(), ...(db.userMemory ?? {}) };
    userMemory.customStopwords = Array.from(new Set([...(userMemory.customStopwords ?? [])]));
    userMemory.ignoredNodeNames = Array.from(new Set([...(userMemory.ignoredNodeNames ?? [])]));
    const deletedSourceIds = new Set(
      (userMemory.deletedNodeIds ?? []).filter((id) => id.startsWith("source:")).map((id) => id.replace("source:", ""))
    );

    const nodes = (db.nodes ?? []).map((node) => ({
      ...node,
      status: node.status ?? "confirmed",
      origin: node.origin ?? "explicit",
      provenance: node.provenance ?? [],
      occurrenceCount: node.occurrenceCount ?? Math.max(1, node.sourceIds?.length ?? 1),
      aliases: node.aliases ?? []
    }));
    const edges = (db.edges ?? []).map((edge) => ({
      ...edge,
      status: edge.status ?? "confirmed",
      origin: edge.origin ?? "explicit",
      strength: edge.strength ?? edge.confidence ?? 0.7,
      provenance: edge.provenance ?? []
    }));

    return {
      ...db,
      sources: (db.sources ?? []).filter((source) => !deletedSourceIds.has(source.id)),
      chunks: (db.chunks ?? []).filter((chunk) => !deletedSourceIds.has(chunk.sourceId)),
      knowledgeCards: (db.knowledgeCards ?? []).filter((card) => !card.sourceIds.some((sourceId) => deletedSourceIds.has(sourceId))),
      reviewCards: (db.reviewCards ?? []).filter((card) => !deletedSourceIds.has(card.sourceId)),
      projects: db.projects ?? [],
      nodes: nodes.filter((node) => !deletedSourceIds.has(node.id.replace("source:", "")) && !node.sourceIds?.some((sourceId) => deletedSourceIds.has(sourceId))),
      edges: edges.filter((edge) => !edge.sourceIds?.some((sourceId) => deletedSourceIds.has(sourceId))),
      userMemory,
      editLog: db.editLog ?? [
        {
          id: createId("log"),
          action: "migration",
          targetId: "database",
          detail: `补齐可信图谱字段，并启用 ${DEFAULT_STOPWORDS.length} 个默认停用词。`,
          createdAt: new Date().toISOString()
        }
      ],
      tags: db.tags ?? [],
      updatedAt: db.updatedAt ?? new Date().toISOString()
    };
  }

  private findNode(id: string): EntityNode {
    const node = this.db.nodes.find((item) => item.id === id);
    if (!node) throw new Error("没有找到该节点。");
    return node;
  }

  private findEdge(id: string): RelationEdge {
    const edge = this.db.edges.find((item) => item.id === id);
    if (!edge) throw new Error("没有找到该关系。");
    return edge;
  }

  private rememberAlias(alias: string, canonical: string) {
    const normalizedAlias = normalizeEntityName(alias);
    const normalizedCanonical = normalizeEntityName(canonical);
    if (!normalizedAlias || !normalizedCanonical || normalizedAlias === normalizedCanonical) return;
    if (
      !this.db.userMemory.entityAliases.some(
        (item) => item.alias.toLowerCase() === normalizedAlias.toLowerCase() && item.canonical === normalizedCanonical
      )
    ) {
      this.db.userMemory.entityAliases.push({ alias: normalizedAlias, canonical: normalizedCanonical });
    }
  }

  private log(action: string, targetId: string, detail: string, save = true) {
    this.db.editLog.unshift({
      id: createId("log"),
      action,
      targetId,
      detail,
      createdAt: new Date().toISOString()
    });
    this.db.editLog = this.db.editLog.slice(0, 80);
    if (save) this.save();
  }

  private save() {
    if (!this.persistToFile) return;
    fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2), "utf-8");
  }
}
