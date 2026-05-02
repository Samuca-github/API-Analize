import { Router } from "express";
export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => res.json({ ok: true }));
healthRouter.get("/version", (_req, res) => res.json({ version: "0.1.0" }));
