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
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

// Reference content changes rarely and only via the dev editors (which invalidate
// their own keys on save, so edits still show immediately). Treat it as fresh for
// several minutes so browsing back and forth doesn't re-hit the DB each time.
queryClient.setQueryDefaults(['catalog'], { staleTime: 10 * 60_000 });
queryClient.setQueryDefaults(['articles'], { staleTime: 10 * 60_000 });
queryClient.setQueryDefaults(['article'], { staleTime: 10 * 60_000 });
queryClient.setQueryDefaults(['wiwon-covers'], { staleTime: 10 * 60_000 });
queryClient.setQueryDefaults(['hero'], { staleTime: 30 * 60_000 });
queryClient.setQueryDefaults(['tags'], { staleTime: 30 * 60_000 });
queryClient.setQueryDefaults(['announcement'], { staleTime: 5 * 60_000 });

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
