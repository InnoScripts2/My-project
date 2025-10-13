export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

export function validateContact(value) {
  const trimmed = (value || '').trim();
  
  if (!trimmed) {
    return { valid: false, type: null, message: 'Введите контакт' };
  }
  
  if (trimmed.includes('@')) {
    if (validateEmail(trimmed)) {
      return { valid: true, type: 'email', normalized: trimmed.toLowerCase() };
    } else {
      return { valid: false, type: 'email', message: 'Неверный формат email' };
    }
  }
  
  if (validatePhone(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    let normalized = digits;
    
    if (normalized.startsWith('8')) {
      normalized = `7${normalized.slice(1)}`;
    } else if (normalized.startsWith('9')) {
      normalized = `7${normalized}`;
    } else if (!normalized.startsWith('7')) {
      normalized = `7${normalized}`;
    }
    
    return { valid: true, type: 'phone', normalized };
  }
  
  return { valid: false, type: null, message: 'Неверный формат телефона или email' };
}
