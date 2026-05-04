import type { ClassifierConfidence, ClassifierLabel, ClassifierSource } from "./taxonomy.js";
import { normalizeConfidence, normalizeLabel } from "./taxonomy.js";

/** Enums da tabela `public.scans` (CHECK constraints no Postgres). */
export type ScansDbConfidence = "low" | "medium" | "high";
export type ScansDbLabel = "phishing" | "suspicious" | "benign";

const CONF_TO_DB: Record<ClassifierConfidence, ScansDbConfidence> = {
  baixa: "low",
  media: "medium",
  alta: "high",
};

const LABEL_TO_DB: Record<ClassifierLabel, ScansDbLabel> = {
  phishing: "phishing",
  suspeito: "suspicious",
  legitimo: "benign",
};

export function confidenceToScansDb(c: unknown): ScansDbConfidence {
  return CONF_TO_DB[normalizeConfidence(c)];
}

export function labelToScansDb(l: unknown): ScansDbLabel {
  return LABEL_TO_DB[normalizeLabel(l)];
}

/** `scans_analyzed_by_check`: apenas gpt | fallback (sem regras rápidas). */
export function analyzedByToScansDb(s: ClassifierSource): "gpt" | "fallback" {
  return s === "reserva" ? "fallback" : "gpt";
}
