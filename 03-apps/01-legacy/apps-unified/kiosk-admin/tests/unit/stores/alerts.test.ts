import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAlertsStore } from '@/stores/alerts';
import axios from 'axios';

vi.mock('axios');

describe('Alerts Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should initialize with empty alerts array', () => {
    const store = useAlertsStore();
    expect(store.alerts).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('should fetch alerts successfully', async () => {
    const mockAlerts = [
      { alertId: 'alert-001', timestamp: '2024-01-01', severity: 'critical', name: 'Test', description: 'Test alert', status: 'active' }
    ];

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockAlerts });

    const store = useAlertsStore();
    await store.fetchAlerts();

    expect(store.alerts).toEqual(mockAlerts);
    expect(store.loading).toBe(false);
  });

  it('should count unacknowledged alerts correctly', () => {
    const store = useAlertsStore();
    store.alerts = [
      { alertId: 'alert-001', timestamp: '2024-01-01', severity: 'critical', name: 'Test1', description: 'Test', status: 'active' },
      { alertId: 'alert-002', timestamp: '2024-01-01', severity: 'warning', name: 'Test2', description: 'Test', status: 'active' },
      { alertId: 'alert-003', timestamp: '2024-01-01', severity: 'info', name: 'Test3', description: 'Test', status: 'resolved' }
    ];

    expect(store.unacknowledgedCount).toBe(2);
  });

  it('should acknowledge alert successfully', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

    const store = useAlertsStore();
    const result = await store.acknowledgeAlert('alert-001');

    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledWith('/api/monitoring/alerts/alert-001/acknowledge');
  });

  it('should resolve alert successfully', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

    const store = useAlertsStore();
    const result = await store.resolveAlert('alert-001');

    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledWith('/api/monitoring/alerts/alert-001/resolve');
  });

  it('should add new alert', () => {
    const store = useAlertsStore();
    const newAlert = {
      alertId: 'alert-001',
      timestamp: '2024-01-01',
      severity: 'critical' as const,
      name: 'New Alert',
      description: 'Test alert',
      status: 'active' as const
    };

    store.addAlert(newAlert);

    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0]).toEqual(newAlert);
  });
});
