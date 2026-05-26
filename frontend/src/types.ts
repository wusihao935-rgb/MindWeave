export type ViewKey = "home" | "graph" | "library" | "source" | "cards" | "projects" | "tags" | "settings";
export type NodeStatus = "confirmed" | "pending" | "ignored";
export type GraphOrigin = "explicit" | "ai_inferred" | "user_created" | "user_edited";

export interface Provenance {
  sourceId: string;
  sourceTitle: string;
  snippet: string;
  occurrenceCount: number;
  chunkId?: string;
  page?: number;
  timestamp?: string;
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
    status: string;
  }>;
  extractedNodeCount: number;
  extractedEdgeCount: number;
  highConfidenceNodeCount: number;
  lowConfidenceNodeCount: number;
  pendingNodeNames: string[];
}

export interface Source {
  id: string;
  type: string;
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

export interface KnowledgeCard {
  id: string;
  title: string;
  summary: string;
  cardType: string;
  sourceIds: string[];
  tags: string[];
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
}

export interface EntityNode {
  id: string;
  name: string;
  nodeType: string;
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
}

export interface RelationEdge {
  id: string;
  sourceNode: string;
  targetNode: string;
  relationType: string;
  evidence: string;
  confidence: number;
  sourceIds: string[];
  status: NodeStatus;
  origin: GraphOrigin;
  strength: number;
  provenance: Provenance[];
  userEdited?: boolean;
  updatedAt?: string;
}

export interface UserMemory {
  customStopwords: string[];
  ignoredNodeNames: string[];
  entityAliases: Array<{ alias: string; canonical: string }>;
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

export interface SearchResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
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

export type SyncStatus = "synced" | "syncing" | "failed" | "offline";

export type ApiProviderName =
  | "openai-compatible"
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "gemini"
  | "claude-compatible"
  | "custom";

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

export interface DashboardState {
  sources: Source[];
  knowledgeCards: KnowledgeCard[];
  reviewCards: ReviewCard[];
  nodes: EntityNode[];
  edges: RelationEdge[];
  projects: Project[];
  tags: string[];
  userMemory: UserMemory;
  editLog: GraphEditLog[];
  updatedAt: string;
  stats: {
    sourceCount: number;
    nodeCount: number;
    edgeCount: number;
    cardCount: number;
    pendingNodeCount: number;
    confirmedNodeCount: number;
  };
}
