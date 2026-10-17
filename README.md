# Casa

Painel da casa. A tela mostra o que pede atenção. Quem grava os dados é o James, pela API em `/api/agent/`.

O painel pede usuário e senha. A conta inicial é `admin` / `admin`. Qualquer usuário logado cria outras contas e define a senha delas. A própria senha pede a senha atual. Não há recuperação de senha. O James usa uma chave gerada em Agentes, ou a variável `AGENT_API_KEY`. Ele não usa esse login.

Não publique este app numa URL aberta. A senha inicial é simples e qualquer conta pode trocar a senha das outras.

## Stack

Next.js (App Router), TypeScript, Tailwind, Neon Postgres (`@neondatabase/serverless`). O clima vem da Open-Meteo, sem chave. A cidade padrão é Pindamonhangaba, SP, e pode ser trocada em `/api/agent/settings`.

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

O passo a passo para ligar o James está em `docs/conectar-james.md`.

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
| POST | `/api/agent/items/:id/done` | marca feito e reagenda, se houver intervalo |
| GET, POST | `/api/agent/dogs` | lista e cria. `?include_archived=1` inclui arquivados |
| GET, PATCH | `/api/agent/dogs/:id` | lê e atualiza. Arquivar: `{ "archived": true }` |
| GET, POST | `/api/agent/family` | membros da família |
| GET, PATCH | `/api/agent/family/:id` | |
| GET, POST | `/api/agent/vehicles` | veículos |
| GET, PATCH | `/api/agent/vehicles/:id` | |
| GET, PATCH | `/api/agent/settings` | cidade, coordenadas e fuso |
| GET | `/api/agent/weather` | previsão e `outdoor_delay` |

Domínios: `dog`, `house`, `finance`, `car`, `family`.

Um item de cão exige `dog_id`. Família exige `family_member_id`. Carro exige `vehicle_id`. Casa e finanças não têm sujeito.

Categorias recomendadas (outras slugs `a-z0-9_` também passam):

- dog: `vaccine`, `deworming`, `flea`, `vet`, `weight`, `grooming`, `other`
- house: `cleaning`, `deep_clean`, `repair`, `outdoor`, `filter`, `other`
- finance: `gas`, `dog_food`, `bill`, `purchase`, `other`
- car: `oil`, `service`, `inspection`, `tire`, `other`
- family: `vaccine`, `dentist`, `medical`, `medicine`, `other`

Prioridade: `low`, `normal`, `high`, `urgent`. Status: `active`, `paused`, `completed`, `cancelled`.

Marcar feito com `interval_days` empurra `due_date` e mantém o item ativo. Sem intervalo, o status vira `completed`. Um `done_on` anterior ao `last_done_on` entra no histórico e não anda o prazo para trás. `weight_kg` no evento mais recente atualiza o peso do cão. `odometer_km` maior que o atual atualiza o veículo.

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

As regras de prazo, ordenação, reagendamento e chuva ficam em `lib/domain/` e não dependem do banco.
