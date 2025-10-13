// Optional realtime wiring for kiosk UI
// If window.SESSION_ID is set by the UI flow, subscribe to payments and sessions changes

async function initRealtime() {
  if (!window.supabase || !window.SESSION_ID) return;
  const sessionId = window.SESSION_ID;

  try {
    const chPay = window.supabase
      .channel(`payments_session_${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        console.log('[realtime] payments change', payload);
        // TODO: update paywall UI, unlock results on status succeeded
        const info = document.getElementById('obd-payment-info');
        if (info) {
          info.textContent = `Статус платежа: ${payload.new?.status ?? payload.old?.status ?? '—'}`;
        }
      })
      .subscribe();

    const chSess = window.supabase
      .channel(`sessions_${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        console.log('[realtime] session change', payload);
      })
      .subscribe();

    window.__supabaseChannels = { chPay, chSess };
  } catch (e) {
    console.warn('Realtime init failed', e);
  }
}

// Delay to ensure main UI scripts set SESSION_ID if needed
setTimeout(initRealtime, 1000);
