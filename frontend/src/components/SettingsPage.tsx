import { CheckCircle2, Eye, EyeOff, KeyRound, RefreshCw, Save, SlidersHorizontal, TestTube2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listProviderSettings, saveProviderSetting, testProviderSetting } from "../api";
import type { ApiProviderName, PublicApiProviderSetting } from "../types";

const providers: Array<{ value: ApiProviderName; label: string; baseUrl: string; chat: string; embedding: string }> = [
  { value: "openai-compatible", label: "OpenAI-compatible API", baseUrl: "https://api.openai.com/v1", chat: "gpt-4o-mini", embedding: "text-embedding-3-small" },
  { value: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", chat: "deepseek-chat", embedding: "deepseek-chat" },
  { value: "qwen", label: "Qwen / 通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", chat: "qwen-plus", embedding: "text-embedding-v3" },
  { value: "moonshot", label: "Moonshot / Kimi", baseUrl: "https://api.moonshot.cn/v1", chat: "moonshot-v1-8k", embedding: "moonshot-v1-8k" },
  { value: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", chat: "gemini-1.5-flash", embedding: "text-embedding-004" },
  { value: "claude-compatible", label: "Claude-compatible API", baseUrl: "https://api.anthropic.com/v1", chat: "claude-3-5-sonnet-latest", embedding: "text-embedding-3-small" },
  { value: "custom", label: "自定义 Endpoint", baseUrl: "", chat: "", embedding: "" }
];

const emptyForm = {
  id: "",
  providerName: "openai-compatible" as ApiProviderName,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  chatModel: "gpt-4o-mini",
  embeddingModel: "text-embedding-3-small",
  visionModel: "",
  asrModel: "",
  enabled: true
};

export function SettingsPage() {
  const [items, setItems] = useState<PublicApiProviderSetting[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [notice, setNotice] = useState("API Key 只会提交给后端加密保存，前端不会读取已保存的明文。");
  const [busy, setBusy] = useState(false);

  async function load() {
    const payload = await listProviderSettings();
    setItems(payload.providers);
  }

  useEffect(() => {
    void load().catch((error) => setNotice(error.message));
  }, []);

  const active = useMemo(() => items.find((item) => item.enabled), [items]);

  function updateProvider(providerName: ApiProviderName) {
    const preset = providers.find((item) => item.value === providerName) ?? providers[0];
    setForm((current) => ({
      ...current,
      providerName,
      baseUrl: current.baseUrl && current.providerName === "custom" ? current.baseUrl : preset.baseUrl,
      chatModel: current.chatModel && current.providerName === "custom" ? current.chatModel : preset.chat,
      embeddingModel: current.embeddingModel && current.providerName === "custom" ? current.embeddingModel : preset.embedding
    }));
  }

  function edit(item: PublicApiProviderSetting) {
    setForm({
      id: item.id,
      providerName: item.providerName,
      baseUrl: item.baseUrl,
      apiKey: "",
      chatModel: item.chatModel,
      embeddingModel: item.embeddingModel,
      visionModel: item.visionModel ?? "",
      asrModel: item.asrModel ?? "",
      enabled: item.enabled
    });
    setNotice("正在编辑已保存的模型设置；留空 API Key 会保留后端已加密的密钥。");
  }

  async function save() {
    setBusy(true);
    try {
      const payload = await saveProviderSetting(form);
      setNotice(`已保存 ${payload.provider.providerName} 设置。`);
      setForm((current) => ({ ...current, id: payload.provider.id, apiKey: "" }));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const payload = await testProviderSetting(form);
      setNotice(payload.ok ? `连接成功：${payload.message ?? "OK"}` : payload.error ?? "连接失败。");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "连接失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace scrollable settings-page">
      <div className="section-header">
        <div>
          <SlidersHorizontal size={19} />
        </div>
        <div>
          <h2>设置 / 模型设置</h2>
          <p>{active ? `当前启用：${active.providerName} · ${active.chatModel}` : "未启用外部模型时，摘要和图谱会继续使用本地规则 fallback。"}</p>
        </div>
      </div>

      <section className="settings-grid">
        <article className="settings-card">
          <div className="panel-title">
            <KeyRound size={17} />
            <span>Provider</span>
          </div>
          <div className="settings-form">
            <label>
              <span>Provider</span>
              <select value={form.providerName} onChange={(event) => updateProvider(event.target.value as ApiProviderName)}>
                {providers.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>API Base URL</span>
              <input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" />
            </label>
            <label>
              <span>API Key</span>
              <div className="secret-input">
                <input
                  type={showKey ? "text" : "password"}
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={form.id ? "留空则保留已保存密钥" : "sk-..."}
                />
                <button type="button" onClick={() => setShowKey((value) => !value)} title={showKey ? "隐藏 API Key" : "显示 API Key"}>
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label>
              <span>Chat 模型</span>
              <input value={form.chatModel} onChange={(event) => setForm({ ...form, chatModel: event.target.value })} />
            </label>
            <label>
              <span>Embedding 模型</span>
              <input value={form.embeddingModel} onChange={(event) => setForm({ ...form, embeddingModel: event.target.value })} />
            </label>
            <label>
              <span>Vision 模型，可选</span>
              <input value={form.visionModel} onChange={(event) => setForm({ ...form, visionModel: event.target.value })} />
            </label>
            <label>
              <span>ASR 模型，可选</span>
              <input value={form.asrModel} onChange={(event) => setForm({ ...form, asrModel: event.target.value })} />
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
              <span>启用该 Provider</span>
            </label>
          </div>
          <div className="settings-actions">
            <button type="button" disabled={busy} onClick={save}>
              <Save size={15} />
              <span>保存</span>
            </button>
            <button type="button" disabled={busy} onClick={test}>
              <TestTube2 size={15} />
              <span>测试连接</span>
            </button>
          </div>
          <p className="settings-notice">{notice}</p>
        </article>

        <article className="settings-card">
          <div className="panel-title">
            <CheckCircle2 size={17} />
            <span>已保存配置</span>
          </div>
          <div className="provider-list">
            {items.map((item) => (
              <button key={item.id} type="button" onClick={() => edit(item)}>
                <strong>{item.providerName}</strong>
                <span>{item.baseUrl}</span>
                <small>
                  {item.enabled ? "已启用" : "未启用"} · {item.hasApiKey ? "已保存 Key" : "未保存 Key"} · {item.chatModel}
                </small>
              </button>
            ))}
            {!items.length && <p className="muted">还没有模型配置。保存后，AI 问答会优先调用启用的 Provider。</p>}
          </div>
          <button className="secondary-action" type="button" onClick={() => void load()}>
            <RefreshCw size={15} />
            <span>刷新配置</span>
          </button>
        </article>
      </section>
    </main>
  );
}
