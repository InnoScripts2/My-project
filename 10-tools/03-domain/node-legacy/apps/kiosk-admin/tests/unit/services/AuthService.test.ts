import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '@/services/AuthService';
import axios from 'axios';

vi.mock('axios');

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should login successfully and store token', async () => {
    const mockResponse = {
      data: {
        token: 'test-token',
        user: { id: '1', username: 'admin', role: 'admin' },
        expiresAt: Date.now() + 86400000
      }
    };

    vi.mocked(axios.post).mockResolvedValueOnce(mockResponse);

    const result = await authService.login('admin', 'password');

    expect(result.success).toBe(true);
    expect(result.token).toBe('test-token');
    expect(result.user.username).toBe('admin');
    expect(localStorage.getItem('auth_token')).toBe('test-token');
    expect(localStorage.getItem('user_role')).toBe('admin');
  });

  it('should logout and clear storage', () => {
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('user_role', 'admin');

    authService.logout();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_role')).toBeNull();
  });

  it('should check authentication status', () => {
    expect(authService.isAuthenticated()).toBe(false);

    localStorage.setItem('auth_token', 'test-token');
    expect(authService.isAuthenticated()).toBe(true);
  });

  it('should get token from storage', () => {
    expect(authService.getToken()).toBeNull();

    localStorage.setItem('auth_token', 'test-token');
    expect(authService.getToken()).toBe('test-token');
  });

  it('should get user role from storage', () => {
    expect(authService.getUserRole()).toBeNull();

    localStorage.setItem('user_role', 'operator');
    expect(authService.getUserRole()).toBe('operator');
  });

  it('should get username from storage', () => {
    expect(authService.getUsername()).toBeNull();

    localStorage.setItem('username', 'testuser');
    expect(authService.getUsername()).toBe('testuser');
  });
});
