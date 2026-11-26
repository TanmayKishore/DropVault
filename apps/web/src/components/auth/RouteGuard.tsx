'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

interface RouteGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * RouteGuard prevents unauthenticated access to protected routes.
 * Avoids premature redirects while session restoration (isLoading) is in flight.
 */
export const RouteGuard: React.FC<RouteGuardProps> = ({
  children,
  redirectTo = '/login',
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const destination = encodeURIComponent(pathname);
      router.push(`${redirectTo}?redirect=${destination}`);
    }
  }, [isLoading, isAuthenticated, router, pathname, redirectTo]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text-primary">
        <Spinner size="lg" label="Restoring session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
