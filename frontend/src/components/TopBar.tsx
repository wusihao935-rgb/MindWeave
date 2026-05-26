import { LogOut, RefreshCw, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import type { DashboardState, SyncStatus } from "../types";

interface TopBarProps {
  state: DashboardState | null;
  onSearch: (query: string) => Promise<void>;
  syncStatus: SyncStatus;
  userEmail?: string;
  onSync: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function TopBar({ state, onSearch, syncStatus, userEmail, onSync, onLogout }: TopBarProps) {
  const [query, setQuery] = useState("");
  return (
    <header className="topbar">
      <form
        className="searchbox"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) void onSearch(query.trim());
        }}
      >
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="语义搜索：输入问题、概念或来源..." />
        <kbd>Enter</kbd>
      </form>

      <div className="metrics">
        <span>
          <Sparkles size={15} />
          {state?.stats.nodeCount ?? 0} 节点
        </span>
        <span>{state?.stats.edgeCount ?? 0} 关系</span>
        <span>{state?.stats.pendingNodeCount ?? 0} 待审</span>
        <span className={`sync-pill ${syncStatus}`}>{syncLabel(syncStatus)}</span>
      </div>

      <div className="icon-actions">
        <button type="button" title="手动同步" aria-label="手动同步" onClick={() => void onSync()}>
          <RefreshCw size={17} />
        </button>
        <button type="button" title={userEmail || "退出登录"} aria-label="退出登录" onClick={() => void onLogout()}>
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}

function syncLabel(status: SyncStatus) {
  if (status === "syncing") return "同步中";
  if (status === "failed") return "同步失败";
  if (status === "offline") return "离线";
  return "已同步";
}
