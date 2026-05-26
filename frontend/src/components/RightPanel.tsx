import { Bot, Check, ChevronRight, Link2, MessageSquare, Network, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnswerResponse, DashboardState, EntityNode, RelationEdge, Source } from "../types";

interface RightPanelProps {
  state: DashboardState | null;
  selectedNode?: EntityNode;
  selectedSource?: Source;
  answer: AnswerResponse | null;
  onAsk: (question: string) => Promise<void>;
  onSelectSource: (sourceId: string) => void;
  onOpenSourceDetail: (sourceId: string) => void;
  onUpdateNode: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onConfirmNode: (id: string) => Promise<void>;
  onDeleteNode: (id: string) => Promise<void>;
  onMergeNodes: (sourceNodeId: string, targetNodeId: string, canonicalName?: string) => Promise<void>;
  onAddNode: (payload: Record<string, unknown>) => Promise<void>;
  onAddEdge: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateEdge: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onDeleteEdge: (id: string) => Promise<void>;
  onAddStopword: (word: string) => Promise<void>;
}

const nodeTypes = ["concept", "person", "organization", "method", "viewpoint", "event", "paper", "source"];
const relationTypes = ["提及", "解释", "支持", "反驳", "引用", "属于", "对比", "补充", "影响", "来源于", "关联"];

