import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { AuthProvider } from './hooks/useAuth';
import { AuthPage } from './pages/AuthPage';
import { ExchangeLayout } from './pages/ExchangeLayout';
import { ExchangeMatchPage } from './pages/ExchangeMatchPage';
import { ExchangePage } from './pages/ExchangePage';
import { ExchangeQAPage } from './pages/ExchangeQAPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TermsOfUsePage } from './pages/TermsOfUsePage';

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [pathname, hash]);

  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              <Route path="/join/:code" element={<JoinPage />} />
              <Route path="/exchanges/:id" element={<ExchangeLayout />}>
                <Route index element={<ExchangePage />} />
                <Route path="match" element={<ExchangeMatchPage />} />
                <Route path="qa" element={<ExchangeQAPage />} />
              </Route>
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfUsePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
