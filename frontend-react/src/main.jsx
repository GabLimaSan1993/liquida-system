import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import B2CAuditoriaPedidosV2Page from './pages/assurant-v2/B2CAuditoriaPedidosV2Page.jsx'

const PRIVATE_AUDIT_PATH = '/v2/assurant/b2c/auditoria'

function RootApp() {
  const { user, profile, loading } = useAuth()
  const isPrivateAudit = window.location.pathname === PRIVATE_AUDIT_PATH

  if (!isPrivateAudit) {
    return <App />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-violet-700 font-bold">
        Carregando auditoria...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isGabriel =
    profile?.is_master === true &&
    String(profile?.nome || '').trim().toLowerCase() === 'gabriel lima'

  if (!isGabriel) {
    return <Navigate to="/sem-acesso" replace />
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] p-4 text-slate-900 md:p-6 lg:p-7">
      <B2CAuditoriaPedidosV2Page />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RootApp />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
