import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './i18n';
import { registerSW } from 'virtual:pwa-register';

registerSW({
  onNeedRefresh() {
    // Optionnel : afficher un toast "Nouvelle version disponible"
    console.log('[PWA] Nouvelle version disponible');
  },
  onOfflineReady() {
    console.log('[PWA] Prêt hors ligne');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
