import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import './styles/fonts.css';
import './styles/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      // Keep the previous result visible while a query key's data reloads, and
      // treat data as fresh for 30s so navigating back doesn't blank the UI.
      // (Polling queries set their own refetchInterval and still update live.)
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
