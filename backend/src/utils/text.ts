const CJK_RANGE = /[\u3400-\u9fff]/;

export const DEFAULT_STOPWORDS = [
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "are",
  "was",
  "were",
  "is",
  "of",
  "to",
  "in",
  "on",
  "as",
  "by",
  "or",
  "an",
  "a",
  "we",
  "you",
  "your",
  "can",
  "will",
  "we",
  "they",
  "them",
  "ours",
  "我",
  "你",
  "他",
  "她",
  "它",
  "我们",
  "你们",
  "他们",
  "这个",
  "那个",
  "问题",
  "东西",
  "内容",
  "资料",
  "方面",
  "情况",
  "时候",
  "一个",
  "一些",
  "很多",
  "可以",
  "需要",
  "进行",
  "通过",
  "认为",
  "表示",
  "提到",
  "用户",
  "系统",
  "支持",
  "一种",
  "这些",
  "以及",
  "实现",
  "自动",
  "相关",
  "模块",
  "来说",
  "如果",
  "因为",
  "但是",
  "没有",
  "还是",
  "应该",
  "能够",
  "然后",
  "就是",
  "视频",
  "访谈",
  "小时",
  "新建",
  "标签页"
];

const STOPWORDS = new Set(DEFAULT_STOPWORDS);

