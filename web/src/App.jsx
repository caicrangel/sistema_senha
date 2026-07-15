import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken, getUser, hasPerm, homeScreen } from './lib/api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Totem from './pages/Totem.jsx';
import Monitor from './pages/Monitor.jsx';
import Attendant from './pages/Attendant.jsx';
import Doctor from './pages/Doctor.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Tickets from './pages/Tickets.jsx';
import Settings from './pages/Settings.jsx';

function Private({ children, perm, adminOnly = false }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  const user = getUser();
  if (adminOnly && user?.role !== 'admin') return <Navigate to={homeScreen(user)} replace />;
  if (perm && !hasPerm(perm)) return <Navigate to={homeScreen(user)} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Páginas públicas (totem e monitor da TV) */}
      <Route path="/totem" element={<Totem />} />
      <Route path="/painel" element={<Monitor />} />
      <Route path="/login" element={<Login />} />

      {/* Área interna — acesso por permissão de tela */}
      <Route element={<Private><Layout /></Private>}>
        <Route path="/atendimento" element={<Private perm="atendimento"><Attendant /></Private>} />
        <Route path="/medico" element={<Private perm="medico"><Doctor /></Private>} />
        <Route path="/senhas" element={<Private perm="senhas"><Tickets /></Private>} />
        <Route path="/dashboard" element={<Private perm="dashboard"><Dashboard /></Private>} />
        <Route path="/relatorios" element={<Private perm="relatorios"><Reports /></Private>} />
        <Route path="/configuracoes" element={<Private adminOnly><Settings /></Private>} />
      </Route>

      <Route path="*" element={<Navigate to={getToken() ? homeScreen(getUser()) : '/login'} replace />} />
    </Routes>
  );
}
