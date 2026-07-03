import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Toaster position="top-right" richColors theme="dark" closeButton />
  </ThemeProvider>
);
