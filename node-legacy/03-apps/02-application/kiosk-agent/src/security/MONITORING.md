# Security Monitoring Dashboard

Grafana dashboard configuration для мониторинга безопасности киоска.

## Prometheus Queries

### Hardening Status
```promql
# Overall hardening status
security_hardening_check_status

# Failed checks count
count(security_hardening_check_status == 0)

# Checks by status
sum by(status) (security_hardening_checks_total)
```

### Wazuh Monitoring
```promql
# Agent connection status
security_wazuh_agent_connected

# Alerts by severity
rate(security_wazuh_alerts_total[5m]) * 60

# Critical alerts in last hour
increase(security_wazuh_alerts_total{severity="Critical"}[1h])
```

### Remote Access
```promql
# Active remote sessions
security_remote_sessions_active

# Remote sessions by protocol
sum by(protocol) (security_remote_sessions_active)

# Firezone tunnel status
security_firezone_connected
```

### Audit Events
```promql
# Audit events rate
rate(security_audit_events_total[5m]) * 60

# Events by category
sum by(category) (security_audit_events_total)

# Failed access attempts
rate(security_audit_events_total{category="RemoteAccess",result="failure"}[5m]) * 60
```

### Updates
```promql
# Successful updates
security_updates_applied_total{success="true"}

# Failed updates
security_updates_applied_total{success="false"}

# Rollbacks
security_rollbacks_total
```

## Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "Kiosk Security Monitoring",
    "panels": [
      {
        "title": "Hardening Status",
        "type": "gauge",
        "targets": [
          {
            "expr": "count(security_hardening_check_status == 1) / count(security_hardening_check_status) * 100"
          }
        ],
        "gridPos": { "x": 0, "y": 0, "w": 6, "h": 4 }
      },
      {
        "title": "Wazuh Agent Status",
        "type": "stat",
        "targets": [
          {
            "expr": "security_wazuh_agent_connected"
          }
        ],
        "gridPos": { "x": 6, "y": 0, "w": 6, "h": 4 }
      },
      {
        "title": "Firezone Tunnel Status",
        "type": "stat",
        "targets": [
          {
            "expr": "security_firezone_connected"
          }
        ],
        "gridPos": { "x": 12, "y": 0, "w": 6, "h": 4 }
      },
      {
        "title": "Active Remote Sessions",
        "type": "gauge",
        "targets": [
          {
            "expr": "sum(security_remote_sessions_active)"
          }
        ],
        "gridPos": { "x": 18, "y": 0, "w": 6, "h": 4 }
      },
      {
        "title": "Wazuh Alerts (5m rate)",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(security_wazuh_alerts_total[5m]) * 60",
            "legendFormat": "{{severity}}"
          }
        ],
        "gridPos": { "x": 0, "y": 4, "w": 12, "h": 6 }
      },
      {
        "title": "Audit Events by Category",
        "type": "piechart",
        "targets": [
          {
            "expr": "sum by(category) (security_audit_events_total)"
          }
        ],
        "gridPos": { "x": 12, "y": 4, "w": 12, "h": 6 }
      },
      {
        "title": "Failed Access Attempts",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(security_audit_events_total{result=\"failure\"}[5m]) * 60",
            "legendFormat": "{{category}}"
          }
        ],
        "gridPos": { "x": 0, "y": 10, "w": 12, "h": 6 }
      },
      {
        "title": "Update Status",
        "type": "table",
        "targets": [
          {
            "expr": "security_updates_applied_total"
          },
          {
            "expr": "security_rollbacks_total"
          }
        ],
        "gridPos": { "x": 12, "y": 10, "w": 12, "h": 6 }
      }
    ]
  }
}
```

## Alerting Rules

### Critical Security Alerts

```yaml
groups:
  - name: security_critical
    interval: 1m
    rules:
      - alert: HardeningChecksFailed
        expr: count(security_hardening_check_status == 0) > 0
        for: 5m
        labels:
          severity: critical
          component: security
        annotations:
          summary: "Hardening checks failed on kiosk {{ $labels.instance }}"
          description: "{{ $value }} hardening checks are failing"
      
      - alert: WazuhAgentDisconnected
        expr: security_wazuh_agent_connected == 0
        for: 5m
        labels:
          severity: critical
          component: security
        annotations:
          summary: "Wazuh agent disconnected on {{ $labels.instance }}"
          description: "Wazuh SIEM agent is not connected"
      
      - alert: FirezoneTunnelDown
        expr: security_firezone_connected == 0
        for: 5m
        labels:
          severity: warning
          component: security
        annotations:
          summary: "Firezone tunnel down on {{ $labels.instance }}"
          description: "ZTNA tunnel is not connected"
      
      - alert: HighFailedAccessAttempts
        expr: rate(security_audit_events_total{result="failure"}[5m]) > 5
        for: 2m
        labels:
          severity: warning
          component: security
        annotations:
          summary: "High rate of failed access attempts on {{ $labels.instance }}"
          description: "{{ $value }} failed access attempts per minute"
      
      - alert: CriticalWazuhAlert
        expr: increase(security_wazuh_alerts_total{severity="Critical"}[5m]) > 0
        for: 1m
        labels:
          severity: critical
          component: security
        annotations:
          summary: "Critical Wazuh alert on {{ $labels.instance }}"
          description: "Wazuh detected a critical security issue"
      
      - alert: UpdateFailed
        expr: increase(security_updates_applied_total{success="false"}[1h]) > 0
        for: 1m
        labels:
          severity: warning
          component: security
        annotations:
          summary: "Update failed on {{ $labels.instance }}"
          description: "Agent update failed, manual intervention may be required"
      
      - alert: RollbackPerformed
        expr: increase(security_rollbacks_total[1h]) > 0
        for: 1m
        labels:
          severity: warning
          component: security
        annotations:
          summary: "Rollback performed on {{ $labels.instance }}"
          description: "Update was rolled back, investigate the cause"
