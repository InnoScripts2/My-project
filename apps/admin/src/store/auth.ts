let accessToken: string | null = null;
let refreshToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setTokens(access: string, refresh?: string): void {
  accessToken = access;
  if (refresh) {
    refreshToken = refresh;
  }
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
}

export function isAuthenticated(): boolean {
  return !!accessToken;
}
