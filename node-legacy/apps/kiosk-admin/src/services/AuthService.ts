import axios from 'axios';
import type { LoginResult } from '@/types';

export class AuthService {
  async login(username: string, password: string): Promise<LoginResult> {
    const response = await axios.post('/api/auth/login', { username, password });
    const { token, user, expiresAt } = response.data;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_role', user.role);
    localStorage.setItem('user_id', user.id);
    localStorage.setItem('username', user.username);

    return { success: true, token, user, expiresAt };
  }

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return token !== null;
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  getUserRole(): 'operator' | 'admin' | null {
    return localStorage.getItem('user_role') as 'operator' | 'admin' | null;
  }

  getUsername(): string | null {
    return localStorage.getItem('username');
  }
}

axios.interceptors.request.use((config) => {
  const authService = new AuthService();
  const token = authService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authService = new AuthService();