```

## Log Aggregation

### Loki Query Examples

```logql
# All security events
{job="kiosk-agent"} |= "security"

# Failed hardening checks
{job="kiosk-agent"} | json | category="SystemEvent" | action="hardening_check_failed"

# Remote access attempts
{job="kiosk-agent"} | json | category="RemoteAccess"

# Failed authentication
{job="kiosk-agent"} | json | category="RemoteAccess" | result="failure"

# Configuration changes
{job="kiosk-agent"} | json | category="ConfigChange"

# File integrity violations
{job="kiosk-agent"} | json | category="FileChange"
```

## Incident Response Runbook

### High Failed Access Attempts

1. Check audit logs для source IPs:
```bash
curl http://kiosk:7070/api/security/audit?category=RemoteAccess&result=failure | jq '.logs[] | .sourceIp' | sort | uniq -c
```

2. Block suspicious IPs в firewall:
```bash
sudo iptables -A INPUT -s <suspicious-ip> -j DROP
```

3. Review Firezone access policies
4. Notify security team

### Wazuh Critical Alert

1. Check Wazuh Manager UI для details
2. Review affected files/processes
3. Isolate kiosk if compromised:
```bash
sudo iptables -A INPUT -j DROP
sudo iptables -A OUTPUT -j DROP
```

4. Collect forensics:
```bash
tar -czf kiosk-forensics-$(date +%s).tar.gz /var/log/kiosk /var/ossec/logs
```

5. Notify security team
6. Plan remediation

### Update Failed

1. Check health status:
```bash
curl http://kiosk:7070/api/health
```

2. Review audit logs:
```bash
curl http://kiosk:7070/api/security/audit?category=SystemEvent&action=agent_update_failed
```

3. Check backup availability:
```bash
ls -lh /var/backups/kiosk-agent
```

4. Manual rollback if needed (see DEPLOYMENT.md)

## Dashboard Links

- Grafana: https://grafana.internal/d/kiosk-security
- Wazuh: https://wazuh.internal
- Firezone: https://firezone.internal
- MeshCentral: https://meshcentral.internal
- Guacamole: https://guacamole.internal:8443
