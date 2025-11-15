#!/bin/bash

# Systemd Service Installer для Linux
# Устанавливает Update Agent как systemd service

SERVICE_NAME="kiosk-update-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AGENT_MAIN="${AGENT_DIR}/main.js"
NODE_PATH="$(which node)"

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Функция установки
install() {
  echo "Installing Kiosk Update Agent as systemd service..."

  # Создать service file
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Kiosk Update Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${AGENT_DIR}
ExecStart=${NODE_PATH} ${AGENT_MAIN}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment variables (adjust as needed)
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF

  echo "Service file created at: ${SERVICE_FILE}"

  # Перезагрузить systemd
  systemctl daemon-reload
  echo "Systemd configuration reloaded"

  # Включить автозапуск
  systemctl enable "${SERVICE_NAME}"
  echo "Service enabled for autostart"

  # Запустить сервис
  systemctl start "${SERVICE_NAME}"
  echo "Service started"

  # Показать статус
  systemctl status "${SERVICE_NAME}" --no-pager
}

# Функция удаления
uninstall() {
  echo "Uninstalling Kiosk Update Agent systemd service..."

  # Остановить сервис
  systemctl stop "${SERVICE_NAME}" 2>/dev/null
  echo "Service stopped"

  # Отключить автозапуск
  systemctl disable "${SERVICE_NAME}" 2>/dev/null
  echo "Service disabled"

  # Удалить service file
  rm -f "$SERVICE_FILE"
  echo "Service file removed"

  # Перезагрузить systemd
  systemctl daemon-reload
  echo "Systemd configuration reloaded"
}

# Функция запуска
start() {
  echo "Starting Kiosk Update Agent..."
  systemctl start "${SERVICE_NAME}"
  systemctl status "${SERVICE_NAME}" --no-pager
}

# Функция остановки
stop() {
  echo "Stopping Kiosk Update Agent..."
  systemctl stop "${SERVICE_NAME}"
}

# Функция перезапуска
restart() {
  echo "Restarting Kiosk Update Agent..."
  systemctl restart "${SERVICE_NAME}"
  systemctl status "${SERVICE_NAME}" --no-pager
}

# Показать статус
status() {
  systemctl status "${SERVICE_NAME}" --no-pager
}

# Показать логи
logs() {
  journalctl -u "${SERVICE_NAME}" -f
}

# CLI Interface
case "$1" in
  install)
    install
    ;;
  uninstall)
    uninstall
    ;;
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    restart
    ;;
  status)
    status
    ;;
  logs)
    logs
    ;;
  *)
    echo "Usage: $0 {install|uninstall|start|stop|restart|status|logs}"
    exit 1
    ;;
esac

exit 0
