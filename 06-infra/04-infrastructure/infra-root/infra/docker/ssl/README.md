# SSL Certificate Setup

## Production Certificates

Place your SSL certificates in this directory:

- `server.crt` - SSL certificate
- `server.key` - Private key

## Self-Signed Certificate for Testing

For testing purposes, generate a self-signed certificate:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Kiosk/CN=kiosk.local"
```

## Let's Encrypt (Recommended for Production)

For production deployment with Let's Encrypt:

1. Install certbot:
   ```bash
   apt-get install certbot python3-certbot-nginx
   ```

2. Obtain certificate:
   ```bash
   certbot certonly --standalone -d your-domain.com
   ```

3. Copy certificates:
   ```bash
   cp /etc/letsencrypt/live/your-domain.com/fullchain.pem server.crt
   cp /etc/letsencrypt/live/your-domain.com/privkey.pem server.key
   ```

4. Set up auto-renewal:
   ```bash
   certbot renew --dry-run
   ```

## Security Notes

- Never commit private keys to version control
- Use strong encryption (2048-bit RSA minimum)
- Rotate certificates before expiration
- Restrict file permissions: `chmod 600 server.key`
