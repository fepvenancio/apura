export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-xl font-bold text-foreground mb-6">Política de Privacidade</h1>
      <div className="prose prose-invert prose-sm text-muted space-y-4 text-[13px] leading-relaxed">
        <p>Última atualização: Março 2026</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">1. Dados que recolhemos</h2>
        <p>Recolhemos apenas os dados necessários para operar o serviço: nome, email, nome da organização e metadados de utilização (consultas executadas, relatórios guardados).</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">2. Dados da base de dados</h2>
        <p>Os resultados das consultas SQL transitam temporariamente pelos nossos servidores para apresentação no browser. Não armazenamos dados da sua base de dados Primavera a menos que guarde explicitamente um relatório. As credenciais SQL nunca saem do seu servidor.</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">3. Conformidade RGPD</h2>
        <p>A Apura atua como processador de dados. Enquanto controlador dos dados, a sua organização mantém total controlo. Disponibilizamos mecanismos para exportação e eliminação de dados conforme o RGPD.</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">4. Localização dos dados</h2>
        <p>A infraestrutura cloud opera na Europa Ocidental (Cloudflare). Os dados da sua base de dados permanecem no seu servidor local.</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">5. Sub-processadores</h2>
        <p>A Apura utiliza os seguintes sub-processadores para a prestacao do servico:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Cloudflare</strong> — infraestrutura cloud, rede de distribuicao
            de conteudo, base de dados (D1), armazenamento (R2, KV)
          </li>
          <li>
            <strong className="text-foreground">Anthropic</strong> — servico de inteligencia artificial para
            conversao de linguagem natural em consultas SQL
          </li>
          <li>
            <strong className="text-foreground">Resend</strong> — servico de envio de emails transacionais
            (verificacao, recuperacao de password, convites)
          </li>
          <li>
            <strong className="text-foreground">Stripe</strong> — processamento de pagamentos e gestao de
            subscricoes
          </li>
        </ul>

        <h2 className="text-sm font-semibold text-foreground mt-6">6. Retencao de Dados</h2>
        <p>
          As consultas sao retidas por um periodo maximo de 12 meses. Os registos de auditoria sao
          anonimizados apos 24 meses. Os utilizadores podem solicitar a exportacao dos seus dados ou
          a eliminacao da sua conta a qualquer momento.
        </p>

        <h2 className="text-sm font-semibold text-foreground mt-6">7. Contacto</h2>
        <p>Para questoes sobre privacidade, contacte-nos em privacidade@apura.xyz.</p>
      </div>
    </main>
  );
}
