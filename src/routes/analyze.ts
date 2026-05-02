import { Router } from "express";
import { AnalyzeRequestSchema } from "../types.js";
import { extractFeatures } from "../services/features.js";
import { mlScore, rulesScore, type MLResult } from "../services/classifier.js";
import { combineScores } from "../utils/scoring.js";
import { supabaseAdmin } from "../services/supabase.js";

export const analyzeRouter = Router();

analyzeRouter.post("/", async (req, res, next) => {
  try {
    const parsed = AnalyzeRequestSchema.parse(req.body);
    const user = res.locals.user;
    if (!user) return res.status(401).json({ error: "unauthenticated" });

    const feats = extractFeatures(parsed);
    const [rScore, mResult] = await Promise.all([
      rulesScore(parsed, feats),
      mlScore(parsed, feats),
    ]);

    const combined = combineScores({
      rules: rScore,
      ml: mResult.score,
      ml_label: mResult.label,
    });

    // Categorias: union(heuristicas, GPT) limitando a 10
    const categories = mergeUnique(
      inferCategories(feats),
      mResult.categories,
      10
    );

    // Explicacoes: GPT primeiro (mais ricas), depois heuristicas que ainda agreguem
    const explanations = mergeUnique(
      mResult.explanations.length ? mResult.explanations : buildExplanations(feats),
      mResult.explanations.length ? buildExplanations(feats) : [],
      10
    );

    const response = {
      result: {
        label: combined.label,
        score: Number(combined.score.toFixed(2)),
        confidence: combined.confidence,
        categories,
        explanations,
        disagreement: combined.disagreement,
      },
      breakdown: {
        rules_score: Number(rScore.toFixed(3)),
        ml_score: Number(mResult.score.toFixed(3)),
        rules_label: combined.rules_label,
        ml_label: mResult.label ?? null,
        ml_confidence: mResult.confidence ?? null,
        analyzed_by: mResult.source,
      },
      features: feats,
      meta: {
        model: "analyze-core@0.2.0",
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

function inferCategories(f: any): string[] {
  const cats: string[] = [];
  if (f.domain_mismatch) cats.push("brand_impersonation");
  if (f.urgency_terms > 0) cats.push("credential_harvest");
  if (f.spf_fail || f.dmarc_none) cats.push("spoofing");
  return Array.from(new Set(cats));
}

function buildExplanations(f: any): string[] {
  const out: string[] = [];
  if (f.domain_mismatch) out.push("Dominio nos links nao corresponde ao remetente");
  if (f.spf_fail) out.push("SPF falhou");
  if (f.dmarc_none) out.push("DMARC ausente/none");
  if (f.urgency_terms > 0) out.push("Uso de linguagem de urgencia");
  return out;
}

function mergeUnique(primary: string[], secondary: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const key = String(item ?? "").trim();
    if (!key) continue;
    const norm = key.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out.length ? out : ["Nenhum sinal critico detectado"];
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
    rules_label: string;
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
      label: result.label,
      score: result.score,
      confidence: result.confidence,
      categories: result.categories,
      explanations: result.explanations,
      features,
      raw_response: raw,
      source: payload?.context?.source ?? "gmail_extension",
      // breakdown
      rules_score: breakdown.rules_score,
      ml_score: breakdown.ml_score,
      gpt_label: mResult.source === "gpt" ? mResult.label ?? null : null,
      gpt_confidence: mResult.source === "gpt" ? mResult.confidence ?? null : null,
      gpt_categories: mResult.source === "gpt" ? mResult.categories : [],
      gpt_explanations: mResult.source === "gpt" ? mResult.explanations : [],
      analyzed_by: breakdown.analyzed_by,
      disagreement: result.disagreement,
    },
    { onConflict: "user_id,gmail_message_id", ignoreDuplicates: false }
  );
  if (error) throw error;
}