const CHINESE_SURNAMES =
  "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公万俟司马上官欧阳夏侯诸葛闻人东方赫连皇甫尉迟公羊澹台公冶宗政濮阳淳于单于太叔申屠公孙仲孙轩辕令狐钟离宇文长孙慕容鲜于闾丘司徒司空";

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function slugify(value: string): string {
  const slug = normalizeEntityName(value)
    .toLowerCase()
    .replace(/[^\w\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || createId("slug");
}

export function cleanText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(text: string, max = 180): string {
  const cleaned = cleanText(text).replace(/\n/g, " ");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}...`;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitSentences(text: string): string[] {
  const normalized = cleanText(text).replace(/\n+/g, " ");
  const parts = normalized
    .split(/(?<=[。！？!?；;])\s+|(?<=[。！？!?；;])|(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
  if (parts.length) return parts;
  return normalized
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function extractTitle(content: string, fallback: string): string {
  const lines = cleanText(content)
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line.length > 3 && line.length < 80);
  return lines[0] || fallback.replace(/\.[^.]+$/, "");
}

export function chunkText(text: string, sourceId: string, maxLength = 900) {
  const sentences = splitSentences(text);
  const chunks: { id: string; sourceId: string; text: string; index: number }[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if ((buffer + sentence).length > maxLength && buffer.length > 0) {
      chunks.push({ id: createId("chunk"), sourceId, text: buffer.trim(), index: chunks.length });
      buffer = "";
    }
    buffer += `${sentence} `;
  }

  if (buffer.trim()) {
    chunks.push({ id: createId("chunk"), sourceId, text: buffer.trim(), index: chunks.length });
  }

  if (!chunks.length && text.trim()) {
    chunks.push({ id: createId("chunk"), sourceId, text: truncate(text, maxLength), index: 0 });
  }

  return chunks;
}

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const latin = lower.match(/[a-z][a-z0-9+#.-]{1,}/g) ?? [];
  const cjkSequences = text.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  const cjkTokens: string[] = [];

  for (const seq of cjkSequences) {
    const clean = seq.trim();
    if (clean.length <= 8) {
      cjkTokens.push(clean);
    }
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i <= clean.length - size; i += 1) {
        cjkTokens.push(clean.slice(i, i + size));
      }
    }
  }

  return [...latin, ...cjkTokens].filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function termFrequency(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const token of tokens) {
    freq[token] = (freq[token] ?? 0) + 1;
  }
  return freq;
}

export function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, value] of Object.entries(a)) {
    normA += value * value;
    if (b[key]) dot += value * b[key];
  }
  for (const value of Object.values(b)) {
    normB += value * value;
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function extractKeywords(text: string, limit = 10): string[] {
  const tokens = [
    ...(text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []),
    ...extractChinesePersonNames(text),
    ...extractChinesePhrases(text)
  ];
  const frequencies = termFrequency(tokens.filter((token) => isUsefulNodeName(token)));
  const entries = Object.entries(frequencies).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);

  const selected: string[] = [];
  for (const [token] of entries) {
    if (selected.some((existing) => existing.includes(token) || token.includes(existing))) continue;
    selected.push(token);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function getStopwords(extra: string[] = []): Set<string> {
  return new Set([...DEFAULT_STOPWORDS, ...extra].map((word) => word.trim()).filter(Boolean));
}

export function isUsefulNodeName(name: string, extraStopwords: string[] = []): boolean {
  const normalized = normalizeEntityName(name);
  if (!normalized) return false;
  const stopwords = getStopwords(extraStopwords);
  if (stopwords.has(normalized) || stopwords.has(normalized.toLowerCase())) return false;
  if (/^[\d\s._-]+$/.test(normalized)) return false;
  if (/(不应该|应该|生成|真正|觉得|重要|上传|打开|允许|请|一下|来自|没有|不能)/.test(normalized)) return false;
  if (normalized.length < 2) return false;
  if (/^[\u3400-\u9fff]{2}$/.test(normalized) && !isKnownShortConcept(normalized)) return false;
  if (/^[\u3400-\u9fff]{2,3}$/.test(normalized) && stopwords.has(normalized)) return false;
  if (normalized.length > 40) return false;
  return true;
}

export function normalizeEntityName(name: string): string {
  return cleanText(name)
    .replace(/^["'“”‘’《<【[]+|["'“”‘’》>】\]]+$/g, "")
    .replace(/^(关于|对于|基于|使用|通过|介绍|讨论|分析)/, "")
    .replace(/(是什么|怎么办|如何|怎么|为什么)$/g, "")
    .replace(/[和与及或等、，。！？；：]+$/g, "")
    .trim();
}

export function extractChinesePersonNames(text: string): string[] {
  const candidates = new Set<string>();
  const compact = text.replace(/\s+/g, "");
  const pattern = new RegExp(`[${CHINESE_SURNAMES}][\\u4e00-\\u9fff]{1,2}`, "g");
  for (const match of compact.matchAll(pattern)) {
    const name = match[0];
    const next = compact.slice((match.index ?? 0) + name.length, (match.index ?? 0) + name.length + 6);
    const prev = compact.slice(Math.max(0, (match.index ?? 0) - 6), match.index ?? 0);
    if (STOPWORDS.has(name) || STOPWORDS.has(prev) || STOPWORDS.has(next)) continue;
    const hasPersonCue =
      /^(访谈|老师|教授|博士|院士|说|表示|认为|提到|讨论|回答|分享|采访|演讲|论文|团队)/.test(next) ||
      /(嘉宾|作者|学者|人物|采访|对话|主持人|嘉宾是|受访者|来自)$/.test(prev);
    if (/^[\u4e00-\u9fff]{3,4}$/.test(name) && hasPersonCue) candidates.add(name);
  }
  return Array.from(candidates);
}

export function extractChinesePhrases(text: string): string[] {
  const stopwordPattern = new RegExp(DEFAULT_STOPWORDS.map(escapeRegExp).join("|"), "g");
  const roughSegments = text
    .replace(/[，。！？、；：,.!?;:\n\r\t"'“”‘’（）()【】[\]<>]/g, "|")
    .split("|")
    .flatMap((segment) => segment.replace(stopwordPattern, "|").split("|"))
    .map((segment) => normalizeEntityName(segment))
    .filter((segment) => /[\u3400-\u9fff]/.test(segment));

  const phrases: string[] = [];
  for (const segment of roughSegments) {
    const cjk = segment.match(/[\u3400-\u9fffA-Za-z0-9+#.-]{3,16}/g) ?? [];
    for (const phrase of cjk) {
      const normalized = normalizeEntityName(phrase);
      if (isUsefulNodeName(normalized)) phrases.push(normalized);
    }
  }
  return phrases;
}

function isKnownShortConcept(name: string): boolean {
  return ["闪卡", "图谱", "复习", "检索", "摘要", "标签", "论文", "播客", "网页", "笔记"].includes(name);
}
