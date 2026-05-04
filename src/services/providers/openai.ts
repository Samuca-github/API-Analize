// src/services/providers/openai.ts
import OpenAI from "openai";
import { parse as parseTLD } from "tldts";
import {
  type ClassifierConfidence,
  type ClassifierLabel,
  type ClassifierSource,
  normalizeCategorySlug,
} from "../../utils/taxonomy.js";
import { scoreToConfidence } from "../../utils/scoring.js";

const HAS_KEY = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10;

const client = HAS_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 120000),
    })
  : null;

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

if (!HAS_KEY) {
  console.warn("[openai] OPENAI_API_KEY ausente; mlScore vai cair em fallback 0.5");
}

export type { ClassifierConfidence, ClassifierLabel, ClassifierSource };

export type LLMOutput = {
  score: number;              // 0..1
  label: ClassifierLabel;
  confidence: ClassifierConfidence;
  categories: string[];
  explanations: string[];
  source: ClassifierSource;
};

// ---------- helpers de domínio/marca ----------
function etld1(hostOrUrl: string): string {
  try {
    const host = hostOrUrl.startsWith("http")
      ? new URL(hostOrUrl).host
      : hostOrUrl;
    return parseTLD(host).domain || "";
  } catch {
    return "";
  }
}

const ASSET_EXT = /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|otf)(\?|#|$)/i;
function isAssetUrl(u: string): boolean {
  if (!u) return false;
  try {
    const url = new URL(u);
    if (ASSET_EXT.test(url.pathname)) return true;
    // heurística simples para CDNs/comuns
    return /(\bcdn\b|static|assets?|images?|fonts?)\./i.test(url.host);
  } catch {
    return false;
  }
}

function brandTokenize(domain: string): string {
  const base = domain.split(".")[0]; // label mais à esquerda
  return base.replace(/[-_]/g, "").replace(/\d+/g, "").toLowerCase();
}

// Jaro-Winkler minimal (suficiente p/ “mercadopago” ~ “mercadolivre”)
function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const m = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const sa = new Array(a.length).fill(false);
  const sb = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - m), end = Math.min(i + m + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!sb[j] && a[i] === b[j]) { sa[i] = sb[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  const aMatches: string[] = [], bMatches: string[] = [];
  for (let i = 0, j = 0; i < a.length; i++) if (sa[i]) aMatches.push(a[i]);
  for (let j = 0, i = 0; j < b.length; j++) if (sb[j]) bMatches.push(b[j]);
  let t = 0;
  for (let i = 0; i < aMatches.length; i++) if (aMatches[i] !== bMatches[i]) t++;
  t /= 2;
  const jaro = (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
  let l = 0;
  while (l < 4 && a[l] && b[l] && a[l] === b[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
}

function likelySameBrand(aDomain: string, bDomain: string): boolean {
  const a = etld1(aDomain), b = etld1(bDomain);
  if (!a || !b) return false;
  if (a === b) return true;
  // mesma raiz (ccTLD variantes)
  if (a.split(".")[0] === b.split(".")[0]) return true;
  // similaridade do “radical”
  const ax = brandTokenize(a);
  const bx = brandTokenize(b);
  return jaroWinkler(ax, bx) >= 0.88;
}

// ---------- feature engineering ----------
function buildFeatures(input: {
  from?: string;
  links?: string[];
  headers?: Record<string, string>;
  body_text?: string;
}) {
  const fromDomain = etld1((input.from || "").split("@")[1] || "");
  const links = input.links || [];
  const assetLinks = links.filter(isAssetUrl);
  const actionLinks = links.filter(l => !isAssetUrl(l));

  const linkEtld1 = links.map(etld1).filter(Boolean);
  const actionEtld1 = actionLinks.map(etld1).filter(Boolean);

  const familyMatches: number[] = actionEtld1.map(d => (likelySameBrand(fromDomain, d) ? 1 : 0));
  const familyMatchRatio = actionEtld1.length
    ? familyMatches.reduce((a, b) => a + b, 0) / actionEtld1.length
    : 0;

  const spf = (input.headers?.received_spf || input.headers?.spf || "none").toLowerCase();
  const dkim = (input.headers?.dkim || "none").toLowerCase();
  const dmarc = (input.headers?.dmarc || "none").toLowerCase();

  const authStrong = (dkim === "pass" && dmarc === "pass") || (spf === "pass" && dkim === "pass");

  return {
    from_etld1: fromDomain,
    link_etld1_unique: Array.from(new Set(linkEtld1)),
    action_link_etld1_unique: Array.from(new Set(actionEtld1)),
    counts: {
      total_links: links.length,
      asset_links: assetLinks.length,
      action_links: actionLinks.length,
    },
    familyMatchRatio,
    auth: { spf, dkim, dmarc, authStrong },
    // alguns sinais textuais simples (opcional)
    text_flags: {
      has_password: /\bsenha\b|password/i.test(input.body_text || ""),
      has_urgent: /\burgente|urgency|immediately|imediat[oa]\b/i.test(input.body_text || ""),
      has_invoice: /\bfatura|invoice|boleto\b/i.test(input.body_text || ""),
    }
  };
}

// ---------- LLM ----------
export async function gptPhishingScore(input: {
  subject?: string;
  from?: string;
  body_text?: string;
  body_html?: string; // mantemos, mas não é obrigatório enviar
  headers?: Record<string, string>;
  links?: string[];
  features?: Record<string, any>;
}): Promise<LLMOutput> {
  const fallback: LLMOutput = {
    score: 0.5,
    label: "suspeito",
    confidence: "baixa",
    categories: [],
    explanations: ["Modo reserva: modelo indisponivel ou erro na chamada."],
    source: "reserva",
  };

  // features automáticas
  const auto = buildFeatures({
    from: input.from,
    links: input.links,
    headers: input.headers,
    body_text: input.body_text
  });

  if (!client) {
    console.warn("[openai] sem client (sem OPENAI_API_KEY); usando fallback");
    return fallback;
  }

  // Instruções compactas
  const system = [
    "Você é um classificador de phishing.",
    "Retorne SOMENTE JSON válido no schema pedido.",
    "Use escala 0..1 para score; 0 = legitimo, 1 = phishing claro.",
    "Considere fortes sinais de legitimidade quando DKIM/DMARC passarem e quando os domínios dos links forem consistentes com a marca do remetente.",
    "CDNs e assets (css/js/img/font) não devem ser penalizados.",
  ].join(" ");

  // Pacote enxuto para o modelo
  const userPayload = {
    subject: input.subject ?? "",
    from: input.from ?? "",
    body_text: (input.body_text ?? "").slice(0, 18_000), // manter curto
    headers_simplified: {
      spf: auto.auth.spf, dkim: auto.auth.dkim, dmarc: auto.auth.dmarc
    },
    links: input.links ?? [],
    auto_features: auto,
    extra_features: input.features ?? {}
  };

  // Chat Completions API (aceita response_format com json_schema).
  // Usar a API "responses" exigiria text.format e nao aceita response_format aqui.
  console.info("[openai] chamando GPT", { model: MODEL, links: userPayload.links.length });

  let raw: string = "";
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            "Classifique o e-mail a seguir. Regras:\n" +
            "- score em [0,1]\n" +
            "- label por threshold: >=0.75 phishing; 0.45-0.74 suspeito; <0.45 legitimo\n" +
            "- confidence no JSON: qualquer valor valido; o servidor recalcula pela distancia ao meio (score perto de 0 ou de 1 = alta certeza no veredito).\n" +
            "- Considere legitimidade quando authStrong=true e familyMatchRatio alto\n" +
            "- Nao penalize links de asset/cdn/webfont\n" +
            "- Preencha categories com slugs em portugues, ex.: personificacao_marca, coleta_credenciais, " +
            "falsificacao_remetente, extorsao, malware, golpe_fatura, premio_falso, pagamento_falso\n" +
            "- Explique em portugues, bullets curtas.\n\n" +
            "Dados JSON:\n" +
            JSON.stringify(userPayload),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "PhishingScore",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              score: { type: "number", minimum: 0, maximum: 1 },
              label: { type: "string", enum: ["phishing", "suspeito", "legitimo"] },
              confidence: { type: "string", enum: ["baixa", "media", "alta"] },
              categories: { type: "array", items: { type: "string" } },
              explanations: { type: "array", items: { type: "string" }, minItems: 1 },
            },
            required: ["score", "label", "confidence", "categories", "explanations"],
          },
        },
      },
      temperature: 0,
      max_tokens: 400,
    });

    raw = response.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      score: number;
      categories?: string[];
      explanations?: string[];
    };
    const score = Number.isFinite(parsed.score) ? Math.min(1, Math.max(0, parsed.score)) : 0.5;
    const label: ClassifierLabel =
      score >= 0.75 ? "phishing" : score >= 0.45 ? "suspeito" : "legitimo";
    const confidence: ClassifierConfidence = scoreToConfidence(score);
    console.info("[openai] resposta GPT", { score, label, confidence });
    const categoriesRaw = Array.isArray(parsed.categories) ? parsed.categories.slice(0, 10) : [];
    return {
      score,
      label,
      confidence,
      categories: categoriesRaw.map((c) => normalizeCategorySlug(String(c))),
      explanations: Array.isArray(parsed.explanations)
        ? parsed.explanations.slice(0, 10)
        : ["classificacao sem explicacao"],
      source: "gpt",
    };
  } catch (err: any) {
    console.error("[openai] erro chamando GPT:", err?.status, err?.message ?? err, raw && `raw=${raw.slice(0, 200)}`);
    return fallback;
  }
}
