import type { AnswerResponse, Chunk, MindWeaveDB, SearchResult, Source } from "../types.js";
import { cosineSimilarity, extractKeywords, termFrequency, tokenize, truncate } from "../utils/text.js";

export function embedText(text: string): Record<string, number> {
  return termFrequency(tokenize(text));
}

export function searchChunks(db: MindWeaveDB, query: string, limit = 8): SearchResult[] {
  const queryVector = embedText(query);
  const queryKeywords = extractKeywords(query, 8).map((item) => item.toLowerCase());
  const sourcesById = new Map(db.sources.map((source) => [source.id, source]));

  return db.chunks
    .map((chunk) => {
      const source = sourcesById.get(chunk.sourceId);
      if (!source) return null;
      const chunkVector = chunk.embedding && Object.keys(chunk.embedding).length ? chunk.embedding : embedText(chunk.text);
      const baseScore = cosineSimilarity(queryVector, chunkVector);
      const boost = source.concepts.some((concept) => queryKeywords.includes(concept.toLowerCase())) ? 0.25 : 0;
      const titleBoost = source.title.toLowerCase().includes(query.toLowerCase()) ? 0.2 : 0;
      return toSearchResult(chunk, source, baseScore + boost + titleBoost);
    })
    .filter((item): item is SearchResult => Boolean(item))
    .filter((item) => item.score > 0 || item.snippet.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function answerQuestion(db: MindWeaveDB, question: string): AnswerResponse {
  const citations = searchChunks(db, question, 5);
  if (!citations.length) {
    return {
      answer: "我还没有在资料库中找到足够相关的片段。可以先导入更多资料，或换一个更具体的概念再问。",
      citations: [],
      relatedConcepts: []
    };
  }

  const relatedConcepts = Array.from(
    new Set(
      citations.flatMap((citation) => {
        const source = db.sources.find((item) => item.id === citation.sourceId);
        return source?.concepts.slice(0, 4) ?? [];
      })
    )
  ).slice(0, 8);

  const points = citations.slice(0, 3).map((citation, index) => {
    const label = index + 1;
    return `${label}. 《${citation.sourceTitle}》指出：${citation.snippet}`;
  });

  const answer = [
    `基于当前资料库，和“${question}”最相关的是 ${relatedConcepts.slice(0, 4).join("、") || "这些片段"}。`,
    ...points,
    "这些结论都来自下方引用片段；如果要进入写作模式，可以继续让系统按主题、争议点或报告结构重组这些来源。"
  ].join("\n");

  return { answer, citations, relatedConcepts };
}

function toSearchResult(chunk: Chunk, source: Source, score: number): SearchResult {
  return {
    chunkId: chunk.id,
    sourceId: source.id,
    sourceTitle: source.title,
    sourceType: source.type,
    snippet: truncate(chunk.text, 260),
    score: Number(score.toFixed(4)),
    page: chunk.page,
    timestamp: chunk.timestamp,
    url: source.url
  };
}
