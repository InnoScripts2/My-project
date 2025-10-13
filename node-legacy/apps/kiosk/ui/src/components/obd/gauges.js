export class RpmGauge {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.options = {
      min: options.min || 0,
      max: options.max || 8000,
      redZone: options.redZone || 6000,
      units: options.units || 'RPM',
    };
    this.currentValue = 0;
    this.targetValue = 0;
    this.animationFrame = null;
  }

  draw(value) {
    this.targetValue = Math.max(this.options.min, Math.min(this.options.max, value));
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.animate();
  }

  animate() {
    const diff = this.targetValue - this.currentValue;
    
    if (Math.abs(diff) < 1) {
      this.currentValue = this.targetValue;
      this.render();
      return;
    }

    this.currentValue += diff * 0.15;
    this.render();
    
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  render() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height * 0.75;
    const radius = Math.min(width, height) * 0.35;

    this.ctx.clearRect(0, 0, width, height);

    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;
    const angleRange = endAngle - startAngle;

    const greenEnd = startAngle + angleRange * 0.7;
    const yellowEnd = startAngle + angleRange * 0.9;

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, startAngle, greenEnd);
    this.ctx.lineWidth = 20;
    this.ctx.strokeStyle = '#00cc66';
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, greenEnd, yellowEnd);
    this.ctx.strokeStyle = '#ffaa00';
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, yellowEnd, endAngle);
    this.ctx.strokeStyle = '#ff4444';
    this.ctx.stroke();

    const valueRatio = (this.currentValue - this.options.min) / (this.options.max - this.options.min);
    const valueAngle = startAngle + angleRange * valueRatio;

    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    const needleLength = radius - 15;
    const needleX = centerX + needleLength * Math.cos(valueAngle);
    const needleY = centerY + needleLength * Math.sin(valueAngle);
    this.ctx.lineTo(needleX, needleY);
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fill();

    this.ctx.font = 'bold 48px sans-serif';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(Math.round(this.currentValue).toString(), centerX, centerY - 20);

    this.ctx.font = '18px sans-serif';
    this.ctx.fillStyle = '#b0b0b0';
    this.ctx.fillText(this.options.units, centerX, centerY + 10);
  }
}

export class SpeedGauge extends RpmGauge {
  constructor(canvasElement, options = {}) {
    super(canvasElement, {
      min: options.min || 0,
      max: options.max || 200,
      redZone: options.redZone || 160,
      units: options.units || 'km/h',
    });
  }
}

export class TemperatureBar {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.options = {
      min: options.min || -40,
      max: options.max || 150,
      criticalThreshold: options.criticalThreshold || 100,
      label: options.label || 'Temp',
    };
    this.currentValue = 0;
    this.targetValue = 0;
    this.animationFrame = null;
  }

  draw(value) {
    this.targetValue = Math.max(this.options.min, Math.min(this.options.max, value));
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.animate();
  }

  animate() {
    const diff = this.targetValue - this.currentValue;
    
    if (Math.abs(diff) < 0.5) {
      this.currentValue = this.targetValue;
      this.render();
      return;
    }

    this.currentValue += diff * 0.15;
    this.render();
    
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  render() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const barWidth = 60;
    const barHeight = height - 80;
    const barX = (width - barWidth) / 2;
    const barY = 50;

    this.ctx.clearRect(0, 0, width, height);

    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    const valueRatio = (this.currentValue - this.options.min) / (this.options.max - this.options.min);
    const fillHeight = barHeight * valueRatio;

    const gradient = this.ctx.createLinearGradient(barX, barY + barHeight, barX, barY);
    
    if (this.currentValue > this.options.criticalThreshold) {
      gradient.addColorStop(0, '#ff4444');
      gradient.addColorStop(1, '#ffaa00');
    } else if (this.currentValue > this.options.criticalThreshold * 0.8) {
      gradient.addColorStop(0, '#ffaa00');
      gradient.addColorStop(1, '#00cc66');
    } else {
      gradient.addColorStop(0, '#00cc66');
      gradient.addColorStop(1, '#00aaff');
    }

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(barX, barY + barHeight - fillHeight, barWidth, fillHeight);

    this.ctx.font = 'bold 24px sans-serif';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(Math.round(this.currentValue).toString(), width / 2, barY + barHeight + 30);

    this.ctx.font = '14px sans-serif';
    this.ctx.fillStyle = '#b0b0b0';
    this.ctx.fillText(`${this.options.label} (°C)`, width / 2, barY + barHeight + 50);
  }
}

export class BatteryVoltageIndicator {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.currentValue = 12.5;
    this.targetValue = 12.5;
    this.animationFrame = null;
  }

  draw(value) {
    this.targetValue = Math.max(10, Math.min(16, value));
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.animate();
  }

  animate() {
    const diff = this.targetValue - this.currentValue;
    
    if (Math.abs(diff) < 0.01) {
      this.currentValue = this.targetValue;
      this.render();
      return;
    }

    this.currentValue += diff * 0.15;
    this.render();
    
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  render() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const barWidth = width * 0.8;
    const barHeight = 40;
    const barX = (width - barWidth) / 2;
    const barY = (height - barHeight) / 2;

    this.ctx.clearRect(0, 0, width, height);

    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    const normalMin = 12.0;
    const normalMax = 14.5;
    const valueRatio = (this.currentValue - 10) / (16 - 10);
    const fillWidth = barWidth * valueRatio;

    let color = '#00cc66';
    if (this.currentValue < normalMin || this.currentValue > normalMax) {
      color = '#ffaa00';
    }
    if (this.currentValue < 11 || this.currentValue > 15) {
      color = '#ff4444';
    }

    this.ctx.fillStyle = color;
    this.ctx.fillRect(barX, barY, fillWidth, barHeight);

    this.ctx.font = 'bold 24px sans-serif';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${this.currentValue.toFixed(1)} V`, width / 2, barY + barHeight + 30);

    this.ctx.font = '14px sans-serif';
    this.ctx.fillStyle = '#b0b0b0';
    this.ctx.fillText('Battery Voltage', width / 2, barY + barHeight + 50);
  }
}
