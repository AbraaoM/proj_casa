# Conectar o seu agente

O seu agente (qualquer assistente, com o nome que você der) grava e atualiza a Casa pela API em `/api/agent/`. O painel lê e tem só botões de um toque. O painel não usa a chave do agente.

O painel tem um login separado (`admin` / `admin` na primeira conta). Esse login não autentica o agente. Deixe o app em `localhost` nesta etapa. Uma URL pública deixaria a casa exposta: a senha inicial é simples e qualquer conta pode trocar a senha das outras.

A tabela completa de rotas está no `README.md`. Este arquivo cobre só a ligação.

## 1. Confirme o banco

O `.env.local` já precisa ter `DATABASE_URL`. O schema entra com:

```bash
npm run db:migrate
```

A versão esperada é `006_medication_doses`.

## 2. Crie a chave

Entre no painel (`admin` / `admin` na primeira conta) e abra **Agentes**. Dê o nome do seu agente e use **Gerar chave**. Copie o segredo na hora. Recarregar a página esconde a chave, porque o banco guarda só o hash.

Entregue a chave ao agente fora do git. Uma chave revogada deixa de funcionar na hora. Gere outra se precisar.

`AGENT_API_KEY` no `.env.local` continua válida, para quem já usa essa variável. O painel não depende dela. Sem chave ativa e sem essa variável, toda rota do agente responde `503` com `agent_not_configured`.

## 3. Suba o app e anote a URL

```bash
npm run dev
```

A base é a URL que o Next imprimir, por exemplo `http://localhost:3000`. Se essa porta já estiver ocupada, use a porta que aparecer no terminal. O agente chama essa origem mais `/api/agent/...`.

## 4. Entregue isto ao agente

Passe no chat do agente, fora do git:

- a base, como `http://localhost:3000`
- a chave, uma única vez
- este arquivo e o `README.md`

Peça para ele guardar a chave só na sessão e começar pelo health check. Se o agente não roda nesta máquina, `localhost` não chega até ele. Não publique o app para contornar isso.

## 5. Como o agente autentica

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
- `data.schema_version` = `006_medication_doses`
- `data.timezone` = `America/Sao_Paulo`, salvo se a casa tiver outro fuso

`database: "unconfigured"` significa que o processo não viu `DATABASE_URL`. `database: "schema_missing"` significa que a migration não rodou.

| HTTP | `error.code` | O que fazer |
| --- | --- | --- |
| 401 | `unauthorized` | A chave do header não é uma chave ativa, nem `AGENT_API_KEY`, ou o header não é `Bearer`. |
| 503 | `agent_not_configured` | Não há chave ativa em Agentes e `AGENT_API_KEY` está vazia. |
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

## 8. Configure as áreas da casa

A migration não cria áreas. O agente cria as áreas reais depois de confirmar com o dono quais cômodos existem. Lista sugerida, para ajustar à casa:

| slug | nome | kind |
| --- | --- | --- |
| `cozinha` | Cozinha | `room` |
| `sala` | Sala | `room` |
| `quarto_casal` | Quarto do casal | `room` |
| `quarto_2` | Quarto 2 | `room` |
| `banheiro_social` | Banheiro social | `room` |
| `banheiro_suite` | Banheiro da suíte | `room` |
| `lavanderia` | Lavanderia | `room` |
| `escritorio` | Escritório | `room` |
| `quintal` | Quintal | `outdoor` |
| `garagem` | Garagem | `outdoor` |
| `jardim` | Jardim | `outdoor` |
| `fachada` | Fachada | `outdoor` |
| `telhado_calhas` | Telhado e calhas | `outdoor` |
| `caixa_dagua` | Caixa d'água | `system` |
| `eletrica` | Elétrica | `system` |
| `hidraulica` | Hidráulica | `system` |
| `ar_condicionado` | Ar-condicionado | `system` |
| `gas` | Gás | `system` |
| `portao_seguranca` | Portão e segurança | `system` |

`kind` separa cômodos (`room`), área externa (`outdoor`) e sistemas da casa (`system`). Um único pedido cria todas:

