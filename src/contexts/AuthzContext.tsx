/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authClient } from '../lib/auth-client';
import { apiRequest } from '../lib/api';

type MyUserResponse = {
  data: {
    permissions: string[];
    roles: Array<{ code: string }>;
  };
};

type AuthzContextValue = {
  permissions: string[];
  isSuperAdmin: boolean;
  isLoading: boolean;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
};

const AuthzContext = createContext<AuthzContextValue | null>(null);

export const AuthzProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session } = authClient.useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!session?.user?.id) {
      setPermissions([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest<MyUserResponse>(
        `/api/admin/users/${encodeURIComponent(session.user?.id ?? '')}`,
      );
      setPermissions(response.data.permissions ?? []);
      setIsSuperAdmin(response.data.roles.some((role) => role.code === 'super_admin'));
    } catch {
      setPermissions([]);
      setIsSuperAdmin(false);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const value = useMemo<AuthzContextValue>(
    () => ({
      permissions,
      isSuperAdmin,
      isLoading,
      can: (permission) => isSuperAdmin || permissions.includes(permission),
      refresh: loadPermissions,
    }),
    [isLoading, isSuperAdmin, permissions, loadPermissions],
  );

  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>;
};

export const useAuthz = () => {
  const context = useContext(AuthzContext);
  if (!context) {
    throw new Error('useAuthz must be used inside AuthzProvider');
  }
  return context;
};
