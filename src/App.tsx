import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConfiguracoesDadosPage } from "./pages/ConfiguracoesDadosPage";
import { ConfiguracoesSobrePage } from "./pages/ConfiguracoesSobrePage";
import { ConfiguracoesNotificacoesPage } from "./pages/ConfiguracoesNotificacoesPage";
import { ConfiguracoesRegrasPage } from "./pages/ConfiguracoesRegrasPage";
import { ConfiguracoesTagsPage } from "./pages/ConfiguracoesTagsPage";
import { ConfiguracoesLayout } from "./components/ConfiguracoesLayout";
import { Layout } from "./components/Layout";
import { CategoriasPage } from "./pages/CategoriasPage";
import { ContasPage } from "./pages/ContasPage";
import { ContasPagarReceberPage } from "./pages/ContasPagarReceberPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DividasParceladasPage } from "./pages/DividasParceladasPage";
import { FaturaCartaoPage } from "./pages/FaturaCartaoPage";
import { MetasPage } from "./pages/MetasPage";
import { OrcamentosPage } from "./pages/OrcamentosPage";
import { RelatoriosPage } from "./pages/RelatoriosPage";
import { TransacoesPage } from "./pages/TransacoesPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="transacoes" element={<TransacoesPage />} />
          <Route path="contas-pagar-receber" element={<ContasPagarReceberPage />} />
          <Route path="dividas-parceladas" element={<DividasParceladasPage />} />
          <Route path="financiamentos" element={<Navigate to="/dividas-parceladas" replace />} />
          <Route path="emprestimos" element={<Navigate to="/dividas-parceladas" replace />} />
          <Route path="orcamentos" element={<OrcamentosPage />} />
          <Route path="metas" element={<MetasPage />} />
          <Route path="relatorios" element={<RelatoriosPage />} />
          <Route path="faturas/:contaId" element={<FaturaCartaoPage />} />
          <Route path="configuracoes" element={<ConfiguracoesLayout />}>
            <Route index element={<Navigate to="contas" replace />} />
            <Route path="contas" element={<ContasPage />} />
            <Route path="categorias" element={<CategoriasPage />} />
            <Route path="tags" element={<ConfiguracoesTagsPage />} />
            <Route path="regras" element={<ConfiguracoesRegrasPage />} />
            <Route path="notificacoes" element={<ConfiguracoesNotificacoesPage />} />
            <Route path="dados" element={<ConfiguracoesDadosPage />} />
            <Route path="sobre" element={<ConfiguracoesSobrePage />} />
          </Route>
          <Route path="contas" element={<Navigate to="/configuracoes/contas" replace />} />
          <Route path="categorias" element={<Navigate to="/configuracoes/categorias" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
