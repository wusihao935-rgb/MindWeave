export type SourceType = "pdf" | "markdown" | "txt" | "web" | "note" | "demo" | "unknown";
export type NodeStatus = "confirmed" | "pending" | "ignored";
export type GraphOrigin = "explicit" | "ai_inferred" | "user_created" | "user_edited";
export type NodeType = "source" | "concept" | "person" | "organization" | "method" | "viewpoint" | "event" | "paper";
export type RelationType = "提及" | "支持" | "反驳" | "引用" | "解释" | "属于" | "对比" | "补充" | "影响" | "来源于" | "关联";

export interface Provenance {
  sourceId: string;
  sourceTitle: string;
  snippet: string;
  occurrenceCount: number;
  chunkId?: string;
  page?: number;
  timestamp?: string;
}

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  author?: string;
  url?: string;
  filePath?: string;
  storagePath?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
  projectId: string;
  tags: string[];
  keywords: string[];
  concepts: string[];
  oneLineSummary: string;
  summary: StructuredSummary;
  content: string;
  userNote?: string;
  processingReport?: ProcessingReport;
  knowledgeCardIds: string[];
  chunkIds: string[];
}

export interface StructuredSummary {
  background: string;
  keyPoints: string[];
  evidence: string[];
  takeaways: string[];
}

export interface ProcessingReport {
  importedAt: string;
  steps: Array<{
    id: string;
    label: string;
    status: "done" | "pending" | "skipped";
  }>;
  extractedNodeCount: number;
  extractedEdgeCount: number;
  highConfidenceNodeCount: number;
  lowConfidenceNodeCount: number;
  pendingNodeNames: string[];
}

export interface Chunk {
  id: string;
  sourceId: string;
  text: string;
  index: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
  page?: number;
  timestamp?: string;
  embedding?: Record<string, number>;
}

export interface KnowledgeCard {
  id: string;
  title: string;
  summary: string;
  cardType: "concept" | "argument" | "case" | "quote" | "method" | "data";
  sourceIds: string[];
  tags: string[];
}

export interface EntityNode {
  id: string;
  name: string;
  nodeType: NodeType;
  description: string;
  confidence: number;
  sourceIds: string[];
  status: NodeStatus;
  origin: GraphOrigin;
  provenance: Provenance[];
  occurrenceCount: number;
  aliases: string[];
  userEdited?: boolean;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
}

export interface RelationEdge {
  id: string;
  sourceNode: string;
  targetNode: string;
  relationType: RelationType;
  evidence: string;
  confidence: number;
  sourceIds: string[];
  status: NodeStatus;
  origin: GraphOrigin;
  strength: number;
  provenance: Provenance[];
  userEdited?: boolean;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
}

export interface ReviewCard {
  id: string;
  question: string;
  answer: string;
  sourceId: string;
  nextReviewAt: string;
  score: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
}

export interface UserMemory {
  customStopwords: string[];
  ignoredNodeNames: string[];
  entityAliases: Array<{
    alias: string;
    canonical: string;
  }>;
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
  confirmedNodeIds: string[];
}

export interface GraphEditLog {
  id: string;
  action: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

export interface MindWeaveDB {
  sources: Source[];
  chunks: Chunk[];
  knowledgeCards: KnowledgeCard[];
  nodes: EntityNode[];
  edges: RelationEdge[];
  reviewCards: ReviewCard[];
  projects: Project[];
  tags: string[];
  userMemory: UserMemory;
  editLog: GraphEditLog[];
  updatedAt: string;
}

export interface ParsedSource {
  type: SourceType;
  title: string;
  content: string;
  url?: string;
  filePath?: string;
  storagePath?: string;
}

export interface SearchResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: SourceType;
  snippet: string;
  score: number;
  page?: number;
  timestamp?: string;
  url?: string;
}

export interface AnswerResponse {
  answer: string;
  citations: SearchResult[];
  relatedConcepts: string[];
  provider?: string;
  fallback?: boolean;
}

export type ApiProviderName =
  | "openai-compatible"
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "gemini"
  | "claude-compatible"
  | "custom";

export interface ApiProviderSetting {
  id: string;
  userId: string;
  providerName: ApiProviderName;
  baseUrl: string;
  apiKeyEncrypted?: string;
  chatModel: string;
  embeddingModel: string;
  visionModel?: string;
  asrModel?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  version: number;
}

export interface PublicApiProviderSetting {
  id: string;
  providerName: ApiProviderName;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  visionModel?: string;
  asrModel?: string;
  enabled: boolean;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}
