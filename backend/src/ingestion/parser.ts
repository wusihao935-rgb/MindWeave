import * as cheerio from "cheerio";
import type { ParsedSource, SourceType } from "../types.js";
import { cleanText, extractTitle } from "../utils/text.js";

const pdfParseTimeoutMs = numberFromEnv("PDF_PARSE_TIMEOUT_MS", 45_000);
const sourceUrlFetchTimeoutMs = numberFromEnv("SOURCE_URL_FETCH_TIMEOUT_MS", 20_000);

interface ParseInput {
  file?: Express.Multer.File;
  url?: string;
  rawText?: string;
  title?: string;
}

export async function parseSourceInput(input: ParseInput): Promise<ParsedSource> {
  if (input.file) return parseFile(input.file, input.title);
  if (input.url) return parseUrl(input.url);
  if (input.rawText) {
    const content = cleanText(input.rawText);
    return {
      type: "note",
      title: input.title || extractTitle(content, "粘贴笔记"),
      content
    };
  }
  throw new Error("请上传文件、填写网页 URL，或粘贴一段文本。");
}

async function parseFile(file: Express.Multer.File, explicitTitle?: string): Promise<ParsedSource> {
  const originalName = file.originalname || "uploaded-source";
  const type = detectSourceType(file);
  let content = "";

  if (type === "pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await withTimeout(pdfParse(file.buffer), pdfParseTimeoutMs, "PDF 文本提取超时，请尝试拆分文件或转换为文本后再导入。");
      content = result.text;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      throw new Error(`PDF 文本提取失败：${detail}`);
    }
  } else {
    content = file.buffer.toString("utf-8");
  }

  content = cleanText(content);
  return {
    type,
    title: explicitTitle || extractTitle(content, originalName),
    content,
    filePath: originalName
  };
}

async function parseUrl(url: string): Promise<ParsedSource> {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "user-agent": "MindWeavePrototype/0.1"
      }
    },
    sourceUrlFetchTimeoutMs,
    "网页抓取超时，请稍后重试或粘贴正文。"
  );
  if (!response.ok) {
    throw new Error(`网页抓取失败：${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, iframe, noscript").remove();
  const title = $("meta[property='og:title']").attr("content") || $("title").first().text() || url;
  const mainText =
    $("article").text() ||
    $("main").text() ||
    $("[role='main']").text() ||
    $("body").text();

  const content = cleanText(mainText);
  if (!content) throw new Error("没有从该网页提取到可读正文。");

  return {
    type: "web",
    title: cleanText(title).slice(0, 100),
    content,
    url
  };
}

function detectSourceType(file: Express.Multer.File): SourceType {
  const originalName = file.originalname || "";
  const extension = originalName.split(".").pop()?.toLowerCase();
  const mimeType = file.mimetype?.toLowerCase() || "";
  const header = file.buffer.subarray(0, 5).toString("utf-8");
  if (extension === "pdf" || mimeType === "application/pdf" || header === "%PDF-") return "pdf";
  if (extension === "md" || extension === "markdown" || mimeType.includes("markdown")) return "markdown";
  if (extension === "txt" || mimeType.startsWith("text/")) return "txt";
  return "unknown";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, timeoutMessage: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(timeoutMessage);
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
