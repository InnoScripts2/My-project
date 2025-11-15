#!/bin/bash
# Generate self-signed SSL certificate for testing

set -e

echo "Generating self-signed SSL certificate..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Kiosk Selfservice/CN=kiosk.local"

chmod 600 server.key

echo ""
echo "SSL certificate generated successfully!"
echo "  Certificate: server.crt"
echo "  Private key: server.key"
echo ""
echo "WARNING: This is a self-signed certificate for TESTING only."
echo "For production, use Let's Encrypt or commercial certificates."
