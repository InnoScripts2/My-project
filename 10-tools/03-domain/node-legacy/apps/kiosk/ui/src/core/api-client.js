import { getApiUrl } from './config.js';

class ApiClient {
  constructor() {
    this.retryCount = 3;
    this.retryDelay = 1000;
  }

  async request(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : getApiUrl(url);
    
    let lastError;
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const response = await fetch(fullUrl, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw Object.assign(
            new Error(data?.message || data?.error || 'request_failed'),
            { data, status: response.status }
          );
        }

        return data;
      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryCount - 1) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  async get(url) {
    return this.request(url, { method: 'GET' });
  }

  async post(url, body = {}) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put(url, body = {}) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete(url) {
    return this.request(url, { method: 'DELETE' });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const apiClient = new ApiClient();
