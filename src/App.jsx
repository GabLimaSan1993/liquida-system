import { Upload, BarChart3, Database, Search, Bell, Package, Filter, ArrowRight, FileSpreadsheet, Truck, ShieldCheck, Smartphone } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { label: "Itens recebidos", value: "61.971", helper: "Base Aging" },
  { label: "Fornecedores", value: "148", helper: "Base ativa" },
  { label: "Disponíveis para venda", value: "38.420", helper: "OS encerradas" },
  { label: "Uploads processados", value: "12", helper: "Últimos 30 dias" },
];

const suppliers = [
  { name: "Samsung", received: 15240, sold: 11352, pending: 3888, status: "Alta saída" },
  { name: "Motorola", received: 11980, sold: 8043, pending: 3937, status: "Atenção" },
  { name: "Apple", received: 8315, sold: 6992, pending: 1323, status: "Alta margem" },
  { name: "Xiaomi", received: 6421, sold: 4014, pending: 2407, status: "Baixa saída" },
];

const uploads = [
  { name: "Aging Abril 2024", type: "Aging", status: "Concluído", rows: "61.971", progress: 100 },
  { name: "Faturamento Abril 2024", type: "Faturamento", status: "Em validação", rows: "18.244", progress: 72 },
  { name: "Aging Maio 2024", type: "Aging", status: "Aguardando", rows: "--", progress: 0 },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 rounded-2xl bg-[#7F2D92] shadow-lg shadow-fuchsia-300/30 ring-1 ring-white/20 overflow-hidden">
        <div className="absolute inset-x-2 top-1 h-1.5 rounded-full bg-[#F59E0B]" />
        <div className="absolute left-2 top-1 h-1.5 w-3 rounded-full bg-[#F97316]" />
        <div className="absolute left-5 top-1 h-1.5 w-3 rounded-full bg-[#C026D3]" />
        <div className="absolute left-8 top-1 h-1.5 w-2 rounded-full bg-[#84CC16]" />
        <div className="absolute inset-x-2 bottom-1 h-1.5 rounded-full bg-[#F59E0B]" />
        <div className="absolute left-2 bottom-1 h-1.5 w-3 rounded-full bg-[#F97316]" />
        <div className="absolute left-5 bottom-1 h-1.5 w-3 rounded-full bg-[#0EA5E9]" />
        <div className="absolute left-8 bottom-1 h-1.5 w-2 rounded-full bg-[#C026D3]" />
        <div className="absolute inset-y-2 left-1 w-1.5 rounded-full bg-[#F59E0B]" />
        <div className="absolute inset-y-2 right-1 w-1.5 rounded-full bg-[#F59E0B]" />
        <div className="absolute inset-0 flex items-center justify-center text-white font-black text-lg tracking-tight">LP</div>
      </div>
      <div>
        <div className="text-2xl font-black tracking-tight text-[#6B1F87]">
          liquida<span className="text-[#F59E0B]">preço</span>
        </div>
        <div className="text-xs text-slate-500 -mt-1">Liquida System</div>
      </div>
    </div>
  );
}

