import { Router } from "express";
import { AnalyzeRequestSchema } from "../types.js";
import { extractFeatures } from "../services/features.js";
import { mlScore, type MLResult } from "../services/classifier.js";
import { finalizeFromMl } from "../utils/scoring.js";
import { supabaseAdmin } from "../services/supabase.js";
import { normalizeCategorySlug } from "../utils/taxonomy.js";
import {
  analyzedByToScansDb,
  confidenceToScansDb,
  labelToScansDb,
} from "../utils/scansDbMapping.js";

export const analyzeRouter = Router();

analyzeRouter.post("/", async (req, res, next) => {
  try {
    const parsed = AnalyzeRequestSchema.parse(req.body);
    const user = res.locals.user;
    if (!user) return res.status(401).json({ error: "unauthenticated" });

    const feats = extractFeatures(parsed);
    const mResult = await mlScore(parsed, feats);
    const verdict = finalizeFromMl(mResult);

    const categories = mergeUnique([], mResult.categories, 10);
    const explanations = mergeUnique(mResult.explanations, [], 10);

    const response = {
      result: {
        label: verdict.label,
        score: Number(verdict.score.toFixed(2)),
        confidence: verdict.confidence,
        categories,
        explanations,
        disagreement: false,
      },
      breakdown: {
        rules_score: 0,
        rules_label: null,
        ml_score: Number(mResult.score.toFixed(3)),
        ml_label: mResult.label ?? null,
        ml_confidence: mResult.confidence ?? null,
        analyzed_by: mResult.source,
      },
      features: feats,
      meta: {
        model: "analyze-core@0.3.0",
        latency_ms: res.locals.__start ? Date.now() - res.locals.__start : undefined,
        trace_id: res.locals.__trace_id,
        user_id: user.id,
      },
    };

    persistScan({
      userId: user.id,
      payload: parsed,
      features: feats,
      result: response.result,
      breakdown: response.breakdown,
      mResult,
      raw: response,
    }).catch((err) => console.error("[scans] persist failed:", err?.message ?? err));

    return res.json(response);
  } catch (err) {
    next(err);
  }
});

function mergeUnique(primary: string[], secondary: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const key = normalizeCategorySlug(String(item ?? "").trim());
    if (!key) continue;
    const norm = key.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out.length ? out : ["nenhum_sinal_critico"];
}

interface PersistArgs {
  userId: string;
  payload: any;
  features: any;
  result: {
    label: string;
    score: number;
    confidence: string;
    categories: string[];
    explanations: string[];
    disagreement: boolean;
  };
  breakdown: {
    rules_score: number;
    ml_score: number;
    rules_label: string | null;
    ml_label: string | null;
    ml_confidence: string | null;
    analyzed_by: string;
  };
  mResult: MLResult;
  raw: any;
}

async function persistScan({
  userId,
  payload,
  features,
  result,
  breakdown,
  mResult,
  raw,
}: PersistArgs) {
  const sb = supabaseAdmin();
  const { error } = await sb.from("scans").upsert(
    {
      user_id: userId,
      gmail_message_id: payload?.context?.gmail_message_id ?? null,
      gmail_thread_id: payload?.context?.gmail_thread_id ?? null,
      subject: payload?.email?.subject ?? null,
      from_address: payload?.email?.from ?? null,
      to_addresses: payload?.email?.to ?? null,
      label: labelToScansDb(result.label),
      score: result.score,
      confidence: confidenceToScansDb(result.confidence),
      categories: result.categories,
      explanations: result.explanations,
      features,
      raw_response: raw,
      source: payload?.context?.source ?? "gmail_extension",
      rules_score: breakdown.rules_score,
      ml_score: breakdown.ml_score,
      gpt_label:
        mResult.source === "gpt" && mResult.label != null ? labelToScansDb(mResult.label) : null,
      gpt_confidence:
        mResult.source === "gpt" && mResult.confidence != null
          ? confidenceToScansDb(mResult.confidence)
          : null,
      gpt_categories: mResult.source === "gpt" ? mResult.categories : [],
      gpt_explanations: mResult.source === "gpt" ? mResult.explanations : [],
      analyzed_by: analyzedByToScansDb(mResult.source),
      disagreement: result.disagreement,
    },
    { onConflict: "user_id,gmail_message_id", ignoreDuplicates: false }
  );
  if (error) throw error;
}
