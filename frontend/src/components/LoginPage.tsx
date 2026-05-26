import { Network, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { isSupabaseAuthConfigured, supabase } from "../supabaseClient";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("登录后，手机和电脑会连接同一个云端知识库。");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!supabase) {
      setNotice("缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，请先配置前端环境变量。");
      return;
    }
    setBusy(true);
    try {
      const action =
        mode === "login"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { error } = await action;
      if (error) throw error;
      setNotice(mode === "login" ? "登录成功，正在进入知识库。" : "注册成功，请按 Supabase Auth 配置完成邮箱验证后登录。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "认证失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <div className="brand-mark">
            <Network size={20} />
          </div>
          <div>
            <strong>知织</strong>
            <span>MindWeave Cloud</span>
          </div>
        </div>
        <div className="login-copy">
          <ShieldCheck size={24} />
          <h1>登录你的个人知识库</h1>
          <p>{notice}</p>
        </div>
        {!isSupabaseAuthConfigured && <p className="auth-warning">前端 Supabase Auth 尚未配置，当前无法连接云端账号。</p>}
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="邮箱" />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="密码"
          />
          <button type="submit" disabled={busy || !email || !password}>
            {busy ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>
        </form>
        <button className="link-button" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
        </button>
      </section>
    </main>
  );
}
