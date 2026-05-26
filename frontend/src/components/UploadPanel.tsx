import { FileUp, Link2, Send, Type, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import type { DashboardState } from "../types";

interface UploadPanelProps {
  state: DashboardState | null;
  onUpload: (formData: FormData) => Promise<void>;
}

export function UploadPanel({ state, onUpload }: UploadPanelProps) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"file" | "url" | "text">("file");

  async function submit(formData: FormData) {
    setBusy(true);
    try {
      const projectId = state?.projects[0]?.id;
      if (projectId) formData.set("projectId", projectId);
      await onUpload(formData);
      setUrl("");
      setRawText("");
      if (fileInput.current) fileInput.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="upload-panel">
      <div className="segmented" role="tablist" aria-label="导入类型">
        <button type="button" className={mode === "file" ? "selected" : ""} onClick={() => setMode("file")} title="上传文件">
          <FileUp size={15} />
        </button>
        <button type="button" className={mode === "url" ? "selected" : ""} onClick={() => setMode("url")} title="导入网页">
          <Link2 size={15} />
        </button>
        <button type="button" className={mode === "text" ? "selected" : ""} onClick={() => setMode("text")} title="粘贴文本">
          <Type size={15} />
        </button>
      </div>

      {mode === "file" && (
        <div className="upload-drop">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md,.markdown"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const formData = new FormData();
              formData.set("file", file);
              void submit(formData);
            }}
          />
          <UploadCloud size={20} />
          <span>{busy ? "解析中" : "PDF / TXT / MD"}</span>
        </div>
      )}

      {mode === "url" && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!url.trim()) return;
            const formData = new FormData();
            formData.set("url", url.trim());
            void submit(formData);
          }}
        >
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="网页 URL" />
          <button type="submit" disabled={busy} title="导入网页">
            <Send size={15} />
          </button>
        </form>
      )}

      {mode === "text" && (
        <form
          className="text-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rawText.trim()) return;
            const formData = new FormData();
            formData.set("rawText", rawText.trim());
            formData.set("title", rawText.trim().slice(0, 28));
            void submit(formData);
          }}
        >
          <textarea value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="粘贴笔记或片段" />
          <button type="submit" disabled={busy}>
            <Send size={15} />
            <span>导入</span>
          </button>
        </form>
      )}
    </section>
  );
}