export function RightPanel({
  state,
  selectedNode,
  selectedSource,
  answer,
  onAsk,
  onSelectSource,
  onOpenSourceDetail,
  onUpdateNode,
  onConfirmNode,
  onDeleteNode,
  onMergeNodes,
  onAddNode,
  onAddEdge,
  onUpdateEdge,
  onDeleteEdge,
  onAddStopword
}: RightPanelProps) {
  const [question, setQuestion] = useState("这些资料如何讨论 RAG 与 hallucination 的关系？");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("concept");
  const [mergeTarget, setMergeTarget] = useState("");
  const [newStopword, setNewStopword] = useState("");
  const [newNodeName, setNewNodeName] = useState("");
  const [newEdgeTarget, setNewEdgeTarget] = useState("");
  const [newEdgeType, setNewEdgeType] = useState("关联");

  useEffect(() => {
    setEditName(selectedNode?.name ?? "");
    setEditType(selectedNode?.nodeType ?? "concept");
    setMergeTarget("");
    setNewEdgeTarget("");
  }, [selectedNode?.id, selectedNode?.name, selectedNode?.nodeType]);

  const relatedSources = state?.sources.filter((source) => selectedNode?.sourceIds.includes(source.id)).slice(0, 5) ?? [];
  const adjacentEdges = useMemo(() => {
    if (!state || !selectedNode) return [];
    return state.edges.filter((edge) => edge.sourceNode === selectedNode.id || edge.targetNode === selectedNode.id).slice(0, 6);
  }, [selectedNode, state]);
  const mergeCandidates = state?.nodes.filter((node) => node.id !== selectedNode?.id && node.nodeType !== "source").slice(0, 80) ?? [];

  return (
    <aside className="right-panel">
      <section className="panel-section summary-panel">
        <div className="panel-title">
          <Sparkles size={17} />
          <span>节点详情与证据</span>
        </div>
        {selectedNode ? (
          <>
            <div className={`node-chip status-${selectedNode.status}`}>
              <Network size={16} />
              <strong>{selectedNode.name}</strong>
              <span>{selectedNode.nodeType}</span>
            </div>
            <div className="trust-row">
              <span>{confidenceLabel(selectedNode.confidence)}</span>
              <span>{originLabel(selectedNode.origin)}</span>
              <span>{selectedNode.status === "confirmed" ? "已确认" : "待审核"}</span>
            </div>
            <p>{selectedNode.description}</p>
            <div className="evidence-list">
              {selectedNode.provenance.slice(0, 4).map((item) => (
                <button key={`${item.sourceId}-${item.chunkId ?? item.snippet}`} type="button" onClick={() => onOpenSourceDetail(item.sourceId)}>
                  <strong>{item.sourceTitle}</strong>
                  <span>
                    出现 {item.occurrenceCount} 次{item.page ? ` · 第 ${item.page} 页` : ""}
                    {item.timestamp ? ` · ${item.timestamp}` : ""}
                  </span>
                  <small>{item.snippet}</small>
                </button>
              ))}
              {!selectedNode.provenance.length && <p className="muted">该节点没有明确来源，建议保留在待审核或删除。</p>}
            </div>
          </>
        ) : (
          <p>点击图谱节点，右侧会显示来源片段、置信度、审核状态和编辑入口。</p>
        )}
      </section>

      {selectedNode && (
        <section className="panel-section editor-panel">
          <div className="panel-title">
            <Save size={17} />
            <span>图谱编辑</span>
          </div>
          <div className="edit-grid">
            <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="节点名称" />
            <select value={editType} onChange={(event) => setEditType(event.target.value)}>
              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onUpdateNode(selectedNode.id, { name: editName, nodeType: editType })}>
              <Save size={15} />
              <span>保存</span>
            </button>
            <button type="button" onClick={() => onConfirmNode(selectedNode.id)}>
              <Check size={15} />
              <span>确认</span>
            </button>
            <button className="danger" type="button" onClick={() => onDeleteNode(selectedNode.id)}>
              <Trash2 size={15} />
              <span>删除</span>
            </button>
          </div>

          <div className="merge-row">
            <select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}>
              <option value="">合并到已有节点</option>
              {mergeCandidates.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!mergeTarget} onClick={() => onMergeNodes(selectedNode.id, mergeTarget, editName)}>
              合并
            </button>
          </div>
        </section>
      )}

      <section className="panel-section">
        <div className="panel-title">
          <Link2 size={17} />
          <span>相关资料</span>
        </div>
        <div className="related-list">
          {relatedSources.map((source) => (
            <button key={source.id} type="button" onClick={() => onSelectSource(source.id)}>
              <strong>{source.title}</strong>
              <span>{source.tags.slice(0, 3).join(" / ")}</span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!relatedSources.length && <p className="muted">选择一个节点后会显示来源回链。</p>}
        </div>
      </section>

      {selectedNode && (
        <section className="panel-section edge-editor">
          <div className="panel-title">
            <Network size={17} />
            <span>关系编辑</span>
          </div>
          <div className="edge-list-editor">
            {adjacentEdges.map((edge) => (
              <EdgeItem key={edge.id} edge={edge} state={state} onUpdateEdge={onUpdateEdge} onDeleteEdge={onDeleteEdge} />
            ))}
          </div>
          <div className="merge-row">
            <select value={newEdgeTarget} onChange={(event) => setNewEdgeTarget(event.target.value)}>
              <option value="">连接到节点</option>
              {mergeCandidates.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
            <select value={newEdgeType} onChange={(event) => setNewEdgeType(event.target.value)}>
              {relationTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <button type="button" disabled={!newEdgeTarget} onClick={() => onAddEdge({ sourceNode: selectedNode.id, targetNode: newEdgeTarget, relationType: newEdgeType })}>
              <Plus size={15} />
            </button>
          </div>
        </section>
      )}

      <section className="panel-section memory-panel">
        <div className="panel-title">
          <Trash2 size={17} />
          <span>纠错记忆</span>
        </div>
        <form
          className="merge-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (newStopword.trim()) {
              void onAddStopword(newStopword.trim()).then(() => setNewStopword(""));
            }
          }}
        >
          <input value={newStopword} onChange={(event) => setNewStopword(event.target.value)} placeholder="加入停用词" />
          <button type="submit">保存</button>
        </form>
        <div className="memory-tags">
          {state?.userMemory.customStopwords.slice(-10).map((word) => (
            <span key={word}>{word}</span>
          ))}
        </div>
        <form
          className="merge-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (newNodeName.trim()) {
              void onAddNode({ name: newNodeName.trim(), nodeType: "concept", sourceId: selectedSource?.id }).then(() => setNewNodeName(""));
            }
          }}
        >
          <input value={newNodeName} onChange={(event) => setNewNodeName(event.target.value)} placeholder="手动新增节点" />
          <button type="submit">
            <Plus size={15} />
          </button>
        </form>
      </section>

      <section className="panel-section ask-panel">
        <div className="panel-title">
          <Bot size={17} />
          <span>资料库问答</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim()) void onAsk(question.trim());
          }}
        >
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
          <button type="submit">
            <Send size={15} />
            <span>基于来源回答</span>
          </button>
        </form>
        {answer && (
          <div className="answer-box">
            <div className="answer-title">
              <MessageSquare size={15} />
              <span>回答</span>
            </div>
            <p>{answer.answer}</p>
            <div className="citation-list">
              {answer.citations.map((citation) => (
                <button key={citation.chunkId} type="button" onClick={() => onSelectSource(citation.sourceId)}>
                  <strong>{citation.sourceTitle}</strong>
                  <span>{citation.snippet}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}

function EdgeItem({
  edge,
  state,
  onUpdateEdge,
  onDeleteEdge
}: {
  edge: RelationEdge;
  state: DashboardState | null;
  onUpdateEdge: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onDeleteEdge: (id: string) => Promise<void>;
}) {
  const [type, setType] = useState(edge.relationType);
  const [strength, setStrength] = useState(edge.strength ?? edge.confidence ?? 0.7);
  const source = state?.nodes.find((node) => node.id === edge.sourceNode);
  const target = state?.nodes.find((node) => node.id === edge.targetNode);
  return (
    <article>
      <strong>
        {source?.name} {"->"} {target?.name}
      </strong>
      <select value={type} onChange={(event) => setType(event.target.value)}>
        {relationTypes.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <label className="strength-control">
        <span>强度 {Math.round(strength * 100)}%</span>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={strength}
          onChange={(event) => setStrength(Number(event.target.value))}
        />
      </label>
      <div>
        <button type="button" onClick={() => onUpdateEdge(edge.id, { relationType: type, strength })}>
          保存
        </button>
        <button className="danger-text" type="button" onClick={() => onDeleteEdge(edge.id)}>
          删除
        </button>
      </div>
    </article>
  );
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.86) return "高置信度";
  if (confidence >= 0.72) return "中置信度";
  return "低置信度";
}

function originLabel(origin: string) {
  if (origin === "explicit") return "原文明确";
  if (origin === "ai_inferred") return "AI 推测";
  if (origin === "user_created") return "用户新增";
  return "用户修改";
}
