import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Termos de uso (rascunho)", description: "Regras de uso do app, do teste de 14 dias e das famílias." };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updated="21/11/2026">
      <p>Ao criar uma família você concorda com estas regras. Elas ainda são um rascunho.</p>
      <h2>O serviço</h2>
      <p>O app organiza a rotina da casa: cães, carros, família, contas e remédios. Ele é uma ferramenta de organização e não substitui orientação médica, veterinária, financeira ou jurídica.</p>
      <h2>Teste de 14 dias</h2>
      <p>Cada família nova tem 14 dias para usar sem custo e sem cartão. Depois disso a família fica só para consulta: nada é apagado e nada é cobrado. Ainda não há plano pago.</p>
      <h2>Sua conta e sua família</h2>
      <ul>
        <li>Quem cria a família é o dono. Ele convida as outras pessoas por link e redefine senhas.</li>
        <li>Guarde a sua senha. Não há recuperação de senha.</li>
        <li>Você é responsável pelo que cadastra e por quem convida.</li>
      </ul>
      <h2>Uso adequado</h2>
      <p>Não use o app para atividade ilegal, para tentar acessar dados de outra família ou para sobrecarregar o serviço.</p>
      <h2>Disponibilidade</h2>
      <p>O serviço é oferecido como está, sem garantia de funcionamento contínuo. Os avisos e lembretes dependem de terceiros (por exemplo, o Telegram) e podem falhar. Confira prazos importantes por outros meios também.</p>
      <h2>Mudanças</h2>
      <p>Estes termos podem mudar. Quando mudarem de forma relevante, o app avisará.</p>
      <h2>Pendências deste rascunho</h2>
      <ul>
        <li>Revisão jurídica, responsável pelo serviço, foro e regras de cobrança quando houver plano pago.</li>
      </ul>
    </LegalPage>
  );
}
