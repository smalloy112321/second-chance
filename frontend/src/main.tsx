import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Printing (Save or print my plan / Print plan): open every collapsed section so nothing is left out,
// then put them back the way they were.
window.addEventListener('beforeprint', () => {
  document.querySelectorAll('details').forEach((d) => {
    d.dataset.printClosed = d.open ? '' : '1'
    d.open = true
  })
  window.dispatchEvent(new Event('scpp:print-open'))
})
window.addEventListener('afterprint', () => {
  document.querySelectorAll('details').forEach((d) => {
    if (d.dataset.printClosed === '1') d.open = false
  })
  window.dispatchEvent(new Event('scpp:print-close'))
})
