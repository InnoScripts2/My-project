# Seafile Configuration Example

This document provides an example configuration for setting up the Seafile integration for long-term report archival.

## Server Setup

### Using Docker

```bash
# Create directories
mkdir -p /opt/seafile-data

# Run Seafile server
docker run -d \
  --name seafile \
  -p 80:80 \
  -p 443:443 \
  -v /opt/seafile-data:/shared \
  -e SEAFILE_SERVER_HOSTNAME=seafile.internal \
  -e SEAFILE_ADMIN_EMAIL=admin@example.com \
  -e SEAFILE_ADMIN_PASSWORD=changeme \
  seafileltd/seafile:latest

# Wait for initialization
docker logs -f seafile
```

### Manual Installation

Follow the official Seafile installation guide:
https://manual.seafile.com/deploy/

## Library Setup

1. Access Seafile web UI at `https://seafile.internal`
2. Login with admin credentials
3. Create new library:
   - Name: "Kiosk Reports Archive"
   - Encryption: Optional (recommended for sensitive data)
4. Copy Library ID from browser URL: `https://seafile.internal/library/f38d3c2e-6c90-4f6c-8f3b-4e8c3d9a6b5e/`
   - Library ID: `f38d3c2e-6c90-4f6c-8f3b-4e8c3d9a6b5e`

## User Setup

1. Create kiosk user account:
   - Username: `kiosk-agent`
   - Password: Generate strong password
   - Email: `kiosk@example.com`

2. Grant permissions to library:
   - Go to Library settings
   - Share with user `kiosk-agent`
   - Permission: Read-Write

3. Get authentication token:

```bash
curl -d "username=kiosk-agent&password=YOUR_PASSWORD" \
  https://seafile.internal/api2/auth-token/
```

Response:
```json
{"token":"24fd3c026886e3121b2ca630805ed425c272cb96"}
```

## Kiosk Agent Configuration

Add to `.env`:

```env
# Seafile Server
SEAFILE_SERVER_URL=https://seafile.internal
SEAFILE_USERNAME=kiosk-agent
SEAFILE_PASSWORD=YOUR_SECURE_PASSWORD
SEAFILE_LIBRARY_ID=f38d3c2e-6c90-4f6c-8f3b-4e8c3d9a6b5e

# Synchronization Schedule (cron format)
# Default: Every day at 4 AM
SEAFILE_SYNC_CRON=0 4 * * *

# Retention Policy
# Keep local files for 7 days after sync
SEAFILE_LOCAL_RETENTION_DAYS=7
# Keep remote files for 90 days
SEAFILE_REMOTE_RETENTION_DAYS=90
# Auto-delete local files after successful sync
SEAFILE_AUTO_DELETE_AFTER_SYNC=true

# Share Link Settings
# Links expire after 7 days
SEAFILE_SHARE_LINK_EXPIRATION_DAYS=7

# Optional: Library encryption password
# SEAFILE_LIBRARY_PASSWORD=encryption-password
```

## Network Configuration

### Firewall Rules

Allow kiosk agent to connect to Seafile:

```bash
# Allow HTTPS
sudo ufw allow from KIOSK_IP to SEAFILE_IP port 443

# Or allow all
sudo ufw allow 443/tcp
```

### DNS/Hosts

Add to kiosk `/etc/hosts` or DNS:

```
192.168.1.100  seafile.internal
```

## SSL Certificate

### Self-signed (Development)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /opt/seafile-data/ssl/seafile.key \
  -out /opt/seafile-data/ssl/seafile.crt \
  -subj "/CN=seafile.internal"
```

### Let's Encrypt (Production)

```bash
docker run --rm -it \
  -v /opt/seafile-data/ssl:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d seafile.example.com \
  --agree-tos -m admin@example.com
```

## Testing Connection

Test from kiosk agent:

```bash
# Test connectivity
curl -k https://seafile.internal/api2/ping/

# Test authentication
curl -k -d "username=kiosk-agent&password=YOUR_PASSWORD" \
  https://seafile.internal/api2/auth-token/

# Test library access
curl -k -H "Authorization: Token YOUR_TOKEN" \
  https://seafile.internal/api2/repos/LIBRARY_ID/
