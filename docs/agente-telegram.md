# Bot do Telegram

O bot é o seu agente dentro do Telegram, no privado e no grupo da família. Ele usa o catálogo inteiro do MCP (`docs/agente-conectar.md`, seção 11), com o mesmo manual de operação, grava em nome de quem escreveu e manda um resumo do dia de manhã. Uma data prevista (a próxima troca de óleo) vira pendência em Próximos; a quilometragem vai no hodômetro do carro. Se a gravação falha, ele diz que não gravou, em vez de confirmar.

Tudo é configurado no app, em **Agentes → Bot** (`/agentes/bot`), só pela conta master. A única variável de ambiente é `CASA_SECRET_KEY`.

## O que ele faz

- **Privado**: você conversa com o seu agente. Ele lê e grava na Casa (pendências, histórico, doses, eventos, finanças).
- **Grupo da família**: cada mensagem é de alguém. O bot identifica a pessoa pelo id do Telegram (`from.id`) e age na conta dela, com o agente dela (nome e chave próprios). Ele lê o grupo para ter contexto, mas só responde quando é chamado: um comando, `@nome_do_bot`, uma resposta a uma mensagem dele ou o nome que a pessoa deu ao agente.
- **Assunto pessoal no grupo** (saúde, dinheiro, algo só da pessoa): ele responde no privado e avisa no grupo que respondeu lá. Para isso a pessoa precisa ter falado com o bot no privado antes (o Telegram não deixa o bot começar uma conversa).
- **Quem não está ligado** a uma conta da Casa: no privado recebe uma resposta educada pedindo para tocar em Conectar Telegram; no grupo, só se chamar o bot. O bot não lê nem grava nada para essa pessoa.
- **Resumo do dia**: às 07:00 (horário de Brasília), uma vez por dia, uma mensagem com o que está atrasado, o que vence hoje e os próximos 3 dias, com botões **Feito**. Vai para os grupos onde o bot está; se não houver grupo, vai para o privado de cada pessoa ligada. `/resumo_off` e `/resumo_on` desligam e religam em cada chat. O resumo é montado sem IA, não gasta cota.
- **Limpeza e rotina da casa** no resumo: depois de "Hoje", as rotinas da casa atrasadas, sem registro ou que vencem hoje, com a última vez ("• Limpeza do banheiro (Banheiro): atrasada há 2 dias, última vez há 5 dias"). Os botões **Feito** dividem o limite de 5 com o resto do resumo. Não há alerta à noite.
- **`/casa`**: as 8 rotinas da casa mais urgentes (o que não está em dia), com botões **Feito** para as 5 primeiras. Montado sem IA. Para mudar uma frequência, peça ao agente na conversa.
- **Feito** no resumo marca a tarefa em nome de quem tocou. Se for algo que costuma custar dinheiro (veterinário, conserto, revisão), o bot pergunta quanto custou.

### Finanças

O bot nunca cria lançamento por iniciativa própria. A única exceção: depois de concluir uma tarefa que costuma ter custo, ele pergunta quanto custou e só grava o valor que a pessoa disser (`registrar_custo`, até 72 h depois e só por quem concluiu).

### O nome do agente

Cada pessoa tem o próprio agente no bot, com o nome que quiser (o padrão é "Agente"). Para mudar, diga ao bot no privado "quero te chamar de Bebê". O nome fica no banco (`agent_keys.label`, chave do tipo `telegram`) e vale também para chamar o bot no grupo. O app não tem um nome fixo para o agente: os textos dizem "seu agente".

### Quem fez o quê

Cada pessoa ligada ganha uma chave interna do tipo `telegram` (não serve para HTTP e não aparece na lista de chaves). Tudo o que o bot grava leva `created_by_user_id` e `agent_key_id` dessa pessoa, e cada escrita entra em `agent_activity` com o canal `telegram`.

### Memória curta

O bot guarda as últimas mensagens de cada chat em `agent_messages` e manda só as 12 últimas ao modelo. Mensagens com mais de 30 dias são apagadas no resumo diário.

## Passo a passo (dono, depois do merge)

### 1. Crie o bot no @BotFather

1. No Telegram, abra o **@BotFather** e mande `/newbot`. Escolha o nome e o usuário (precisa terminar em `bot`). Ele responde com o **token**. Guarde, não mande para ninguém.
2. Mande `/setprivacy`, escolha o bot e **Disable**.

