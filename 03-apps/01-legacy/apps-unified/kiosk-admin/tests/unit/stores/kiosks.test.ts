import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useKiosksStore } from '@/stores/kiosks';
import axios from 'axios';

vi.mock('axios');

describe('Kiosks Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should initialize with empty kiosks array', () => {
    const store = useKiosksStore();
    expect(store.kiosks).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('should fetch kiosks list successfully', async () => {
    const mockKiosks = [
      { kioskId: 'kiosk-001', location: 'Moscow', status: 'online', uptime: 1000, lastSeen: '2024-01-01' },
      { kioskId: 'kiosk-002', location: 'SPB', status: 'offline', uptime: 0, lastSeen: '2024-01-01' }
    ];

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockKiosks });

    const store = useKiosksStore();
    await store.fetchKiosksList();

    expect(store.kiosks).toEqual(mockKiosks);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('should handle fetch kiosks error', async () => {
    const errorMessage = 'Network error';
    vi.mocked(axios.get).mockRejectedValueOnce(new Error(errorMessage));

    const store = useKiosksStore();
    await store.fetchKiosksList();

    expect(store.kiosks).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBe(errorMessage);
  });

  it('should filter online kiosks correctly', () => {
    const store = useKiosksStore();
    store.kiosks = [
      { kioskId: 'kiosk-001', location: 'Moscow', status: 'online', uptime: 1000, lastSeen: '2024-01-01' },
      { kioskId: 'kiosk-002', location: 'SPB', status: 'offline', uptime: 0, lastSeen: '2024-01-01' },
      { kioskId: 'kiosk-003', location: 'Kazan', status: 'online', uptime: 2000, lastSeen: '2024-01-01' }
    ];

    expect(store.onlineKiosks).toHaveLength(2);
    expect(store.onlineKiosks[0].kioskId).toBe('kiosk-001');
  });

  it('should restart kiosk successfully', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

    const store = useKiosksStore();
    const result = await store.restartKiosk('kiosk-001');

    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledWith('/api/kiosks/kiosk-001/restart');
  });

  it('should update kiosk status', () => {
    const store = useKiosksStore();
    store.kiosks = [
      { kioskId: 'kiosk-001', location: 'Moscow', status: 'online', uptime: 1000, lastSeen: '2024-01-01' }
    ];

    store.updateKioskStatus('kiosk-001', 'offline');

    expect(store.kiosks[0].status).toBe('offline');
  });
});
