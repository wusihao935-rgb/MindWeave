import type { NextFunction, Request, Response } from "express";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin.js";

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    email?: string;
    accessToken?: string;
    mode: "supabase" | "local";
  };
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!isSupabaseConfigured()) {
    if (process.env.ALLOW_LOCAL_FALLBACK !== "true") {
      res.status(503).json({ error: "Supabase Auth 未配置，已拒绝未登录数据访问。" });
      return;
    }
    (req as AuthenticatedRequest).auth = {
      userId: "local-dev-user",
      email: "local-dev@mindweave.local",
      mode: "local"
    };
    next();
    return;
  }

  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    res.status(401).json({ error: "请先登录。" });
    return;
  }

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "登录状态已失效，请重新登录。" });
    return;
  }

  (req as AuthenticatedRequest).auth = {
    userId: data.user.id,
    email: data.user.email ?? undefined,
    accessToken: token,
    mode: "supabase"
  };
  next();
}
