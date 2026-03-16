export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-xl font-bold text-foreground mb-6">Termos de Serviço</h1>
      <div className="prose prose-invert prose-sm text-muted space-y-4 text-[13px] leading-relaxed">
        <p>Última atualização: Março 2026</p>
        <p>Ao utilizar a plataforma Apura, concorda com os presentes termos de serviço. A Apura fornece uma plataforma de relatórios inteligentes que se liga a bases de dados Primavera ERP através de um conector local instalado nos seus servidores.</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">1. Acesso e Utilização</h2>
        <p>O acesso à base de dados é exclusivamente de leitura (SELECT). A Apura não altera, insere ou elimina dados na sua base de dados. As credenciais SQL permanecem exclusivamente no seu servidor local.</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">2. Segurança</h2>
        <p>Todas as comunicações são encriptadas via TLS. Os resultados das consultas transitam pela nossa infraestrutura mas não são armazenados permanentemente, exceto quando guarda um relatório explicitamente.</p>
        <h2 className="text-sm font-semibold text-foreground mt-6">3. Privacidade</h2>
        <p>Consulte a nossa política de privacidade para informação detalhada sobre o tratamento de dados pessoais, em conformidade com o RGPD.</p>
      </div>
    </main>
  );
}
