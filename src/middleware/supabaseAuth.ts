import { Request, Response, NextFunction } from "express";
import { jwtVerify, createRemoteJWKSet, JWTPayload } from "jose";
import { cfg } from "../config.js";

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: AuthUser;
      __start?: number;
      __trace_id?: string;
    }
  }
}

/**
 * Verifica JWT do Supabase. Tenta primeiro JWKS (assinatura assimetrica - novo padrao),
 * cai para o segredo HS256 (legado, ainda padrao em muitos projetos).
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks && cfg.supabase.url) {
    jwks = createRemoteJWKSet(new URL(`${cfg.supabase.url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

async function verifyToken(token: string): Promise<JWTPayload> {
  // 1) tenta JWKS (RS256/ES256)
  const remoteJwks = getJwks();
  if (remoteJwks) {
    try {
      const { payload } = await jwtVerify(token, remoteJwks, {
        issuer: `${cfg.supabase.url}/auth/v1`,
        audience: "authenticated",
      });
      return payload;
    } catch {
      // segue para HS256
    }
  }

  // 2) fallback HS256 com JWT secret
  if (!cfg.supabase.jwtSecret) {
    throw new Error("Sem JWKS valido e sem SUPABASE_JWT_SECRET configurado");
  }
  const secret = new TextEncoder().encode(cfg.supabase.jwtSecret);
  const { payload } = await jwtVerify(token, secret, {
    issuer: `${cfg.supabase.url}/auth/v1`,
    audience: "authenticated",
  });
  return payload;
}

export async function supabaseAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: "missing_bearer_token" });
  }

  try {
    const payload = await verifyToken(token);
    if (!payload.sub) {
      return res.status(401).json({ error: "invalid_token_no_sub" });
    }
    res.locals.user = {
      id: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
    };
    return next();
  } catch (err: any) {
    return res.status(401).json({ error: "invalid_jwt", detail: err?.message });
  }
}
