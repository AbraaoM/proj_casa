# Casa

Painel da casa. A tela mostra o que pede atenção. Quem grava os dados é o seu agente, pela API em `/api/agent/`.

O painel pede usuário e senha. A conta inicial é `admin` / `admin`. Qualquer usuário logado cria outras contas e define a senha delas. A própria senha pede a senha atual. Não há recuperação de senha. O agente usa uma chave gerada em Agentes, ou a variável `AGENT_API_KEY`. Ele não usa esse login.

Não publique este app numa URL aberta. A senha inicial é simples e qualquer conta pode trocar a senha das outras.

## Telas

Só leitura. `/` mostra o que pede atenção. `/caes`, `/carros`, `/familia` e `/casa` listam cada cão, veículo, pessoa e área; a página de cada um (`/caes/:id`, `/carros/:id`, `/familia/:id`, `/casa/:slug`, `/casa/geral`) traz os destaques, os próximos e o histórico por mês, com filtro `?categoria=`.

`/financas?mes=AAAA-MM` mostra o mês: saldo de hoje, resultado, contas a pagar, orçamento e para onde foi o dinheiro. `/financas/lancamentos` lista os lançamentos com filtros (mês, tipo, conta, categoria, `origem=dog:<id>`); `/financas/contas` e `/financas/contas/:slug` mostram saldos e o saldo informado. `/financas/contas-a-pagar` lista as contas que se repetem por vencimento, com os últimos pagamentos; `/financas/orcamento` compara orçado e realizado por categoria e filhas, com os últimos 6 meses. A página do cartão mostra a fatura aberta e as próximas parcelas. As páginas de cão, carro e área levam a "Ver em Finanças".

O painel só escreve por botões de um toque: **Paguei**, **Dose dada**, **Feito**, **+1 dia**, **Ignorar** (pula para o próximo ciclo) e Confirmar/Dispensar de conta sugerida. Não há formulário fora do login e da administração. Cada toque é idempotente e mostra **Desfazer** por 5 s; desfazer anula o registro, não apaga. O normal continua sendo o dono pedir ao agente no chat. Detalhes para o agente: `docs/agente-conectar.md`.

## Stack

Next.js (App Router), TypeScript, Tailwind, Neon Postgres (`@neondatabase/serverless`). O clima vem da Open-Meteo, sem chave. A cidade da casa fica no banco e é trocada em `/api/agent/settings`; sem ela, o código usa São Paulo, SP. A migration inicial já grava uma cidade; troque pela sua.

## Ambiente

Copie `.env.example` para `.env.local` e preencha:

- `DATABASE_URL`: connection string pooled do Neon.
- `AGENT_API_KEY`: segredo opcional. O caminho normal é gerar a chave em Agentes, no painel. A variável continua válida como alternativa.

Nunca commite `.env` nem `.env.local`.

```bash
npm install
npm run db:migrate
npm run dev
```

Sem `DATABASE_URL` o painel abre e diz que o banco não está ligado. As rotas de dados respondem `503` com `database_unavailable`. Sem chave ativa no banco e sem `AGENT_API_KEY`, as rotas do agente respondem `503` com `agent_not_configured`.

## Agent API

O passo a passo para ligar o seu agente está em `docs/agente-conectar.md`.

Todas as rotas exigem:

```http
Authorization: Bearer <chave>
```

Resposta de sucesso:

```json
{ "ok": true, "data": {}, "meta": {} }
```

Resposta de erro:

```json
{
  "ok": false,
  "error": {
    "code": "validation_error",
    "message": "must be YYYY-MM-DD",
    "details": [{ "field": "due_date", "message": "must be YYYY-MM-DD" }]
  }
}
```

Códigos: `unauthorized`, `validation_error`, `not_found`, `database_unavailable`, `agent_not_configured`, `internal_error`.

`external_key` é a identidade da operação. Repetir a mesma chave devolve o primeiro registro e `meta.idempotent_replay: true`. A chave não atualiza campos.

Datas são dias de calendário (`YYYY-MM-DD`) no fuso da casa (`America/Sao_Paulo` por padrão).

