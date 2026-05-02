import { AnalyzeRequest } from "../types.js";
import {
  gptPhishingScore,
  type ClassifierLabel,
  type ClassifierConfidence,
  type ClassifierSource,
} from "./providers/openai.js";

export type MLResult = {
  score: number;
  label?: ClassifierLabel;
  confidence?: ClassifierConfidence;
  categories: string[];
  explanations: string[];
  source: ClassifierSource;
};

export async function rulesScore(_input: AnalyzeRequest, feats: Record<string, any>): Promise<number> {
  let s = 0;
  if (feats.domain_mismatch) s += 0.5;
  if (feats.spf_fail) s += 0.25;
  if (feats.dmarc_none) s += 0.1;
  s += Math.min(0.15, (feats.urgency_terms ?? 0) * 0.05);
  s += Math.min(0.1, (feats.links_count ?? 0) * 0.02);
  return Math.min(1, s);
}

export async function mlScore(input: AnalyzeRequest, feats: Record<string, any>): Promise<MLResult> {
  try {
    const res = await gptPhishingScore({
      subject: input.email.subject,
      from: input.email.from,
      body_text: input.email.body_text,
      body_html: input.email.body_html,
      headers: input.email.headers,
      links: input.email.links,
      features: feats,
    });
    return {
      score: res.score,
      label: res.label,
      confidence: res.confidence,
      categories: res.categories ?? [],
      explanations: res.explanations ?? [],
      source: res.source,
    };
  } catch (err: any) {
    console.warn("[mlScore] GPT indisponivel, usando fallback 0.5:", err?.message ?? err);
    return { score: 0.5, categories: [], explanations: [], source: "fallback" };
  }
}
