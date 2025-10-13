export function formatCurrency(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatRelativeTime(date) {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minute = 60000;
  const hour = 3600000;
  const day = 86400000;
  
  const abs = Math.abs(diffMs);
  
  if (abs < minute) {
    return 'менее минуты назад';
  } else if (abs < hour) {
    const mins = Math.round(abs / minute);
    return `${mins} мин назад`;
  } else if (abs < day) {
    const hours = Math.round(abs / hour);
    return `${hours} ч назад`;
  } else {
    const days = Math.round(abs / day);
    return `${days} дн назад`;
  }
}

export function escapeHtml(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPhoneNumber(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '';
  
  let normalized = digits;
  if (normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`;
  } else if (normalized.startsWith('9') && normalized.length <= 10) {
    normalized = `7${normalized}`;
  } else if (!normalized.startsWith('7')) {
    normalized = `7${normalized}`;
  }
  
  normalized = normalized.slice(0, 11);
  
  let formatted = '+7';
  const zone = normalized.slice(1, Math.min(4, normalized.length));
  if (zone) {
    formatted += ` (${zone}`;
    if (zone.length === 3) {
      formatted += ')';
    }
  }
  
  const block2 = normalized.slice(4, Math.min(7, normalized.length));
  if (block2) {
    formatted += ` ${block2}`;
  }
  
  const block3 = normalized.slice(7, Math.min(9, normalized.length));
  if (block3) {
    formatted += `-${block3}`;
  }
  
  const block4 = normalized.slice(9, Math.min(11, normalized.length));
  if (block4) {
    formatted += `-${block4}`;
  }
  
  return formatted;
}
