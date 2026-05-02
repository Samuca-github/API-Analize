import { z } from "zod";

export const AnalyzeRequestSchema = z.object({
  email: z.object({
    subject: z.string().optional(),
    from: z.string().optional(),
    to: z.array(z.string().email()).optional(),
    body_text: z.string().optional(),
    body_html: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    links: z.array(z.string().url()).optional()
  }),
  context: z.object({
    language: z.string().default("pt-BR"),
    source: z.string().optional(),
    user_id: z.string().optional(),
    gmail_message_id: z.string().optional(),
    gmail_thread_id: z.string().optional()
  }).optional(),
  options: z.object({
    explain: z.boolean().default(true),
    return_features: z.boolean().default(true)
  }).optional()
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
