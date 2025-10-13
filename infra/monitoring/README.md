# Kiosk Agent Monitoring Configuration

This directory contains monitoring and observability infrastructure for the Kiosk Agent.

## Components

### Prometheus
- Time-series metrics database
- Scrapes metrics from kiosk-agent at `/metrics` endpoint
- Configuration: `../docker/prometheus.yml`
- Alert rules: `../docker/alerts/rules.yml`

### Alertmanager
- Routes and manages alerts from Prometheus
- Configuration: `../docker/alertmanager.yml`
- Webhook notifications sent to kiosk-agent

### Grafana
- Visualization and dashboarding
- Pre-configured Prometheus datasource
- Dashboard provisioning from `grafana/provisioning/`
- Access: http://localhost:3001 (default credentials: admin/changeme)

## Metrics Collected

### Application Metrics
- `http_requests_total` - Total HTTP requests by endpoint and status
- `http_request_duration_seconds` - Request duration histogram
- `payment_operations_total` - Payment operations by type and status
- `payment_operation_duration_seconds` - Payment operation duration
- `obd_connection_attempts_total` - OBD connection attempts by status
- `obd_diagnostic_duration_seconds` - OBD diagnostic duration

### System Metrics
- `process_cpu_user_seconds_total` - CPU usage
- `process_resident_memory_bytes` - Memory usage
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_gc_duration_seconds` - Garbage collection duration

## Alert Rules

### Critical Alerts
- **KioskAgentDown**: Agent is unreachable for >1 minute
- **PaymentFailureRate**: Payment failures exceed 10% over 5 minutes

### Warning Alerts
- **HighErrorRate**: HTTP 5xx errors exceed 5% over 5 minutes
- **ObdConnectionFailures**: OBD connection failures exceed 30% over 10 minutes
- **HighResponseTime**: 95th percentile response time >2 seconds
- **HighMemoryUsage**: Memory usage exceeds 1GB
- **LowDiskSpace**: Available disk space <10%

## Health Checks

### Agent Health Check
```bash
curl http://localhost:7070/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345
}
```

### Prometheus Health Check
```bash
curl http://localhost:9090/-/healthy
```

### Grafana Health Check
```bash
curl http://localhost:3001/api/health
```

## Setup Instructions

### Using Docker Compose
```bash
cd infra/docker
docker-compose up -d
```

### Manual Setup

#### 1. Install Prometheus
```bash
# Download Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# Copy configuration
cp /path/to/infra/docker/prometheus.yml ./prometheus.yml
cp -r /path/to/infra/docker/alerts ./

# Start Prometheus
./prometheus --config.file=prometheus.yml
```

#### 2. Install Alertmanager
```bash
# Download Alertmanager
wget https://github.com/prometheus/alertmanager/releases/download/v0.26.0/alertmanager-0.26.0.linux-amd64.tar.gz
tar xvfz alertmanager-*.tar.gz
cd alertmanager-*

# Copy configuration
cp /path/to/infra/docker/alertmanager.yml ./alertmanager.yml

# Start Alertmanager
./alertmanager --config.file=alertmanager.yml
```

#### 3. Install Grafana
```bash
# Ubuntu/Debian
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana

# Start Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

## Dashboard Creation

### Import Pre-built Dashboard
1. Open Grafana (http://localhost:3001)
2. Login with admin credentials
3. Navigate to Dashboards > Import
4. Upload dashboard JSON from `grafana/dashboards/`

### Create Custom Dashboard
1. Navigate to Dashboards > New Dashboard
2. Add panels with PromQL queries:
   ```promql
   # Request rate
   rate(http_requests_total[5m])
   
   # Error rate
   rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
   
   # Payment success rate
   rate(payment_operations_total{status="success"}[5m]) / rate(payment_operations_total[5m])
   
   # Response time (95th percentile)
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
   ```

## Querying Metrics

### PromQL Examples

#### Request Rate by Endpoint
```promql
sum(rate(http_requests_total[5m])) by (endpoint)
```

#### Top 5 Slowest Endpoints
```promql
topk(5, histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (endpoint))
```

#### Payment Success Rate
```promql
sum(rate(payment_operations_total{status="success"}[5m])) / sum(rate(payment_operations_total[5m]))
```

#### OBD Connection Success Rate
```promql
sum(rate(obd_connection_attempts_total{status="success"}[5m])) / sum(rate(obd_connection_attempts_total[5m]))
```

## Alerting

### Configure Webhook Receiver in Agent

The agent provides a webhook endpoint for receiving alerts:

```typescript
POST /api/alerts/webhook
Content-Type: application/json

{
  "status": "firing",
  "alerts": [
    {
      "labels": { "alertname": "HighErrorRate", "severity": "warning" },
      "annotations": { "summary": "High error rate detected" }
    }
  ]
}
```

### Email Notifications

Update `alertmanager.yml`:
```yaml
global:
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alertmanager@example.com'
  smtp_auth_username: 'user@example.com'
  smtp_auth_password: 'password'

receivers:
  - name: 'email'
    email_configs:
      - to: 'admin@example.com'
```

## Troubleshooting

### Metrics Not Appearing
1. Check agent is exposing `/metrics` endpoint:
   ```bash
   curl http://localhost:7070/metrics
   ```
2. Verify Prometheus can scrape the target:
   ```bash
   # Check Prometheus targets page
   open http://localhost:9090/targets
   ```
3. Check Prometheus logs:
   ```bash
   docker logs kiosk-prometheus
   ```

### Alerts Not Firing
1. Verify alert rules are loaded:
   ```bash
   open http://localhost:9090/rules
   ```
2. Check Alertmanager status:
   ```bash
   open http://localhost:9093
   ```
3. Review Alertmanager logs:
   ```bash
   docker logs kiosk-alertmanager
   ```

### Grafana Dashboard Issues
1. Verify datasource connection:
   - Navigate to Configuration > Data Sources
   - Test Prometheus connection
2. Check dashboard queries:
   - Open dashboard in edit mode
   - Review panel queries for errors
3. Verify time range selection

## Production Recommendations

1. **Retention**: Configure appropriate retention periods
   - Prometheus: `--storage.tsdb.retention.time=30d`
   - Alertmanager: `--data.retention=120h`

2. **Backup**: Regular backups of metrics and configuration
   ```bash
   # Backup Prometheus data
   tar -czf prometheus-backup-$(date +%Y%m%d).tar.gz /prometheus/data
   ```

3. **Security**: 
   - Enable authentication for Prometheus and Alertmanager
   - Use HTTPS for Grafana
   - Restrict access to metrics endpoints

4. **High Availability**: 
   - Run multiple Prometheus instances
   - Use Thanos or Cortex for long-term storage
   - Deploy Alertmanager in cluster mode

5. **Resource Limits**:
   - Set memory limits for Prometheus (2-4GB recommended)
   - Monitor disk usage for TSDB storage
   - Configure cardinality limits

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
