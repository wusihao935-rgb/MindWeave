import type { AnswerResponse, DashboardState, PublicApiProviderSetting, SearchResult } from "./types";

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || "").replace(/\/+$/, "");
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
let tokenProvider: (() => Promise<string | null>) | null = null;

export function configureApiAuth(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

async function request<T>(url: string, options: ApiRequestInit = {}): Promise<T> {
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error("生产环境缺少 VITE_API_BASE_URL，请配置公网后端地址。");
  }
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal, ...requestOptions } = options;
  const token = tokenProvider ? await tokenProvider() : null;
  const headers = new Headers(requestOptions.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(`${API_BASE}${url}`, { ...requestOptions, headers, signal: controller.signal });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `请求失败（${response.status}）`);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`请求超时，请检查网络或稍后重试。（${Math.round(timeoutMs / 1000)} 秒）`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function readResponsePayload(response: Response): Promise<Record<string, any>> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => "");
  return text ? { message: text.slice(0, 180) } : {};
}

export function fetchState() {
  return request<DashboardState>("/api/state");
}

export function syncNow() {
  return request<DashboardState>("/api/sync", { method: "POST" });
}

export function uploadSource(formData: FormData) {
  return request("/api/sources", {
    method: "POST",
    body: formData,
    timeoutMs: 120_000
  });
}

export function deleteSource(id: string) {
  return request(`/api/sources/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function searchKnowledge(query: string) {
  return request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query)}`);
}

export function askKnowledge(question: string) {
  return request<AnswerResponse>("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    timeoutMs: 20_000
  });
}

export function createProject(name: string, description = "") {
  return request("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description })
  });
}

export function updateNode(id: string, updates: Record<string, unknown>) {
  return request(`/api/graph/nodes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
}

export function confirmNode(id: string) {
  return request(`/api/graph/nodes/${encodeURIComponent(id)}/confirm`, {
    method: "POST"
  });
}

export function deleteNode(id: string, addToStopwords = true) {
  return request(`/api/graph/nodes/${encodeURIComponent(id)}?stopword=${addToStopwords ? "true" : "false"}`, {
    method: "DELETE"
  });
}

export function mergeNodes(sourceNodeId: string, targetNodeId: string, canonicalName?: string) {
  return request("/api/graph/nodes/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceNodeId, targetNodeId, canonicalName })
  });
}

export function addNode(payload: Record<string, unknown>) {
  return request("/api/graph/nodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function addEdge(payload: Record<string, unknown>) {
  return request("/api/graph/edges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateEdge(id: string, updates: Record<string, unknown>) {
  return request(`/api/graph/edges/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
}

export function deleteEdge(id: string) {
  return request(`/api/graph/edges/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function addStopword(word: string) {
  return request("/api/rules/stopwords", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word })
  });
}

export function listProviderSettings() {
  return request<{ providers: PublicApiProviderSetting[] }>("/api/settings/ai-providers");
}

export function saveProviderSetting(payload: Record<string, unknown>) {
  return request<{ provider: PublicApiProviderSetting }>("/api/settings/ai-providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function testProviderSetting(payload: Record<string, unknown>) {
  return request<{ ok: boolean; message?: string; error?: string }>("/api/settings/ai-providers/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 35_000
  });
}
