import { AnalyzeRequest } from "../types.js";
import { gptPhishingScore } from "./providers/openai.js";
import type {
  ClassifierConfidence,
  ClassifierLabel,
  ClassifierSource,
} from "../utils/taxonomy.js";

export type MLResult = {
  score: number;
  label?: ClassifierLabel;
  confidence?: ClassifierConfidence;
  categories: string[];
  explanations: string[];
  source: ClassifierSource;
};

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
    return { score: 0.5, categories: [], explanations: [], source: "reserva" };
  }
}
