import type { ClassifierLabel, ClassifierConfidence } from "../services/providers/openai.js";

export type ScoreParts = {
  rules: number;
  ml: number;
  ml_label?: ClassifierLabel;
};

export type CombinedResult = {
  score: number;
  label: ClassifierLabel;
  confidence: ClassifierConfidence;
  rules_label: ClassifierLabel;
  ml_label?: ClassifierLabel;
  disagreement: boolean;
};

export function scoreToLabel(s: number): ClassifierLabel {
  return s >= 0.75 ? "phishing" : s >= 0.45 ? "suspicious" : "benign";
}

export function scoreToConfidence(s: number): ClassifierConfidence {
  return s >= 0.85 ? "high" : s >= 0.6 ? "medium" : "low";
}

function downgradeConfidence(c: ClassifierConfidence): ClassifierConfidence {
  return c === "high" ? "medium" : c === "medium" ? "low" : "low";
}

export function combineScores(p: ScoreParts): CombinedResult {
  // peso 60% regras / 40% ML
  const score = Math.max(0, Math.min(1, 0.6 * p.rules + 0.4 * p.ml));
  let confidence = scoreToConfidence(score);
  const label = scoreToLabel(score);
  const rules_label = scoreToLabel(p.rules);

  // Discordancia: regras e GPT chegam a labels diferentes.
  // Quando isso acontece, rebaixamos a confianca - o sistema "nao tem certeza".
  const disagreement = !!(p.ml_label && p.ml_label !== rules_label);
  if (disagreement) confidence = downgradeConfidence(confidence);

  return { score, label, confidence, rules_label, ml_label: p.ml_label, disagreement };
}
