/**
 * Main Smoke Test Runner - Cycle 4/09
 * 
 * Запускает все smoke tests для проверки устройств и интеграций:
 * - OBD (ELM327)
 * - Толщиномер
 * - Платежи (только DEV)
 * 
 * Запуск: npm run smoke:all
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestResult {
  name: string;
  passed: boolean;
  exitCode: number;
  durationMs: number;
  output?: string;
}

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`, ...args);
}

async function runTest(name: string, scriptPath: string): Promise<TestResult> {
  log('INFO', `\n${'='.repeat(60)}`);
  log('INFO', `Running: ${name}`);
  log('INFO', `${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const nodeArgs = ['--loader', 'ts-node/esm', '--no-warnings', scriptPath];
    
    const child = spawn('node', nodeArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
    
    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const exitCode = code ?? 0;
      const passed = exitCode === 0;
      
      log('INFO', `\n${name} finished with exit code ${exitCode} (${durationMs}ms)\n`);
      
      resolve({
        name,
        passed,
        exitCode,
        durationMs,
      });
    });
    
    child.on('error', (error) => {
      const durationMs = Date.now() - startTime;
      
      log('ERROR', `\n${name} failed to start: ${error.message}\n`);
      
      resolve({
        name,
        passed: false,
        exitCode: -1,
        durationMs,
        output: error.message,
      });
    });
  });
}

async function main() {
  log('INFO', '=== Smoke Test Suite - Cycle 4/09 ===');
  log('INFO', `Environment: ${process.env.AGENT_ENV || 'DEV'}`);
  log('INFO', `Node version: ${process.version}`);
  log('INFO', `Started at: ${new Date().toISOString()}`);
  log('INFO', '');
  
  const env = process.env.AGENT_ENV || 'DEV';
  
  const tests: Array<{ name: string; script: string; runInProd: boolean }> = [
    { name: 'OBD Smoke Test', script: 'obd-smoke.ts', runInProd: true },
    { name: 'Thickness Smoke Test', script: 'thickness-smoke.ts', runInProd: true },
    { name: 'Payments Smoke Test (DEV-only)', script: 'payments-smoke.ts', runInProd: false },
  ];
  
  const results: TestResult[] = [];
  
  for (const test of tests) {
    if (env === 'PROD' && !test.runInProd) {
      log('INFO', `Skipping ${test.name} in PROD environment`);
      results.push({
        name: test.name,
        passed: true,
        exitCode: 0,
        durationMs: 0,
        output: 'Skipped in PROD',
      });
      continue;
    }
    
    const scriptPath = join(__dirname, test.script);
    const result = await runTest(test.name, scriptPath);
    results.push(result);
    
    // Если тест критически провалился в PROD, останавливаемся
    if (env === 'PROD' && !result.passed) {
      log('ERROR', 'CRITICAL: Test failed in PROD environment. Stopping.');
      break;
    }
  }
  
  // Печатаем финальную сводку
  log('INFO', '\n' + '='.repeat(60));
  log('INFO', '=== Final Summary ===');
  log('INFO', '='.repeat(60) + '\n');
  
  let passedCount = 0;
  let failedCount = 0;
  let totalDuration = 0;
  
  results.forEach((result) => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const duration = `(${result.durationMs}ms)`;
    log('INFO', `${status}: ${result.name} ${duration}`);
    
    if (result.exitCode !== 0) {
      log('INFO', `  Exit code: ${result.exitCode}`);
    }
    
    if (result.output) {
      log('INFO', `  Output: ${result.output}`);
    }
    
    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
    
    totalDuration += result.durationMs;
  });
  
  log('INFO', '');
  log('INFO', `Total: ${passedCount}/${results.length} passed, ${failedCount} failed`);
  log('INFO', `Total duration: ${totalDuration}ms`);
  log('INFO', `Completed at: ${new Date().toISOString()}`);
  log('INFO', '');
  
  if (env === 'PROD' && failedCount > 0) {
    log('ERROR', 'CRITICAL: Smoke tests failed in PROD environment!');
    log('ERROR', 'Please review the errors above and fix before deployment.');
    process.exit(1);
  }
  
  if (failedCount > 0) {
    log('WARN', 'Some smoke tests failed. Review errors above.');
    log('WARN', 'In DEV this is acceptable for development purposes.');
    process.exit(2);
  }
  
  log('INFO', '✓ All smoke tests passed successfully!');
  process.exit(0);
}

// Запуск
main().catch((error) => {
  log('ERROR', 'Fatal error in smoke test runner:', error);
  process.exit(3);
});
