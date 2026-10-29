# Conectar o seu agente

O seu agente (qualquer assistente, com o nome que você der) grava e atualiza a Casa pela API em `/api/agent/`. O painel lê e tem só botões de um toque. O painel não usa a chave do agente.

O painel tem um login separado, com usuário e senha de cada pessoa. Esse login não autentica o agente: o agente usa uma chave.

Há dois jeitos de ligar um agente, com a mesma chave:

- **REST** (`/api/agent/...`): para um agente que roda na mesma máquina ou que chama HTTP direto. Seções 1 a 10.
- **MCP** (`/api/mcp`): para um assistente que aceita conector MCP remoto, como o Claude no plano Free. Seção 11.

Para conversar com o agente no Telegram (privado e grupo da família), veja `docs/agente-telegram.md`. Para o Google Agenda, veja `docs/agente-agenda.md`.

A tabela completa de rotas está no `README.md`. Este arquivo cobre só a ligação.

### Quem fez o quê

Cada chave pertence a uma pessoa (a conta que a gerou) e tem o nome que ela deu ao agente. Tudo o que o agente grava (pendência, evento, dose, lançamento, conta) leva `created_by_user_id` e `agent_key_id`, e cada escrita (`POST`, `PATCH`, `PUT` e ferramenta MCP que grava) entra em `agent_activity` com o canal (`rest` ou `mcp`), a ação e o status. Um toque no painel fica no nome de quem está logado, sem chave. `GET /api/agent/health` mostra em `data.caller` quem a chave representa.

`AGENT_API_KEY`, a variável antiga, continua valendo e age como a primeira conta master.

### Antes de publicar

O app pode ficar numa URL pública (é o que o Claude e o bot precisam) desde que:

- nenhuma conta use a senha inicial antiga. A migration `007_identity` marca essa conta: no app local ela entra e é obrigada a trocar a senha; no deploy da Vercel ela nem entra até a senha ser trocada;
- cada pessoa tenha a própria conta. Cada um troca só a própria senha; só a conta master cria contas e redefine a senha de outra pessoa, que escolhe uma nova no próximo acesso;
- cada pessoa use a própria chave, revogável em **Agentes**.

## 1. Confirme o banco

O `.env.local` já precisa ter `DATABASE_URL`. O schema entra com:

```bash
npm run db:migrate
```

A versão esperada é `007_identity`.

Num banco novo não existe conta. No app local, a tela de login pede para criar a primeira conta (master). No deploy público isso não aparece, para ninguém tomar a casa: crie a conta pelo terminal, sem gravar a senha em arquivo:

```bash
CASA_FIRST_USERNAME=dono CASA_FIRST_PASSWORD='uma-senha-longa' npm run db:migrate
```

## 2. Crie a chave

Entre no painel com a sua conta e abra **Agentes**. Dê o nome do seu agente e use **Gerar chave**. Copie o segredo na hora. Recarregar a página esconde a chave, porque o banco guarda só o hash.

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

Peça para ele guardar a chave só na sessão e começar pelo health check. Se o agente não roda nesta máquina, `localhost` não chega até ele: use a URL pública do deploy (veja "Antes de publicar").

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
- `data.schema_version` = `007_identity`
- `data.caller.user` = a conta dona da chave e `data.caller.agent_name` = o nome do agente
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

## 8a. Checklist da casa (rotinas)

A tela `/casa` é um checklist no estilo dos de limpeza hospitalar: cada tarefa do cômodo, de quanto em quanto tempo, a última vez, quem fez e o que está mais urgente. Cada cômodo tem uma folha de registro dos últimos 30 dias.

Uma rotina é uma pendência da casa com `interval_days` ou `interval_months`. Não há tabela nova.

**A frequência só muda pela conversa com o agente.** O app não tem tela para editar frequência. A pessoa pede ("troca de toalha a cada 4 dias") e o agente chama `atualizar_item`; `interval_days: null` (e `interval_months: null`) tira a frequência e o item deixa de ser rotina.

