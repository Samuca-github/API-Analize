/** Taxonomia em portugues (slugs) para respostas da API e persistencia. */

export type ClassifierLabel = "phishing" | "suspeito" | "legitimo";
export type ClassifierConfidence = "baixa" | "media" | "alta";
export type ClassifierSource = "gpt" | "reserva";

export const LABEL_ALIASES: Record<string, ClassifierLabel> = {
  phishing: "phishing",
  suspicious: "suspeito",
  suspeito: "suspeito",
  benign: "legitimo",
  legitimo: "legitimo",
  inofensivo: "legitimo",
};

export const CONFIDENCE_ALIASES: Record<string, ClassifierConfidence> = {
  low: "baixa",
  baixa: "baixa",
  medium: "media",
  media: "media",
  média: "media",
  high: "alta",
  alta: "alta",
};

export const SOURCE_ALIASES: Record<string, ClassifierSource> = {
  gpt: "gpt",
  fallback: "reserva",
  reserva: "reserva",
  /** legado (antes só existia GPT + atalhos de regra) */
  short_circuit: "gpt",
  rules_only: "gpt",
  regras_rapidas: "gpt",
};

export function normalizeLabel(s: unknown): ClassifierLabel {
  const k = String(s ?? "")
    .trim()
    .toLowerCase();
  return LABEL_ALIASES[k] ?? "suspeito";
}

export function normalizeConfidence(s: unknown): ClassifierConfidence {
  const k = String(s ?? "")
    .trim()
    .toLowerCase();
  return CONFIDENCE_ALIASES[k] ?? "baixa";
}

export function normalizeSource(s: unknown): ClassifierSource {
  const k = String(s ?? "")
    .trim()
    .toLowerCase();
  return SOURCE_ALIASES[k] ?? "gpt";
}

/** Ingles (GPT antigo) e variantes -> slug PT */
export const CATEGORY_ALIASES: Record<string, string> = {
  brand_impersonation: "personificacao_marca",
  credential_harvest: "coleta_credenciais",
  spoofing: "falsificacao_remetente",
  extortion: "extorsao",
  invoice_scam: "golpe_fatura",
  prize_scam: "premio_falso",
  payment_scam: "pagamento_falso",
  personificacao_marca: "personificacao_marca",
  coleta_credenciais: "coleta_credenciais",
  falsificacao_remetente: "falsificacao_remetente",
  extorsao: "extorsao",
  malware: "malware",
  golpe_fatura: "golpe_fatura",
  premio_falso: "premio_falso",
  pagamento_falso: "pagamento_falso",
  nenhum_sinal_critico: "nenhum_sinal_critico",
};

export function normalizeCategorySlug(s: string): string {
  const raw = String(s ?? "").trim();
  if (!raw) return raw;
  const k = raw.toLowerCase();
  return CATEGORY_ALIASES[k] ?? raw;
}
