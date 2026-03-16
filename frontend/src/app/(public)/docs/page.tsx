export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-xl font-bold text-foreground mb-6">Documentação</h1>
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Guia de Instalação</h2>
          <div className="rounded-lg border border-card-border bg-card p-5 space-y-3 text-[13px] text-muted leading-relaxed">
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">1.</span>
              <div>
                <p className="text-foreground font-medium">Criar conta</p>
                <p>Registe-se em apura.xyz/signup. Receberá uma chave API para o conector.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">2.</span>
              <div>
                <p className="text-foreground font-medium">Instalar o Conector</p>
                <p>Transfira o Apura Connector e instale-o no servidor Windows onde o SQL Server corre. O conector é um executável autónomo, sem dependências externas.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">3.</span>
              <div>
                <p className="text-foreground font-medium">Configurar</p>
                <p>Introduza a chave API e as credenciais SQL Server no assistente de configuração. Recomendamos criar um utilizador SQL dedicado com permissão apenas de leitura (db_datareader).</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-mono font-bold shrink-0">4.</span>
              <div>
                <p className="text-foreground font-medium">Começar a perguntar</p>
                <p>O conector liga-se automaticamente à cloud. Volte a apura.xyz e comece a fazer perguntas sobre os seus dados em português.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Requisitos</h2>
          <div className="rounded-lg border border-card-border bg-card p-5 text-[13px]">
            <table className="w-full">
              <tbody className="divide-y divide-card-border">
                <tr><td className="py-2 text-muted">SQL Server</td><td className="py-2 text-foreground">2016, 2017, 2019 ou 2022</td></tr>
                <tr><td className="py-2 text-muted">Primavera</td><td className="py-2 text-foreground">V9, V10 ou Evolution</td></tr>
                <tr><td className="py-2 text-muted">Sistema Operativo</td><td className="py-2 text-foreground">Windows Server 2016+ ou Windows 10/11</td></tr>
                <tr><td className="py-2 text-muted">Rede</td><td className="py-2 text-foreground">Acesso HTTPS de saída (porta 443). Sem portas de entrada.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Segurança</h2>
          <div className="rounded-lg border border-card-border bg-card p-5 space-y-2 text-[13px] text-muted leading-relaxed">
            <p>O conector estabelece uma ligação WebSocket encriptada (WSS/TLS) de saída. Não necessita de abrir portas no firewall.</p>
            <p>As credenciais SQL permanecem exclusivamente no servidor local. A cloud nunca vê a password do SQL Server.</p>
            <p>Todas as queries são validadas por 3 camadas independentes antes de executar: validação cloud, validação no conector, e permissões SQL Server (apenas SELECT).</p>
          </div>
        </section>
      </div>
    </main>
  );
}
