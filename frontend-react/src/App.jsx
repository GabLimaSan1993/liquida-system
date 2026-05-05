import { Navigate, Route, Routes } from "react-router-dom";

import MainLayout from "./layout/MainLayout.jsx";

import UploadPage from "./pages/UploadPage.jsx";
import AnalysisEntryPage from "./pages/AnalysisEntryPage.jsx";
import FaturamentoPage from "./pages/FaturamentoPage.jsx";
import AberturaOsPage from "./pages/AberturaOsPage.jsx";
import LinhaBrancaTriagemPage from "./pages/LinhaBrancaTriagemPage.jsx";

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
      </Route>
    </Routes>
  );
}