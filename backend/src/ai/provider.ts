import type { ApiProviderSetting, RelationEdge, StructuredSummary } from "../types.js";
import { splitSentences, truncate } from "../utils/text.js";
import { decryptProviderApiKey } from "../supabase/cloudRepository.js";

const aiRequestTimeoutMs = numberFromEnv("AI_REQUEST_TIMEOUT_MS", 25_000);

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
  summarize(text: string): Promise<StructuredSummary>;
  extractEntities(text: string): Promise<string[]>;
  extractRelations(text: string, entities: string[]): Promise<Array<Pick<RelationEdge, "sourceNode" | "targetNode" | "relationType" | "evidence">>>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  transcribeAudio(audio: Buffer, filename?: string): Promise<string>;
  analyzeImage(image: Buffer, prompt: string): Promise<string>;
}

export class LocalRuleProvider implements AIProvider {
  name = "local-rule-fallback";

  async chat(messages: ChatMessage[]) {
    const question = messages.at(-1)?.content ?? "";
    return `当前没有启用外部模型，已使用本地规则 fallback。问题：${truncate(question, 180)}`;
  }

  async summarize(text: string): Promise<StructuredSummary> {
    const sentences = splitSentences(text).slice(0, 8);
    return {
      background: truncate(sentences[0] ?? text, 220),
      keyPoints: sentences.slice(1, 4).map((sentence) => truncate(sentence, 160)),
      evidence: sentences.slice(4, 6).map((sentence) => truncate(sentence, 160)),
      takeaways: sentences.slice(6, 8).map((sentence) => truncate(sentence, 160))
    };
  }

