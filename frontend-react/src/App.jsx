import BaixasManuaisB2CV2Page from './pages/assurant-v2/BaixasManuaisB2CV2Page.jsx';
import UploadAgingLinhaBrancaPage from "./pages/linha-branca-v2/UploadAgingLinhaBrancaPage.jsx";
import DivergenciasImeiV2Page from "./pages/assurant-v2/DivergenciasImeiV2Page.jsx";
import ProducaoEsteiraV2Page from './pages/assurant-v2/ProducaoEsteiraV2Page.jsx';
import FechamentoDiarioV2Page from './pages/assurant-v2/FechamentoDiarioV2Page.jsx';
import RelatorioEstoqueV2Page from "./pages/assurant-v2/RelatorioEstoqueV2Page";
import FechamentoLojasV2Page from "./pages/assurant-v2/FechamentoLojasV2Page";
import GestaoEsteiraV2Page from "./pages/assurant-v2/GestaoEsteiraV2Page.jsx";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import {
  useAuth,
} from "./AuthContext.jsx";

import MainLayout from "./layout/MainLayout.jsx";
import AssurantWorkspaceLayout from "./layout/AssurantWorkspaceLayout.jsx";
import LinhaBrancaWorkspaceLayout from "./layout/LinhaBrancaWorkspaceLayout.jsx";

import LoginPage from "./pages/LoginPage.jsx";


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

import RecebimentoV2Page from "./pages/assurant-v2/RecebimentoV2Page.jsx";
import GestaoRecebimentoV2Page from "./pages/assurant-v2/GestaoRecebimentoV2Page.jsx";
import TriagensV2Page from "./pages/assurant-v2/TriagensV2Page.jsx";
import TriagemAutomaticaLabV2Page from "./pages/assurant-v2/TriagemAutomaticaLabV2Page.jsx";
import TriagemUnificadaTestePage from "./pages/assurant-v2/TriagemUnificadaTestePage.jsx";
import ArmazenagemV2Page from "./pages/assurant-v2/ArmazenagemV2Page.jsx";
import ConsultaEstoqueV2Page from "./pages/assurant-v2/ConsultaEstoqueV2Page.jsx";
import InventarioV2Page from "./pages/assurant-v2/InventarioV2Page.jsx";
import CargaInicialV2Page from "./pages/assurant-v2/CargaInicialV2Page.jsx";
import B2BV2Page from "./pages/assurant-v2/B2BV2Page.jsx";
import B2CV2Page from "./pages/assurant-v2/B2CV2Page.jsx";
import B2CFluxoComplementarV2Page from "./pages/assurant-v2/B2CFluxoComplementarV2Page.jsx";
import UploadsV2Page from "./pages/assurant-v2/UploadsV2Page.jsx";
import GestaoChamadosPage from "./pages/GestaoChamadosPage.jsx";
import ChamadosPage from "./pages/ChamadosPage.jsx";
import GestaoUsuariosPage from "./pages/GestaoUsuariosPage.jsx";
import IndicadoresExecutivosV2Page from "./pages/assurant-v2/IndicadoresExecutivosV2Page.jsx";
import EstoqueAgingDetalheV2Page from "./pages/assurant-v2/EstoqueAgingDetalheV2Page.jsx";
import EstoqueInteligenciaSkuV2Page from "./pages/assurant-v2/EstoqueInteligenciaSkuV2Page.jsx";
import RastreabilidadeItemV2Page from "./pages/assurant-v2/RastreabilidadeItemV2Page.jsx";
import AuditoriaFifoV2Page from "./pages/assurant-v2/AuditoriaFifoV2Page.jsx";
import MargemB2CV2Page from "./pages/assurant-v2/MargemB2CV2Page.jsx";
import DesvinculacoesLiquidaV2Page from "./pages/assurant-v2/DesvinculacoesLiquidaV2Page.jsx";

