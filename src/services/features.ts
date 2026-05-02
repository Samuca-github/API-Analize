import { AnalyzeRequest } from "../types.js";
import { domainFromUrl } from "../utils/url.js";

const URGENCY = ["urgente", "imediato", "agora", "suspenso", "bloqueado", "expirou", "clique"];

// Função para extrair email completo dentro de <>
export function extractEmailFromBrackets(text: string): string | null {
  const match = text.match(/<([^>]+)>/);
  return match ? match[1] : null;
}

// Função para extrair domínio do email (dentro de <> ou puro)
export function extractEmailDomain(s?: string): string | undefined {
  if (!s) return;
  // pega e-mail dentro de <...> ou puro
  const m = s.match(/<([^>]+)>/);
  const addr = (m ? m[1] : s).trim();
  // valida/normaliza
  const at = addr.lastIndexOf("@");
  if (at === -1) return;
  const dom = addr.slice(at + 1).replace(/[>\s]/g, "").toLowerCase();
  return dom || undefined;
}

export function extractFeatures(input: AnalyzeRequest) {
  console.log(input)
  const text = (input.email.body_text ?? "") + " " + (input.email.subject ?? "");
  const links = input.email.links ?? [];
  const from = input.email.from ?? "";
  const headers = input.email.headers ?? {};

  const fromDomain = extractEmailDomain(from);
  const linkDomains = links.map(domainFromUrl).filter(Boolean) as string[];

  const domainMismatch = !!(fromDomain && linkDomains.length && linkDomains.some(d => !d.endsWith(fromDomain)));
  const urgencyTerms = URGENCY.reduce((acc, t) => acc + (text.toLowerCase().includes(t) ? 1 : 0), 0);

  return {
    fromDomain,
    linkDomains,
    domain_mismatch: domainMismatch,
    urgency_terms: urgencyTerms,
    spf_fail: /fail/i.test(headers["received_spf"] ?? ""),
    dmarc_none: /none/i.test(headers["dmarc"] ?? ""),
    dkim_fail: /fail/i.test(headers["dkim"] ?? ""),
    links_count: links.length
  };
}