import type { Chunk, KnowledgeCard, ParsedSource, ReviewCard, Source, StructuredSummary } from "../types.js";
import {
  chunkText,
  cleanText,
  createId,
  extractChinesePersonNames,
  extractKeywords,
  extractTitle,
  isUsefulNodeName,
  normalizeEntityName,
  splitSentences,
  truncate
} from "../utils/text.js";

const KNOWN_CONCEPTS = [
  "知识图谱",
  "个人知识库",
  "第二大脑",
  "RAG",
  "retrieval augmented generation",
  "hallucination",
  "Transformer",
  "Agent",
  "AI Safety",
  "MoE",
  "向量数据库",
  "语义搜索",
  "embedding",
  "OCR",
  "ASR",
  "闪卡",
  "间隔复习",
  "来源回链",
  "论文综述",
  "投资 memo",
  "学习路径",
  "观点冲突",
  "知识缺口",
  "NotebookLM",
  "Obsidian",
  "Readwise",
  "Heptabase"
];

export interface SourceAnalysis {
  source: Source;
  chunks: Chunk[];
  knowledgeCards: KnowledgeCard[];
  reviewCards: ReviewCard[];
}

export function analyzeParsedSource(parsed: ParsedSource, projectId: string): SourceAnalysis {
  const sourceId = createId("src");
  const content = cleanText(parsed.content);
  const title = parsed.title || extractTitle(content, "未命名资料");
  const sentences = splitSentences(content);
  const keywords = extractKeywords(`${title}\n${content}`, 12);
  const concepts = extractConcepts(`${title}\n${content}`, keywords);
  const summary = buildStructuredSummary(content, concepts);
  const chunks = chunkText(content, sourceId).map((chunk) => ({
    ...chunk,
    embedding: undefined
  }));
  const knowledgeCards = buildKnowledgeCards(sourceId, title, concepts, summary, keywords);
  const reviewCards = buildReviewCards(sourceId, concepts, title);
  const source: Source = {
    id: sourceId,
    type: parsed.type,
    title,
    url: parsed.url,
    filePath: parsed.filePath,
    storagePath: parsed.storagePath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: Date.now(),
    projectId,
    tags: buildTags(parsed.type, concepts, keywords),
    keywords,
    concepts,
    oneLineSummary: buildOneLineSummary(sentences, title, concepts),
    summary,
    content,
    processingReport: {
      importedAt: new Date().toISOString(),
      steps: [
        { id: "import", label: "资料导入", status: "done" },
        { id: "extract_text", label: "文本提取", status: "done" },
        { id: "chunk", label: "章节/片段切分", status: "done" },
        { id: "summarize", label: "摘要生成", status: "done" },
        { id: "entities", label: "实体与概念提取", status: "done" },
        { id: "graph", label: "图谱生成", status: "pending" },
        { id: "review", label: "低置信度节点审核", status: "pending" }
      ],
      extractedNodeCount: concepts.length,
      extractedEdgeCount: Math.max(0, concepts.length - 1),
      highConfidenceNodeCount: 0,
      lowConfidenceNodeCount: 0,
      pendingNodeNames: []
    },
    knowledgeCardIds: knowledgeCards.map((card) => card.id),
    chunkIds: chunks.map((chunk) => chunk.id)
  };

  return { source, chunks, knowledgeCards, reviewCards };
}

function extractConcepts(text: string, keywords: string[]): string[] {
  const lowered = text.toLowerCase();
  const known = KNOWN_CONCEPTS.filter((concept) => lowered.includes(concept.toLowerCase()));
  const people = extractChinesePersonNames(text);
  const keywordConcepts = keywords
    .filter((keyword) => keyword.length >= 2)
    .map((keyword) => normalizeConcept(keyword))
    .filter(Boolean)
    .filter((keyword) => !people.some((person) => person.includes(keyword) || keyword.includes(person)));
  const concepts = [...people, ...known, ...keywordConcepts]
    .map((concept) => normalizeEntityName(concept))
    .filter((concept) => isUsefulNodeName(concept));
  return removeContainedConcepts(Array.from(new Set(concepts))).slice(0, 16);
}

function normalizeConcept(keyword: string): string {
  if (/^[a-z0-9+#.-]+$/i.test(keyword)) return keyword.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  return keyword.slice(0, 16);
}

function removeContainedConcepts(concepts: string[]): string[] {
  return concepts.filter((concept) => {
    if (!/^[\u3400-\u9fff]{2,4}$/.test(concept)) return true;
    return !concepts.some((other) => other !== concept && other.includes(concept) && other.length > concept.length);
  });
}

function buildOneLineSummary(sentences: string[], title: string, concepts: string[]): string {
  const best =
    sentences.find((sentence) => concepts.some((concept) => sentence.toLowerCase().includes(concept.toLowerCase()))) ??
    sentences[0] ??
    title;
  return truncate(best, 120);
}

function buildStructuredSummary(text: string, concepts: string[]): StructuredSummary {
  const sentences = splitSentences(text);
  const conceptMatches = (sentence: string) =>
    concepts.filter((concept) => sentence.toLowerCase().includes(concept.toLowerCase())).length;
  const ranked = [...sentences].sort((a, b) => conceptMatches(b) - conceptMatches(a) || b.length - a.length);
  const selected = ranked.slice(0, 8);

  return {
    background: truncate(selected[0] ?? sentences[0] ?? text, 220),
    keyPoints: selected.slice(1, 4).map((sentence) => truncate(sentence, 160)),
    evidence: selected.slice(4, 6).map((sentence) => truncate(sentence, 160)),
    takeaways: selected.slice(6, 8).map((sentence) => truncate(sentence, 160))
  };
}

function buildTags(type: string, concepts: string[], keywords: string[]): string[] {
  const typeLabel: Record<string, string> = {
    pdf: "论文/PDF",
    markdown: "Markdown",
    txt: "文本",
    web: "网页",
    note: "笔记",
    demo: "示例"
  };
  return Array.from(new Set([typeLabel[type] ?? "资料", ...concepts.slice(0, 4), ...keywords.slice(0, 2)])).slice(0, 8);
}

function buildKnowledgeCards(
  sourceId: string,
  sourceTitle: string,
  concepts: string[],
  summary: StructuredSummary,
  keywords: string[]
): KnowledgeCard[] {
  const cards: KnowledgeCard[] = concepts.slice(0, 6).map((concept, index) => ({
    id: createId("card"),
    title: concept,
    summary:
      summary.keyPoints[index % Math.max(summary.keyPoints.length, 1)] ??
      `${concept} 是《${sourceTitle}》中反复出现的核心知识对象，可用于后续检索、复习和图谱关联。`,
    cardType: index % 3 === 0 ? "concept" : index % 3 === 1 ? "argument" : "method",
    sourceIds: [sourceId],
    tags: Array.from(new Set([concept, ...keywords.slice(0, 3)]))
  }));

  if (!cards.length) {
    cards.push({
      id: createId("card"),
      title: sourceTitle,
      summary: summary.background,
      cardType: "argument",
      sourceIds: [sourceId],
      tags: keywords.slice(0, 4)
    });
  }

  return cards;
}

function buildReviewCards(sourceId: string, concepts: string[], title: string): ReviewCard[] {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return concepts.slice(0, 4).map((concept) => ({
    id: createId("review"),
    question: `${concept} 在《${title}》里解决了什么问题？`,
    answer: `${concept} 是该资料中的关键概念。复习时应能说出它的定义、关联资料和可迁移启发。`,
    sourceId,
    nextReviewAt: tomorrow,
    score: 0
  }));
}