```bash
curl -sS "$CASA_URL/api/agent/areas/bulk" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "items": [
    { "slug": "cozinha", "name": "Cozinha", "kind": "room", "sort_order": 1 },
    { "slug": "quintal", "name": "Quintal", "kind": "outdoor" },
    { "slug": "caixa_dagua", "name": "Caixa d'"'"'água", "kind": "system" }
  ] }'
```

O slug `geral` é reservado (é a página dos itens sem área). O `slug` é a identidade: repetir o mesmo slug devolve a área existente sem mudar nada. Para renomear, use `PATCH /api/agent/areas/cozinha` com `{ "name": "..." }`. O slug não muda; para trocar, crie outra área e arquive a antiga.

## 9. Importe o histórico

O histórico é feito de eventos (`care_events`). Um evento pode estar ligado a uma pendência (`care_item_id`) ou ser avulso: uma consulta, uma pesagem, um conserto que não estava agendado.

```bash
curl -sS "$CASA_URL/api/agent/events/bulk" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "items": [
    { "domain": "dog", "dog_id": "<uuid>", "category": "vaccine", "title": "V10",
      "done_on": "2025-10-10", "provider": "Clínica Pet", "amount_cents": 12000,
      "external_key": "dog:thor:vaccine:2025-10-10" },
    { "domain": "car", "vehicle_id": "<uuid>", "category": "oil", "title": "Troca de óleo",
      "done_on": "2026-04-16", "odometer_km": 40000, "amount_cents": 32000,
      "external_key": "car:onix:oil:2026-04-16" },
    { "domain": "house", "area": "caixa_dagua", "category": "cleaning", "title": "Limpeza da caixa d'"'"'água",
      "done_on": "2026-03-01", "external_key": "house:caixa_dagua:cleaning:2026-03-01" }
  ] }'
```

Uma `external_key` estável por evento (por exemplo `domínio:sujeito:categoria:data`) torna a importação segura de repetir.

## 10. Finanças

As categorias padrão já vêm no banco. O agente cria as contas que o dono contar (`POST /api/agent/finance/accounts/bulk`, com o saldo de abertura) e passa a mandar `amount_cents` nos eventos que custam dinheiro. O guia completo, com exemplos, está em `docs/agente-financas.md`.

O caminho principal é o chat: quando uma tarefa implica custo (uma consulta, um conserto), o agente pergunta o valor e grava no evento. Contas que se repetem entram já confirmadas. A sugestão (`status: "suggested"`), com os botões Confirmar e Dispensar no painel, é o caminho raro: use só quando não der para confirmar na conversa, e pouco.

## Regras para o agente

- Datas são `YYYY-MM-DD`, no fuso da casa. "Hoje" é esse fuso, não o relógio do servidor.
- Cão exige só `dog_id`. Família exige só `family_member_id`. Carro exige só `vehicle_id`. Casa e finanças recusam os três.
- Categoria é um slug `^[a-z0-9_]{1,40}$`. A lista recomendada vem em `data.recommended_categories` no health.
- Não há delete. Arquivar cão, pessoa, veículo ou área é `PATCH` com `{ "archived": true }`. Item encerrado vai para `cancelled` ou `completed`.
- Evento lançado errado é anulado com `PATCH /api/agent/events/:id` e `{ "voided": true }`. Ele sai do histórico e dos resumos, mas continua no banco. `{ "voided": false }` desfaz.
- `weight_kg` só vale para cão e `odometer_km` só para carro. Em outro domínio, a API responde `validation_error`.
- Em cada criação, mande uma `external_key` estável. Repetir a chamada deve ser seguro.
- Campo desconhecido no JSON responde `400` com `validation_error`. Leia `error.details`.
- Dinheiro é sempre em centavos inteiros. Custo de um setor vai no evento (`amount_cents`); o lançamento em Finanças nasce dele. Não crie um segundo lançamento para o mesmo gasto.
- Prefira confirmar contas e gastos no chat. Sugestão no painel é exceção.
- O painel chama os serviços direto. O agente não precisa da chave para a tela existir, e a tela não grava no lugar dele.