  async extractEntities(text: string) {
    return Array.from(new Set(splitSentences(text).flatMap((sentence) => sentence.match(/[A-Za-z][A-Za-z0-9+#.-]{2,}|[\u3400-\u9fff]{2,8}/g) ?? []))).slice(0, 20);
  }

  async extractRelations() {
    return [];
  }

  async generateEmbeddings(texts: string[]) {
    return texts.map(() => []);
  }

  async transcribeAudio(): Promise<string> {
    throw new Error("离线或未配置模型时暂不支持音频转写。");
  }

  async analyzeImage(): Promise<string> {
    throw new Error("离线或未配置模型时暂不支持图片分析。");
  }
}

export function createAIProvider(setting: ApiProviderSetting | null): AIProvider {
  if (!setting || !setting.enabled || !setting.apiKeyEncrypted) return new LocalRuleProvider();
  const apiKey = decryptProviderApiKey(setting);
  if (!apiKey) return new LocalRuleProvider();
  return new RemoteAIProvider(setting, apiKey);
}

class RemoteAIProvider implements AIProvider {
  name: string;

  constructor(
    private readonly setting: ApiProviderSetting,
    private readonly apiKey: string
  ) {
    this.name = setting.providerName;
  }

  async chat(messages: ChatMessage[]) {
    if (this.setting.providerName === "gemini") return this.geminiChat(messages);
    const payload = await this.openAIRequest("/chat/completions", {
      model: this.setting.chatModel,
      messages,
      temperature: 0.2
    });
    return payload.choices?.[0]?.message?.content ?? "";
  }

  async summarize(text: string): Promise<StructuredSummary> {
    const content = await this.chat([
      { role: "system", content: "你是个人知识管理 App 的摘要引擎。请输出 JSON：background, keyPoints, evidence, takeaways。" },
      { role: "user", content: truncate(text, 6000) }
    ]);
    return parseStructuredSummary(content, await new LocalRuleProvider().summarize(text));
  }

  async extractEntities(text: string) {
    const content = await this.chat([
      { role: "system", content: "从文本中抽取适合知识图谱的实体/概念，只输出 JSON 字符串数组。" },
      { role: "user", content: truncate(text, 6000) }
    ]);
    return parseJsonArray(content);
  }

  async extractRelations(text: string, entities: string[]) {
    const content = await this.chat([
      { role: "system", content: "从文本中抽取实体关系，只输出 JSON 数组，字段 sourceNode,targetNode,relationType,evidence。" },
      { role: "user", content: JSON.stringify({ text: truncate(text, 6000), entities }) }
    ]);
    return parseJsonArray(content);
  }

  async generateEmbeddings(texts: string[]) {
    if (this.setting.providerName === "gemini") {
      // TODO: Gemini embeddings use a separate endpoint shape; keep local vector fallback until wired.
      return texts.map(() => []);
    }
    const payload = await this.openAIRequest("/embeddings", {
      model: this.setting.embeddingModel,
      input: texts
    });
    return (payload.data ?? []).map((item: any) => item.embedding ?? []);
  }

  async transcribeAudio(audio: Buffer, filename = "audio.webm") {
    if (!this.setting.asrModel) throw new Error("当前 Provider 未配置 ASR 模型。");
    const form = new FormData();
    form.set("model", this.setting.asrModel);
    form.set("file", new Blob([new Uint8Array(audio)]), filename);
    const response = await fetchWithTimeout(`${trimSlash(this.setting.baseUrl)}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form
    }, aiRequestTimeoutMs, "ASR 调用超时。");
    if (!response.ok) throw new Error(`ASR 调用失败：${response.status}`);
    const payload = await response.json();
    return payload.text ?? "";
  }

  async analyzeImage(_image: Buffer, prompt: string) {
    if (!this.setting.visionModel) throw new Error("当前 Provider 未配置 Vision 模型。");
    // TODO: 接入多模态图片上传/URL 转换，当前先通过统一 chat 提供明确失败路径。
    return this.chat([
      { role: "system", content: "你是图片分析助手。当前后端尚未把图片二进制转成 provider 所需格式。" },
      { role: "user", content: prompt }
    ]);
  }

  private async openAIRequest(pathname: string, body: unknown) {
    const response = await fetchWithTimeout(
      `${trimSlash(this.setting.baseUrl)}${pathname}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      },
      aiRequestTimeoutMs,
      "模型服务调用超时。"
    );
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`模型服务调用失败：${response.status} ${truncate(message, 180)}`);
    }
    return response.json();
  }

  private async geminiChat(messages: ChatMessage[]) {
    const base = trimSlash(this.setting.baseUrl || "https://generativelanguage.googleapis.com/v1beta");
    const response = await fetchWithTimeout(
      `${base}/models/${encodeURIComponent(this.setting.chatModel)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages
            .filter((message) => message.role !== "system")
            .map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
          systemInstruction: {
            parts: [{ text: messages.find((message) => message.role === "system")?.content ?? "You are a helpful assistant." }]
          }
        })
      },
      aiRequestTimeoutMs,
      "Gemini 调用超时。"
    );
    if (!response.ok) throw new Error(`Gemini 调用失败：${response.status}`);
    const payload = await response.json();
    return payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join("") ?? "";
  }
}

function parseStructuredSummary(text: string, fallback: StructuredSummary): StructuredSummary {
  try {
    const parsed = JSON.parse(extractJson(text));
    return {
      background: String(parsed.background ?? fallback.background),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String).slice(0, 6) : fallback.keyPoints,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String).slice(0, 6) : fallback.evidence,
      takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.map(String).slice(0, 6) : fallback.takeaways
    };
  } catch {
    return fallback;
  }
}

function parseJsonArray(text: string): any[] {
  try {
    const parsed = JSON.parse(extractJson(text));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractJson(text: string) {
  const start = text.indexOf("[") >= 0 ? text.indexOf("[") : text.indexOf("{");
  const end = text.lastIndexOf("]") > text.lastIndexOf("}") ? text.lastIndexOf("]") : text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, timeoutMessage: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${timeoutMessage} 请检查模型服务地址、网络或稍后重试。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