Kit sugerido (o ponto de partida aprovado pelo dono; o agente oferece para cômodos sem rotina):

| Cômodo | Tarefa | Categoria | Frequência |
| --- | --- | --- | --- |
| Banheiro | Limpeza do banheiro | `cleaning` | 3 dias |
| Banheiro | Limpeza pesada do banheiro | `deep_clean` | 15 dias |
| Banheiro | Trocar toalhas | `cleaning` | 3 dias |
| Quarto | Trocar roupa de cama | `cleaning` | 7 dias |
| Cozinha | Limpar bancada e fogão | `cleaning` | 1 dia |
| Cozinha | Limpar a geladeira | `deep_clean` | 30 dias |
| Cozinha | Trocar filtro de água | `maintenance` | 6 meses |
| Qualquer cômodo | Aspirar e passar pano | `cleaning` | 7 dias |
| Ar-condicionado | Limpar filtro do ar-condicionado | `maintenance` | 1 mês |

Criar uma rotina (uma por cômodo e tarefa; `external_key` no formato `rotina:<área>:<tarefa>`):

```bash
curl -sS "$CASA_URL/api/agent/items" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "domain": "house", "area": "banheiro", "category": "cleaning", "title": "Limpeza do banheiro",
        "interval_days": 3, "last_done_on": "2026-10-21",
        "external_key": "rotina:banheiro:limpeza_do_banheiro" }'
```

Sem `due_date`, o vencimento é `last_done_on` + intervalo. Sem `last_done_on`, a rotina aparece como "Sem registro" e vence hoje.

Ler o checklist:

```bash
curl -sS "$CASA_URL/api/agent/house/routines?area=banheiro" -H "Authorization: Bearer $AGENT_API_KEY"
```

Filtros: `area`, `status` (`overdue`, `never`, `due_soon`, `ok`), `limit` (1 a 200), `include_kit=true` (traz o kit sugerido). Cada rotina vem com `last_done_on`, `done_by`, `via_agent`, `days_since`, `progress_pct`, `status`, `due_date` e `days_overdue`, da mais urgente para a menos. `due_soon` é 75% ou mais do intervalo já passado.

Não há responsável nem rodízio: o app só registra quem fez.

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
- Um evento anulado libera a sua `external_key`: a mesma chamada depois grava um registro novo (o anulado fica com a chave renomeada para `<chave>~voided~<id>`).
- O dono registra pela tela só com botões de um toque, com chaves `ui:pay:<bill>:<vencimento>`, `ui:done:<item>:<vencimento>` e `ui:dose:<item>:<horário>`. "+1 dia" e "Ignorar" mudam só o `due_date` do item (Ignorar pula para o próximo ciclo, sem evento). Desfazer, em até 5 s, anula o evento ou devolve a data. Ao ver um evento `ui:*`, trate como registrado pelo dono; não registre de novo.
- `weight_kg` só vale para cão e `odometer_km` só para carro. Em outro domínio, a API responde `validation_error`.
- Em cada criação, mande uma `external_key` estável. Repetir a chamada deve ser seguro.
- Campo desconhecido no JSON responde `400` com `validation_error`. Leia `error.details`.
- Dinheiro é sempre em centavos inteiros. Custo de um setor vai no evento (`amount_cents`); o lançamento em Finanças nasce dele. Não crie um segundo lançamento para o mesmo gasto.
- Prefira confirmar contas e gastos no chat. Sugestão no painel é exceção.
- O painel chama os serviços direto. O agente não precisa da chave para a tela existir, e a tela não grava no lugar dele.

## 11. MCP remoto (`/api/mcp`)

A Casa expõe um servidor MCP em `POST /api/mcp`, com transporte Streamable HTTP sem sessão: cada pedido é uma mensagem JSON-RPC e a resposta vem em JSON ([especificação](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)). Não há fluxo SSE (`GET` responde `405`). A autenticação é a mesma chave, no header `Authorization: Bearer <chave>`.

Ferramentas (as mesmas regras das rotas REST):

