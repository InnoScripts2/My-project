import type { Playbook } from './types/index.js';

export class OnCallPlaybooks {
  private playbooks: Map<string, Playbook>;

  constructor() {
    this.playbooks = new Map();
    this.initializeDefaultPlaybooks();
  }

  private initializeDefaultPlaybooks(): void {
    this.playbooks.set('device_disconnected_obd', {
      name: 'device_disconnected_obd',
      title: 'OBD-II адаптер не подключается',
      symptoms: [
        'Алерт device_disconnected severity critical',
        'GET /api/obd/status возвращает {"connected": false}',
        'Клиент не может начать диагностику',
      ],
      diagnosis: [
        {
          step: 'Проверить физическое подключение адаптера к киоску',
          expectedOutput: 'Кабель подключён к USB порту',
        },
        {
          step: 'Проверить доступность COM порта',
          command: 'mode',
          expectedOutput: 'COM3 доступен',
        },
        {
          step: 'Проверить статус в приложении',
          command: 'curl http://localhost:8080/api/obd/status',
          expectedOutput: '{"connected": true}',
        },
      ],
      resolution: [
        {
          step: 'Переподключить USB кабель адаптера',
          note: 'Ожидать 10 секунд после переподключения',
        },
        {
          step: 'Перезапустить kiosk-agent',
          command: 'POST /api/kiosks/:id/restart',
          note: 'Через admin-console или API',
        },
        {
          step: 'Если не помогло заменить адаптер на запасной',
          note: 'Запасной адаптер в киоске ящик A',
        },
      ],
      escalation: 'Если resolution не помогла в течение 15 минут escalate к senior operator или tech support',
      estimatedTime: 10,
    });

    this.playbooks.set('payment_failure_rate_high', {
      name: 'payment_failure_rate_high',
      title: 'Высокий процент неудачных платежей',
      symptoms: [
        'Алерт payment_failure_rate более 10%',
        'Клиенты жалуются на failed payments',
      ],
      diagnosis: [
        {
          step: 'Проверить статус YooKassa API',
          command: 'curl https://api.yookassa.ru/health',
          expectedOutput: '200 OK',
        },
        {
          step: 'Проверить интернет соединение киоска',
          command: 'ping 8.8.8.8',
          expectedOutput: 'Packets received 4/4',
        },
        {
          step: 'Проверить логи ошибок платежей',
          command: 'GET /api/payments/errors?limit=10',
          expectedOutput: 'Error codes',
        },
      ],
      resolution: [
        {
          step: 'Если YooKassa down ожидать восстановления',
          note: 'Проверить status.yookassa.ru',
        },
        {
          step: 'Если интернет проблемы перезагрузить роутер',
          note: 'Роутер в техническом помещении',
        },
        {
          step: 'Если логи показывают invalid credentials обновить API key',
          command: 'PUT /api/kiosks/:id/config yookassaShopId yookassaApiKey',
        },
      ],
      escalation: 'Если payments не восстанавливаются в течение 30 минут escalate к финансовому отделу',
      estimatedTime: 20,
    });
  }

  async getPlaybook(issueName: string): Promise<Playbook | null> {
    return this.playbooks.get(issueName) || null;
  }

  async listPlaybooks(): Promise<Playbook[]> {
    return Array.from(this.playbooks.values());
  }

  async createPlaybook(playbook: Playbook): Promise<void> {
    this.playbooks.set(playbook.name, playbook);
  }
}
