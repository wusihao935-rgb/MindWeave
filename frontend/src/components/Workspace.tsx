import { FileText, Filter, Layers3, Network, Search, Sparkles, Tags, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { DashboardState, EntityNode, SearchResult, Source, ViewKey } from "../types";
import { GraphCanvas } from "./GraphCanvas";
import { SettingsPage } from "./SettingsPage";

interface WorkspaceProps {
  state: DashboardState;
  view: ViewKey;
  selectedNodeId?: string;
  selectedSource?: Source;
  searchResults: SearchResult[];
  onSelectNode: (nodeId: string) => void;
  onSelectSource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => Promise<void>;
}

export function Workspace({
  state,
  view,
  selectedNodeId,
  selectedSource,
  searchResults,
  onSelectNode,
  onSelectSource,
  onDeleteSource
}: WorkspaceProps) {
  const [nodeQuery, setNodeQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [scope, setScope] = useState<"global" | "current">("global");
  const pendingNodes = state.nodes.filter((node) => node.status === "pending");

  const graphData = useMemo(() => {
    const sourceId = scope === "current" ? selectedSource?.id : undefined;
    const query = nodeQuery.trim().toLowerCase();
    const nodes = state.nodes.filter((node) => {
      if (sourceId && !node.sourceIds.includes(sourceId) && node.nodeType !== "source") return false;
      if (typeFilter !== "all" && node.nodeType !== typeFilter) return false;
      if (confidenceFilter === "high" && node.confidence < 0.72) return false;
      if (confidenceFilter === "pending" && node.status !== "pending") return false;
      if (confidenceFilter === "confirmed" && node.status !== "confirmed") return false;
      if (query && !`${node.name} ${node.description}`.toLowerCase().includes(query)) return false;
      return true;
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = state.edges.filter((edge) => nodeIds.has(edge.sourceNode) && nodeIds.has(edge.targetNode));
    return { nodes, edges };
  }, [confidenceFilter, nodeQuery, scope, selectedSource?.id, state.edges, state.nodes, typeFilter]);

  if (view === "settings") {
    return <SettingsPage />;
  }

  if (view === "home") {
    return (
      <main className="workspace scrollable home-workspace">
        <section className="home-hero">
          <div>
            <span className="eyebrow">MindWeave workbench</span>
            <h1>把输入过的内容变成可调用的知识网络</h1>
            <p>导入资料后，系统会自动生成摘要、概念卡、来源片段和图谱关系；提问时优先基于你的资料回答。</p>
          </div>
          <div className="home-stats">
            <article>
              <strong>{state.stats.sourceCount}</strong>
              <span>资料</span>
            </article>
            <article>
              <strong>{state.stats.nodeCount}</strong>
              <span>节点</span>
            </article>
            <article>
              <strong>{state.stats.edgeCount}</strong>
              <span>关系</span>
            </article>
          </div>
        </section>
        <section className="object-strip">
          {state.sources.slice(0, 4).map((source) => (
            <button key={source.id} type="button" onClick={() => onSelectSource(source.id)}>
              <Sparkles size={16} />
              <strong>{source.title}</strong>
              <span>{source.concepts.slice(0, 3).join(" / ")}</span>
            </button>
          ))}
        </section>
      </main>
    );
  }

  if (view === "library") {
    return (
      <main className="workspace scrollable">
        <SectionHeader icon={<FileText size={19} />} title="资料库" subtitle="所有导入内容、摘要、标签和来源入口" />
        <div className="source-grid">
          {state.sources.map((source) => (
            <button key={source.id} className="source-card" type="button" onClick={() => onSelectSource(source.id)}>
              <span className="type-badge">{source.type}</span>
              <strong>{source.title}</strong>
              <p>{source.oneLineSummary}</p>
              <div className="tag-row">
                {source.tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (view === "source" && selectedSource) {
    const sourceNodes = state.nodes.filter((node) => node.sourceIds.includes(selectedSource.id) && node.nodeType !== "source");
    const sourceEdges = state.edges.filter((edge) => edge.sourceIds.includes(selectedSource.id));
    const cards = state.knowledgeCards.filter((card) => card.sourceIds.includes(selectedSource.id));
    return (
      <main className="workspace scrollable source-detail-page">
        <div className="source-page-header">
          <SectionHeader icon={<FileText size={19} />} title={selectedSource.title} subtitle="资料详情、原文证据、当前资料图谱和复习卡" />
          <button className="danger-text-button" type="button" onClick={() => void onDeleteSource(selectedSource.id)}>
            <Trash2 size={15} />
            <span>删除资料</span>
          </button>
        </div>
        <section className="processing-report">
          {selectedSource.processingReport?.steps.map((step) => (
            <span key={step.id} className={step.status}>
              {step.label}
            </span>
          ))}
        </section>
        <div className="source-detail-grid">
          <article className="detail-panel">
            <strong>AI 摘要</strong>
            <p>{selectedSource.oneLineSummary}</p>
            <ul>
              {selectedSource.summary.keyPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
          <article className="detail-panel">
            <strong>处理报告</strong>
            <p>
              节点 {selectedSource.processingReport?.extractedNodeCount ?? sourceNodes.length} 个，关系{" "}
              {selectedSource.processingReport?.extractedEdgeCount ?? sourceEdges.length} 条，待审核{" "}
              {selectedSource.processingReport?.lowConfidenceNodeCount ?? sourceNodes.filter((node) => node.status === "pending").length} 个。
            </p>
            <div className="tag-row">
              {sourceNodes.slice(0, 10).map((node) => (
                <button key={node.id} type="button" onClick={() => onSelectNode(node.id)}>
                  {node.name}
                </button>
              ))}
            </div>
          </article>
        </div>
        <section className="detail-panel source-text">
          <strong>原文 / 转录文本</strong>
          <p>{selectedSource.content}</p>
        </section>
        <section className="card-grid">
          {cards.map((card) => (
            <article key={card.id} className="knowledge-card">
              <span>{card.cardType}</span>
              <strong>{card.title}</strong>
              <p>{card.summary}</p>
            </article>
          ))}
        </section>
      </main>
    );
  }

  if (view === "cards") {
    return (
      <main className="workspace scrollable">
        <SectionHeader icon={<Layers3 size={19} />} title="笔记与闪卡" subtitle="从资料自动拆出的概念卡、论点卡和复习任务" />
        <div className="card-grid">
          {state.knowledgeCards.map((card) => (
            <article key={card.id} className="knowledge-card">
              <span>{card.cardType}</span>
              <strong>{card.title}</strong>
              <p>{card.summary}</p>
            </article>
          ))}
        </div>
        <div className="review-list">
          {state.reviewCards.slice(0, 8).map((card) => (
            <article key={card.id}>
              <strong>{card.question}</strong>
              <p>{card.answer}</p>
            </article>
          ))}
        </div>
      </main>
    );
  }

  if (view === "projects") {
    return (
      <main className="workspace scrollable">
        <SectionHeader icon={<Network size={19} />} title="项目" subtitle="按研究主题组织资料和图谱" />
        <div className="project-grid">
          {state.projects.map((project) => (
            <article key={project.id} className="project-card">
              <strong>{project.name}</strong>
              <p>{project.description || "新的研究空间，可以继续导入资料并沉淀知识卡片。"}</p>
              <span>{state.sources.filter((source) => source.projectId === project.id).length} 份资料</span>
            </article>
          ))}
        </div>
      </main>
    );
  }

  if (view === "tags") {
    return (
      <main className="workspace scrollable">
        <SectionHeader icon={<Tags size={19} />} title="标签" subtitle="资料类型、主题和自动概念标签" />
        <div className="tag-cloud">
          {state.tags.map((tag) => (
            <button key={tag} type="button">
              {tag}
            </button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="workspace graph-workspace">
      <div className="graph-controls">
        <label className="node-search">
          <Search size={15} />
          <input value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} placeholder="搜索节点" />
        </label>
        <select value={scope} onChange={(event) => setScope(event.target.value as "global" | "current")}>
          <option value="global">全局知识图谱</option>
          <option value="current">当前资料图谱</option>
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">全部类型</option>
          <option value="person">人物</option>
          <option value="concept">概念</option>
          <option value="method">方法</option>
          <option value="organization">机构</option>
          <option value="source">资料</option>
        </select>
        <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)}>
          <option value="all">全部可信度</option>
          <option value="confirmed">已确认</option>
          <option value="high">高置信度</option>
          <option value="pending">待审核</option>
        </select>
      </div>
      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.slice(0, 4).map((result) => (
            <button key={result.chunkId} type="button" onClick={() => onSelectSource(result.sourceId)}>
              <strong>{result.sourceTitle}</strong>
              <span>{result.snippet}</span>
            </button>
          ))}
        </div>
      )}
      <GraphCanvas nodes={graphData.nodes} edges={graphData.edges} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
      {selectedSource && (
        <div className="active-source-strip">
          <strong>{selectedSource.title}</strong>
          <span>{selectedSource.oneLineSummary}</span>
        </div>
      )}
      {pendingNodes.length > 0 && (
        <aside className="pending-review">
          <div>
            <Filter size={15} />
            <strong>待审核节点</strong>
          </div>
          {pendingNodes.slice(0, 6).map((node) => (
            <button key={node.id} type="button" onClick={() => onSelectNode(node.id)}>
              <span>{node.name}</span>
              <small>{Math.round(node.confidence * 100)}%</small>
            </button>
          ))}
        </aside>
      )}
    </main>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <div>{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
