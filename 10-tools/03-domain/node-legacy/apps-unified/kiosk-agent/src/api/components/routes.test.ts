/**
 * Unit tests for routes.ts - HTTP API routes
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import express, { type Express } from 'express';
import { registerRoutes } from './routes.js';

describe('registerRoutes', () => {
  let app: Express;

  before(() => {
    app = express();
    app.use(express.json());
    registerRoutes(app);
  });

  it('registers routes on express app', () => {
    assert.ok(app);
  });

  it('health endpoint returns status', async () => {
    const response = await makeRequest(app, 'GET', '/health');

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.status);
    assert.ok(response.body.version);
    assert.ok(response.body.uptime !== undefined);
  });

  it('obd status endpoint returns connection status', async () => {
    const response = await makeRequest(app, 'GET', '/api/obd/status');

    assert.strictEqual(response.status, 200);
    assert.ok(Object.prototype.hasOwnProperty.call(response.body, 'connected'));
  });

  it('obd scan endpoint accepts valid mode', async () => {
    const response = await makeRequest(app, 'POST', '/api/obd/scan', {
      mode: 'general',
    });

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.sessionId);
    assert.strictEqual(response.body.mode, 'general');
  });

  it('obd scan endpoint validates mode', async () => {
    const response = await makeRequest(app, 'POST', '/api/obd/scan', {
      mode: 'invalid',
    });

    assert.strictEqual(response.status, 400);
  });

  it('obd scan results endpoint returns session data', async () => {
    const response = await makeRequest(app, 'GET', '/api/obd/scan/test-session-id');

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.sessionId);
    assert.ok(response.body.status);
  });

  it('obd clear dtc requires confirmation', async () => {
    const response = await makeRequest(app, 'POST', '/api/obd/clear-dtc', {
      confirmation: false,
    });

    assert.strictEqual(response.status, 400);
  });

  it('obd clear dtc accepts valid confirmation', async () => {
    const response = await makeRequest(app, 'POST', '/api/obd/clear-dtc', {
      confirmation: true,
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'success');
  });

  it('thickness status endpoint returns device status', async () => {
    const response = await makeRequest(app, 'GET', '/api/thickness/status');

    assert.strictEqual(response.status, 200);
    assert.ok(Object.prototype.hasOwnProperty.call(response.body, 'connected'));
  });

  it('thickness start endpoint accepts vehicle type', async () => {
    const response = await makeRequest(app, 'POST', '/api/thickness/start', {
      vehicleType: 'sedan',
    });

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.sessionId);
    assert.strictEqual(response.body.vehicleType, 'sedan');
  });

  it('thickness start validates vehicle type', async () => {
    const response = await makeRequest(app, 'POST', '/api/thickness/start', {
      vehicleType: 'invalid',
    });

    assert.strictEqual(response.status, 400);
  });

  it('thickness measure endpoint records measurement', async () => {
    const response = await makeRequest(app, 'POST', '/api/thickness/measure', {
      sessionId: 'test-session',
      zone: 'hood',
      value: 125.5,
    });

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.recorded);
  });

  it('thickness measure validates positive values', async () => {
    const response = await makeRequest(app, 'POST', '/api/thickness/measure', {
      sessionId: 'test-session',
      zone: 'hood',
      value: -1,
    });

    assert.strictEqual(response.status, 400);
  });

  it('thickness finish endpoint completes session', async () => {
    const response = await makeRequest(app, 'POST', '/api/thickness/finish', {
      sessionId: 'test-session',
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'completed');
  });

  it('payment intent endpoint creates payment', async () => {
    const response = await makeRequest(app, 'POST', '/api/payment/intent', {
      amount: 48000,
      service: 'diagnostics',
    });

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.intentId);
    assert.ok(response.body.qrCode);
  });

  it('payment intent validates positive amount', async () => {
    const response = await makeRequest(app, 'POST', '/api/payment/intent', {
      amount: -100,
      service: 'diagnostics',
    });

    assert.strictEqual(response.status, 400);
  });

  it('payment intent validates service type', async () => {
    const response = await makeRequest(app, 'POST', '/api/payment/intent', {
      amount: 48000,
      service: 'invalid',
    });

    assert.strictEqual(response.status, 400);
  });

  it('payment status endpoint returns payment status', async () => {
    const response = await makeRequest(app, 'GET', '/api/payment/status/test-intent-id');

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.status);
  });

  it('payment confirm-dev endpoint only works in DEV mode', async () => {
    const originalEnv = process.env.AGENT_ENV;

    process.env.AGENT_ENV = 'PROD';
    const prodResponse = await makeRequest(app, 'POST', '/api/payment/confirm-dev', {
      intentId: 'test-intent',
    });
    assert.strictEqual(prodResponse.status, 403);

    process.env.AGENT_ENV = 'DEV';
    const devResponse = await makeRequest(app, 'POST', '/api/payment/confirm-dev', {
      intentId: 'test-intent',
    });
    assert.strictEqual(devResponse.status, 200);

    process.env.AGENT_ENV = originalEnv;
  });

  it('selfcheck endpoint returns device checks', async () => {
    const response = await makeRequest(app, 'GET', '/api/selfcheck');

    assert.strictEqual(response.status, 200);
    assert.ok(response.body.obd);
    assert.ok(response.body.thickness);
  });

  it('lock open endpoint opens device lock', async () => {
    const response = await makeRequest(app, 'POST', '/api/lock/open', {
      device: 'obd',
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.device, 'obd');
  });

  it('lock open validates device type', async () => {
    const response = await makeRequest(app, 'POST', '/api/lock/open', {
      device: 'invalid',
    });

    assert.strictEqual(response.status, 400);
  });
});

async function makeRequest(
  app: Express,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const req = {
      method,
      path,
      body: body || {},
      route: { path },
      on: () => {},
    } as any;

    const res = {
      statusCode: 200,
      _body: null as any,
      _headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this._body = data;
        resolve({ status: this.statusCode, body: data });
      },
      setHeader(name: string, value: string) {
        this._headers[name] = value;
      },
      on() {},
      headersSent: false,
    } as any;

    const next = (error?: Error) => {
      if (error) {
        resolve({ status: 500, body: { error: error.message } });
      }
    };

    const matchedRoute = findRoute(app, method, path);
    if (matchedRoute) {
      matchedRoute(req, res, next);
    } else {
      resolve({ status: 404, body: { error: 'Not found' } });
    }
  });
}

function findRoute(app: Express, method: string, path: string): any {
  const stack = (app as any)._router?.stack || [];

  for (const layer of stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0]?.toUpperCase();

      if (routeMethod === method && pathMatches(routePath, path)) {
        return layer.route.stack[0].handle;
      }
    }
  }

  return null;
}

function pathMatches(routePath: string, requestPath: string): boolean {
  if (routePath === requestPath) return true;

  const routeParts = routePath.split('/').filter(Boolean);
  const requestParts = requestPath.split('/').filter(Boolean);

  if (routeParts.length !== requestParts.length) return false;

  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) continue;
    if (routeParts[i] !== requestParts[i]) return false;
  }

  return true;
}