| Ferramenta | Faz | Grava? |
| --- | --- | --- |
| `atencao_hoje` | pendências atrasadas, de hoje e dos próximos dias | não |
| `listar_cadastros` | ids e nomes de cães, família, carros e áreas | não |
| `listar_itens` | pendências com filtro | não |
| `historico` | histórico de um cão, carro, pessoa ou área | não |
| `rotinas_casa` | checklist da casa: última vez, quem fez, status, mais urgente primeiro; `include_kit` traz o kit sugerido | não |
| `adicionar_item` | nova pendência. No carro, `odometer_km` grava o hodômetro e `due_date` fica em Próximos. Remédio leva `interval_hours` (1x ao dia = 24) e `ends_on` | sim |
| `atualizar_item` | corrige pendência: status, vencimento, um intervalo, notas. É o único jeito de mudar a frequência de uma rotina da casa (`null` tira) | sim |
| `marcar_feito` | conclui e reagenda; não aceita valor | sim |
| `registrar_dose` | dose de remédio por hora | sim |
| `listar_doses` | doses de um item e a próxima | não |
| `registrar_evento` | algo já feito, sem pendência e sem data futura; não aceita valor | sim |
| `anular_evento` | anula ou restaura um evento ou uma dose | sim |
| `registrar_custo` | o custo que a pessoa disse, num evento recém-concluído | sim |
| `cadastrar` | cria ou atualiza cão, pessoa, carro ou área | sim |
| `clima` | tempo agora e se convém adiar o lado de fora | não |
| `resumo_financeiro` | resumo do mês | não |
| `listar_financas` | contas, categorias e contas a pagar | não |
| `criar_conta` | conta com o saldo de abertura que a pessoa disse | sim |
| `conta_a_pagar` | cria ou corrige a conta recorrente que a pessoa confirmou | sim |
| `pagar_conta` | paga a conta; o valor é o da conta, salvo o que a pessoa disser | sim |
| `definir_orcamento` | teto de uma categoria, com o valor que a pessoa disse | sim |
| `conferir_conta` | saldo que o banco mostrou e conciliação | sim |
| `ajustar_casa` | lê a cidade; muda cidade ou fuso quando a pessoa pede | sim |

**Regra de finanças.** Nenhuma ferramenta cria lançamento por iniciativa do agente. Quando `marcar_feito` ou `registrar_evento` conclui algo que costuma custar dinheiro (consulta, vacina, troca de óleo, conserto, dentista, remédio…), a resposta traz `ask_cost: true`. O agente pergunta quanto custou e só então chama `registrar_custo` com o valor dito. O servidor recusa `registrar_custo` se o evento tiver mais de 72 h, já tiver custo, estiver anulado ou tiver sido gravado por outra pessoa.

Teste rápido:

```bash
curl -sS "$CASA_URL/api/mcp" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Agente local com MCP

Um agente que roda nesta máquina e aceita servidor MCP por HTTP usa `http://localhost:3000/api/mcp` com o mesmo header. Para quem já usa a API REST, nada muda: as duas formas convivem.

### Claude (plano Free) como conector personalizado

O Claude conecta da nuvem da Anthropic, então a Casa precisa estar numa URL HTTPS pública (o deploy da Vercel), já com "Antes de publicar" cumprido. O plano Free aceita 1 conector personalizado ([ajuda do Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)).

1. Cada pessoa entra na Casa com a própria conta, abre **Agentes** e gera uma chave (o nome pode ser "Claude").
2. No Claude (web ou app): **Customize → Connectors → + Add → Add custom connector**.
3. Nome: `Casa`. URL: `https://<seu-deploy>/api/mcp`. **Continue**.
4. Em **Authentication**, escolha **No sign in**.
5. Em **Request headers**, adicione `Authorization` com o valor `Bearer <a chave>`.
6. **Add**. Na conversa, ligue o conector em **+ → Connectors**.

O Claude não manda lembrete sozinho e o nome dele continua sendo Claude. Para revogar, revogue a chave em **Agentes** ou remova o conector no Claude.
