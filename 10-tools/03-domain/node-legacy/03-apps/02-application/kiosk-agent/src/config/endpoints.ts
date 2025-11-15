/**
 * Centralized endpoints configuration
 * Eliminates hardcoded localhost dependencies
 */

export interface EndpointsConfig {
  agent: {
    baseUrl: string;
    port: number;
    protocol: 'http' | 'https';
  };
  frontend: {
    baseUrl: string;
    port: number;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
  };
}

/**
 * Get local IP address (for production terminals)
 */
function getLocalIP(): string {
  // In browser/terminal context, use hostname
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  
  // In Node.js context
  try {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        // IPv4, not internal
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch (error) {
    console.warn('[Config] Could not determine local IP, using fallback');
  }

  return '127.0.0.1';
}

/**
 * Dynamic endpoints based on environment
 */
export function getEndpoints(): EndpointsConfig {
  const env = process.env.NODE_ENV || 'development';

  // Development (local)
  if (env === 'development') {
    return {
      agent: {
        baseUrl: process.env.AGENT_BASE_URL || '127.0.0.1',
        port: parseInt(process.env.AGENT_PORT || '7070'),
        protocol: 'http'
      },
      frontend: {
        baseUrl: process.env.FRONTEND_BASE_URL || '127.0.0.1',
        port: parseInt(process.env.FRONTEND_PORT || '8080')
      },
      supabase: {
        url: process.env.SUPABASE_URL || 'https://sbbqjrcywpgdmpuymziq.supabase.co',
        anonKey: process.env.SUPABASE_ANON_KEY!,
        serviceRoleKey: process.env.SUPABASE_SERVICE_KEY
      }
    };
  }

  // Production (deployed terminals)
  if (env === 'production') {
    const terminalHost = process.env.TERMINAL_HOSTNAME || getLocalIP();

    return {
      agent: {
        baseUrl: terminalHost,
        port: 443,
        protocol: 'https'
      },
      frontend: {
        baseUrl: terminalHost,
        port: 443
      },
      supabase: {
        url: process.env.SUPABASE_URL!,
        anonKey: process.env.SUPABASE_ANON_KEY!,
        serviceRoleKey: process.env.SUPABASE_SERVICE_KEY
      }
    };
  }

  // Staging/QA
  return {
    agent: {
      baseUrl: process.env.AGENT_BASE_URL || 'staging-agent.kiosk.example.com',
      port: 443,
      protocol: 'https'
    },
    frontend: {
      baseUrl: process.env.FRONTEND_BASE_URL || 'staging.kiosk.example.com',
      port: 443
    },
    supabase: {
      url: process.env.SUPABASE_URL!,
      anonKey: process.env.SUPABASE_ANON_KEY!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_KEY
    }
  };
}

/**
 * Helper to build full URL
 */
export function getAgentUrl(): string {
  const config = getEndpoints();
  const { protocol, baseUrl, port } = config.agent;
  
  // Don't include port if it's standard (80 for http, 443 for https)
  const includePort = (protocol === 'http' && port !== 80) || (protocol === 'https' && port !== 443);
  
  return `${protocol}://${baseUrl}${includePort ? ':' + port : ''}`;
}

export function getFrontendUrl(): string {
  const config = getEndpoints();
  const { baseUrl, port } = config.frontend;
  
  return `http://${baseUrl}:${port}`;
}

// Singleton export
export const endpoints = getEndpoints();
