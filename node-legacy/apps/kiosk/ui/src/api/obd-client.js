const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:3000'
  : window.location.origin;

const DEFAULT_TIMEOUT = 10000;

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown_error' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

export async function getObdStatus() {
  return await fetchWithTimeout(`${API_BASE}/api/obd/status`);
}

export async function connectObd(vehicleMake, model, mode) {
  return await fetchWithTimeout(`${API_BASE}/api/obd/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vehicleMake,
      model,
      mode,
    }),
  });
}

export async function disconnectObd() {
  return await fetchWithTimeout(`${API_BASE}/api/obd/disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function getDtcCodes() {
  return await fetchWithTimeout(`${API_BASE}/api/obd/dtc`);
}

export async function clearDtcCodes(confirmation) {
  return await fetchWithTimeout(`${API_BASE}/api/obd/dtc/clear`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      confirmation,
    }),
  });
}

export async function getLivePids() {
  return await fetchWithTimeout(`${API_BASE}/api/obd/pids/live`);
}
