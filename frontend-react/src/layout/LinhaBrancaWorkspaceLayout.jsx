import { useEffect, useState } from "react";
import {
  ArrowLeft, BarChart3, ChevronDown, ChevronRight, ClipboardCheck,
  Droplets, LayoutDashboard, LogOut, Menu, PackageOpen, PackageSearch,
  Refrigerator, Snowflake, UploadCloud, User, WashingMachine,
  Warehouse, Wrench, X, Layers3, TestTubeDiagonal, Trash2, ShieldCheck,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";

const NAVEGACAO = [
  {
    id:"gestao", titulo:"Gestão e controle", icone:BarChart3,
    itens:[
      {nome:"Painel geral",rota:"/v2/linha-branca",icone:LayoutDashboard,exata:true},
      {nome:"Gestão da produção",rota:"/v2/linha-branca/gestao/producao",icone:BarChart3},
      {nome:"Estoque de lavadoras",rota:"/v2/linha-branca/gestao/estoque",icone:Warehouse},
      {nome:"Upload diário de Aging",rota:"/v2/linha-branca/uploads",icone:UploadCloud},
    ],
  },
  {
    id:"operacao",titulo:"Linhas operacionais",icone:Layers3,
    subgrupos:[
      {id:"lavadoras",titulo:"Lavadoras",icone:WashingMachine,itens:[
        {nome:"Visão da linha",rota:"/v2/linha-branca/lavadoras",exata:true},
        {nome:"Triagem",rota:"/v2/linha-branca/lavadoras/triagem"},
        {nome:"Reparos",rota:"/v2/linha-branca/lavadoras/reparos"},
        {nome:"Bancada de testes",rota:"/v2/linha-branca/lavadoras/testes"},
        {nome:"Scrap",rota:"/v2/linha-branca/lavadoras/scrap",permissao:"/v2/linha-branca/lavadoras/triagem"},
      ]},
      {id:"refrigeracao",titulo:"Refrigeração",icone:Refrigerator,itens:[
        {nome:"Visão da linha",rota:"/v2/linha-branca/refrigeracao",exata:true},
        {nome:"Triagem",rota:"/v2/linha-branca/refrigeracao/triagem"},
        {nome:"Reparos",rota:"/v2/linha-branca/refrigeracao/reparos"},
        {nome:"Bancada de testes",rota:"/v2/linha-branca/refrigeracao/testes"},
      ]},
      {id:"climatizacao",titulo:"Climatização",icone:Snowflake,itens:[
        {nome:"Visão da linha",rota:"/v2/linha-branca/climatizacao",exata:true},
        {nome:"Triagem",rota:"/v2/linha-branca/climatizacao/triagem"},
        {nome:"Reparos",rota:"/v2/linha-branca/climatizacao/reparos"},
        {nome:"Bancada de testes",rota:"/v2/linha-branca/climatizacao/testes"},
      ]},
      {id:"outras",titulo:"Outras categorias",icone:Wrench,itens:[
        {nome:"Reparos de outras categorias",rota:"/v2/linha-branca/reparos-outros",permissao:"/v2/linha-branca"},
        {nome:"Portáteis",desabilitado:true,icone:PackageSearch},
      ]},
    ],
  },
  {
    id:"destinacao",titulo:"Destinação e qualidade",icone:PackageOpen,
    itens:[
      {nome:"Desmembramento de peças",rota:"/v2/linha-branca/desmembramento",icone:PackageOpen},
      {nome:"Scrap de lavadoras",rota:"/v2/linha-branca/lavadoras/scrap",permissao:"/v2/linha-branca/lavadoras/triagem",icone:Trash2},
      {nome:"QCC",desabilitado:true,icone:ShieldCheck},
      {nome:"Higienização",desabilitado:true,icone:Droplets},
    ],
  },
];

function ItemLink({item,onNavigate,hasAccess}){
  const Icon=item.icone;
  if(item.desabilitado)return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/35" title="Funcionalidade em implantação">
      {Icon&&<Icon size={15}/>}<span className="flex-1">{item.nome}</span>
      <span className="text-[9px] font-semibold">Em breve</span>
    </div>
  );
  if(!hasAccess(item.permissao||item.rota))return null;
  return <NavLink to={item.rota} end={!!item.exata} onClick={onNavigate}
    className={({isActive})=>"group flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition "+
      (isActive?"bg-white text-[#43284F] shadow-sm":"text-white/65 hover:bg-white/10 hover:text-white")}>
    {Icon?<Icon size={15} className="shrink-0"/>:<span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40"/>}
    <span className="min-w-0 flex-1 truncate">{item.nome}</span>
    <ChevronRight size={13} className="opacity-0 transition group-hover:opacity-100"/>
  </NavLink>;
}

export default function LinhaBrancaWorkspaceLayout(){
  const navigate=useNavigate();
  const location=useLocation();
  const {profile,hasAccess}=useAuth();
  const [mobileOpen,setMobileOpen]=useState(false);
  const [abertos,setAbertos]=useState({gestao:true,operacao:true,lavadoras:true,destinacao:true});
  function toggle(k){setAbertos(v=>({...v,[k]:!v[k]}));}
  useEffect(()=>{setMobileOpen(false);},[location.pathname]);
  async function sair(){await signOut();navigate("/login",{replace:true});}
  const nav=(mobile=false)=>(
    <div className="flex h-full flex-col bg-[linear-gradient(175deg,#321D49_0%,#241334_70%,#1E112B_100%)] text-white">
      <div className="flex h-[76px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <img src="/brand/liquida-logo-icon.png" alt="LiquidaPreço"
          className="h-10 w-10 rounded-xl bg-white p-1 object-contain"/>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">Liquida System</div>
          <p className="mt-0.5 text-[10px] font-semibold tracking-[.12em] text-violet-200/70">LINHA BRANCA</p>
        </div>
        {mobile&&<button aria-label="Fechar menu" type="button" onClick={()=>setMobileOpen(false)}
          className="rounded-lg p-2 text-white/75 hover:bg-white/10"><X size={18}/></button>}
      </div>
      <nav aria-label="Navegação da Linha Branca" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-5">
        {NAVEGACAO.map(grupo=>{
          const GrupoIcon=grupo.icone;
          return <div key={grupo.id}>
            <button type="button" onClick={()=>toggle(grupo.id)}
              aria-expanded={!!abertos[grupo.id]}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-[.10em] text-violet-100 hover:bg-white/5">
              <GrupoIcon size={16} className="shrink-0 text-violet-200"/>
              <span className="flex-1">{grupo.titulo}</span>
              {abertos[grupo.id]?<ChevronDown size={15}/>:<ChevronRight size={15}/>}
            </button>
            {abertos[grupo.id]&&
              <div className="mt-1 space-y-0.5 pl-2">
                {(grupo.itens||[]).map(item=><ItemLink key={item.rota||item.nome}
                  item={item} hasAccess={hasAccess} onNavigate={()=>setMobileOpen(false)}/>)}
                {(grupo.subgrupos||[]).map(sub=>{
                  const SubIcon=sub.icone;
                  const disponiveis=sub.itens.some(item=>item.desabilitado||hasAccess(item.permissao||item.rota));
                  if(!disponiveis)return null;
                  return <div key={sub.id} className="mt-1">
                    <button type="button" onClick={()=>toggle(sub.id)}
                      aria-expanded={!!abertos[sub.id]}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-white/80 hover:bg-white/10">
                      <SubIcon size={15} className="shrink-0 text-violet-200/85"/>
                      <span className="flex-1">{sub.titulo}</span>
                      {abertos[sub.id]?<ChevronDown size={14}/>:<ChevronRight size={14}/>}
                    </button>
                    {abertos[sub.id]&&<div className="space-y-0.5 border-l border-white/10 pl-2 ml-5">
                      {sub.itens.map(item=><ItemLink key={item.rota||item.nome}
                        item={item} hasAccess={hasAccess} onNavigate={()=>setMobileOpen(false)}/>)}
                    </div>}
                  </div>;
                })}
              </div>
            }
          </div>;
        })}
      </nav>
      <div className="shrink-0 space-y-2 border-t border-white/10 p-4">
        <button type="button" onClick={()=>navigate("/sistemas")}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white">
          <ArrowLeft size={16}/> Voltar aos sistemas
        </button>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <User size={17}/>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{profile?.nome||"Usuário"}</p>
            <p className="text-[10px] text-white/45">Operação · Linha Branca</p>
          </div>
          <button type="button" onClick={sair} title="Sair" aria-label="Sair da conta"
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><LogOut size={16}/></button>
        </div>
      </div>
    </div>
  );
  return <div className="min-h-screen bg-[#F5F6F9]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[278px] lg:block">
      {nav()}
    </aside>
    {mobileOpen&&<div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Fechar navegação" onClick={()=>setMobileOpen(false)}
        className="absolute inset-0 bg-slate-950/65"/>
      <aside className="relative h-full w-[285px] max-w-[88vw] shadow-2xl">{nav(true)}</aside>
    </div>}
    <div className="min-w-0 lg:pl-[278px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
        <button type="button" onClick={()=>setMobileOpen(true)}
          aria-label="Abrir menu de navegação" className="rounded-xl border border-slate-200 p-2.5 text-[#43284F] lg:hidden">
          <Menu size={20}/>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-900">Operação Linha Branca</div>
          <p className="text-[11px] text-slate-500">Gestão, produção e controle de estoque</p>
        </div>
        <span className="hidden text-xs font-semibold text-slate-500 sm:block">{profile?.nome||"Usuário"}</span>
        <button type="button" onClick={sair}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
          <LogOut size={15}/><span className="hidden sm:inline">Sair</span>
        </button>
      </header>
      <main className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-7 lg:py-8">
        <Outlet/>
      </main>
      <footer className="px-6 pb-6 text-center text-[10px] text-slate-400">
        Powered by <span className="font-semibold">Redoma Advisory</span>
      </footer>
    </div>
  </div>;
}