import GestaoProducaoLinhaBrancaPage from "./pages/linha-branca-v2/GestaoProducaoLinhaBrancaPage.jsx";
import DesmembramentoLinhaBrancaPage from "./pages/linha-branca-v2/DesmembramentoLinhaBrancaPage.jsx";
import GestaoEstoqueLinhaBrancaPage from "./pages/linha-branca-v2/GestaoEstoqueLinhaBrancaPage.jsx";
import LinhaBrancaHomePage from "./pages/linha-branca-v2/LinhaBrancaHomePage.jsx";
import RefrigeracaoV2Page from "./pages/linha-branca-v2/RefrigeracaoV2Page.jsx";
import TriagemRefrigeracaoV2Page from "./pages/linha-branca-v2/TriagemRefrigeracaoV2Page.jsx";
import ReparosRefrigeracaoV2Page from "./pages/linha-branca-v2/ReparosRefrigeracaoV2Page.jsx";
import BancadaTestesRefrigeracaoV2Page from "./pages/linha-branca-v2/BancadaTestesRefrigeracaoV2Page.jsx";
import LavadorasV2Page from "./pages/linha-branca-v2/LavadorasV2Page.jsx";
import TriagemLavadorasV2Page from "./pages/linha-branca-v2/TriagemLavadorasV2Page.jsx";
import ReparosLavadorasV2Page from "./pages/linha-branca-v2/ReparosLavadorasV2Page.jsx";
import BancadaTestesLavadorasV2Page from "./pages/linha-branca-v2/BancadaTestesLavadorasV2Page.jsx";
import ClimatizacaoV2Page from "./pages/linha-branca-v2/ClimatizacaoV2Page.jsx";
import TriagemClimatizacaoV2Page from "./pages/linha-branca-v2/TriagemClimatizacaoV2Page.jsx";
import ReparosClimatizacaoV2Page from "./pages/linha-branca-v2/ReparosClimatizacaoV2Page.jsx";
import BancadaTestesClimatizacaoV2Page from "./pages/linha-branca-v2/BancadaTestesClimatizacaoV2Page.jsx";

import SistemasPage from "./pages/SistemasPage.jsx";
import { getUserLanding } from "./services/userLanding.js";
import DefinicaoAssurantV2Page from "./pages/assurant-v2/DefinicaoAssurantV2Page.jsx";
import ValidacaoMeliV2Page from "./pages/assurant-v2/ValidacaoMeliV2Page.jsx";

import RefrigeracaoWorkspaceLayout from "./layout/RefrigeracaoWorkspaceLayout.jsx";
import LavadorasWorkspaceLayout from "./layout/LavadorasWorkspaceLayout.jsx";
import ClimatizacaoWorkspaceLayout from "./layout/ClimatizacaoWorkspaceLayout.jsx";


function ProtectedRoute({
  tela,
  children,
}) {
  const {
    user,
    loading,
    hasAccess,
  } =
    useAuth();

  if (
    loading
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center text-purple-700 font-bold">
        Carregando...
      </div>
    );
  }

  if (
    !user
  ) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (
    tela &&
    !hasAccess(
      tela
    )
  ) {
    return (
      <Navigate
        to="/sem-acesso"
        replace
      />
    );
  }

  return children;
}

function UserOnlyRoute({
  userId,
  userIds,
  children,
}) {
  const {
    user,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-purple-700 font-bold">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (userIds?.length ? !userIds.includes(user.id) : user.id !== userId) {
    return (
      <Navigate
        to="/sem-acesso"
        replace
      />
    );
  }

  return children;
}

function LiquidaOnlyRoute({ tela, children }) {
  const { user, profile, loading, hasAccess } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-purple-700 font-bold">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const email = String(profile?.email || user?.email || "").toLowerCase();
  const autorizado =
    Boolean(profile?.is_master) ||
    email.endsWith("@liquidapreco.com.br");

  if (!autorizado) {
    return <Navigate to="/sem-acesso" replace />;
  }

  if (tela && !hasAccess(tela)) {
    return <Navigate to="/sem-acesso" replace />;
  }

  return children;
}



function DefaultRedirect() {
  const {
    profile,
    loading,
  } =
    useAuth();

  if (
    loading
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#43284F] font-bold">
        Carregando...
      </div>
    );
  }

  if (
    !profile
  ) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  return (
    <Navigate
      to={getUserLanding(profile)}
      replace
    />
  );
}


function SemAcessoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6FF]">
      <div className="text-center">
        <div className="text-6xl mb-4">
          🔒
        </div>

        <h1 className="text-2xl font-black text-[#6B1F87] mb-2">
          Acesso negado
        </h1>

        <p className="text-slate-500">
          Você não tem permissão para acessar esta página.
        </p>
      </div>
    </div>
  );
}


export default function App() {
  const {
    user,
    profile,
    loading,
  } =
    useAuth();

  if (
    loading
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center text-purple-700 font-bold">
        Carregando...
      </div>
    );
  }


  return (
    <Routes>

      {/* =====================================================
          LOGIN
      ====================================================== */}

      <Route
        path="/login"
        element={
          !user ? (
            <LoginPage />
          ) : (
            <Navigate
              to={getUserLanding(profile)}
              replace
            />
          )
        }
      />

      <Route
        path="/sem-acesso"
        element={
          <SemAcessoPage />
        }
      />

      <Route
        path="/sistemas"
        element={
          <ProtectedRoute>
            <SistemasPage />
          </ProtectedRoute>
        }
      />


      <Route path="/v2/assurant/usuarios" element={<ProtectedRoute tela="/gerenciar-usuarios"><Navigate to="/usuarios" replace /></ProtectedRoute>} />
      <Route path="/chamados/gestao" element={<ProtectedRoute tela="/chamados/gestao"><GestaoChamadosPage /></ProtectedRoute>} />
      <Route path="/chamados" element={<ProtectedRoute tela="/chamados"><ChamadosPage /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute tela="/gerenciar-usuarios"><GestaoUsuariosPage /></ProtectedRoute>} />
      <Route path="/gerenciar-usuarios" element={<ProtectedRoute tela="/gerenciar-usuarios"><Navigate to="/usuarios" replace /></ProtectedRoute>} />

      {/* =====================================================
          LINHA BRANCA V2
      ====================================================== */}

      <Route
        path="/v2/linha-branca"
        element={
          <ProtectedRoute tela="/v2/linha-branca">
            <LinhaBrancaWorkspaceLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <LinhaBrancaHomePage />
          }
        />
        <Route path="uploads" element={<ProtectedRoute tela="/v2/linha-branca/uploads"><UploadAgingLinhaBrancaPage /></ProtectedRoute>} />
        <Route path="gestao/producao" element={<ProtectedRoute tela="/v2/linha-branca/gestao/producao"><GestaoProducaoLinhaBrancaPage /></ProtectedRoute>} />
        <Route path="desmembramento" element={<ProtectedRoute tela="/v2/linha-branca/desmembramento"><DesmembramentoLinhaBrancaPage /></ProtectedRoute>} />
        <Route path="gestao/estoque" element={<ProtectedRoute tela="/v2/linha-branca/gestao/estoque"><GestaoEstoqueLinhaBrancaPage /></ProtectedRoute>} />
      </Route>


      <Route
        path="/v2/linha-branca/refrigeracao"
        element={
          <ProtectedRoute tela="/v2/linha-branca/refrigeracao">
            <RefrigeracaoWorkspaceLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <RefrigeracaoV2Page />
          }
        />

        <Route
          path="triagem"
          element={
            <ProtectedRoute tela="/v2/linha-branca/refrigeracao/triagem"><TriagemRefrigeracaoV2Page /></ProtectedRoute>
          }
        />

        <Route
          path="reparos"
          element={
            <ProtectedRoute tela="/v2/linha-branca/refrigeracao/reparos"><ReparosRefrigeracaoV2Page /></ProtectedRoute>
          }
        />

        <Route
          path="testes"
          element={
            <ProtectedRoute tela="/v2/linha-branca/refrigeracao/testes"><BancadaTestesRefrigeracaoV2Page /></ProtectedRoute>
          }
        />
      </Route>


      <Route
        path="/v2/linha-branca/climatizacao"
        element={
          <ProtectedRoute tela="/v2/linha-branca/climatizacao">
            <ClimatizacaoWorkspaceLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <ClimatizacaoV2Page />
          }
        />

        <Route
          path="triagem"
          element={
            <ProtectedRoute tela="/v2/linha-branca/climatizacao/triagem"><TriagemClimatizacaoV2Page /></ProtectedRoute>
          }
        />

        <Route
          path="reparos"
          element={
            <ProtectedRoute tela="/v2/linha-branca/climatizacao/reparos"><ReparosClimatizacaoV2Page /></ProtectedRoute>
          }
        />

        <Route
          path="testes"
          element={
            <ProtectedRoute tela="/v2/linha-branca/climatizacao/testes"><BancadaTestesClimatizacaoV2Page /></ProtectedRoute>
          }
        />
      </Route>


      <Route
        path="/v2/linha-branca/lavadoras"
        element={
          <ProtectedRoute tela="/v2/linha-branca/lavadoras">
            <LavadorasWorkspaceLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <LavadorasV2Page />
          }
        />

        <Route
          path="triagem"
          element={
            <ProtectedRoute tela="/v2/linha-branca/lavadoras/triagem"><TriagemLavadorasV2Page /></ProtectedRoute>
          }
        />

        <Route
          path="reparos"
          element={
            <ProtectedRoute tela="/v2/linha-branca/lavadoras/reparos"><ReparosLavadorasV2Page /></ProtectedRoute>
          }
        />

        <Route
          path="testes"
          element={
            <ProtectedRoute tela="/v2/linha-branca/lavadoras/testes"><BancadaTestesLavadorasV2Page /></ProtectedRoute>
          }
        />
      </Route>


      {/* =====================================================
          ASSURANT WAREHOUSE V2
      ====================================================== */}

      <Route
        path="/v2/assurant"
        element={
          <ProtectedRoute tela="/v2/assurant">
            <AssurantWorkspaceLayout />
          </ProtectedRoute>
        }
      >

        {/* Recebimento */}

        <Route
          path="recebimento"
          element={
            <RecebimentoV2Page />
          }
        />

        <Route
          path="recebimento/gestao"
          element={
            <GestaoRecebimentoV2Page />
          }
        />


        {/* Triagens */}

        <Route
          path="triagens/funcional"
          element={
            <TriagensV2Page tipo="funcional" />
          }
        />

        <Route
          path="triagens/unificada-teste"
          element={
            <UserOnlyRoute userIds={["b517d70a-56be-4b4f-8b9e-a03c769dd3c3","490cfecb-4ba4-4670-9a53-5775c0b15bef","8549de55-3657-4042-86c6-822cd3d49941","6e0ac557-93a2-42ae-8595-12648b2ac0de"]}>
              <TriagemUnificadaTestePage />
            </UserOnlyRoute>
          }
        />

        <Route
          path="triagens/automatica-lab"
          element={
            <UserOnlyRoute userId="b517d70a-56be-4b4f-8b9e-a03c769dd3c3">
              <TriagemAutomaticaLabV2Page />
            </UserOnlyRoute>
          }
        />

        <Route
          path="triagens/laudo"
          element={
            <TriagensV2Page tipo="laudo" />
          }
        />

        <Route
          path="triagens/cosmetica"
          element={
            <TriagensV2Page tipo="cosmetica" />
          }
        />

        <Route
          path="triagens/oracle"
          element={
            <TriagensV2Page tipo="oracle" />
          }
        />


        {/* Estoque */}

        <Route
          path="estoque/armazenagem"
          element={
            <ArmazenagemV2Page />
          }
        />

        <Route
          path="estoque/consulta"
          element={
            <ConsultaEstoqueV2Page />
          }
        />

        <Route
          path="estoque/rastreabilidade"
          element={
            <ProtectedRoute tela="/v2/assurant/estoque/rastreabilidade">
              <RastreabilidadeItemV2Page />
            </ProtectedRoute>
          }
        />

        <Route
          path="estoque/auditoria-fifo"
          element={
            <UserOnlyRoute userId="b517d70a-56be-4b4f-8b9e-a03c769dd3c3">
              <AuditoriaFifoV2Page />
            </UserOnlyRoute>
          }
        />

        <Route
          path="estoque/inventario"
          element={
            <InventarioV2Page />
          }
        />

        <Route
          path="estoque/carga-inicial"
          element={
            <CargaInicialV2Page />
          }
        />


        {/* B2B */}

        <Route
          path="b2b/picking"
          element={
            <B2BV2Page tipo="picking" />
          }
        />

        <Route
          path="b2b/embalagem"
          element={
            <B2BV2Page tipo="embalagem" />
          }
        />

        <Route
          path="b2b/faturamento"
          element={
            <B2BV2Page tipo="faturamento" />
          }
        />

        <Route
          path="b2b/gestao"
          element={
            <B2BV2Page tipo="gestao" />
          }
        />


        {/* B2C */}
        <Route path="triagens/divergencias-imei" element={<ProtectedRoute tela="/v2/assurant/triagens/divergencias-imei"><DivergenciasImeiV2Page /></ProtectedRoute>} />
        <Route path="b2c/definicao-assurant" element={<ProtectedRoute tela="/v2/assurant/b2c/definicao-assurant"><DefinicaoAssurantV2Page /></ProtectedRoute>} />
        <Route path="b2c/validacao-meli" element={<ProtectedRoute tela="/v2/assurant/b2c/validacao-meli"><ValidacaoMeliV2Page /></ProtectedRoute>} />

        <Route
          path="b2c"
          element={
            <B2CV2Page />
          }
        />

        <Route
          path="b2c/embalagem"
          element={
            <B2CFluxoComplementarV2Page tipo="embalagem" />
          }
        />

        <Route
          path="b2c/expedicao"
          element={
            <B2CFluxoComplementarV2Page tipo="expedicao" />
          }
        />

        <Route
          path="b2c/etiquetas"
          element={
            <B2CFluxoComplementarV2Page tipo="etiquetas" />
          }
        />

        <Route
          path="b2c/gestao"
          element={
            <B2CFluxoComplementarV2Page tipo="gestao" />
          }
        />

        <Route
          path="b2c/gestao/margem"
          element={
            <UserOnlyRoute userId="b517d70a-56be-4b4f-8b9e-a03c769dd3c3">
              <MargemB2CV2Page />
            </UserOnlyRoute>
          }
        />

        <Route
          path="b2c/desvinculacoes"
          element={
            <LiquidaOnlyRoute tela="/v2/assurant/b2c/desvinculacoes">
              <DesvinculacoesLiquidaV2Page />
            </LiquidaOnlyRoute>
          }
        />


        <Route path="b2c/baixas" element={<LiquidaOnlyRoute tela="/v2/assurant/b2c/baixas"><BaixasManuaisB2CV2Page /></LiquidaOnlyRoute>} />

        {/* Dados */}

        <Route
          path="uploads"
          element={
            <UploadsV2Page />
          }
        />


        {/* Gestão */}
        <Route path="gestao/relatorio-estoque" element={<ProtectedRoute tela="/v2/assurant/gestao/relatorio-estoque"><RelatorioEstoqueV2Page /></ProtectedRoute>} />
        <Route path="gestao/fechamento-lojas" element={<ProtectedRoute tela="/v2/assurant/gestao/fechamento-lojas"><FechamentoLojasV2Page /></ProtectedRoute>} />
        <Route path="gestao/producao" element={<ProtectedRoute tela="/v2/assurant/gestao/producao"><ProducaoEsteiraV2Page /></ProtectedRoute>} />
        <Route path="gestao/esteira" element={<ProtectedRoute tela="/v2/assurant/gestao/esteira"><GestaoEsteiraV2Page /></ProtectedRoute>} />
        <Route path="gestao/fechamento-diario" element={<UserOnlyRoute userIds={["b517d70a-56be-4b4f-8b9e-a03c769dd3c3","a5115520-a653-4ae3-b0ae-177674ffbff7","6e0ac557-93a2-42ae-8595-12648b2ac0de","8549de55-3657-4042-86c6-822cd3d49941"]}><FechamentoDiarioV2Page /></UserOnlyRoute>} />



        <Route
          path="indicadores"
          element={
            <ProtectedRoute tela="/v2/assurant/indicadores">
              <IndicadoresExecutivosV2Page />
            </ProtectedRoute>
          }
        />

        <Route
          path="indicadores/estoque/aging"
          element={
            <ProtectedRoute tela="/v2/assurant/indicadores">
              <EstoqueAgingDetalheV2Page />
            </ProtectedRoute>
          }
        />

        <Route
          path="indicadores/estoque/inteligencia"
          element={
            <ProtectedRoute tela="/v2/assurant/indicadores">
              <EstoqueInteligenciaSkuV2Page />
            </ProtectedRoute>
          }
        />

      </Route>


      {/* =====================================================
          LIQUIDA SYSTEM ATUAL
      ====================================================== */}

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >

        <Route
          path="/"
          element={
            <DefaultRedirect />
          }
        />


        {/* Upload */}

        <Route
          path="/upload"
          element={
            <ProtectedRoute tela="/upload">
              <UploadPage />
            </ProtectedRoute>
          }
        />


        {/* Análise */}

        <Route
          path="/analise-entrada"
          element={
            <ProtectedRoute tela="/analise-entrada">
              <AnalysisEntryPage />
            </ProtectedRoute>
          }
        />


        {/* Faturamento */}

        <Route
          path="/faturamento"
          element={
            <ProtectedRoute tela="/faturamento">
              <FaturamentoPage />
            </ProtectedRoute>
          }
        />


        {/* Abertura OS */}

        <Route
          path="/abertura-os"
          element={
            <ProtectedRoute tela="/abertura-os">
              <AberturaOsPage />
            </ProtectedRoute>
          }
        />


        {/* Financeiro */}

        <Route
          path="/financeiro/fluxo-realizado"
          element={
            <ProtectedRoute tela="/financeiro/fluxo-realizado">
              <FluxoCaixaRealizadoPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/financeiro/contas-pagar"
          element={
            <ProtectedRoute tela="/financeiro/contas-pagar">
              <ContasPagarPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/financeiro/contas-receber"
          element={
            <ProtectedRoute tela="/financeiro/contas-receber">
              <ContasReceberPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/financeiro/carga-historica"
          element={
            <ProtectedRoute tela="/financeiro/carga-historica">
              <CargaHistoricaPage />
            </ProtectedRoute>
          }
        />


        {/* Linha Branca legado */}

        <Route
          path="/linha-branca/triagem"
          element={
            <ProtectedRoute tela="/linha-branca/triagem">
              <LinhaBrancaTriagemPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/reparo-mecanico"
          element={
            <ProtectedRoute tela="/linha-branca/reparo-mecanico">
              <ReparoLinhaBrancaPage areaExecucao="Reparo Mecânico" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/reparo-eletrico"
          element={
            <ProtectedRoute tela="/linha-branca/reparo-eletrico">
              <ReparoLinhaBrancaPage areaExecucao="Reparo Elétrico" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/reparo-estetico"
          element={
            <ProtectedRoute tela="/linha-branca/reparo-estetico">
              <ReparoLinhaBrancaPage areaExecucao="Reparo Estético" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/reparos"
          element={
            <ProtectedRoute tela="/linha-branca/reparos">
              <ReparosRefrigeracaoPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/triagem-reparos"
          element={
            <ProtectedRoute tela="/linha-branca/triagem-reparos">
              <TriagemReparosPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/bancada-testes"
          element={
            <ProtectedRoute tela="/linha-branca/bancada-testes">
              <BancadaTestesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/limpeza"
          element={
            <ProtectedRoute tela="/linha-branca/limpeza">
              <LimpezaPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/linha-branca/qualidade"
          element={
            <ProtectedRoute tela="/linha-branca/qualidade">
              <QualidadePage />
            </ProtectedRoute>
          }
        />


        {/* Usuários */}




        {/* Assurant legado */}

        <Route
          path="/assurant/dashboard"
          element={
            <ProtectedRoute tela="/assurant/dashboard">
              <AssurantDashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/assurant/sla"
          element={
            <ProtectedRoute tela="/assurant/sla">
              <AssurantSLAPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/assurant/layout"
          element={
            <ProtectedRoute tela="/assurant/layout">
              <AssurantLayoutPage />
            </ProtectedRoute>
          }
        />


        {/* Recebimento legado */}

        <Route
          path="/recebimento"
          element={
            <ProtectedRoute tela="/recebimento">
              <RecebimentoPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/recebimento/gestao"
          element={
            <ProtectedRoute tela="/recebimento/gestao">
              <GestaoRecebimentoPage />
            </ProtectedRoute>
          }
        />


        {/* B2B legado */}

        <Route
          path="/b2b/picking"
          element={
            <ProtectedRoute tela="/b2b/picking">
              <B2BPickingPage abaInicial="picking" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/b2b/embalagem"
          element={
            <ProtectedRoute tela="/b2b/embalagem">
              <B2BPickingPage abaInicial="embalagem" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/b2b/faturamento"
          element={
            <ProtectedRoute tela="/b2b/faturamento">
              <B2BPickingPage abaInicial="pedidos" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/b2b/painel"
          element={
            <ProtectedRoute tela="/b2b/painel">
              <B2BPainelGestorPage />
            </ProtectedRoute>
          }
        />


        {/* Trocas B2C */}

        <Route
          path="/trocas-b2c/nova"
          element={
            <ProtectedRoute tela="/trocas-b2c/nova">
              <TrocasB2CAssurantPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/trocas-b2c/gestao"
          element={
            <ProtectedRoute tela="/trocas-b2c/gestao">
              <TrocasB2CFurbtechPage />
            </ProtectedRoute>
          }
        />


        {/* Trocas / Devoluções */}

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


        {/* B2C legado */}

        <Route
          path="/b2c/pedidos"
          element={
            <ProtectedRoute tela="/b2c/pedidos">
              <PedidosB2CPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/b2c/embalagem"
          element={
            <ProtectedRoute tela="/b2c/embalagem">
              <B2CEmbalagemMesaPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/b2c/painel"
          element={
            <ProtectedRoute tela="/b2c/painel">
              <B2CPainelGestorPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/b2c/expedicao"
          element={
            <ProtectedRoute tela="/b2c/expedicao">
              <ExpedicaoPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/b2c/etiquetas"
          element={
            <ProtectedRoute tela="/b2c/etiquetas">
              <EtiquetasEnvioPage />
            </ProtectedRoute>
          }
        />


        {/* Triagens legado */}

        <Route
          path="/triagens/funcional"
          element={
            <ProtectedRoute tela="/triagens/funcional">
              <TriagemFuncionalPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/triagens/laudo"
          element={
            <ProtectedRoute tela="/triagens/laudo">
              <LaudoPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/triagens/cosmetica"
          element={
            <ProtectedRoute tela="/triagens/cosmetica">
              <TriagemCosmeticaPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/triagens/armazenagem"
          element={
            <ProtectedRoute tela="/triagens/armazenagem">
              <ArmazenagemPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/triagens/entrada-oracle"
          element={
            <ProtectedRoute tela="/triagens/entrada-oracle">
              <EntradaOraclePage />
            </ProtectedRoute>
          }
        />


        {/* WMS */}

        <Route
          path="/wms/estoque"
          element={
            <ProtectedRoute tela="/wms/estoque">
              <EstoqueWmsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/wms/carga-inicial"
          element={
            <ProtectedRoute tela="/wms/carga-inicial">
              <CargaInicialEstoquePage />
            </ProtectedRoute>
          }
        />


        {/* Inventário */}

        <Route
          path="/inventario"
          element={
            <ProtectedRoute tela="/inventario">
              <InventarioPage />
            </ProtectedRoute>
          }
        />


        {/* Indicadores legado */}

        <Route
          path="/indicadores"
          element={
            <ProtectedRoute tela="/indicadores">
              <IndicadoresPage />
            </ProtectedRoute>
          }
        />

      </Route>

    </Routes>
  );
}
