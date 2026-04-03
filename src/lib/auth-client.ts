import { createAuthClient } from 'better-auth/react';

const resolvedBaseUrl =
  import.meta.env.VITE_AUTH_BASE_URL?.trim() || `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL: resolvedBaseUrl,
});

export type AuthSession = typeof authClient.$Infer.Session;
