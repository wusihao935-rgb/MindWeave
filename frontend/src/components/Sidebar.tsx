import {
  BookOpen,
  FolderKanban,
  Home,
  Layers3,
  Network,
  Plus,
  Settings,
  Tags,
} from "lucide-react";
import { useState } from "react";
import type { DashboardState, ViewKey } from "../types";
import { UploadPanel } from "./UploadPanel";

interface SidebarProps {
  state: DashboardState | null;
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onUpload: (formData: FormData) => Promise<void>;
  onCreateProject: (name: string) => Promise<void>;
  onSelectSource: (sourceId: string) => void;
}

const nav = [
  { key: "home", label: "首页", icon: Home },
  { key: "graph", label: "知识图谱", icon: Network },
  { key: "library", label: "资料库", icon: BookOpen },
  { key: "cards", label: "笔记与闪卡", icon: Layers3 },
  { key: "projects", label: "项目", icon: FolderKanban },
  { key: "tags", label: "标签", icon: Tags },
  { key: "settings", label: "设置", icon: Settings }
] as const;

export function Sidebar({
  state,
  view,
  onViewChange,
  onUpload,
  onCreateProject,
  onSelectSource
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Network size={20} />
        </div>
        <div>
          <strong>知织</strong>
          <span>MindWeave</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="主导航">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={view === item.key ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onViewChange(item.key)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <UploadPanel state={state} onUpload={onUpload} />

      <section className="side-section">
        <div className="side-title">
          <span>最近资料</span>
          <span>{state?.sources.length ?? 0}</span>
        </div>
        <div className="source-mini-list">
          {state?.sources.slice(0, 5).map((source) => (
            <button key={source.id} type="button" onClick={() => onSelectSource(source.id)}>
              <span>{source.title}</span>
              <small>{source.type}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="side-section project-create">
        <div className="side-title">
          <span>我的项目</span>
          <span>{state?.projects.length ?? 0}</span>
        </div>
        <ProjectInput onCreateProject={onCreateProject} />
      </section>
    </aside>
  );
}

function ProjectInput({ onCreateProject }: { onCreateProject: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <form
      className="project-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = name.trim();
        if (!value) return;
        await onCreateProject(value);
        setName("");
      }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="新项目" />
      <button type="submit" aria-label="新增项目" title="新增项目">
        <Plus size={15} />
      </button>
    </form>
  );
}
