export class DtcList {
  constructor(containerElement) {
    this.container = containerElement;
  }

  render(dtcCodes) {
    if (!Array.isArray(dtcCodes) || dtcCodes.length === 0) {
      this.renderEmpty();
      return;
    }

    this.container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'dtc-grid';

    dtcCodes.forEach((dtc) => {
      const card = this.createDtcCard(dtc);
      grid.appendChild(card);
    });

    this.container.appendChild(grid);
  }

  createDtcCard(dtc) {
    const card = document.createElement('div');
    card.className = 'dtc-card';

    const typeClass = this.getTypeClass(dtc.code);
    card.classList.add(typeClass);

    const header = document.createElement('div');
    header.className = 'dtc-header';

    const codeElement = document.createElement('div');
    codeElement.className = 'dtc-code';
    codeElement.textContent = dtc.code || 'Unknown';

    const statusElement = document.createElement('div');
    statusElement.className = 'dtc-status';
    statusElement.innerHTML = this.getStatusIcon(dtc.status);

    header.appendChild(codeElement);
    header.appendChild(statusElement);

    const typeElement = document.createElement('div');
    typeElement.className = 'dtc-type';
    typeElement.textContent = dtc.type || 'Unknown';

    const descElement = document.createElement('div');
    descElement.className = 'dtc-description';
    descElement.textContent = dtc.description || 'No description available';

    card.appendChild(header);
    card.appendChild(typeElement);
    card.appendChild(descElement);

    return card;
  }

  getTypeClass(code) {
    if (!code) return 'dtc-unknown';
    
    const firstChar = code.charAt(0).toUpperCase();
    switch (firstChar) {
      case 'P':
        return 'dtc-powertrain';
      case 'C':
        return 'dtc-chassis';
      case 'B':
        return 'dtc-body';
      case 'U':
        return 'dtc-network';
      default:
        return 'dtc-unknown';
    }
  }

  getStatusIcon(status) {
    if (status === 'pending') {
      return '<span class="status-icon status-pending" title="Pending">⚠️</span>';
    }
    return '<span class="status-icon status-confirmed" title="Confirmed">❌</span>';
  }

  renderEmpty() {
    this.container.innerHTML = `
      <div class="dtc-empty">
        <div class="dtc-empty-icon">✓</div>
        <div class="dtc-empty-title">Ошибок не обнаружено</div>
        <div class="dtc-empty-message">Все системы автомобиля работают в штатном режиме</div>
      </div>
    `;
  }
}
