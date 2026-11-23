import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { subscribeLocalDebug } from '../lib/localDebugStore';
import { isNeonConfigured, neonAuth } from '../lib/neon';
import type { UserProfile } from '../types/database';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithEmail: (email: string, password: string) => Promise<UserProfile>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ user: UserProfile; requiresEmailVerification: boolean }>;
  sendEmailVerificationOtp: (email: string) => Promise<{ debugOtp?: string }>;
  verifyEmailWithOtp: (email: string, otp: string) => Promise<UserProfile>;
  requestPasswordResetOtp: (email: string) => Promise<{ debugOtp?: string }>;
  resetPasswordWithOtp: (email: string, otp: string, newPassword: string) => Promise<void>;
  resetPasswordWithToken: (token: string, newPassword: string) => Promise<void>;
  signInWithGoogle: (redirectPath: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(isNeonConfigured);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!isNeonConfigured) {
      setUser(null);
      setAuthError(null);
      setLoading(false);
      return;
    }
    setAuthError(null);
    try {
      const profile = await neonAuth.getSession();
      setUser(profile);
    } catch (err) {
      setUser(null);
      setAuthError(
        err instanceof Error ? err.message : 'Unable to verify your sign-in session.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!__LOCAL_DEBUG__) return;
    return subscribeLocalDebug(() => {
      void refreshSession();
    });
  }, [refreshSession]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const profile = await neonAuth.signInWithEmail(email, password);
    setUser(profile);
    return profile;
  }, []);

  const signUpWithEmail = useCallback(async (name: string, email: string, password: string) => {
    setAuthError(null);
    const result = await neonAuth.signUpWithEmail(name, email, password);
    if (!result.requiresEmailVerification) {
      setUser(result.user);
    }
    return result;
  }, []);

  const sendEmailVerificationOtp = useCallback(async (email: string) => {
    setAuthError(null);
    return neonAuth.sendEmailVerificationOtp(email);
  }, []);

  const verifyEmailWithOtp = useCallback(async (email: string, otp: string) => {
    setAuthError(null);
    const profile = await neonAuth.verifyEmailWithOtp(email, otp);
    setUser(profile);
    return profile;
  }, []);

  const requestPasswordResetOtp = useCallback(async (email: string) => {
    setAuthError(null);
    return neonAuth.requestPasswordResetOtp(email);
  }, []);

  const resetPasswordWithOtp = useCallback(
    async (email: string, otp: string, newPassword: string) => {
      setAuthError(null);
      await neonAuth.resetPasswordWithOtp(email, otp, newPassword);
      setUser(null);
    },
    [],
  );

  const resetPasswordWithToken = useCallback(async (token: string, newPassword: string) => {
    setAuthError(null);
    await neonAuth.resetPasswordWithToken(token, newPassword);
    setUser(null);
  }, []);

  const signInWithGoogle = useCallback(async (redirectPath: string) => {
    setAuthError(null);
    await neonAuth.signInWithGoogle(redirectPath);
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await neonAuth.signOut();
    setUser(null);
  }, []);

  const getAccessToken = useCallback((forceRefresh = false) => neonAuth.getJwt(forceRefresh), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authError,
      clearAuthError,
      signInWithEmail,
      signUpWithEmail,
      sendEmailVerificationOtp,
      verifyEmailWithOtp,
      requestPasswordResetOtp,
      resetPasswordWithOtp,
      resetPasswordWithToken,
      signInWithGoogle,
      signOut,
      getAccessToken,
      refreshSession,
    }),
    [
      user,
      loading,
      authError,
      clearAuthError,
      signInWithEmail,
      signUpWithEmail,
      sendEmailVerificationOtp,
      verifyEmailWithOtp,
      requestPasswordResetOtp,
      resetPasswordWithOtp,
      resetPasswordWithToken,
      signInWithGoogle,
      signOut,
      getAccessToken,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
