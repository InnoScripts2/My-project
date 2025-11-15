export class ConnectionStatus {
  constructor(containerElement) {
    this.container = containerElement;
  }

  update(status) {
    this.container.innerHTML = '';

    const statusDiv = document.createElement('div');
    statusDiv.className = 'connection-status';

    const indicator = document.createElement('div');
    indicator.className = 'connection-indicator';

    const indicatorDot = document.createElement('div');
    indicatorDot.className = 'connection-dot';

    if (status.connected) {
      indicatorDot.classList.add('connected');
      statusDiv.classList.add('connected');
    } else {
      indicatorDot.classList.add('disconnected');
      statusDiv.classList.add('disconnected');
    }

    indicator.appendChild(indicatorDot);

    const statusText = document.createElement('div');
    statusText.className = 'connection-text';

    const mainText = document.createElement('div');
    mainText.className = 'connection-main-text';
    
    if (status.connected) {
      mainText.textContent = `Подключено ${status.adapter || 'ELM327'}`;
    } else {
      mainText.textContent = 'Нет подключения';
    }

    const detailsText = document.createElement('div');
    detailsText.className = 'connection-details';

    if (status.connected) {
      const details = [];
      if (status.protocol) {
        details.push(`Протокол: ${status.protocol}`);
      }
      if (status.vehicle) {
        const vehicleStr = [status.vehicle.make, status.vehicle.model]
          .filter(Boolean)
          .join(' ');
        if (vehicleStr) {
          details.push(`Автомобиль: ${vehicleStr}`);
        }
      }
      detailsText.textContent = details.join(' • ');
    } else {
      detailsText.textContent = 'Поиск адаптера...';
    }

    statusText.appendChild(mainText);
    statusText.appendChild(detailsText);

    statusDiv.appendChild(indicator);
    statusDiv.appendChild(statusText);

    this.container.appendChild(statusDiv);

    if (!status.connected) {
      indicatorDot.classList.add('pulse');
    }
  }
}
