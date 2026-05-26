import type { MindWeaveDB, ParsedSource, Project } from "../types.js";
import { analyzeParsedSource } from "../ai/analyzer.js";
import { rebuildGraph } from "../graph/knowledgeGraph.js";
import { embedText } from "../retrieval/vectorStore.js";
import { DEFAULT_STOPWORDS, createId } from "../utils/text.js";

const defaultProject: Project = {
  id: "project_ai_research",
  name: "AI 研究",
  description: "围绕 RAG、LLM、AI Safety 和个人知识管理的示例研究空间。",
  tags: ["RAG", "LLM", "AI Safety"],
  createdAt: new Date().toISOString()
};

export function createEmptyDatabase(): MindWeaveDB {
  const now = new Date().toISOString();
  return {
    sources: [],
    chunks: [],
    knowledgeCards: [],
    reviewCards: [],
    nodes: [],
    edges: [],
    projects: [{ ...defaultProject, createdAt: now }],
    tags: [],
    userMemory: {
      customStopwords: [],
      ignoredNodeNames: [],
      entityAliases: [],
      deletedNodeIds: [],
      deletedEdgeIds: [],
      confirmedNodeIds: []
    },
    editLog: [
      {
        id: createId("log"),
        action: "init_cloud_workspace",
        targetId: "database",
        detail: "初始化云端个人知识库。",
        createdAt: now
      }
    ],
    updatedAt: now
  };
}

const demoSources: ParsedSource[] = [
  {
    type: "demo",
    title: "RAG 与幻觉问题研究笔记",
    content:
      "RAG 是 Retrieval Augmented Generation 的缩写，它把向量检索和大语言模型结合起来，先从资料库召回相关 Chunk，再让 LLM 基于这些来源生成回答。RAG 的核心价值是降低 hallucination，并让回答提供来源回链。真实系统里，检索质量、引用粒度、文档切分和 embedding 模型都会影响答案可靠性。知识图谱可以补充向量数据库，因为图谱能够表达概念、论文、人物、机构和观点之间的解释、支持、反驳与引用关系。对于研究者来说，RAG 不只是问答技术，也是一种把资料转化为可复用知识资产的工作流。"
  },
  {
    type: "demo",
    title: "Transformer、Agent 与学习路径摘录",
    content:
      "Transformer 通过注意力机制把长文本中的 token 关系建模，是现代 LLM 的关键基础。学习 AI 时，Transformer、MoE、Agent、AI Safety 和 RAG 往往被分散在课程视频、论文、播客和网页中。MindWeave 应该把这些资料自动解析成知识卡片，形成学习路径，并通过间隔复习帮助用户长期记住。Agent 工作流强调任务分解、工具调用、记忆和反馈循环；它和个人知识库结合时，可以把用户过去看过的内容变成写作、研究和决策时可调用的上下文。"
  },
  {
    type: "demo",
    title: "个人知识图谱产品分析",
    content:
      "普通笔记软件擅长保存资料，但很少真正理解资料。Heptabase 重视白板与卡片，Obsidian 和 Logseq 重视双向链接，NotebookLM 重视基于资料的 AI 问答，Readwise 重视高亮回顾。MindWeave 的差异化在于自动建立个人知识图谱：它从 PDF、网页、电子书、播客和视频中抽取概念、观点、案例、方法和引用，再用语义搜索与图谱关系帮助用户发现联系、观点冲突和知识缺口。最终目标是把看过的内容变成可连接、可记忆、可创造的第二大脑。"
  }
];

export function createSeedDatabase(): MindWeaveDB {
  const analyses = demoSources.map((source) => analyzeParsedSource(source, defaultProject.id));
  const sources = analyses.map((analysis) => analysis.source);
  const chunks = analyses.flatMap((analysis) =>
    analysis.chunks.map((chunk) => ({
      ...chunk,
      embedding: embedText(chunk.text)
    }))
  );
  const knowledgeCards = analyses.flatMap((analysis) => analysis.knowledgeCards);
  const reviewCards = analyses.flatMap((analysis) => analysis.reviewCards);
  const userMemory = {
    customStopwords: [],
    ignoredNodeNames: [],
    entityAliases: [],
    deletedNodeIds: [],
    deletedEdgeIds: [],
    confirmedNodeIds: []
  };
  const graph = rebuildGraph(sources, { chunks, userMemory });
  applyProcessingReports(sources, graph.nodes, graph.edges);

  return {
    sources,
    chunks,
    knowledgeCards,
    reviewCards,
    nodes: graph.nodes,
    edges: graph.edges,
    projects: [defaultProject],
    tags: Array.from(new Set(sources.flatMap((source) => source.tags))).sort(),
    userMemory,
    editLog: [
      {
        id: createId("log"),
        action: "seed",
        targetId: "database",
        detail: `初始化默认停用词 ${DEFAULT_STOPWORDS.length} 个，示例知识库已生成。`,
        createdAt: new Date().toISOString()
      }
    ],
    updatedAt: new Date().toISOString()
  };
}

function applyProcessingReports(sources, nodes, edges) {
  for (const source of sources) {
    const sourceNodes = nodes.filter((node) => node.sourceIds.includes(source.id) && node.nodeType !== "source");
    const sourceEdges = edges.filter((edge) => edge.sourceIds.includes(source.id));
    const pending = sourceNodes.filter((node) => node.status === "pending");
    if (source.processingReport) {
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
}
