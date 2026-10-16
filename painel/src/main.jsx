import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '../../public/estatico/app.css'
import './painel.css'
import { App } from './App.jsx'
import { ProvedorSessao } from './sessao.jsx'

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <BrowserRouter basename="/painel">
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
)
