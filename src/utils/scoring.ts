import type { ClassifierConfidence, ClassifierLabel } from "./taxonomy.js";

export type MlVerdict = {
  score: number;
  label: ClassifierLabel;
  confidence: ClassifierConfidence;
};

export function scoreToLabel(s: number): ClassifierLabel {
  return s >= 0.75 ? "phishing" : s >= 0.45 ? "suspeito" : "legitimo";
}

/**
 * Confiança no veredito (não “intensidade de phishing”).
 * Para label legitimo (score abaixo de 0,45): quanto mais longe do limiar 0,45, mais confiança.
 * Só usamos “baixa” quando o score ainda é legitimo mas colado em ~0,43–0,45 (zona de virada para suspeito).
 */
export function scoreToConfidence(s: number): ClassifierConfidence {
  if (s < 0.45) {
    if (s <= 0.18) return "alta";
    if (s <= 0.42) return "media";
    return "baixa";
  }
  if (s < 0.75) {
    const d = Math.min(s - 0.45, 0.75 - s);
    if (d >= 0.1) return "media";
    return "baixa";
  }
  if (s >= 0.9) return "alta";
  if (s >= 0.82) return "media";
  return "baixa";
}

/**
 * Veredito final a partir da saída do modelo.
 * A confiança vem só do score (certeza no veredito), nunca do texto do GPT — evita “legitimo + baixa”.
 */
export function finalizeFromMl(m: {
  score: number;
  label?: ClassifierLabel;
}): MlVerdict {
  const score = Math.max(0, Math.min(1, m.score));
  const label = m.label ?? scoreToLabel(score);
  const confidence = scoreToConfidence(score);
  return { score, label, confidence };
}
