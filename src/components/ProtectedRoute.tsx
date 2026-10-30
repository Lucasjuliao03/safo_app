import { ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useStudyAccess } from '@/hooks/useStudyAccess';
import { useQueryClient } from '@tanstack/react-query';
import { BlockedOverlay } from './BlockedOverlay';
import { StudyLoadError } from './StudyLoadError';
import { LastStudyResult } from './LastStudyResult';
import { clearSecureContentCache } from '@/services/secureContentService';
import { canUseApp, isAppAccessSnapshot } from '@/lib/appAccess';

function AppAccessGate({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const allowed = location.pathname === '/perfil' || location.pathname === '/assinar';
  const { data: access, error, refetch } = useStudyAccess(!allowed && !isAdmin);
  const client = useQueryClient();
  const routeKey = `${user?.id}:${location.key}`;
  const [verifiedKey, setVerifiedKey] = useState<string>();
  const valid = isAppAccessSnapshot(access);
  const blocked = valid && !canUseApp(access);

  useEffect(() => {
    if (allowed || isAdmin) return;
    let current = true;
    // A cached grant alone must not mount a newly selected module.
    void refetch({ cancelRefetch: false }).then(() => { if (current) setVerifiedKey(routeKey); });
    return () => { current = false; };
  }, [allowed, isAdmin, refetch, routeKey]);

  useEffect(() => {
    if (!blocked) return;
    clearSecureContentCache();
    const keep = new Set(['studyAccess', 'lastStudyFeedback', 'userProfile', 'plans', 'courses']);
    const filter = { predicate: (query: { queryKey: readonly unknown[] }) => !keep.has(String(query.queryKey[0])) };
    void client.cancelQueries(filter).then(() => client.removeQueries(filter));
  }, [blocked, client]);

  if (allowed || isAdmin) return <>{children}</>;
  if (error) return <div className="dark min-h-screen bg-background text-foreground">
    <StudyLoadError error={error} /><Link className="block text-center text-primary" to="/perfil">Meu perfil</Link>
  </div>;
  if (blocked) return <div className="dark min-h-screen bg-background text-foreground">
    <BlockedOverlay answeredCount={access.used} reason={access.blocked ? 'account_blocked' : access.expired ? 'expired' : 'limit_reached'}>
      {!access.expired && !access.blocked && <LastStudyResult />}
    </BlockedOverlay>
  </div>;
  if (!valid || verifiedKey !== routeKey) return <div className="dark min-h-screen bg-background flex items-center justify-center" role="status">
    <span>Verificando acesso...</span>
  </div>;
  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppAccessGate>{children}</AppAccessGate>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
