import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { AuthCardSkeleton, useDebugLoadingPreview } from '../components/LoadingPlaceholders';
import { useAuth } from '../hooks/useAuth';
import { sanitizeRedirectPath } from '../lib/validation';

export function AuthPage() {
  const { user, loading } = useAuth();
  const debugPreviewLoading = useDebugLoadingPreview();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const redirectPath = sanitizeRedirectPath(searchParams.get('redirect'));

  useEffect(() => {
    if (!loading && user) {
      navigate(redirectPath, { replace: true });
    }
  }, [loading, navigate, redirectPath, user]);

  return (
    <div className="mx-auto max-w-md py-4">
      {loading || debugPreviewLoading ? (
        <AuthCardSkeleton />
      ) : (
        <AuthCard
          headingAs="h1"
          redirectPath={redirectPath}
          onSuccess={() => navigate(redirectPath, { replace: true })}
        />
      )}
    </div>
  );
}
