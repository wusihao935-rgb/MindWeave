import type { Chunk, EntityNode, Provenance, RelationEdge, RelationType, Source, UserMemory } from "../types.js";
import {
  createId,
  escapeRegExp,
  extractChinesePersonNames,
  isUsefulNodeName,
  normalizeEntityName,
  truncate
} from "../utils/text.js";

const HIGH_CONFIDENCE_CONCEPTS = new Set([
  "知识图谱",
  "个人知识库",
  "第二大脑",
  "RAG",
  "Retrieval Augmented Generation",
  "Hallucination",
  "Transformer",
  "Agent",
  "AI Safety",
  "MoE",
  "向量数据库",
  "语义搜索",
  "Embedding",
  "OCR",
  "ASR",
  "闪卡",
  "间隔复习",
  "来源回链",
  "AI Scientist"
]);

export interface GraphBuildOptions {
  chunks: Chunk[];
  userMemory: UserMemory;
  previousNodes?: EntityNode[];
  previousEdges?: RelationEdge[];
}

export function rebuildGraph(sources: Source[], options: GraphBuildOptions): { nodes: EntityNode[]; edges: RelationEdge[] } {
  const nodeMap = new Map<string, EntityNode>();
  const edgeMap = new Map<string, RelationEdge>();
  const previousNodeMap = new Map((options.previousNodes ?? []).map((node) => [node.id, node]));
  const previousEdgeMap = new Map((options.previousEdges ?? []).map((edge) => [edge.id, edge]));
  const ignoredNames = new Set(options.userMemory.ignoredNodeNames.map((name) => normalizeEntityName(name).toLowerCase()));
  const deletedNodeIds = new Set(options.userMemory.deletedNodeIds);
  const deletedEdgeIds = new Set(options.userMemory.deletedEdgeIds);
  const confirmedNodeIds = new Set(options.userMemory.confirmedNodeIds);

  for (const source of sources) {
    const sourceNodeId = `source:${source.id}`;
    if (!deletedNodeIds.has(sourceNodeId)) {
      const previous = previousNodeMap.get(sourceNodeId);
      nodeMap.set(sourceNodeId, {
        id: sourceNodeId,
        name: previous?.name ?? source.title,
        nodeType: "source",
        description: previous?.description ?? source.oneLineSummary,
        confidence: 1,
        sourceIds: [source.id],
        status: "confirmed",
        origin: previous?.origin ?? "explicit",
        provenance: [
          {
            sourceId: source.id,
            sourceTitle: source.title,
            snippet: truncate(source.content, 260),
            occurrenceCount: 1
          }
        ],
        occurrenceCount: 1,
        aliases: previous?.aliases ?? [],
        userEdited: previous?.userEdited,
        updatedAt: previous?.updatedAt
      });
    }

    const concepts = prepareConceptsForSource(source, options.userMemory);
    for (const concept of concepts) {
      if (ignoredNames.has(concept.toLowerCase())) continue;
      const provenance = findProvenance(concept, source, options.chunks);
      if (!provenance.length) continue;

      const conceptNodeId = `concept:${slugConcept(concept)}`;
      if (deletedNodeIds.has(conceptNodeId)) continue;

      const previous = previousNodeMap.get(conceptNodeId);
      const existing = nodeMap.get(conceptNodeId);
      const occurrenceCount = provenance.reduce((sum, item) => sum + item.occurrenceCount, 0) + (existing?.occurrenceCount ?? 0);
      const confidence = calculateNodeConfidence(concept, provenance, source);
      const status = previous?.status ?? (confirmedNodeIds.has(conceptNodeId) || confidence >= 0.72 ? "confirmed" : "pending");
      const sourceIds = Array.from(new Set([...(existing?.sourceIds ?? []), source.id]));

      nodeMap.set(conceptNodeId, {
        id: conceptNodeId,
        name: previous?.name ?? concept,
        nodeType: previous?.userEdited ? previous.nodeType : classifyConcept(concept),
        description:
          previous?.description ||
          existing?.description ||
          truncate(`${concept} 在《${source.title}》中明确出现，可从右侧证据片段回溯原文。`, 180),
        confidence: Math.max(previous?.confidence ?? 0, existing?.confidence ?? 0, confidence),
        sourceIds,
        status,
        origin: previous?.origin ?? "explicit",
        provenance: mergeProvenance([...(existing?.provenance ?? []), ...provenance]),
        occurrenceCount,
        aliases: Array.from(new Set([...(existing?.aliases ?? []), ...(previous?.aliases ?? [])])),
        userEdited: previous?.userEdited,
        updatedAt: previous?.updatedAt
      });

      addEdge(
        edgeMap,
        previousEdgeMap,
        deletedEdgeIds,
        sourceNodeId,
        conceptNodeId,
        "提及",
        `《${source.title}》明确提及 ${concept}`,
        source.id,
        0.86,
        provenance,
        "explicit"
      );
    }

    const confirmedConcepts = concepts
      .map((concept) => `concept:${slugConcept(concept)}`)
      .filter((id) => nodeMap.has(id) && nodeMap.get(id)?.status === "confirmed")
      .slice(0, 8);

    for (let i = 0; i < confirmedConcepts.length - 1; i += 1) {
      const left = nodeMap.get(confirmedConcepts[i]);
      const right = nodeMap.get(confirmedConcepts[i + 1]);
      if (!left || !right) continue;
      const relation: RelationType = i % 3 === 0 ? "解释" : i % 3 === 1 ? "补充" : "关联";
      addEdge(
        edgeMap,
        previousEdgeMap,
        deletedEdgeIds,
        left.id,
        right.id,
        relation,
        `${left.name} 与 ${right.name} 在《${source.title}》中共同出现；该关系由共现推断，需结合原文判断。`,
        source.id,
        0.58,
        mergeProvenance([...left.provenance, ...right.provenance]).slice(0, 2),
        "ai_inferred"
      );
    }
  }

  for (const previous of previousNodeMap.values()) {
    if (previous.origin === "user_created" && !deletedNodeIds.has(previous.id) && previous.status !== "ignored") {
      nodeMap.set(previous.id, previous);
    }
  }

  for (const previous of previousEdgeMap.values()) {
    if ((previous.origin === "user_created" || previous.userEdited) && !deletedEdgeIds.has(previous.id) && previous.status !== "ignored") {
      edgeMap.set(previous.id, previous);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()).filter((node) => node.status !== "ignored"),
    edges: Array.from(edgeMap.values()).filter((edge) => edge.status !== "ignored" && nodeMap.has(edge.sourceNode) && nodeMap.has(edge.targetNode))
  };
}

