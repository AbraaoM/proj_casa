# Doses de remédio: guia para o agente

Remédio com horário (um analgésico de 6 em 6 h, uma vitamina 1x ao dia) é um **item** da pessoa com `interval_hours`. Cada dose dada é um **evento** desse item, com data e hora (`done_at`). Registrar a dose **não conclui** o item: ele segue ativo e a próxima dose é recalculada.

Schema: `006_medication_doses`. Mesmo envelope `{ ok, data, meta }`, erros por campo e `external_key` idempotente.

## Regras

- **Um item por remédio por tratamento**, nunca um por dia. A chave estável é do remédio, por exemplo `family:bebe:dipirona`, sem a data.
- **Próxima dose** = dose válida mais recente + `interval_hours`. Uma dose antiga registrada atrasada não mexe na próxima.
- **Atrasada** assim que passa do horário da próxima dose, sem tolerância. O painel e o `/attention` mostram `next_due_at` e `next_due_time` (HH:mm no fuso da casa).
- **Fim do tratamento** (`ends_on`, opcional): quando a próxima dose cairia depois desse dia, o item se conclui sozinho (`status: "completed"`).
- Horários sem fuso valem no fuso da casa (`America/Sao_Paulo`). Com `Z` ou `-03:00`, vale o que veio.
- O app só mostra o horário pelo intervalo. Não dá orientação de dose nem de quantidade; isso fica com quem prescreveu.

## Configurar um remédio

Item novo:

```bash
curl -sS "$CASA_URL/api/agent/items" \
  -H "Authorization: Bearer $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{ "domain": "family", "family_member_id": "<pessoa>", "title": "Dipirona", "category": "medicine",
        "interval_hours": 6, "ends_on": "2026-10-20", "external_key": "family:bebe:dipirona" }'
```

Item que já existe (o caso de hoje): `PATCH /api/agent/items/:id` com `{ "interval_hours": 6 }`. Mandar `interval_hours` limpa `interval_days` e `interval_months`; só um intervalo vale por vez. `interval_hours` vai de 1 a 168. Um remédio 1x ao dia é `interval_hours: 24` (o horário importa), não `interval_days: 1`.

## Registrar uma dose

```bash
curl -sS "$CASA_URL/api/agent/items/<item>/doses" \
  -H "Authorization: Bearer $AGENT_API_KEY" -H "Content-Type: application/json" \
  -d '{ "given_at": "2026-10-17T07:30", "notes": "5 ml", "external_key": "dose:family:bebe:dipirona:2026-10-17T07:30" }'
```

- `given_at`: opcional. Sem ele, vale **agora** (arredondado ao minuto). Até 5 min no futuro é aceito; mais que isso responde `validation_error`.
- `external_key`: sugerido `dose:<chave-do-item>:<YYYY-MM-DDTHH:mm>`. Repetir a chamada devolve a mesma dose (`200`, `meta.idempotent_replay: true`).
- Sem chave, a mesma dose do mesmo item no mesmo minuto também não duplica.
- Item sem `interval_hours` responde `validation_error` no campo `interval_hours`: faça o `PATCH` antes.
- A resposta traz `data.item` (com `next_due_at`) e `data.event` (com `done_at`).

## Consultar

`GET /api/agent/items/:id/doses?from=2026-10-17&to=2026-10-17` devolve as doses (mais recentes primeiro), `next_due_at`, `next_due_time`, `minutes_until_next` e `late`. `from` e `to` aceitam dia ou data e hora. `include_voided=true` mostra as anuladas.

O `GET /api/agent/family/:id/history` traz `medications`: cada remédio ativo com as doses das últimas 48 h.

## Corrigir

- **Dose errada:** `PATCH /api/agent/events/:id` com `{ "voided": true }`. Nada é apagado. A próxima dose volta a seguir a dose válida mais recente (`meta.notes` confirma).
- **Horário errado:** anule e registre de novo com o horário certo.
- **Tratamento acabou antes:** `POST /api/agent/items/:id/done`. Num item por hora, isso encerra o tratamento (`completed`). Para registrar uma dose, use sempre `/doses`.
- **Reabrir um tratamento concluído:** `PATCH /api/agent/items/:id` com `{ "status": "active" }` (e um `ends_on` novo, se for o caso).

## Doses que estão nas notes (uma vez, depois do deploy)

Antes da 006, os horários das doses ficavam no campo `notes` dos itens de remédio. Depois do merge, para cada um desses itens:

1. `PATCH` com o intervalo em horas (6 em 6 h → `6`, 8 em 8 h → `8`, 1x ao dia → `24`).
2. `POST /doses` para cada horário anotado, com `external_key`.
3. Confira com `GET /doses` e só então limpe as `notes` (`PATCH` com `{ "notes": null }`).
