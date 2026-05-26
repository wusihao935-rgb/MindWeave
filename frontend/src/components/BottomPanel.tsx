import { FileText, Layers3, Link2, NotebookText } from "lucide-react";
import { useState } from "react";
import type { DashboardState, Source } from "../types";

interface BottomPanelProps {
  state: DashboardState | null;
  selectedSource?: Source;
}

const tabs = [
  { key: "summary", label: "资料摘要", icon: FileText },
  { key: "cards", label: "知识卡片", icon: Layers3 },
  { key: "links", label: "来源回链", icon: Link2 },
  { key: "notes", label: "笔记", icon: NotebookText }
] as const;

export function BottomPanel({ state, selectedSource }: BottomPanelProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("summary");
  const cards = state?.knowledgeCards.filter((card) => selectedSource && card.sourceIds.includes(selectedSource.id)) ?? [];
  const relatedEdges =
    state?.edges.filter((edge) => selectedSource && edge.sourceIds.includes(selectedSource.id)).slice(0, 8) ?? [];

  return (
    <section className="bottom-panel">
      <div className="tabbar">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} type="button" className={tab === item.key ? "selected" : ""} onClick={() => setTab(item.key)}>
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {!selectedSource && <p className="empty-panel">选择一份资料后，可以查看摘要、知识卡片和来源回链。</p>}

      {selectedSource && tab === "summary" && (
        <div className="bottom-content summary-grid">
          <article>
            <strong>一句话摘要</strong>
            <p>{selectedSource.oneLineSummary}</p>
          </article>
          <article>
            <strong>核心观点</strong>
            <ul>
              {selectedSource.summary.keyPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
          <article>
            <strong>标签</strong>
            <div className="tag-row">
              {selectedSource.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </article>
        </div>
      )}

      {selectedSource && tab === "cards" && (
        <div className="bottom-content chip-list">
          {cards.map((card) => (
            <article key={card.id}>
              <strong>{card.title}</strong>
              <p>{card.summary}</p>
            </article>
          ))}
        </div>
      )}

      {selectedSource && tab === "links" && (
        <div className="bottom-content edge-list">
          {relatedEdges.map((edge) => (
            <article key={edge.id}>
              <strong>{edge.relationType}</strong>
              <p>{edge.evidence}</p>
            </article>
          ))}
        </div>
      )}

      {selectedSource && tab === "notes" && (
        <div className="bottom-content notes-placeholder">
          <textarea placeholder="为这份资料记录你的想法。原型阶段先保存在当前输入框中。" />
        </div>
      )}
    </section>
  );
}
