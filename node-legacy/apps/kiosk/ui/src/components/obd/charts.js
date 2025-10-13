export class RealtimeChart {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.options = {
      maxDataPoints: options.maxDataPoints || 60,
      updateInterval: options.updateInterval || 1000,
    };
    this.dataPoints = [];
    this.visibleMetrics = ['rpm', 'speed', 'coolant', 'throttle'];
    this.animationFrame = null;
  }

  addDataPoint(timestamp, values) {
    this.dataPoints.push({
      timestamp,
      ...values,
    });

    if (this.dataPoints.length > this.options.maxDataPoints) {
      this.dataPoints.shift();
    }

    this.update();
  }

  setVisibleMetrics(metrics) {
    this.visibleMetrics = metrics;
    this.update();
  }

  update() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    this.animationFrame = requestAnimationFrame(() => this.render());
  }

  render() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = { top: 40, right: 100, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    this.ctx.clearRect(0, 0, width, height);

    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 1;

    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(padding.left, y);
      this.ctx.lineTo(padding.left + chartWidth, y);
      this.ctx.stroke();
    }

    for (let i = 0; i <= 6; i++) {
      const x = padding.left + (chartWidth / 6) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, padding.top);
      this.ctx.lineTo(x, padding.top + chartHeight);
      this.ctx.stroke();
    }

    if (this.dataPoints.length === 0) {
      this.ctx.font = '16px sans-serif';
      this.ctx.fillStyle = '#666';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Waiting for data...', width / 2, height / 2);
      return;
    }

    const metricConfigs = {
      rpm: { color: '#00aaff', scale: 8000, label: 'RPM' },
      speed: { color: '#00cc66', scale: 200, label: 'Speed' },
      coolant: { color: '#ff4444', scale: 150, label: 'Coolant' },
      throttle: { color: '#ffaa00', scale: 100, label: 'Throttle' },
    };

    this.visibleMetrics.forEach((metric) => {
      const config = metricConfigs[metric];
      if (!config) return;

      this.ctx.strokeStyle = config.color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      let firstPoint = true;

      this.dataPoints.forEach((point, index) => {
        const value = point[metric] || 0;
        const x = padding.left + (chartWidth / (this.options.maxDataPoints - 1)) * index;
        const y = padding.top + chartHeight - (value / config.scale) * chartHeight;

        if (firstPoint) {
          this.ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          this.ctx.lineTo(x, y);
        }
      });

      this.ctx.stroke();
    });

    const legendX = padding.left + chartWidth + 10;
    let legendY = padding.top;

    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'left';

    this.visibleMetrics.forEach((metric) => {
      const config = metricConfigs[metric];
      if (!config) return;

      const latestPoint = this.dataPoints[this.dataPoints.length - 1];
      const value = latestPoint ? (latestPoint[metric] || 0) : 0;

      this.ctx.fillStyle = config.color;
      this.ctx.fillRect(legendX, legendY, 12, 12);

      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(`${config.label}: ${Math.round(value)}`, legendX + 20, legendY + 10);

      legendY += 25;
    });

    this.ctx.font = '12px sans-serif';
    this.ctx.fillStyle = '#666';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Time (seconds)', width / 2, height - 10);

    this.ctx.save();
    this.ctx.translate(20, height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText('Value', 0, 0);
    this.ctx.restore();
  }
}
