# Finanças: guia para o agente

As finanças da Casa são de entrada simples, em reais e em centavos inteiros (`amount_cents`). Cada lançamento é uma saída (`expense`), uma entrada (`income`) ou uma transferência entre contas (`transfer`). Não há partidas dobradas.

Schema: `005_finance`. Rotas em `/api/agent/finance/…`, com o mesmo envelope `{ ok, data, meta }` (também nos erros: caminho inexistente responde 404 `not_found` e método errado 405 `method_not_allowed` com o header `Allow`), `external_key` idempotente, erros por campo e bulk com até 50 entradas. Contas, categorias e contas a pagar aceitam **slug** ou uuid na URL e nos campos.

## Como o agente trabalha

O caminho principal é a conversa. O dono pede, e o agente grava.

1. **Uma tarefa com custo.** O agente conclui algo que custa dinheiro (consulta do cão, troca de óleo, conserto) e **pergunta o valor** no chat. Depois manda `amount_cents` no evento (`POST /events` ou `POST /items/:id/done`). O lançamento em Finanças nasce sozinho; não crie outro em `/finance/transactions`.
2. **Uma conta que se repete.** O dono diz "a luz vence dia 10". O agente confirma no chat e cria a bill já `active`.
3. **Sugestões, com parcimônia.** `status: "suggested"` é só para quando o agente notou algo recorrente e **não conseguiu confirmar no chat**. A sugestão aparece no painel com Confirmar e Dispensar, mas esse é o caminho raro. Prefira perguntar. Não crie mais de uma ou duas sugestões por vez, e não repita uma que o dono dispensou (`ended`).

## Primeira configuração

As categorias padrão vêm na migração (`GET /finance/categories`). As contas não: o agente cria as que o dono contar, com o saldo de abertura.

```bash
curl -sS "$CASA_URL/api/agent/finance/accounts/bulk" \
  -H "Authorization: Bearer $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{ "items": [
    { "slug": "itau", "name": "Itaú", "kind": "checking", "opening_balance_cents": 523000, "opening_date": "2026-10-01" },
    { "slug": "nubank", "name": "Nubank", "kind": "credit_card", "opening_balance_cents": 0,
      "credit_limit_cents": 800000, "statement_close_day": 5, "due_day": 12 }
  ] }'
```

- `kind`: `checking`, `savings`, `cash`, `credit_card`, `investment`, `loan`, `other`.
- Em cartão e empréstimo, o saldo é **o que se deve**. `opening_balance_cents` é a dívida na abertura.
- `opening_date`: lançamentos anteriores a essa data não mexem no saldo (já estão no saldo de abertura).
- O slug é a identidade. Repetir o slug devolve a conta sem mudar nada. Para editar: `PATCH /finance/accounts/itau`. Para arquivar: `{ "archived": true }`.

## Custos dos outros setores

Todo evento com `amount_cents > 0` e não anulado vira **um** lançamento `expense` com `source: "care_event"`. A categoria padrão segue o setor:

| setor / categoria do evento | categoria financeira |
| --- | --- |
| dog `vaccine`, `vet`, `deworming`, `flea` | `pets_saude` |
| dog `grooming` | `pets_banho` |
| dog outros | `pets` |
| car `oil`, `service`, `tire`, `inspection` | `carro_manutencao` |
| car `fuel` | `combustivel` |
| car outros | `transporte` |
| house `cleaning`, `deep_clean` | `casa_limpeza` |
| house outros | `casa_manutencao` |
| family `medicine` | `saude_farmacia` |
| family outros | `saude_consulta` |
| finance `gas` / `dog_food` / outros | `gas` / `pets_racao` / `outros` |

- No evento, `finance_category` (slug) troca a categoria e `account` (slug) diz de onde saiu o dinheiro. Os dois exigem `amount_cents`.
- Valor, data e anulação **seguem o evento**: corrija com `PATCH /events/:id` (`amount_cents`, `done_on`, `voided`). Um `PATCH /finance/transactions/:id` nesses campos responde `validation_error` com a rota certa.
- Categoria, conta, observação e status do lançamento podem ser corrigidos no próprio lançamento e não voltam ao padrão.
- A migração `005` já trouxe os custos lançados antes dela.

## Lançamentos avulsos

