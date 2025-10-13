let errorModal = null;

export function showError(message, options = {}) {
  if (!errorModal) {
    createErrorModal();
  }
  
  const titleEl = errorModal.querySelector('.error-modal-title');
  const messageEl = errorModal.querySelector('.error-modal-message');
  const retryBtn = errorModal.querySelector('.error-modal-retry');
  
  if (titleEl) {
    titleEl.textContent = options.title || 'Ошибка';
  }
  
  if (messageEl) {
    messageEl.textContent = message || 'Произошла неизвестная ошибка';
  }
  
  if (retryBtn) {
    retryBtn.style.display = options.onRetry ? '' : 'none';
    retryBtn.onclick = () => {
      hideError();
      if (options.onRetry) {
        options.onRetry();
      }
    };
  }
  
  errorModal.classList.remove('hidden');
}

export function hideError() {
  if (errorModal) {
    errorModal.classList.add('hidden');
  }
}

function createErrorModal() {
  errorModal = document.createElement('div');
  errorModal.className = 'modal-backdrop hidden';
  errorModal.setAttribute('role', 'dialog');
  errorModal.setAttribute('aria-modal', 'true');
  errorModal.setAttribute('aria-labelledby', 'error-modal-title');
  
  errorModal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title error-modal-title" id="error-modal-title">Ошибка</div>
        <button type="button" class="close error-modal-close" aria-label="Закрыть">Закрыть</button>
      </div>
      <div class="modal-body">
        <div class="error-modal-message"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary error-modal-close">Отменить</button>
        <button type="button" class="primary error-modal-retry">Повторить</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(errorModal);
  
  const closeButtons = errorModal.querySelectorAll('.error-modal-close');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', hideError);
  });
  
  errorModal.addEventListener('click', (e) => {
    if (e.target === errorModal) {
      hideError();
    }
  });
}

export function initErrorHandler() {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[error-handler] Unhandled promise rejection:', event.reason);
    
    if (import.meta.env.DEV) {
      showError(`Необработанная ошибка: ${event.reason?.message || event.reason}`, {
        title: 'Ошибка разработки',
      });
    }
  });
  
  window.addEventListener('error', (event) => {
    console.error('[error-handler] Global error:', event.error);
  });
  
  console.log('[error-handler] Error handler initialized');
}