function prepareConceptsForSource(source: Source, userMemory: UserMemory): string[] {
  const people = extractChinesePersonNames(`${source.title}\n${source.content}`);
  const titlePeople = extractChinesePersonNames(source.title);
  const raw = [...people, ...source.concepts, ...source.keywords];
  const normalized = raw
    .map((concept) => applyTitlePersonCanonical(applyAliases(normalizeEntityName(concept), userMemory), titlePeople))
    .filter((concept) => isUsefulNodeName(concept, [...userMemory.customStopwords, ...userMemory.ignoredNodeNames]))
    .filter((concept) => {
      if (!/^[\u4e00-\u9fff]{3}$/.test(concept)) return true;
      if (people.includes(concept) || titlePeople.includes(concept)) return true;
      if (HIGH_CONFIDENCE_CONCEPTS.has(concept)) return true;
      return false;
    });

  const unique = Array.from(new Set(normalized));
  return unique
    .filter((concept) => !unique.some((other) => other !== concept && other.includes(concept) && other.length > concept.length))
    .slice(0, 18);
}

function applyTitlePersonCanonical(name: string, titlePeople: string[]): string {
  if (!/^[\u4e00-\u9fff]{3,4}$/.test(name)) return name;
  const canonical = titlePeople.find((person) => person[0] === name[0] && editDistance(person, name) <= 1);
  return canonical ?? name;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function applyAliases(name: string, userMemory: UserMemory): string {
  const match = userMemory.entityAliases.find((item) => item.alias.toLowerCase() === name.toLowerCase());
  return match ? match.canonical : name;
}

function findProvenance(concept: string, source: Source, chunks: Chunk[]): Provenance[] {
  const matcher = new RegExp(escapeRegExp(concept), "gi");
  const sourceChunks = chunks.filter((chunk) => chunk.sourceId === source.id);
  const matches: Provenance[] = [];

  for (const chunk of sourceChunks) {
    const occurrences = chunk.text.match(matcher)?.length ?? 0;
    if (!occurrences) continue;
    matches.push({
      sourceId: source.id,
      sourceTitle: source.title,
      snippet: excerptAround(chunk.text, concept),
      occurrenceCount: occurrences,
      chunkId: chunk.id,
      page: chunk.page,
      timestamp: chunk.timestamp
    });
  }

  if (!matches.length && source.content.match(matcher)) {
    matches.push({
      sourceId: source.id,
      sourceTitle: source.title,
      snippet: excerptAround(source.content, concept),
      occurrenceCount: source.content.match(matcher)?.length ?? 1
    });
  }

  return matches.slice(0, 4);
}

function excerptAround(text: string, concept: string): string {
  const index = text.toLowerCase().indexOf(concept.toLowerCase());
  if (index < 0) return truncate(text, 240);
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + concept.length + 130);
  return truncate(text.slice(start, end), 260);
}

