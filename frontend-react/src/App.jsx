import { Navigate, Route, Routes } from "react-router-dom";

import MainLayout from "./layout/MainLayout.jsx";

import UploadPage from "./pages/UploadPage.jsx";
import AnalysisEntryPage from "./pages/AnalysisEntryPage.jsx";
import FaturamentoPage from "./pages/FaturamentoPage.jsx";
import AberturaOsPage from "./pages/AberturaOsPage.jsx";
import LinhaBrancaTriagemPage from "./pages/LinhaBrancaTriagemPage.jsx";
import ReparoLinhaBrancaPage from "./pages/ReparoLinhaBrancaPage.jsx";
import BancadaTestesPage from "./pages/BancadaTestesPage.jsx";
import LimpezaPage from "./pages/LimpezaPage.jsx";
import QualidadePage from "./pages/QualidadePage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/upload" replace />} />

        <Route path="/upload" element={<UploadPage />} />
        <Route path="/analise-entrada" element={<AnalysisEntryPage />} />
        <Route path="/faturamento" element={<FaturamentoPage />} />
        <Route path="/abertura-os" element={<AberturaOsPage />} />

        <Route path="/linha-branca/triagem" element={<LinhaBrancaTriagemPage />} />
        <Route path="/linha-branca/reparo-mecanico" element={<ReparoLinhaBrancaPage areaExecucao="Reparo Mecânico" />} />
        <Route path="/linha-branca/reparo-eletrico" element={<ReparoLinhaBrancaPage areaExecucao="Reparo Elétrico" />} />
        <Route path="/linha-branca/reparo-estetico" element={<ReparoLinhaBrancaPage areaExecucao="Reparo Estético" />} />
        <Route path="/linha-branca/bancada-testes" element={<BancadaTestesPage />} />
        <Route path="/linha-branca/limpeza" element={<LimpezaPage />} />
        <Route path="/linha-branca/qualidade" element={<QualidadePage />} />
      </Route>
    </Routes>
  );
}