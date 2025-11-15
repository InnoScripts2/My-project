/**
 * Скрипт для быстрого тестирования Green API
 * Запуск: node test-send.js
 */

import { GreenApiClient, ReportSender } from './src/index.js';
import 'dotenv/config';

async function testBasicMessage() {
  console.log('🧪 Тест 1: Отправка простого сообщения...');

  const client = new GreenApiClient({
    idInstance: process.env.GREEN_API_INSTANCE_ID || '1105335604',
    apiTokenInstance: process.env.GREEN_API_TOKEN || ''
  });

  const result = await client.sendMessage({
    chatId: process.env.GREEN_API_RECIPIENT_PHONE || '79963153818@c.us',
    message: '🤖 Тестовое сообщение из системы киоска\n\nВремя: ' + new Date().toLocaleString('ru-RU')
  });

  if (result.success) {
    console.log('✅ Сообщение отправлено успешно!');
    console.log('📝 Ответ:', result.data);
  } else {
    console.error('❌ Ошибка отправки:', result.error);
  }

  return result.success;
}

async function testDiagnosticReport() {
  console.log('\n🧪 Тест 2: Отправка диагностического отчёта...');

  const sender = new ReportSender({
    idInstance: process.env.GREEN_API_INSTANCE_ID || '1105335604',
    apiTokenInstance: process.env.GREEN_API_TOKEN || ''
  });

  const report = {
    timestamp: new Date().toISOString(),
    vehicleId: 'TEST-001',
    vin: '1HGBH41JXMN109186',
    diagnosticCodes: ['P0420', 'P0171'],
    sensors: {
      'Температура двигателя': '92°C',
      'Обороты': '850 RPM',
      'Скорость': '0 км/ч',
      'Напряжение АКБ': '12.6V'
    },
    summary: 'Тестовый отчёт: обнаружены ошибки системы катализатора и топливной смеси'
  };

  const result = await sender.sendDiagnosticReport(report, {
    recipientPhone: process.env.GREEN_API_RECIPIENT_PHONE || '79963153818@c.us',
    includeDetails: true,
    sendAsFile: false
  });

  if (result.success) {
    console.log('✅ Отчёт отправлен успешно!');
  } else {
    console.error('❌ Ошибка отправки отчёта:', result.error);
  }

  return result.success;
}

async function testGetSettings() {
  console.log('\n🧪 Тест 3: Получение настроек инстанса...');

  const client = new GreenApiClient({
    idInstance: process.env.GREEN_API_INSTANCE_ID || '1105335604',
    apiTokenInstance: process.env.GREEN_API_TOKEN || ''
  });

  const result = await client.getSettings();

  if (result.success) {
    console.log('✅ Настройки получены:');
    console.log('📱 WhatsApp ID:', result.data?.wid);
    console.log('🌍 Страна:', result.data?.countryInstance || 'не указана');
    console.log('⏱️  Задержка:', result.data?.delaySendMessagesMilliseconds, 'мс');
  } else {
    console.error('❌ Ошибка получения настроек:', result.error);
  }

  return result.success;
}

async function runAllTests() {
  console.log('🚀 Запуск тестов Green API\n');
  console.log('Instance ID:', process.env.GREEN_API_INSTANCE_ID || 'НЕ УКАЗАН');
  console.log('Получатель:', process.env.GREEN_API_RECIPIENT_PHONE || 'НЕ УКАЗАН');
  console.log('Token:', process.env.GREEN_API_TOKEN ? 'НАСТРОЕН ✅' : 'НЕ НАСТРОЕН ❌');
  console.log('─'.repeat(50));

  const test1 = await testBasicMessage();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const test2 = await testDiagnosticReport();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const test3 = await testGetSettings();

  console.log('\n' + '─'.repeat(50));
  console.log('📊 Результаты:');
  console.log(`Тест 1 (Сообщение): ${test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Тест 2 (Отчёт): ${test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Тест 3 (Настройки): ${test3 ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = test1 && test2 && test3;
  console.log('\n' + (allPassed ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!' : '❌ ЕСТЬ ОШИБКИ'));

  if (!allPassed) {
    console.log('\n💡 Проверьте:');
    console.log('1. Настроены ли переменные окружения в .env');
    console.log('2. Подключён ли WhatsApp в консоли Green API');
    console.log('3. Правильно ли указан формат номера (79XXXXXXXXX@c.us)');
  }
}

runAllTests().catch(console.error);
