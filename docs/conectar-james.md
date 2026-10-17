# Conectar o James

O James grava e atualiza a Casa pela API em `/api/agent/`. O painel só lê. Ele não usa a chave do James.

O painel tem um login separado (`admin` / `admin` na primeira conta). Esse login não autentica o James. Deixe o app em `localhost` nesta etapa. Uma URL pública deixaria a casa exposta: a senha inicial é simples e qualquer conta pode trocar a senha das outras.

A tabela completa de rotas está no `README.md`. Este arquivo cobre só a ligação.

## 1. Confirme o banco

O `.env.local` já precisa ter `DATABASE_URL`. O schema entra com:

```bash
npm run db:migrate
```

A versão esperada é `001_init`.

## 2. Crie a chave

Gere um segredo longo e cole só no `.env.local`, na linha `AGENT_API_KEY`. Não commite esse arquivo e não grave a chave no repositório.

```bash
openssl rand -base64 32
```

O servidor lê a variável na subida. Se o `npm run dev` já estava aberto, pare e suba de novo depois de salvar o `.env.local`.

Sem `AGENT_API_KEY`, toda rota do agente responde `503` com `agent_not_configured`.

## 3. Suba o app e anote a URL

```bash
npm run dev
```

A base é a URL que o Next imprimir, por exemplo `http://localhost:3000`. Se essa porta já estiver ocupada, use a porta que aparecer no terminal. O James chama essa origem mais `/api/agent/...`.

## 4. Entregue isto ao James

Passe no chat do James, fora do git:

- a base, como `http://localhost:3000`
- a chave, uma única vez
- este arquivo e o `README.md`

Peça para ele guardar a chave só na sessão e começar pelo health check. Se o James não roda nesta máquina, `localhost` não chega até ele. Não publique o app para contornar isso.

## 5. Como o James autentica

Toda chamada leva:

```http
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json
```

`Content-Type` vale para `POST` e `PATCH`. A chave vai no header, nunca na query string nem no corpo.

Sucesso:

```json
{ "ok": true, "data": {}, "meta": {} }
```

Erro:

```json
{
  "ok": false,
  "error": { "code": "unauthorized", "message": "Missing or invalid agent API key." }
}
```

## 6. Prova de conexão

```bash
curl -sS "$CASA_URL/api/agent/health" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

Ligado de verdade, a resposta é `200` e o corpo tem:

- `data.service` = `casa`
- `data.database` = `ok`
- `data.schema_version` = `001_init`
- `data.timezone` = `America/Sao_Paulo`, salvo se a casa tiver outro fuso

`database: "unconfigured"` significa que o processo não viu `DATABASE_URL`. `database: "schema_missing"` significa que a migration não rodou.

| HTTP | `error.code` | O que fazer |
| --- | --- | --- |
| 401 | `unauthorized` | A chave do header não é a do `.env.local`, ou o header não é `Bearer`. |
| 503 | `agent_not_configured` | Falta `AGENT_API_KEY` no processo. Salve o `.env.local` e reinicie o `npm run dev`. |
| 503 | `database_unavailable` | Nas rotas de dados, falta `DATABASE_URL`. O health, nesse caso, responde `200` com `database: "unconfigured"`. |
| 500 | `internal_error` | O servidor loga a causa. A resposta não traz stack. |

## 7. Primeiras chamadas

Ordem segura depois do health:

1. `GET /api/agent/attention` para ver o que o painel mostra.
2. `GET /api/agent/settings` para cidade, coordenadas e fuso.
3. Criar o sujeito antes do item: `POST /api/agent/dogs`, `/api/agent/family` ou `/api/agent/vehicles`. O corpo mínimo é `{ "name": "Nome" }`.
4. `POST /api/agent/items` com o `dog_id`, `family_member_id` ou `vehicle_id` devolvido. Casa e finanças não levam sujeito.

Exemplo de item, depois de a conexão estar `ok`:

```bash
curl -sS "$CASA_URL/api/agent/items" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "finance",
    "title": "Gás",
    "category": "gas",
    "due_date": "2026-11-01",
    "interval_days": 30,
    "external_key": "finance:gas:mensal"
  }'
```

`201` cria. A mesma `external_key` de novo devolve o primeiro registro, `200`, e `meta.idempotent_replay: true`. A chave identifica a operação. Ela não atualiza o título nem a data.

## Regras para o James

- Datas são `YYYY-MM-DD`, no fuso da casa. "Hoje" é esse fuso, não o relógio do servidor.
- Cão exige só `dog_id`. Família exige só `family_member_id`. Carro exige só `vehicle_id`. Casa e finanças recusam os três.
- Categoria é um slug `^[a-z0-9_]{1,40}$`. A lista recomendada vem em `data.recommended_categories` no health.
- Não há delete. Arquivar cão, pessoa ou veículo é `PATCH` com `{ "archived": true }`. Item encerrado vai para `cancelled` ou `completed`.
- Em cada criação, mande uma `external_key` estável. Repetir a chamada deve ser seguro.
- Campo desconhecido no JSON responde `400` com `validation_error`. Leia `error.details`.
- O painel chama os serviços direto. O James não precisa da chave para a tela existir, e a tela não grava no lugar dele.