function SidebarItem({ icon: Icon, label, active = false }) {
  return (
    <button
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${
        active
          ? "bg-white text-[#6B1F87] shadow-lg"
          : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{label}</span>
    </button>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl bg-white/12 p-4 backdrop-blur ring-1 ring-white/10">
      <div className="text-xs text-white/75">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      <div className="text-xs text-white/75">{helper}</div>
    </div>
  );
}

function SectionCard({ children, className = "" }) {
  return (
    <div className={`rounded-[28px] bg-white shadow-xl shadow-violet-100/80 ${className}`}>
      {children}
    </div>
  );
}

function Button({ children, variant = "primary", className = "" }) {
  const base = "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition";
  const styles =
    variant === "outline"
      ? "border border-[#E9D5FF] text-[#6B1F87] bg-white hover:bg-[#FCFAFF]"
      : "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white hover:opacity-95";
  return <button className={`${base} ${styles} ${className}`}>{children}</button>;
}

function Badge({ children, color = "purple" }) {
  const colors = {
    purple: "bg-[#7F2D92] text-white",
    orange: "bg-[#F59E0B] text-white",
    emerald: "bg-emerald-500 text-white",
    sky: "bg-sky-500 text-white",
    rose: "bg-rose-500 text-white",
    amber: "bg-amber-500 text-white",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${colors[color]}`}>{children}</span>;
}

function ProgressBar({ value }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F3E8FF]">
      <div className="h-full rounded-full bg-[linear-gradient(90deg,#7F2D92_0%,#F97316_100%)]" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FAF6FF_0%,#F4ECFA_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:flex flex-col gap-6 bg-[linear-gradient(180deg,#7F2D92_0%,#5B1E74_100%)] p-6 text-white">
          <Logo />

          <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur">
            <div className="text-sm text-white/70">Plataforma</div>
            <div className="mt-1 text-lg font-semibold">Pricing & Margem</div>
            <div className="mt-3 text-sm text-white/75">
              Uploads, conciliação entre Aging e Faturamento e leitura executiva por fornecedor.
            </div>
          </div>

          <nav className="space-y-2">
            <SidebarItem icon={Upload} label="Uploads" active />
            <SidebarItem icon={BarChart3} label="Análises" />
            <SidebarItem icon={Database} label="Base de dados" />
            <SidebarItem icon={Package} label="Estoque e OS" />
            <SidebarItem icon={Bell} label="Alertas" />
          </nav>

          <div className="mt-auto rounded-3xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] p-5 text-white shadow-xl">
            <div className="text-sm opacity-90">Próxima etapa</div>
            <div className="mt-1 text-xl font-bold">Dashboard executivo</div>
            <div className="mt-2 text-sm opacity-90">
              Conectar faturamento, deduplicação e margem consolidada por fornecedor.
            </div>
          </div>
        </aside>

        <main className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-6"
          >
            <section className="rounded-[32px] bg-[linear-gradient(135deg,#7F2D92_0%,#C026D3_45%,#F97316_100%)] p-6 text-white shadow-2xl shadow-fuchsia-200/50">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur">
                    Interface React + Tailwind
                  </div>
                  <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                    Liquida System com cara de produto premium
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-white/90 sm:text-base">
                    Front-end redesenhado com base na identidade visual da Liquida Preço, usando roxo, laranja e composição vibrante.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
                  {stats.map((item) => (
                    <StatCard key={item.label} {...item} />
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <SectionCard>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-[#6B1F87]">Central de Upload</h2>
                    <Badge color="orange">Operacional</Badge>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[24px] border border-dashed border-[#D8B4FE] bg-[#FCFAFF] p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-lg font-bold text-[#6B1F87]">Base de Aging</div>
                          <div className="mt-1 text-sm text-slate-500">Entrada de itens, OS, custos e disponibilidade.</div>
                        </div>
                        <div className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] p-3 text-white shadow-lg">
                          <Upload className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E9D5FF]">
                        <div className="text-sm font-medium">Relatório_de_aging_finalizado_scrap08_04_2024.csv</div>
                        <div className="mt-1 text-xs text-slate-500">61.971 linhas detectadas</div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button>Enviar arquivo</Button>
                        <Button variant="outline">Validar estrutura</Button>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-dashed border-[#D8B4FE] bg-[#FCFAFF] p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-lg font-bold text-[#6B1F87]">Base de Faturamento</div>
                          <div className="mt-1 text-sm text-slate-500">Saída, receita, canal e conciliação com Aging.</div>
                        </div>
                        <div className="rounded-2xl bg-[#7F2D92] p-3 text-white shadow-lg">
                          <FileSpreadsheet className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E9D5FF]">
                        <div className="text-sm font-medium text-slate-400">Nenhum arquivo enviado</div>
                        <div className="mt-1 text-xs text-slate-400">Pronto para receber a base de vendas</div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button className="bg-[#7F2D92] hover:bg-[#6B1F87]">Selecionar arquivo</Button>
                        <Button variant="outline">Ver layout esperado</Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    {uploads.map((item) => (
                      <div key={item.name} className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex rounded-full border border-[#D8B4FE] px-3 py-1 text-xs font-semibold text-[#6B1F87]">{item.type}</span>
                          <span className="text-xs text-slate-500">{item.rows} linhas</span>
                        </div>
                        <div className="mt-3 font-semibold">{item.name}</div>
                        <div className="mt-1 text-sm text-slate-500">{item.status}</div>
                        <div className="mt-4">
                          <ProgressBar value={item.progress} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard>
                <div className="p-6">
                  <h2 className="text-xl font-bold text-[#6B1F87]">Leitura gerencial</h2>
                  <div className="mt-4 grid gap-3">
                    {[
                      { icon: Truck, title: "Entrada e logística reversa", text: "Monitorar recebimento, condição do item e tempo operacional até a liberação." },
                      { icon: ShieldCheck, title: "Qualidade e triagem", text: "Usar status de OS para separar produto vendável de produto ainda em processo." },
                      { icon: Smartphone, title: "Conciliação com vendas", text: "Cruzar IMEI/SerialOut com faturamento para medir giro e margem futura." },
                    ].map((item) => (
                      <div key={item.title} className="flex gap-4 rounded-[22px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                        <div className="rounded-2xl bg-[#F59E0B]/15 p-3 text-[#F59E0B]">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-[#6B1F87]">{item.title}</div>
                          <div className="mt-1 text-sm text-slate-500">{item.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
              <SectionCard>
                <div className="p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-bold text-[#6B1F87]">Análise por fornecedor</h2>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          placeholder="Buscar fornecedor"
                          className="w-[220px] rounded-2xl border border-[#E9D5FF] bg-white py-2 pl-9 pr-3 outline-none"
                        />
                      </div>
                      <Button variant="outline">
                        <Filter className="mr-2 h-4 w-4" />
                        Filtrar
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[24px] ring-1 ring-[#E9D5FF]">
                    <div className="grid grid-cols-5 bg-[#FCFAFF] px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <div>Fornecedor</div>
                      <div>Recebidos</div>
                      <div>Vendidos</div>
                      <div>Pendentes</div>
                      <div>Status</div>
                    </div>

                    <div className="divide-y divide-[#F3E8FF] bg-white">
                      {suppliers.map((supplier) => (
                        <div key={supplier.name} className="grid grid-cols-5 items-center px-5 py-4 text-sm">
                          <div className="font-semibold text-[#6B1F87]">{supplier.name}</div>
                          <div>{supplier.received.toLocaleString("pt-BR")}</div>
                          <div>{supplier.sold.toLocaleString("pt-BR")}</div>
                          <div>{supplier.pending.toLocaleString("pt-BR")}</div>
                          <div>
                            <Badge
                              color={
                                supplier.status === "Alta margem"
                                  ? "emerald"
                                  : supplier.status === "Alta saída"
                                  ? "sky"
                                  : supplier.status === "Baixa saída"
                                  ? "rose"
                                  : "amber"
                              }
                            >
                              {supplier.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard>
                <div className="p-6">
                  <h2 className="text-xl font-bold text-[#6B1F87]">Próxima arquitetura recomendada</h2>
                  <div className="mt-4 space-y-4">
                    {[
                      ["Front-end", "React + Tailwind para interface premium e escalável."],
                      ["Backend", "Python ou funções serverless para ingestão e deduplicação."],
                      ["Banco", "Supabase para autenticação, armazenamento e análise."],
                      ["Uploads", "Pipeline com logs, hashes de arquivos e bloqueio de duplicidade."],
                    ].map(([title, text]) => (
                      <div key={title} className="rounded-[22px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                        <div className="font-semibold text-[#6B1F87]">{title}</div>
                        <div className="mt-1 text-sm text-slate-500">{text}</div>
                      </div>
                    ))}

                    <Button className="w-full bg-[linear-gradient(135deg,#7F2D92_0%,#F97316_100%)]">
                      Avançar para layout completo
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </section>
          </motion.div>
        </main>
      </div>
    </div>
  );
}