Por que desligar o modo privacidade: por padrão o bot em grupo só recebe comandos, menções e respostas a ele ([Telegram, Privacy Mode](https://core.telegram.org/bots/features#privacy-mode)). Com o modo desligado ele recebe as mensagens do grupo e consegue entender "fiz isso agora" no contexto da conversa. O Telegram avisa: a mudança só vale depois de **tirar e adicionar o bot de novo** em grupos onde ele já estava. Um bot administrador do grupo também recebe tudo.

### 2. Crie a chave da IA

Padrão: **Groq**, modelo `openai/gpt-oss-120b`, no plano grátis.

1. Crie a chave em https://console.groq.com/keys.
2. Em **Settings → Data Controls** (https://console.groq.com/settings/data-controls), ative **Zero Data Retention**. A Groq não treina com os dados da API e, por padrão, não guarda as conversas, mas pode guardar até 30 dias para investigar falha ou abuso; o ZDR desliga isso ([Your Data in GroqCloud](https://console.groq.com/docs/your-data)).

No plano grátis há limite de pedidos e de tokens por minuto e por dia. Se o bot bater no limite, ele responde "Cheguei no limite do plano de IA agora" e volta a funcionar no minuto seguinte. Cada mensagem manda o catálogo inteiro e as 12 últimas falas. Para uma família cabe; se estourar, é esse aviso, e a mensagem seguinte segue.

Outros provedores na tela: OpenAI, Anthropic, Google (Gemini), OpenRouter e qualquer API compatível com OpenAI (com URL base `https://…/v1`).

> **Não use um plano grátis que treina com os dados.** A cota grátis do Gemini (Google AI Studio) permite que o Google use o conteúdo e que pessoas leiam; use o Gemini só com faturamento ativo. No OpenRouter, modelos `:free` podem treinar com os dados: bloqueie os provedores que treinam nas configurações de privacidade. Para qualquer outro, confira os termos antes de mandar dados da família.

### 3. Gere a `CASA_SECRET_KEY` e coloque na Vercel

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Em Vercel → projeto → Settings → Environment Variables, crie `CASA_SECRET_KEY` (Production) com esse valor e faça um novo deploy. É a única variável do bot. Ela cifra (AES-256-GCM) o token e a chave de IA no banco. Se ela mudar, os segredos salvos deixam de abrir: cole o token e a chave de novo na tela.

Opcional: `CRON_SECRET`. Se existir, a Vercel manda `Authorization: Bearer <valor>` ao chamar o resumo, e a rota recusa chamadas sem ele. Sem ela, a rota funciona do mesmo jeito e manda no máximo um resumo por chat por dia.

### 4. Configure em Agentes → Bot

Entre com a conta master na URL pública e abra **Agentes → Configurar o bot**.

1. Provedor, modelo, chave da IA e token do bot. **Salvar**. A tela nunca mostra um segredo salvo, só os 4 últimos caracteres. Campo vazio mantém o que está salvo.
2. **Registrar webhook**. Chama `setWebhook` com `https://<seu-app>/api/telegram/webhook` e um segredo aleatório. O Telegram manda esse segredo no header `X-Telegram-Bot-Api-Secret-Token` e a rota recusa (401) quem não tiver. Precisa ser pela URL https do deploy.
3. **Testar**. Chama `getMe` no Telegram e pede uma palavra ao modelo. Mostra o que deu certo e o que falhou.
4. **Ligar bot**.

**Trocar segredo do webhook** gera um segredo novo; depois toque em Registrar webhook de novo. Cada mudança fica na lista **Mudanças** (quem, o quê e quando, sem valores).

### 5. Cada pessoa liga o próprio Telegram

Cada pessoa entra com a própria conta, abre **Agentes** e toca em **Conectar Telegram**. O Telegram abre o bot; toque em **Iniciar**. O código vale 15 minutos e uma vez só. Pronto: o bot sabe quem é a pessoa. **Desconectar Telegram** desfaz.

### 6. Crie o grupo da família

1. No Telegram, crie um grupo com a família e adicione o bot (pelo usuário dele).
2. Se o bot já estava no grupo antes do `/setprivacy` Disable, tire e adicione de novo.
3. Converse normalmente. Para pedir algo, chame o bot: `@nome_do_bot anota a vacina para sexta` ou pelo nome do seu agente.

O resumo do dia passa a ir para o grupo (e não mais para o privado).

## Rotas

| Rota | Quem chama | Proteção |
| --- | --- | --- |
| `POST /api/telegram/webhook` | Telegram | header `X-Telegram-Bot-Api-Secret-Token`; responde 200 depois da checagem para o Telegram não reenviar |
| `GET /api/telegram/digest` | Vercel Cron, `0 10 * * *` (07:00 BRT) | `CRON_SECRET` se existir; no máximo um resumo por chat por dia |

No plano Hobby da Vercel o cron roda uma vez por dia e pode atrasar até 59 minutos (entre 07:00 e 07:59).

## Testes

Nenhum teste usa token real nem rede: o Telegram e o modelo são simulados (`MockLanguageModelV3`). `tests/integration/telegram-bot-db.test.ts` cobre ligação por código, privado e grupo, quem não está ligado, resposta no privado, nome do agente, atualização repetida, Feito com pergunta de custo, resumo e a tela de configuração (cifragem, máscara, só master, sem `CASA_SECRET_KEY`).
