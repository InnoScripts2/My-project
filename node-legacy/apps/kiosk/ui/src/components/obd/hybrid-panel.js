export class HybridPanel {
  constructor(containerElement) {
    this.container = containerElement;
    this.isVisible = false;
  }

  update(data) {
    if (!data || !data.hvBattery) {
      this.hide();
      return;
    }

    this.show();
    this.render(data);
  }

  show() {
    if (!this.isVisible) {
      this.container.style.display = 'block';
      this.isVisible = true;
    }
  }

  hide() {
    if (this.isVisible) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  render(data) {
    this.container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'hybrid-panel';

    const title = document.createElement('h3');
    title.className = 'hybrid-panel-title';
    title.textContent = 'Гибридная система';
    panel.appendChild(title);

    if (data.hvBattery) {
      const batterySection = this.createBatterySection(data.hvBattery);
      panel.appendChild(batterySection);
    }

    if (data.inverter) {
      const inverterSection = this.createInverterSection(data.inverter);
      panel.appendChild(inverterSection);
    }

    if (data.mg1 || data.mg2) {
      const motorsSection = this.createMotorsSection(data.mg1, data.mg2);
      panel.appendChild(motorsSection);
    }

    this.container.appendChild(panel);
  }

  createBatterySection(battery) {
    const section = document.createElement('div');
    section.className = 'hybrid-section';

    const header = document.createElement('div');
    header.className = 'hybrid-section-header';
    header.textContent = 'Высоковольтная батарея';
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'hybrid-grid';

    if (typeof battery.soc === 'number') {
      const socItem = document.createElement('div');
      socItem.className = 'hybrid-item';
      socItem.innerHTML = `
        <div class="hybrid-label">Заряд</div>
        <div class="hybrid-value">${battery.soc}%</div>
        <div class="hybrid-bar">
          <div class="hybrid-bar-fill" style="width: ${battery.soc}%"></div>
        </div>
      `;
      grid.appendChild(socItem);
    }

    if (typeof battery.voltage === 'number') {
      const voltageItem = document.createElement('div');
      voltageItem.className = 'hybrid-item';
      voltageItem.innerHTML = `
        <div class="hybrid-label">Напряжение</div>
        <div class="hybrid-value">${battery.voltage.toFixed(1)} V</div>
      `;
      grid.appendChild(voltageItem);
    }

    if (typeof battery.current === 'number') {
      const currentItem = document.createElement('div');
      currentItem.className = 'hybrid-item';
      const direction = battery.current > 0 ? 'Заряд' : battery.current < 0 ? 'Разряд' : 'Нет тока';
      currentItem.innerHTML = `
        <div class="hybrid-label">${direction}</div>
        <div class="hybrid-value">${Math.abs(battery.current).toFixed(1)} A</div>
      `;
      grid.appendChild(currentItem);
    }

    if (typeof battery.temp === 'number') {
      const tempItem = document.createElement('div');
      tempItem.className = 'hybrid-item';
      tempItem.innerHTML = `
        <div class="hybrid-label">Температура</div>
        <div class="hybrid-value">${battery.temp}°C</div>
      `;
      grid.appendChild(tempItem);
    }

    section.appendChild(grid);
    return section;
  }

  createInverterSection(inverter) {
    const section = document.createElement('div');
    section.className = 'hybrid-section';

    const header = document.createElement('div');
    header.className = 'hybrid-section-header';
    header.textContent = 'Инвертор';
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'hybrid-grid';

    if (typeof inverter.temp === 'number') {
      const tempItem = document.createElement('div');
      tempItem.className = 'hybrid-item';
      tempItem.innerHTML = `
        <div class="hybrid-label">Температура</div>
        <div class="hybrid-value">${inverter.temp}°C</div>
      `;
      grid.appendChild(tempItem);
    }

    section.appendChild(grid);
    return section;
  }

  createMotorsSection(mg1, mg2) {
    const section = document.createElement('div');
    section.className = 'hybrid-section';

    const header = document.createElement('div');
    header.className = 'hybrid-section-header';
    header.textContent = 'Электромоторы';
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'hybrid-grid';

    if (mg1) {
      const mg1Item = document.createElement('div');
      mg1Item.className = 'hybrid-item';
      mg1Item.innerHTML = `
        <div class="hybrid-label">MG1</div>
        <div class="hybrid-value">${mg1.speed || 0} RPM</div>
        <div class="hybrid-subvalue">${mg1.torque || 0} Nm</div>
      `;
      grid.appendChild(mg1Item);
    }

    if (mg2) {
      const mg2Item = document.createElement('div');
      mg2Item.className = 'hybrid-item';
      mg2Item.innerHTML = `
        <div class="hybrid-label">MG2</div>
        <div class="hybrid-value">${mg2.speed || 0} RPM</div>
        <div class="hybrid-subvalue">${mg2.torque || 0} Nm</div>
      `;
      grid.appendChild(mg2Item);
    }

    section.appendChild(grid);
    return section;
  }
}
