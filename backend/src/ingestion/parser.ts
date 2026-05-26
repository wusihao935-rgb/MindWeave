import * as cheerio from "cheerio";
import type { ParsedSource, SourceType } from "../types.js";
import { cleanText, extractTitle } from "../utils/text.js";

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
  const extension = originalName.split(".").pop()?.toLowerCase();
  const type = detectSourceType(extension);
  let content = "";

  if (type === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(file.buffer);
    content = result.text;
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
  const response = await fetch(url, {
    headers: {
      "user-agent": "MindWeavePrototype/0.1"
    }
  });
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

function detectSourceType(extension?: string): SourceType {
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "txt") return "txt";
  return "unknown";
}
