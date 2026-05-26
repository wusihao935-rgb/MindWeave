import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  addNode,
  addStopword,
  askKnowledge,
  confirmNode,
  configureApiAuth,
  createProject,
  deleteEdge,
  deleteNode,
  deleteSource,
  fetchState,
  mergeNodes,
  searchKnowledge,
  syncNow,
  updateEdge,
  updateNode,
  uploadSource
} from "./api";
import { BottomPanel } from "./components/BottomPanel";
import { LoginPage } from "./components/LoginPage";
import { MobileDock } from "./components/MobileDock";
import { RightPanel } from "./components/RightPanel";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { UploadPanel } from "./components/UploadPanel";
import { Workspace } from "./components/Workspace";
import { isSupabaseAuthConfigured, supabase, type AuthSession } from "./supabaseClient";
import type { AnswerResponse, DashboardState, SearchResult, SyncStatus, ViewKey } from "./types";

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [state, setState] = useState<DashboardState | null>(null);
  const [view, setView] = useState<ViewKey>("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [notice, setNotice] = useState("正在加载知识库...");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? "syncing" : "offline");

  useEffect(() => {
    configureApiAuth(async () => session?.access_token ?? null);
  }, [session]);

  useEffect(() => {
    if (!supabase || !isSupabaseAuthConfigured) {
      setAuthLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setState(null);
        setSelectedNodeId(undefined);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const online = () => setSyncStatus("syncing");
    const offline = () => setSyncStatus("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setNotice("当前离线，无法连接云端后端。");
      return;
    }
    setSyncStatus("syncing");
    try {
      const nextState = await fetchState();
      setState(nextState);
      setSelectedNodeId((current) =>
        current && nextState.nodes.some((node) => node.id === current)
          ? current
          : nextState.nodes.find((node) => node.name.toLowerCase().includes("rag"))?.id ?? nextState.nodes[0]?.id
      );
      setSyncStatus("synced");
      setNotice("知识库已与云端同步");
    } catch (error) {
      setSyncStatus("failed");
      setNotice(error instanceof Error ? error.message : "同步失败");
    }
  }, [session]);

  useEffect(() => {
    if (session) void load();
  }, [load, session]);

  const selectedNode = useMemo(() => state?.nodes.find((node) => node.id === selectedNodeId), [selectedNodeId, state]);
  const selectedSource = useMemo(() => {
    if (!state) return undefined;
    if (selectedNodeId?.startsWith("source:")) {
      return state.sources.find((source) => source.id === selectedNodeId.replace("source:", ""));
    }
    if (selectedNode?.nodeType === "source") {
      const sourceId = selectedNode.id.replace("source:", "");
      return state.sources.find((source) => source.id === sourceId);
    }
    const firstSourceId = selectedNode?.sourceIds[0];
    return firstSourceId ? state.sources.find((source) => source.id === firstSourceId) : undefined;
  }, [selectedNode, selectedNodeId, state]);

  async function handleUpload(formData: FormData) {
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setNotice("离线时无法上传资料，请恢复网络后重试。");
      return;
    }
    setSyncStatus("syncing");
    setNotice("正在解析资料...");
    try {
      await uploadSource(formData);
      await load();
      setNotice("资料已导入，并生成摘要、概念和图谱关系");
    } catch (error) {
      setSyncStatus("failed");
      setNotice(error instanceof Error ? error.message : "资料导入失败，请稍后重试。");
    }
  }

  async function handleSearch(query: string) {
    try {
      setNotice(`正在搜索：${query}`);
      const payload = await searchKnowledge(query);
      setSearchResults(payload.results);
      setView("graph");
      if (payload.results[0]) {
        setSelectedNodeId(`source:${payload.results[0].sourceId}`);
      }
      setNotice(`找到 ${payload.results.length} 条相关片段`);
    } catch (error) {
      setSearchResults([]);
      setNotice(error instanceof Error ? error.message : "搜索失败，请稍后重试。");
    }
  }

  async function handleAsk(question: string) {
    if (!navigator.onLine) {
      setSyncStatus("offline");
      const message = "离线时 AI 问答不可用，请恢复网络后重试。";
      setAnswer({ answer: message, citations: [], relatedConcepts: [], provider: "offline", fallback: true });
      setNotice(message);
      return;
    }
    setNotice("正在基于资料库生成回答...");
    setAnswer(null);
    try {
      const payload = await askKnowledge(question);
      setAnswer(payload);
      if (payload.citations[0]) setSelectedNodeId(`source:${payload.citations[0].sourceId}`);
      setNotice(payload.fallback ? "回答已生成：外部模型不可用或未配置，已使用本地规则 fallback" : `回答已由 ${payload.provider} 生成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "资料库问答失败，请稍后重试。";
      setAnswer({
        answer: message,
        citations: [],
        relatedConcepts: [],
        provider: "error",
        fallback: true
      });
      setNotice(message);
    }
  }

  async function handleCreateProject(name: string) {
    await createProject(name);
    await load();
    setNotice(`项目“${name}”已创建`);
  }

  function selectSource(sourceId: string) {
    setSelectedNodeId(`source:${sourceId}`);
    setView("source");
  }

  async function mutateGraph(action: () => Promise<unknown>, success: string) {
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setNotice("当前离线，修改无法写入云端。");
      return;
    }
    setSyncStatus("syncing");
    await action();
    await load();
    setNotice(success);
  }

  async function handleDeleteSource(sourceId: string) {
    await mutateGraph(async () => {
      await deleteSource(sourceId);
      setSelectedNodeId(undefined);
      setView("library");
    }, "资料已删除，并同步移除相关节点和关系");
  }

  async function handleDeleteNode(id: string) {
    if (id.startsWith("source:")) {
      await handleDeleteSource(id.replace("source:", ""));
      return;
    }
    await mutateGraph(() => deleteNode(id), "节点已删除，并写入纠错记忆");
  }

  async function handleManualSync() {
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setNotice("当前离线，无法手动同步。");
      return;
    }
    setSyncStatus("syncing");
    try {
      const nextState = await syncNow();
      setState(nextState);
      setSyncStatus("synced");
      setNotice("已手动刷新云端数据");
    } catch (error) {
      setSyncStatus("failed");
      setNotice(error instanceof Error ? error.message : "手动同步失败");
    }
  }

  async function handleLogout() {
    await supabase?.auth.signOut();
    setSession(null);
    setState(null);
    setNotice("已退出登录");
  }

  if (authLoading) {
    return <main className="workspace loading">正在连接 MindWeave Cloud...</main>;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        state={state}
        view={view}
        onViewChange={setView}
        onUpload={handleUpload}
        onCreateProject={handleCreateProject}
        onSelectSource={selectSource}
      />
      <TopBar
        state={state}
        onSearch={handleSearch}
        syncStatus={syncStatus}
        userEmail={session.user.email}
        onSync={handleManualSync}
        onLogout={handleLogout}
      />
      <div className="mobile-capture">
        <UploadPanel state={state} onUpload={handleUpload} />
      </div>
      {state ? (
        <Workspace
          state={state}
          view={view}
          selectedNodeId={selectedNodeId}
          selectedSource={selectedSource}
          searchResults={searchResults}
          onSelectNode={setSelectedNodeId}
          onSelectSource={selectSource}
          onDeleteSource={handleDeleteSource}
        />
      ) : (
        <main className="workspace loading">加载 MindWeave...</main>
      )}
      <RightPanel
        state={state}
        selectedNode={selectedNode}
        selectedSource={selectedSource}
        answer={answer}
        onAsk={handleAsk}
        onSelectSource={selectSource}
        onOpenSourceDetail={selectSource}
        onUpdateNode={(id, updates) => mutateGraph(() => updateNode(id, updates), "节点已保存")}
        onConfirmNode={(id) => mutateGraph(() => confirmNode(id), "节点已确认")}
        onDeleteNode={handleDeleteNode}
        onMergeNodes={(sourceNodeId, targetNodeId, canonicalName) =>
          mutateGraph(() => mergeNodes(sourceNodeId, targetNodeId, canonicalName), "节点已合并，并保存实体别名规则")
        }
        onAddNode={(payload) => mutateGraph(() => addNode(payload), "节点已新增")}
        onAddEdge={(payload) => mutateGraph(() => addEdge(payload), "关系已新增")}
        onUpdateEdge={(id, updates) => mutateGraph(() => updateEdge(id, updates), "关系已保存")}
        onDeleteEdge={(id) => mutateGraph(() => deleteEdge(id), "关系已删除")}
        onAddStopword={(word) => mutateGraph(() => addStopword(word), "停用词已保存，后续生成会自动过滤")}
      />
      <BottomPanel state={state} selectedSource={selectedSource} />
      <MobileDock view={view} onViewChange={setView} />
      <div className="toast" role="status">{notice}</div>
    </div>
  );
}