```

## Monitoring

### Seafile Server Monitoring

```bash
# Check disk space
df -h /opt/seafile-data

# Check Seafile logs
docker logs seafile

# Check database size
du -sh /opt/seafile-data/seafile-data/
```

### Kiosk Agent Monitoring

Check Prometheus metrics:

```bash
curl http://localhost:7070/metrics | grep file_transfer
```

Expected metrics:
- `file_transfer_archived_reports_total`
- `file_transfer_sync_duration_seconds`
- `file_transfer_sync_uploaded_files_total`
- `file_transfer_sync_failed_total`

## Backup Strategy

### Seafile Data Backup

```bash
# Stop Seafile
docker stop seafile

# Backup data directory
tar czf seafile-backup-$(date +%Y%m%d).tar.gz /opt/seafile-data

# Start Seafile
docker start seafile
```

### Automated Backup Script

```bash
#!/bin/bash
# /opt/backup-seafile.sh

BACKUP_DIR="/backup/seafile"
DATE=$(date +%Y%m%d)

# Create backup
docker exec seafile /scripts/seafile.sh backup

# Copy to backup directory
mkdir -p $BACKUP_DIR
cp /opt/seafile-data/seafile-backup-*.tar.gz $BACKUP_DIR/

# Keep last 30 days
find $BACKUP_DIR -name "seafile-backup-*.tar.gz" -mtime +30 -delete
```

Add to crontab:
```cron
0 2 * * * /opt/backup-seafile.sh
```

## Troubleshooting

### Connection Issues

Problem: `Connection refused`

Solution:
1. Check Seafile is running: `docker ps | grep seafile`
2. Check firewall: `sudo ufw status`
3. Check network: `ping seafile.internal`
4. Check logs: `docker logs seafile`

### Authentication Issues

Problem: `Authentication failed: 401`

Solution:
1. Verify credentials in `.env`
2. Test token manually: `curl -d "username=USER&password=PASS" https://seafile.internal/api2/auth-token/`
3. Check user permissions in Seafile web UI
4. Reset password if needed

### Upload Issues

Problem: `Upload failed: 403`

Solution:
1. Check library ID is correct
2. Verify user has read-write permission
3. Check disk space on Seafile server: `df -h`
4. Check upload size limits in Seafile config

### Sync Issues

Problem: Sync takes too long

Solution:
1. Reduce number of files: Apply retention policy more aggressively
2. Run sync during off-hours: Change `SEAFILE_SYNC_CRON`
3. Increase network bandwidth
4. Consider compression before upload

## Security Best Practices

1. **Use HTTPS**: Always use SSL/TLS for production
2. **Strong passwords**: Generate random passwords for kiosk user
3. **Encrypt library**: Enable encryption for sensitive reports
4. **Firewall rules**: Restrict access to Seafile server
5. **Regular updates**: Keep Seafile server updated
6. **Audit logs**: Review access logs regularly
7. **Backup encryption**: Encrypt backups at rest
8. **Share link expiration**: Always set expiration on share links

## Performance Tuning

### Seafile Server

Edit `/opt/seafile-data/seafile/conf/seafile.conf`:

```ini
[fileserver]
# Max upload size (MB)
max_upload_size = 1000

# Max download size (MB)
max_download_dir_size = 1000

[quota]
# Default user quota (GB)
default = 100
```

### Kiosk Agent

Optimize sync performance:

```env
# Sync during off-hours
SEAFILE_SYNC_CRON=0 3 * * *

# Aggressive local retention
SEAFILE_LOCAL_RETENTION_DAYS=1

# Auto-delete after sync
SEAFILE_AUTO_DELETE_AFTER_SYNC=true
```

## Support

For issues with:
- Seafile server: https://manual.seafile.com/
- Kiosk integration: See README.md in file-transfer directory
- API errors: Check logs in kiosk-agent/logs/

## References

- Seafile Manual: https://manual.seafile.com/
- Seafile API: https://manual.seafile.com/develop/web_api_v2.1/
- Docker Hub: https://hub.docker.com/r/seafileltd/seafile
