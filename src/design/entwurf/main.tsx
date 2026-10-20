// Einstieg der Design-Vorschau entwurf.html (ohne Service Worker, ohne App-Daten).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Entwurf } from './Entwurf'
import '../tokens.css'
import './entwurf.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Entwurf />
  </StrictMode>,
)
