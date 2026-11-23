import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TermsOfUsePage } from './pages/TermsOfUsePage';

export function App() {
  return (
    <BrowserRouter>
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
