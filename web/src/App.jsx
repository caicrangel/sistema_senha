import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken, getUser } from './lib/api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Totem from './pages/Totem.jsx';
import Monitor from './pages/Monitor.jsx';
import Attendant from './pages/Attendant.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Tickets from './pages/Tickets.jsx';
import Settings from './pages/Settings.jsx';

function Private({ children, adminOnly = false }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  if (adminOnly && getUser()?.role !== 'admin') return <Navigate to="/atendimento" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Páginas públicas (totem e monitor da TV) */}
      <Route path="/totem" element={<Totem />} />
      <Route path="/painel" element={<Monitor />} />
      <Route path="/login" element={<Login />} />

      {/* Área interna */}
      <Route element={<Private><Layout /></Private>}>
        <Route path="/atendimento" element={<Attendant />} />
        <Route path="/senhas" element={<Tickets />} />
        <Route path="/dashboard" element={<Private adminOnly><Dashboard /></Private>} />
        <Route path="/relatorios" element={<Private adminOnly><Reports /></Private>} />
        <Route path="/configuracoes" element={<Private adminOnly><Settings /></Private>} />
      </Route>

      <Route path="*" element={<Navigate to={getToken() ? '/atendimento' : '/login'} replace />} />
    </Routes>
  );
}