### Rotas

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/api/agent/health` | chave, banco e versão do schema |
| GET | `/api/agent/attention?domain=&within_days=14` | pendências ordenadas |
| GET | `/api/agent/items` | lista (`domain`, `status`, `dog_id`, `family_member_id`, `vehicle_id`, `limit`) |
| POST | `/api/agent/items` | cria um item |
| POST | `/api/agent/items/bulk` | até 50 criações, cada uma com o próprio `ok` |
| GET | `/api/agent/items/:id` | item e os 20 eventos mais recentes |
| PATCH | `/api/agent/items/:id` | atualiza campos do item |
| POST | `/api/agent/items/:id/done` | marca feito e reagenda, se houver intervalo. Num remédio por hora, encerra o tratamento |
| GET, POST | `/api/agent/items/:id/doses` | doses com horário de um remédio (`interval_hours`) e a próxima. O POST registra a dose sem concluir o item. Guia: `docs/agente-doses.md` |
| GET, POST | `/api/agent/dogs` | lista e cria. `?include_archived=1` inclui arquivados |
| GET, PATCH | `/api/agent/dogs/:id` | lê e atualiza. Arquivar: `{ "archived": true }` |
| GET, POST | `/api/agent/family` | membros da família |
| GET, PATCH | `/api/agent/family/:id` | |
| GET, POST | `/api/agent/vehicles` | veículos |
| GET, PATCH | `/api/agent/vehicles/:id` | |
| GET | `/api/agent/dogs/:id/history` | pendências ativas, eventos e resumo do cão |
| GET | `/api/agent/vehicles/:id/history` | o mesmo para o veículo, com km desde o último óleo |
| GET | `/api/agent/family/:id/history` | o mesmo para a pessoa |
| GET, POST | `/api/agent/areas` | áreas da casa. O POST é idempotente pelo `slug` |
| POST | `/api/agent/areas/bulk` | até 50 áreas, cada uma com o próprio `ok` |
| GET, PATCH | `/api/agent/areas/:id_ou_slug` | lê e atualiza. Arquivar: `{ "archived": true }` |
| GET | `/api/agent/areas/:id_ou_slug/history` | pendências, eventos e resumo da área |
| GET | `/api/agent/events` | histórico (`domain`, `dog_id`, `vehicle_id`, `family_member_id`, `area`, `care_item_id`, `category`, `from`, `to`, `include_voided=1`, `limit`, `offset`) |
| POST | `/api/agent/events` | registra algo feito, avulso ou com `care_item_id` |
| POST | `/api/agent/events/bulk` | até 50 eventos, para importar histórico |
| GET, PATCH | `/api/agent/events/:id` | lê e corrige. Anular: `{ "voided": true }` |
| GET, POST | `/api/agent/finance/accounts` | contas com saldo de hoje e patrimônio. O POST é idempotente pelo `slug` |
| POST | `/api/agent/finance/accounts/bulk` | até 50 contas |
| GET, PATCH | `/api/agent/finance/accounts/:id_ou_slug` | saldo, último saldo informado, fatura aberta do cartão. Arquivar: `{ "archived": true }` |
| POST | `/api/agent/finance/accounts/:id_ou_slug/balance-checks` | saldo real numa data |
| POST | `/api/agent/finance/accounts/:id_ou_slug/reconcile` | `{ through }`: marca `cleared` se o saldo bater |
| GET, POST | `/api/agent/finance/categories` | categorias (pai e filhas). POST idempotente pelo `slug` |
| GET, PATCH | `/api/agent/finance/categories/:id_ou_slug` | renomeia, muda a pai, arquiva |
| GET, POST | `/api/agent/finance/transactions` | lançamentos. `installments: N` parcela uma compra |
| POST | `/api/agent/finance/transactions/bulk` | até 50 lançamentos |
| GET, PATCH | `/api/agent/finance/transactions/:id` | corrige ou anula. O que veio de evento se corrige pelo evento |
| GET, POST | `/api/agent/finance/bills` | contas que se repetem. `?status=active,suggested` |
| GET, PATCH | `/api/agent/finance/bills/:id_ou_slug` | edita; confirmar `active`, dispensar `ended` |
| POST | `/api/agent/finance/bills/:id_ou_slug/pay` | paga e avança para o próximo vencimento |
| GET, PUT | `/api/agent/finance/budgets?month=` | orçado × realizado; PUT faz upsert |
| GET | `/api/agent/finance/summary?month=` | o mês inteiro numa chamada |
| GET, PATCH | `/api/agent/settings` | cidade, coordenadas e fuso |
| GET | `/api/agent/weather` | previsão e `outdoor_delay` |

Domínios: `dog`, `house`, `finance`, `car`, `family`.

Um item de cão exige `dog_id`. Família exige `family_member_id`. Carro exige `vehicle_id`. Finanças não tem sujeito. Casa pode apontar uma área com `area` (slug) ou `area_id`; sem área, o item fica em "Casa · geral".

Categorias recomendadas (outras slugs `a-z0-9_` também passam):

- dog: `vaccine`, `deworming`, `flea`, `vet`, `weight`, `grooming`, `other`
- house: `cleaning`, `deep_clean`, `repair`, `outdoor`, `filter`, `other`
- finance: `gas`, `dog_food`, `bill`, `purchase`, `other`
- car: `oil`, `service`, `inspection`, `tire`, `other`
- family: `vaccine`, `dentist`, `medical`, `medicine`, `other`

Prioridade: `low`, `normal`, `high`, `urgent`. Status: `active`, `paused`, `completed`, `cancelled`.

Marcar feito com `interval_days` (ou `interval_months`, que mantém o dia do mês) empurra `due_date` e mantém o item ativo. Sem intervalo, o status vira `completed`. Um `done_on` anterior ao `last_done_on` entra no histórico e não anda o prazo para trás. `weight_kg` no evento mais recente atualiza o peso do cão. `odometer_km` maior que o atual atualiza o veículo.

### Histórico

Cada coisa feita é um evento. `POST /api/agent/events` aceita dois formatos:

- **Avulso**: `domain`, `category`, `title` e o sujeito do domínio (`dog_id`, `vehicle_id`, `family_member_id`, ou `area` em casa). `done_on` padrão é hoje e não pode ser futuro.
- **Ligado a uma pendência**: `care_item_id`. Domínio, sujeito, categoria e título vêm do item, e o efeito é o mesmo de `POST /items/:id/done` (reagenda). Mandar `category` ou `title` junto responde `validation_error`; domínio ou sujeito diferentes do item também.

Campos opcionais: `notes`, `provider` (clínica, oficina), `amount_cents` (vira um lançamento em Finanças; `finance_category` e `account` ajustam categoria e conta), `weight_kg` (só cão), `odometer_km` (só carro), `external_key`.

O peso do cão passa a ser o do evento com peso mais recente que não foi anulado. Um registro antigo entra no histórico sem mudar o peso atual. O hodômetro só sobe.

Evento errado é anulado com `PATCH /api/agent/events/:id` e `{ "voided": true }`. Não há delete. Anular o pagamento mais recente de uma conta devolve o vencimento da conta (e a parcela). Nas outras pendências, anular não mexe no prazo; a resposta avisa em `meta.notes`, e o ajuste é `PATCH /items/:id`. Um evento anulado libera a sua `external_key`: repetir a mesma chamada depois grava um registro novo.

O `history` de cada sujeito devolve `active_items` (todas as pendências ativas, na ordem de atenção), `events` (até 200, mais novos primeiro) e `summary`: `last_by_category`, `weight_series`, `costs` (ano corrente, total e por categoria) e `oil` (última troca, dias e km desde ela).

Sugestão de áreas e exemplo de importação: `docs/agente-conectar.md`. Finanças: `docs/agente-financas.md`.

A atenção inclui só itens `active`: atrasados, hoje, dentro da janela (14 dias) e sem data. A ordem é atraso, hoje, prazo futuro, sem data. Dentro do grupo, `urgent` vem antes de `high`, `normal` e `low`.

Chuva com probabilidade do dia igual ou acima de 60 define `outdoor_delay: true`.

### Exemplo

```bash
curl -s http://localhost:3000/api/agent/items \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "finance",
    "title": "Gás",
    "category": "gas",
    "due_date": "2026-11-01",
    "interval_days": 30,
    "external_key": "gas-mensal"
  }'
```

## Testes

```bash
npm test
```

As regras de prazo, ordenação, reagendamento, chuva e resumo do histórico ficam em `lib/domain/` e não dependem do banco.

Os testes de integração rodam contra um Postgres de verdade e apagam o schema `public` do banco indicado. Use um banco local cujo nome contenha `test`:

```bash
TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npm run test:db
```

Sem `TEST_DATABASE_URL`, eles são pulados. Para rodar o app contra um Postgres local, use `DATABASE_DRIVER=pg` no `.env.local`.
