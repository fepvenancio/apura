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
        <h2 className="text-sm font-semibold text-foreground mt-6">5. Contacto</h2>
        <p>Para questões sobre privacidade, contacte-nos em privacidade@apura.xyz.</p>
      </div>
    </main>
  );
}
