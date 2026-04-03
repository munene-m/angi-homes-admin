import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthzProvider } from './contexts/AuthzContext';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthzProvider>
          <App />
        </AuthzProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