function calculateNodeConfidence(concept: string, provenance: Provenance[], source: Source): number {
  const occurrences = provenance.reduce((sum, item) => sum + item.occurrenceCount, 0);
  if (source.title.toLowerCase().includes(concept.toLowerCase())) return 0.92;
  if (HIGH_CONFIDENCE_CONCEPTS.has(concept)) return 0.88;
  if (classifyConcept(concept) === "person" && occurrences >= 1) return 0.82;
  if (occurrences >= 3) return 0.86;
  if (occurrences >= 2) return 0.74;
  return 0.58;
}

function addEdge(
  edgeMap: Map<string, RelationEdge>,
  previousEdgeMap: Map<string, RelationEdge>,
  deletedEdgeIds: Set<string>,
  sourceNode: string,
  targetNode: string,
  relationType: RelationType,
  evidence: string,
  sourceId: string,
  confidence: number,
  provenance: Provenance[],
  origin: "explicit" | "ai_inferred"
) {
  const stableId = `edge:${slugConcept(sourceNode)}:${slugConcept(targetNode)}:${slugConcept(relationType)}`;
  if (deletedEdgeIds.has(stableId)) return;

  const previous = previousEdgeMap.get(stableId);
  const existing = edgeMap.get(stableId);
  if (existing) {
    existing.sourceIds = Array.from(new Set([...existing.sourceIds, sourceId]));
    existing.confidence = Math.max(existing.confidence, confidence);
    existing.provenance = mergeProvenance([...existing.provenance, ...provenance]);
    return;
  }

  edgeMap.set(stableId, {
    id: stableId,
    sourceNode,
    targetNode,
    relationType: previous?.relationType ?? relationType,
    evidence: previous?.evidence ?? evidence,
    confidence: previous?.confidence ?? confidence,
    sourceIds: Array.from(new Set([sourceId, ...(previous?.sourceIds ?? [])])),
    status: previous?.status ?? (origin === "explicit" || confidence >= 0.72 ? "confirmed" : "pending"),
    origin: previous?.origin ?? origin,
    strength: previous?.strength ?? Number(Math.max(0.2, confidence).toFixed(2)),
    provenance: previous?.provenance?.length ? previous.provenance : provenance,
    userEdited: previous?.userEdited,
    updatedAt: previous?.updatedAt
  });
}

function mergeProvenance(items: Provenance[]): Provenance[] {
  const map = new Map<string, Provenance>();
  for (const item of items) {
    const key = `${item.sourceId}:${item.chunkId ?? item.snippet}`;
    const existing = map.get(key);
    if (existing) {
      existing.occurrenceCount += item.occurrenceCount;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values()).slice(0, 8);
}

export function slugConcept(concept: string): string {
  return concept.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/gi, "-").replace(/^-|-$/g, "");
}

function classifyConcept(concept: string): EntityNode["nodeType"] {
  const lowered = concept.toLowerCase();
  if (/^[\u4e00-\u9fff]{3}$/.test(concept)) return "person";
  if (["rag", "transformer", "agent", "moe", "ocr", "asr", "embedding", "scientist"].some((item) => lowered.includes(item))) {
    return "method";
  }
  if (["notebooklm", "obsidian", "readwise", "heptabase", "anthropic", "openai"].some((item) => lowered.includes(item))) {
    return "organization";
  }
  if (concept.includes("观点") || concept.includes("冲突")) return "viewpoint";
  return "concept";
}
