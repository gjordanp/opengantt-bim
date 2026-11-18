import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme } from './theme'

applyTheme()
// Lets the styles know the platform (the macOS title bar has its buttons on the left).
document.documentElement.dataset.platform = window.api?.platform ?? ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
