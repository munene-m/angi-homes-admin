export type ApiError = {
  message: string;
  status: number;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

const buildUrl = (path: string) => {
  if (!path.startsWith('/')) {
    return `${apiBaseUrl}/${path}`;
  }

  return `${apiBaseUrl}${path}`;
};

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const raw = await response.text();
  const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;

  if (!response.ok) {
    throw {
      message:
        (parsed?.message as string | undefined) ||
        `Request failed with status ${response.status}`,
      status: response.status,
    } satisfies ApiError;
  }

  return parsed as T;
};

