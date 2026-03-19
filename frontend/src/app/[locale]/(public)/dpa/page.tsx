export default function DpaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-xl font-bold text-foreground mb-6">Acordo de Processamento de Dados (DPA)</h1>
      <div className="prose prose-invert prose-sm text-muted space-y-4 text-[13px] leading-relaxed">
        <p>Ultima atualizacao: Marco 2026</p>

        <h2 className="text-sm font-semibold text-foreground mt-6">1. Ambito</h2>
        <p>
          A Apura atua como processador de dados pessoais em nome do controlador de dados (organizacao cliente).
          O ambito do processamento abrange: dados de conta de utilizador (nome, email), metadados de consultas
          (consultas SQL geradas, timestamps, parametros), e conteudo de relatorios guardados.
        </p>

        <h2 className="text-sm font-semibold text-foreground mt-6">2. Obrigacoes do Processador</h2>
        <p>
          A Apura compromete-se a processar dados pessoais exclusivamente de acordo com as instrucoes do controlador.
          Implementamos medidas tecnicas e organizacionais apropriadas para garantir a seguranca dos dados,
          incluindo encriptacao TLS em transito e controlo de acesso baseado em funcoes. A Apura assiste o controlador
          no cumprimento de pedidos de direitos dos titulares (DSAR), incluindo eliminacao e exportacao de dados.
        </p>

        <h2 className="text-sm font-semibold text-foreground mt-6">3. Sub-processadores</h2>
        <p>A Apura utiliza os seguintes sub-processadores para a prestacao do servico:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Cloudflare</strong> — infraestrutura cloud, CDN, armazenamento
            (D1, R2, KV)
          </li>
          <li>
            <strong className="text-foreground">Anthropic</strong> — processamento de linguagem natural para
            geracao SQL
          </li>
          <li>
            <strong className="text-foreground">Resend</strong> — envio de emails transacionais (verificacao,
            recuperacao de password, convites)
          </li>
          <li>
            <strong className="text-foreground">Stripe</strong> — processamento de pagamentos e faturacao
          </li>
        </ul>

        <h2 className="text-sm font-semibold text-foreground mt-6">4. Transferencias Internacionais</h2>
        <p>
          Os dados sao processados na Uniao Europeia atraves da infraestrutura Cloudflare EU.
          As chamadas a API da Anthropic podem transitar por servidores nos Estados Unidos,
          mas contem apenas metadados de consultas (texto em linguagem natural), nunca conteudo
          da base de dados do cliente.
        </p>

        <h2 className="text-sm font-semibold text-foreground mt-6">5. Retencao de Dados</h2>
        <p>
          As consultas sao retidas por um periodo maximo de 12 meses. Os registos de auditoria
          sao anonimizados apos 24 meses. Apos estes periodos, os dados sao automaticamente
          eliminados ou anonimizados.
        </p>

        <h2 className="text-sm font-semibold text-foreground mt-6">6. Direitos dos Titulares</h2>
        <p>
          Os utilizadores podem solicitar a exportacao dos seus dados e a eliminacao da sua conta
          atraves da pagina de definicoes. Os pedidos sao processados no prazo de 30 dias,
          em conformidade com o Artigo 17 do RGPD.
        </p>

        <h2 className="text-sm font-semibold text-foreground mt-6">7. Contacto</h2>
        <p>
          Para questoes relacionadas com o processamento de dados, contacte-nos em{' '}
          <a href="mailto:privacidade@apura.xyz" className="text-foreground underline">
            privacidade@apura.xyz
          </a>.
        </p>
      </div>
    </main>
  );
}
