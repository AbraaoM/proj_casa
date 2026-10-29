# Google Agenda

A Casa mostra os próximos 14 dias do Google Agenda de quem conectou a própria conta, e o agente pode criar um compromisso nessa agenda. Não substitui as pendências da Casa: uma consulta continua sendo um item de família quando alguém precisa lembrar do que fazer. A agenda é o horário no calendário.

Cada pessoa conecta a própria conta. A tela da casa junta as agendas conectadas. O token de atualização fica cifrado com `CASA_SECRET_KEY`, do mesmo jeito que o token do Telegram. A tela nunca mostra o token.

## O que aparece

- **Agenda** (`/agenda`), também em Mais: os próximos 14 dias, por dia, com o horário e de quem é a conta.
- **Painel**: os 3 próximos, quando alguém já conectou.
- **Agentes**: um toque em **Conectar Google Agenda**. **Desconectar** revoga o acesso.

## O que o agente faz

As mesmas regras valem no REST e no MCP.

| | |
| --- | --- |
| `GET /api/agent/calendar?within_days=14` | compromissos das contas conectadas. `within_days` de 1 a 30, padrão 14 |
| `POST /api/agent/calendar/events` | cria na agenda de quem a chave representa |
| `agenda_proximos` | a mesma lista |
| `agenda_criar` | o mesmo POST |

Uma data `AAAA-MM-DD` é o dia inteiro. Um horário sem fuso usa o fuso da casa. Sem `ends_at`, um horário dura uma hora. Para um dia inteiro com fim, `ends_at` é o último dia, inclusive. `external_key` repetida devolve o primeiro evento (`idempotent_replay: true`).

Se a pessoa ainda não conectou, a resposta é `409` com `agenda_not_connected`. Diga para ela tocar em **Conectar Google Agenda** em Agentes. Não invente horário e não crie o evento em outra conta.

```bash
curl -sS "$CASA_URL/api/agent/calendar/events" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Dentista", "starts_at": "2026-11-02T15:00", "external_key": "familia:dentista:2026-11-02" }'
```

## Passo a passo (dono, depois do merge)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou use um seu). Em **APIs e serviços**, ative a **Google Calendar API**.
2. Em **Tela de consentimento OAuth**, tipo Externo, adicione o escopo `https://www.googleapis.com/auth/calendar.events` e os e-mails da família como usuários de teste enquanto o app não estiver publicado.
3. Em **Credenciais**, crie um **ID do cliente OAuth**, tipo **Aplicativo da Web**. URI de redirecionamento autorizado, exatamente:

   `https://<seu-app>/api/google/callback`

   No local: `http://localhost:3000/api/google/callback` (a porta que o Next imprimir).

4. Na Vercel, no mesmo projeto da Casa, crie `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. `CASA_SECRET_KEY` precisa existir (é a mesma do bot). Faça um novo deploy.
5. Rode a migration `009_google_calendar` (`npm run db:migrate` no ambiente que aponta para o banco).
6. Cada pessoa entra em **Agentes** e toca em **Conectar Google Agenda**. O Google pede a conta e a permissão de ver e criar eventos. Pronto.

A Casa pede só o escopo de eventos (`calendar.events`), com PKCE, e guarda o refresh token. Não pede acesso ao restante da conta Google.
