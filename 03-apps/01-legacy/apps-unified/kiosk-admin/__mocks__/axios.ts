import { vi } from 'vitest';

// Ручной mock axios для vitest.
// Обеспечивает методы get/post/create и interceptors.request.use.
// create возвращает общий объект, чтобы единообразно работать с apiClient.

const mockAxios: any = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  create() {
    return mockAxios;
  },
  interceptors: {
    request: {
      use: vi.fn(),
    },
    response: {
      use: vi.fn(),
    }
  }
};

export default mockAxios;
export { mockAxios };
