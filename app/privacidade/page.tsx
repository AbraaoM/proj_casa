import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacidade (rascunho)", description: "Que dados o app guarda, para quê e com quem ficam." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacidade" updated="21/11/2026">
      <p>Resumo em português simples do que acontece com os dados de uma família neste app.</p>
      <h2>O que o app guarda</h2>
      <ul>
        <li>Conta: usuário e senha. A senha fica guardada só como hash, nunca em texto.</li>
        <li>O que a família cadastra: cães, carros, pessoas da casa, rotinas, remédios, contas e lançamentos, refeições e estoque.</li>
        <li>Se a família ligar o agente no Telegram: o nome e o identificador de quem conversa com o bot, e as mensagens recentes (guardadas por 30 dias).</li>
        <li>Chaves que a família coloca na tela do agente (provedor de IA, token do Telegram) ficam criptografadas.</li>
      </ul>
      <h2>Para quê</h2>
      <p>Só para o app funcionar para a sua família: mostrar o que pede atenção, lembrar vencimentos e responder pelo agente. Não vendemos dados e não há anúncios.</p>
      <h2>Quem enxerga</h2>
      <p>Cada família só enxerga os próprios dados. O isolamento é feito no banco de dados, não só na tela. As pessoas da mesma família veem o que a família cadastrou.</p>
      <h2>Onde ficam</h2>
      <p>Em serviços de nuvem: hospedagem na Vercel e banco de dados na Neon. Se a família usar um provedor de IA, o texto que ela mandar ao agente é enviado a esse provedor, com a chave dela.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir acesso, correção ou exclusão dos seus dados (LGPD). Ainda não existe uma tela para isso: o pedido é feito ao responsável pelo serviço, pelo contato [a definir antes de abrir ao público].</p>
      <h2>Pendências deste rascunho</h2>
      <ul>
        <li>Identificar o responsável pelo tratamento e o contato.</li>
        <li>Revisão jurídica e definição de prazos de retenção e de exclusão.</li>
      </ul>
    </LegalPage>
  );
}
