import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const initApp = async () => {
  if ((window as any).electron) {
    try {
      const saved = await (window as any).electron.getSavedStorage();
      if (saved && typeof saved === 'object') {
        const originalSet = localStorage.setItem.bind(localStorage);
        Object.keys(saved).forEach(key => {
          originalSet(key, saved[key]);
        });
        console.log('[Electron Storage] Restored session keys:', Object.keys(saved));
      }
    } catch (e) {
      console.error('[Electron Storage] Failed to load initial storage:', e);
    }

    // Monitor and sync future changes to the file system
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key: string, value: string) {
      originalSetItem(key, value);
      try {
        (window as any).electron.saveStorageKey(key, value);
      } catch (e) {
        console.error('[Electron Storage] Error syncing save:', e);
      }
    };

    const originalRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function (key: string) {
      originalRemoveItem(key);
      try {
        (window as any).electron.removeStorageKey(key);
      } catch (e) {
        console.error('[Electron Storage] Error syncing remove:', e);
      }
    };
  }

  // Import app modules after loading stored values
  await import('./i18n');
  const { default: App } = await import('./App.tsx');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
};

initApp();