```bash
# Mercado no débito
{ "kind": "expense", "date": "2026-10-14", "amount_cents": 38790, "category": "mercado",
  "account": "itau", "description": "Mercado", "external_key": "tx:mercado:2026-10-14" }

# Salário
{ "kind": "income", "date": "2026-10-05", "amount_cents": 800000, "category": "salario",
  "account": "itau", "description": "Salário" }

# Pagar a fatura do cartão: transferência, não é saída
{ "kind": "transfer", "date": "2026-10-12", "amount_cents": 154300, "account": "itau",
  "to_account": "nubank", "description": "Fatura Nubank" }

# Compra parcelada: amount_cents é o total
{ "kind": "expense", "date": "2026-10-08", "amount_cents": 300000, "installments": 10,
  "account": "nubank", "category": "casa", "description": "Geladeira", "external_key": "tx:geladeira" }
```

- **Cartão conta na data da compra.** A compra é a saída do mês; pagar a fatura é transferência e não conta de novo.
- Parcelas: N lançamentos mensais no mesmo dia (dia 31 vira o último dia do mês), com `installment_n`/`installment_total`. Os centavos que sobram vão na primeira.
- Estorno: `income` numa categoria de saída. Ele reduz o gasto daquela categoria.
- Anular: `PATCH /finance/transactions/:id` com `{ "voided": true }`. Não há delete.
- Filtros do `GET /finance/transactions`: `month` ou `from`/`to`, `account`, `category` (inclui as filhas), `kind`, `status`, `source`, `bill`, `origin` (`dog:<uuid>`, `car`, …), `q`, `limit`, `offset`.

## Contas a pagar (bills)

```bash
{ "slug": "energia", "name": "Energia", "amount_cents": 21000, "amount_varies": true,
  "category": "energia", "account": "itau", "next_due_date": "2026-11-10" }
```

- `kind`: `bill`, `subscription`, `installment`, `income` (salário esperado; exige categoria de entrada).
- `frequency`: `monthly` (padrão), `yearly`, `weekly`, `every_n_days`, com `interval`. O dia do mês vem de `next_due_date`; dia 31 cai no último dia dos meses curtos e volta ao 31 depois.
- `remaining` (parcelas que faltam) ou `end_date` encerram a bill sozinhos.
- Cada bill ganha uma pendência `finance` (aparece no painel como qualquer lembrete). `care_item_id` adota uma pendência `finance` que já existe, em vez de criar outra.
- **Pagar**: `POST /finance/bills/energia/pay` com `{ "paid_on", "amount_cents", "account", "external_key" }`. Registra o evento na pendência, cria o lançamento (`source: "bill"`) e avança bill e pendência para o próximo vencimento. `POST /items/:id/done` na pendência da bill faz o mesmo.
- **Várias de uma vez**: `POST /finance/bills/bulk` com `{ "items": [ … ] }` (até 50). Cada entrada tem o próprio `ok`; repetir a chamada não duplica (slug e `external_key`).
- O dono também pode tocar **Paguei** na tela de Finanças. Isso usa a mesma regra do `pay` (hoje, valor previsto ou o digitado, conta da bill) com `external_key` `ui:pay:<bill id>:<vencimento>`. Antes de pagar pela API, consulte a bill: se o vencimento já avançou, ela já foi paga.
- Confirmar uma sugestão: `PATCH` com `{ "status": "active" }`. Dispensar ou encerrar: `{ "status": "ended" }`. Pausar: `paused`.

## Orçamento

```bash
curl -X PUT "$CASA_URL/api/agent/finance/budgets" ... -d '{ "month": null, "items": [
  { "category": "mercado", "amount_cents": 150000 },
  { "category": "pets", "amount_cents": 40000 } ] }'
```

- `month: null` é o orçamento padrão de todo mês. `"month": "2026-12"` vale só para aquele mês e ganha do padrão. `amount_cents: null` remove.
- Uma categoria pai sem orçamento próprio usa a soma das filhas. O gasto da pai inclui as filhas.

## Saldo real e conciliação

- `POST /finance/accounts/itau/balance-checks` com `{ "date", "balance_cents" }`: o saldo que o banco mostra. A resposta traz a diferença para o calculado.
- `POST /finance/accounts/itau/reconcile` com `{ "through": "2026-10-16" }`: se o calculado bate com o saldo informado naquele dia, marca os lançamentos até a data como `cleared`. Se não bate, devolve `reconciled: false` e a diferença; o agente procura o lançamento que falta.

## Resumo

`GET /finance/summary?month=2026-10` é a chamada para "como estão as finanças": entradas, saídas, resultado, saídas por categoria (com filhas), entradas por categoria, saldo por conta e patrimônio (ativos − dívidas), orçamento e estouros, contas a vencer em 30 dias (com atrasadas), sugestões pendentes, últimos lançamentos e `without_account_count` (lançamentos sem conta, que não mexem em saldo).

## Fora do escopo, por enquanto

Metas de economia, importação de OFX/CSV do banco, várias moedas, investimentos com cotação e relatórios fiscais.
