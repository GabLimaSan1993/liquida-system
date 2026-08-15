import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

import MainLayout from "./layout/MainLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import GerenciarUsuariosPage from "./pages/GerenciarUsuariosPage.jsx";

import UploadPage from "./pages/UploadPage.jsx";
import AnalysisEntryPage from "./pages/AnalysisEntryPage.jsx";
import FaturamentoPage from "./pages/FaturamentoPage.jsx";
import AberturaOsPage from "./pages/AberturaOsPage.jsx";
import LinhaBrancaTriagemPage from "./pages/LinhaBrancaTriagemPage.jsx";
import ReparoLinhaBrancaPage from "./pages/ReparoLinhaBrancaPage.jsx";
import ReparosRefrigeracaoPage from "./pages/ReparosRefrigeracaoPage.jsx";
import TriagemReparosPage from "./pages/TriagemReparosPage.jsx";
import BancadaTestesPage from "./pages/BancadaTestesPage.jsx";
import LimpezaPage from "./pages/LimpezaPage.jsx";
import QualidadePage from "./pages/QualidadePage.jsx";
import FluxoCaixaRealizadoPage from "./pages/FluxoCaixaRealizadoPage.jsx";
import ContasPagarPage from "./pages/ContasPagarPage.jsx";
import ContasReceberPage from "./pages/ContasReceberPage.jsx";
import CargaHistoricaPage from "./pages/CargaHistoricaPage.jsx";

import AssurantDashboardPage from "./pages/assurant/AssurantDashboardPage.jsx";
import AssurantSLAPage from "./pages/assurant/AssurantSLAPage.jsx";
import AssurantLayoutPage from "./pages/assurant/AssurantLayoutPage.jsx";
import IndicadoresPage from "./pages/IndicadoresPage.jsx";

import RecebimentoPage from "./pages/RecebimentoPage.jsx";
import GestaoRecebimentoPage from "./pages/GestaoRecebimentoPage.jsx";
import B2BPickingPage from "./pages/B2BPickingPage.jsx";
import TrocasB2CAssurantPage from "./pages/TrocasB2CAssurantPage.jsx";
import TrocasB2CFurbtechPage from "./pages/TrocasB2CFurbtechPage.jsx";
import PedidosB2CPage from "./pages/PedidosB2CPage.jsx";
import B2CEmbalagemMesaPage from "./pages/B2CEmbalagemMesaPage.jsx";
import B2CPainelGestorPage from "./pages/B2CPainelGestorPage.jsx";
import ExpedicaoPage from "./pages/ExpedicaoPage.jsx";
import EtiquetasEnvioPage from "./pages/EtiquetasEnvioPage.jsx";
import B2BPainelGestorPage from "./pages/B2BPainelGestorPage.jsx";
import InventarioPage from "./pages/InventarioPage.jsx";
import EntradaOraclePage from "./pages/EntradaOraclePage.jsx";
import TriagemFuncionalPage from "./pages/TriagemFuncionalPage.jsx";
import LaudoPage from "./pages/LaudoPage.jsx";
import TriagemCosmeticaPage from "./pages/TriagemCosmeticaPage.jsx";
import ArmazenagemPage from "./pages/ArmazenagemPage.jsx";
import EstoqueWmsPage from "./pages/EstoqueWmsPage.jsx";
import CargaInicialEstoquePage from "./pages/CargaInicialEstoquePage.jsx";
import PortalTrocasDevolucoesAssurantPage from "./pages/PortalTrocasDevolucoesAssurantPage.jsx";
import PortalTrocasDevolucoesFurbtechPage from "./pages/PortalTrocasDevolucoesFurbtechPage.jsx";
import GestaoTrocasDevolucoesPage from "./pages/GestaoTrocasDevolucoesPage.jsx";

function ProtectedRoute({ tela, children }) {
  const { user, loading, hasAccess } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-purple-700 font-bold">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (tela && !hasAccess(tela)) return <Navigate to="/sem-acesso" replace />;
  return children;
}

function DefaultRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-purple-700 font-bold">Carregando...</div>;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.is_master)                                                        return <Navigate to="/upload" replace />;
  if (profile.area_tecnica === "assurant_trocas")                               return <Navigate to="/trocas-devolucoes/assurant" replace />;
  if (profile.area_tecnica === "refrigeracao")                                  return <Navigate to="/linha-branca/triagem" replace />;
  if (["climatizacao", "lavadoras", "diversos"].includes(profile.area_tecnica)) return <Navigate to="/linha-branca/triagem-reparos" replace />;
  if (profile.area_tecnica === "assurant") {
    const primeira = profile.telas_permitidas?.[0];
    return <Navigate to={primeira || "/sem-acesso"} replace />;
  }
  if (profile.telas_permitidas?.length > 0) return <Navigate to={profile.telas_permitidas[0]} replace />;
  return <Navigate to="/sem-acesso" replace />;
}

function SemAcessoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6FF]">
      <div className="text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-black text-[#6B1F87] mb-2">Acesso negado</h1>
        <p className="text-slate-500">Você não tem permissão para acessar esta página.</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-purple-700 font-bold">Carregando...</div>;

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
      <Route path="/sem-acesso" element={<SemAcessoPage />} />

      <Route element={
        <ProtectedRoute>
          <MainLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<DefaultRedirect />} />

        <Route path="/upload"                     element={<ProtectedRoute tela="/upload"><UploadPage /></ProtectedRoute>} />
        <Route path="/analise-entrada"            element={<ProtectedRoute tela="/analise-entrada"><AnalysisEntryPage /></ProtectedRoute>} />
        <Route path="/faturamento"                element={<ProtectedRoute tela="/faturamento"><FaturamentoPage /></ProtectedRoute>} />
        <Route path="/abertura-os"                element={<ProtectedRoute tela="/abertura-os"><AberturaOsPage /></ProtectedRoute>} />
        <Route path="/financeiro/fluxo-realizado" element={<ProtectedRoute tela="/financeiro/fluxo-realizado"><FluxoCaixaRealizadoPage /></ProtectedRoute>} />
        <Route path="/financeiro/contas-pagar"    element={<ProtectedRoute tela="/financeiro/contas-pagar"><ContasPagarPage /></ProtectedRoute>} />
        <Route path="/financeiro/contas-receber"  element={<ProtectedRoute tela="/financeiro/contas-receber"><ContasReceberPage /></ProtectedRoute>} />
        <Route path="/financeiro/carga-historica" element={<ProtectedRoute tela="/financeiro/carga-historica"><CargaHistoricaPage /></ProtectedRoute>} />

        <Route path="/linha-branca/triagem"          element={<ProtectedRoute tela="/linha-branca/triagem"><LinhaBrancaTriagemPage /></ProtectedRoute>} />
        <Route path="/linha-branca/reparo-mecanico"  element={<ProtectedRoute tela="/linha-branca/reparo-mecanico"><ReparoLinhaBrancaPage areaExecucao="Reparo Mecânico" /></ProtectedRoute>} />
        <Route path="/linha-branca/reparo-eletrico"  element={<ProtectedRoute tela="/linha-branca/reparo-eletrico"><ReparoLinhaBrancaPage areaExecucao="Reparo Elétrico" /></ProtectedRoute>} />
        <Route path="/linha-branca/reparo-estetico"  element={<ProtectedRoute tela="/linha-branca/reparo-estetico"><ReparoLinhaBrancaPage areaExecucao="Reparo Estético" /></ProtectedRoute>} />
        <Route path="/linha-branca/reparos"          element={<ProtectedRoute tela="/linha-branca/reparos"><ReparosRefrigeracaoPage /></ProtectedRoute>} />
        <Route path="/linha-branca/triagem-reparos"  element={<ProtectedRoute tela="/linha-branca/triagem-reparos"><TriagemReparosPage /></ProtectedRoute>} />
        <Route path="/linha-branca/bancada-testes"   element={<ProtectedRoute tela="/linha-branca/bancada-testes"><BancadaTestesPage /></ProtectedRoute>} />
        <Route path="/linha-branca/limpeza"          element={<ProtectedRoute tela="/linha-branca/limpeza"><LimpezaPage /></ProtectedRoute>} />
        <Route path="/linha-branca/qualidade"        element={<ProtectedRoute tela="/linha-branca/qualidade"><QualidadePage /></ProtectedRoute>} />

        <Route path="/gerenciar-usuarios" element={<ProtectedRoute tela="/gerenciar-usuarios"><GerenciarUsuariosPage /></ProtectedRoute>} />

        <Route path="/assurant/dashboard" element={<ProtectedRoute tela="/assurant/dashboard"><AssurantDashboardPage /></ProtectedRoute>} />
        <Route path="/assurant/sla"       element={<ProtectedRoute tela="/assurant/sla"><AssurantSLAPage /></ProtectedRoute>} />
        <Route path="/assurant/layout"    element={<ProtectedRoute tela="/assurant/layout"><AssurantLayoutPage /></ProtectedRoute>} />

        {/* Recebimento YBV — entrada do processo */}
        <Route path="/recebimento"        element={<ProtectedRoute tela="/recebimento"><RecebimentoPage /></ProtectedRoute>} />
        <Route path="/recebimento/gestao" element={<ProtectedRoute tela="/recebimento/gestao"><GestaoRecebimentoPage /></ProtectedRoute>} />

        {/* B2B */}
        <Route path="/b2b/picking"     element={<ProtectedRoute tela="/b2b/picking"><B2BPickingPage abaInicial="picking" /></ProtectedRoute>} />
        <Route path="/b2b/embalagem"   element={<ProtectedRoute tela="/b2b/embalagem"><B2BPickingPage abaInicial="embalagem" /></ProtectedRoute>} />
        <Route path="/b2b/faturamento" element={<ProtectedRoute tela="/b2b/faturamento"><B2BPickingPage abaInicial="pedidos" /></ProtectedRoute>} />
        <Route path="/b2b/painel"      element={<ProtectedRoute tela="/b2b/painel"><B2BPainelGestorPage /></ProtectedRoute>} />

        {/* Trocas B2C Assurant */}
        <Route path="/trocas-b2c/nova"   element={<ProtectedRoute tela="/trocas-b2c/nova"><TrocasB2CAssurantPage /></ProtectedRoute>} />
        <Route path="/trocas-b2c/gestao" element={<ProtectedRoute tela="/trocas-b2c/gestao"><TrocasB2CFurbtechPage /></ProtectedRoute>} />

        {/* Trocas e Devoluções — portais unificados */}
        <Route
          path="/trocas-devolucoes/assurant"
          element={
            <ProtectedRoute tela="/trocas-devolucoes/assurant">
              <PortalTrocasDevolucoesAssurantPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trocas-devolucoes/furbtech"
          element={
            <ProtectedRoute tela="/trocas-devolucoes/furbtech">
              <PortalTrocasDevolucoesFurbtechPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trocas-devolucoes/gestao"
          element={
            <ProtectedRoute tela="/trocas-devolucoes/gestao">
              <GestaoTrocasDevolucoesPage />
            </ProtectedRoute>
          }
        />

        {/* Pedidos B2C — novo módulo */}
        <Route path="/b2c/pedidos"   element={<ProtectedRoute tela="/b2c/pedidos"><PedidosB2CPage /></ProtectedRoute>} />
        <Route path="/b2c/embalagem" element={<ProtectedRoute tela="/b2c/embalagem"><B2CEmbalagemMesaPage /></ProtectedRoute>} />
        <Route path="/b2c/painel"    element={<ProtectedRoute tela="/b2c/painel"><B2CPainelGestorPage /></ProtectedRoute>} />
        <Route path="/b2c/expedicao" element={<ProtectedRoute tela="/b2c/expedicao"><ExpedicaoPage /></ProtectedRoute>} />
        <Route path="/b2c/etiquetas" element={<ProtectedRoute tela="/b2c/etiquetas"><EtiquetasEnvioPage /></ProtectedRoute>} />

        {/* Triagens */}
        <Route path="/triagens/funcional" element={<ProtectedRoute tela="/triagens/funcional"><TriagemFuncionalPage /></ProtectedRoute>} />
        <Route path="/triagens/laudo" element={<ProtectedRoute tela="/triagens/laudo"><LaudoPage /></ProtectedRoute>} />
        <Route path="/triagens/cosmetica" element={<ProtectedRoute tela="/triagens/cosmetica"><TriagemCosmeticaPage /></ProtectedRoute>} />
        <Route path="/triagens/armazenagem" element={<ProtectedRoute tela="/triagens/armazenagem"><ArmazenagemPage /></ProtectedRoute>} />
        <Route path="/triagens/entrada-oracle" element={<ProtectedRoute tela="/triagens/entrada-oracle"><EntradaOraclePage /></ProtectedRoute>} />

        {/* WMS */}
        <Route path="/wms/estoque" element={<ProtectedRoute tela="/wms/estoque"><EstoqueWmsPage /></ProtectedRoute>} />
        <Route path="/wms/carga-inicial" element={<ProtectedRoute tela="/wms/carga-inicial"><CargaInicialEstoquePage /></ProtectedRoute>} />

        {/* Inventário Cíclico */}
        <Route path="/inventario" element={<ProtectedRoute tela="/inventario"><InventarioPage /></ProtectedRoute>} />

        {/* Indicadores */}
        <Route path="/indicadores" element={<ProtectedRoute tela="/indicadores"><IndicadoresPage /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
