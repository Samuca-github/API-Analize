# API-Analize (analyze-api)

API HTTP em **Node.js + Express + TypeScript** para análise de e-mails (phishing / sinais de risco). A classificação é feita **só com o modelo de linguagem** (OpenAI); features extraídas do e-mail (links, cabeçalhos, etc.) entram como contexto para o GPT. Opcionalmente persiste o resultado no **Supabase**.

Pensada para ser chamada por clientes autenticados (por exemplo, extensão do Gmail) com JWT do Supabase.

## Requisitos

- Node.js 18 ou superior (recomendado 20 LTS)
- Conta Supabase (URL, chaves e JWT) para autenticação e, se quiser histórico, tabela `scans`
- Chave OpenAI para análise com LLM (sem chave, o serviço de ML usa fallback e a API continua respondendo)

## Instalação

```bash
npm install
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Não | Porta HTTP (padrão: `8080`) |
| `SUPABASE_URL` | Sim (para `/analyze`) | URL do projeto Supabase |
| `SUPABASE_JWT_SECRET` | Sim*, se JWKS falhar | Segredo JWT HS256 legado do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim (para gravar scans) | Chave service role — **somente no servidor** |
| `OPENAI_API_KEY` | Não | Chave da API OpenAI |
| `OPENAI_MODEL` | Não | Modelo (padrão: `gpt-4o-mini`) |
| `OPENAI_TIMEOUT_MS` | Não | Timeout da chamada OpenAI em ms (padrão: `120000`) |
| `CORS_ORIGINS` | Não | Lista separada por vírgula; padrão inclui `chrome-extension://*` e `http://localhost:*` |
| `MAX_BODY_SIZE` | Não | Limite do body JSON (padrão: `512kb`) |
| `RATE_WINDOW_MS` | Não | Janela do rate limit em ms (padrão: `60000`) |
| `RATE_MAX` | Não | Máximo de requisições por IP por janela (padrão: `60`) |
| `NODE_ENV` | Não | Em `production`, o handler de erro omite `stack` na resposta |

\* O middleware tenta primeiro validar o JWT com **JWKS** (`/auth/v1/.well-known/jwks.json`). Se isso falhar, usa `SUPABASE_JWT_SECRET` (HS256).

`SUPABASE_ANON_KEY` está no `config` para uso futuro; hoje a rota protegida usa o Bearer do utilizador e o cliente admin usa a service role.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor com `tsx watch` (recarrega ao editar) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa `node dist/index.js` (após `build`) |

## Endpoints

### `GET /health`

Verificação simples de disponibilidade.

**Resposta:** `{ "ok": true }`

### `GET /version`

**Resposta:** `{ "version": "0.1.0" }`

### `POST /analyze`

Analisa o payload do e-mail. **Requer autenticação.**

**Cabeçalho:** `Authorization: Bearer <access_token_supabase>`

**Corpo (JSON)** — campos principais (schema Zod em `src/types.ts`):

- `email` (objeto)
  - `subject`, `from` (opcionais)
  - `to` (opcional): array de e-mails válidos
  - `body_text`, `body_html` (opcionais)
  - `headers` (opcional): mapa string → string
  - `links` (opcional): array de URLs
- `context` (opcional): `language` (padrão `pt-BR`), `source`, `user_id`, `gmail_message_id`, `gmail_thread_id`
- `options` (opcional): `explain`, `return_features` (booleanos)

**Resposta (resumo):**

- `result`: `label`, `score`, `confidence`, `categories`, `explanations`, `disagreement`
- `breakdown`: score e rótulo do modelo (`ml_*`), `analyzed_by`; `rules_score` fica `0` e `rules_label` `null` (legado)
- `features`: características extraídas do e-mail
- `meta`: modelo lógico, `latency_ms`, `trace_id`, `user_id`

Os scans são gravados na tabela `scans` do Supabase (upsert por `user_id` + `gmail_message_id`), em segundo plano; falhas de persistência são registadas no log do servidor.

## Segurança

- **Helmet** e **CORS** configuráveis por origem.
- **Rate limiting** global por IP.
- JWT Supabase com verificação de issuer/audience (`authenticated`).
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` nem `SUPABASE_JWT_SECRET` no cliente.

## Estrutura do código

```
src/
  index.ts              # App Express, middlewares, rotas
  config.ts             # Variáveis de ambiente
  types.ts              # Schema Zod do pedido de análise
  routes/
    analyze.ts          # POST /analyze
    health.ts           # GET /health, /version
  middleware/
    supabaseAuth.ts     # Bearer JWT
    limiter.ts          # Rate limit
    error.ts            # Erros HTTP
  services/
    features.ts         # Extração de features do e-mail
    classifier.ts       # Regras + ML
    supabase.ts         # Cliente admin
    providers/openai.ts # Integração OpenAI
  utils/
    scoring.ts          # Thresholds e veredito a partir do ML
    taxonomy.ts         # Normalização de categorias
```

## Licença

Defina a licença do repositório no ficheiro `LICENSE` se aplicável.
