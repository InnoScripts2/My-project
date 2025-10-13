/**
 * Windows Service Installer
 *
 * Устанавливает Update Agent как Windows Service используя node-windows.
 */
import { Service } from 'node-windows';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const agentPath = path.join(__dirname, '..', 'main.js');
// Конфигурация сервиса
const svc = new Service({
    name: 'KioskUpdateAgent',
    description: 'Kiosk Update Agent - manages automatic updates for kiosk applications',
    script: agentPath,
    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096',
    ],
    env: [
        {
            name: 'NODE_ENV',
            value: 'production',
        },
    ],
});
/**
 * Установить Windows Service
 */
export function install() {
    svc.on('install', () => {
        console.log('Service installed successfully');
        console.log('Starting service...');
        svc.start();
    });
    svc.on('alreadyinstalled', () => {
        console.log('Service is already installed');
    });
    svc.on('start', () => {
        console.log('Service started');
    });
    svc.on('error', (error) => {
        console.error('Service error:', error.message);
    });
    console.log('Installing Kiosk Update Agent as Windows Service...');
    svc.install();
}
/**
 * Удалить Windows Service
 */
export function uninstall() {
    svc.on('uninstall', () => {
        console.log('Service uninstalled successfully');
    });
    svc.on('alreadyuninstalled', () => {
        console.log('Service is not installed');
    });
    svc.on('error', (error) => {
        console.error('Service error:', error.message);
    });
    console.log('Uninstalling Kiosk Update Agent Windows Service...');
    svc.uninstall();
}
/**
 * Запустить сервис
 */
export function start() {
    console.log('Starting Kiosk Update Agent...');
    svc.start();
}
/**
 * Остановить сервис
 */
export function stop() {
    console.log('Stopping Kiosk Update Agent...');
    svc.stop();
}
/**
 * Перезапустить сервис
 */
export function restart() {
    console.log('Restarting Kiosk Update Agent...');
    svc.restart();
}
// CLI Interface
if (require.main === module) {
    const command = process.argv[2];
    switch (command) {
        case 'install':
            install();
            break;
        case 'uninstall':
            uninstall();
            break;
        case 'start':
            start();
            break;
        case 'stop':
            stop();
            break;
        case 'restart':
            restart();
            break;
        default:
            console.log('Usage: node windows-service.js [install|uninstall|start|stop|restart]');
            process.exit(1);
    }
}
