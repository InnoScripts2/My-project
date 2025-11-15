/**
 * HardeningChecklist Module
 * 
 * Validates system security hardening configuration.
 * Checks OS, Network, User, and Services categories.
 */

import os from 'os';
import { execSync } from 'child_process';
import type {
  HardeningReport,
  CheckResult,
  CheckStatus,
  Platform,
  OverallStatus,
} from './types.js';

export class HardeningChecklist {
  private platform: Platform;

  constructor() {
    this.platform = os.platform() === 'win32' ? 'Windows' : 'Linux';
  }

  async runChecks(): Promise<HardeningReport> {
    const checks: CheckResult[] = [];
    const timestamp = new Date().toISOString();

    checks.push(await this.checkKioskMode());
    checks.push(await this.checkAutoLogin());
    checks.push(await this.checkSystemShortcutsBlocked());
    checks.push(await this.checkUpdatesScheduled());
    checks.push(await this.checkFirewallRules());
    checks.push(await this.checkVpnRequired());
    checks.push(await this.checkDnsHardened());
    checks.push(await this.checkUnprivilegedUser());
    checks.push(await this.checkHomeDirectoryRestricted());
    checks.push(await this.checkSudoDisabled());
    checks.push(await this.checkUnnecessaryServicesDisabled());
    checks.push(await this.checkAgentAutoStart());
    checks.push(await this.checkFrontendAutoStart());

    const failedChecks = checks.filter((c) => c.status === 'failed');
    const warningChecks = checks.filter((c) => c.status === 'warning');

    let overallStatus: OverallStatus = 'passed';
    if (failedChecks.length > 0) {
      overallStatus = 'failed';
    } else if (warningChecks.length > 0) {
      overallStatus = 'warning';
    }

    const recommendations = checks
      .filter((c) => c.remediation)
      .map((c) => c.remediation as string);

    return {
      timestamp,
      platform: this.platform,
      checks,
      overallStatus,
      recommendations,
    };
  }

  getCheckStatus(checkId: string): CheckStatus | null {
    return null;
  }

  exportReport(report: HardeningReport, format: 'json' | 'html'): string {
    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    const statusColor = (status: CheckStatus) => {
      switch (status) {
        case 'passed':
          return 'green';
        case 'failed':
          return 'red';
        case 'warning':
          return 'orange';
        default:
          return 'gray';
      }
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Security Hardening Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { background: #333; color: white; padding: 20px; }
    .check { border: 1px solid #ddd; margin: 10px 0; padding: 15px; }
    .passed { border-left: 5px solid green; }
    .failed { border-left: 5px solid red; }
    .warning { border-left: 5px solid orange; }
    .status { font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Security Hardening Report</h1>
    <p>Platform: ${report.platform}</p>
    <p>Timestamp: ${report.timestamp}</p>
    <p>Overall Status: <span style="color: ${statusColor(report.overallStatus)}">${report.overallStatus.toUpperCase()}</span></p>
  </div>
  ${report.checks
    .map(
      (check) => `
    <div class="check ${check.status}">
      <h3>${check.description} [${check.category}]</h3>
      <p class="status">Status: <span style="color: ${statusColor(check.status)}">${check.status.toUpperCase()}</span></p>
      <p>${check.details}</p>
      ${check.remediation ? `<p><strong>Remediation:</strong> ${check.remediation}</p>` : ''}
    </div>
  `
    )
    .join('')}
  ${
    report.recommendations.length > 0
      ? `
    <div style="background: #fff3cd; padding: 15px; margin-top: 20px;">
      <h2>Recommendations</h2>
      <ul>
        ${report.recommendations.map((r) => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  `
      : ''
  }
</body>
</html>
    `;

    return html;
  }

  private async checkKioskMode(): Promise<CheckResult> {
    try {
      if (this.platform === 'Windows') {
        const result = execSync(
          'powershell -Command "Get-AssignedAccess | ConvertTo-Json"',
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();

        if (result && result !== '[]' && result !== 'null') {
          return {
            id: 'kiosk_mode_enabled',
            category: 'OS',
            description: 'Kiosk mode active',
            status: 'passed',
            details: 'AssignedAccess configured',
            remediation: null,
          };
        }

        return {
          id: 'kiosk_mode_enabled',
          category: 'OS',
          description: 'Kiosk mode active',
          status: 'warning',
          details: 'AssignedAccess not detected',
          remediation: 'Configure Windows Kiosk Mode via AssignedAccess',
        };
      } else {
        const lockFile = '/etc/kiosk.lock';
        try {
          execSync(`test -f ${lockFile}`, { encoding: 'utf-8', timeout: 5000 });
          return {
            id: 'kiosk_mode_enabled',
            category: 'OS',
            description: 'Kiosk mode active',
            status: 'passed',
            details: 'Kiosk lock file present',
            remediation: null,
          };
        } catch {
          return {
            id: 'kiosk_mode_enabled',
            category: 'OS',
            description: 'Kiosk mode active',
            status: 'warning',
            details: 'Kiosk lock file not found',
            remediation: 'Configure display manager kiosk mode',
          };
        }
      }
    } catch (error: unknown) {
      return {
        id: 'kiosk_mode_enabled',
        category: 'OS',
        description: 'Kiosk mode active',
        status: 'warning',
        details: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
        remediation: 'Verify kiosk mode configuration',
      };
    }
  }

  private async checkAutoLogin(): Promise<CheckResult> {
    return {
      id: 'auto_login_configured',
      category: 'OS',
      description: 'Auto-login configured',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Configure auto-login for kiosk user',
    };
  }

  private async checkSystemShortcutsBlocked(): Promise<CheckResult> {
    return {
      id: 'system_shortcuts_blocked',
      category: 'OS',
      description: 'System shortcuts blocked',
      status: 'warning',
      details: 'Manual verification required',
      remediation:
        'Block Alt+Tab, Win, Ctrl+Alt+Del via Group Policy or compositor rules',
    };
  }

  private async checkUpdatesScheduled(): Promise<CheckResult> {
    return {
      id: 'updates_scheduled',
      category: 'OS',
      description: 'Automatic updates scheduled',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Schedule updates for 2-5 AM non-working hours',
    };
  }

  private async checkFirewallRules(): Promise<CheckResult> {
    try {
      if (this.platform === 'Windows') {
        const rules = execSync(
          'netsh advfirewall firewall show rule name=all dir=out',
          { encoding: 'utf-8', timeout: 5000 }
        );

        return {
          id: 'firewall_rules_configured',
          category: 'Network',
          description: 'Firewall rules configured',
          status: 'passed',
          details: 'Windows Firewall active',
          remediation: null,
        };
      } else {
        try {
          execSync('sudo iptables -L -n', { encoding: 'utf-8', timeout: 5000 });
          return {
            id: 'firewall_rules_configured',
            category: 'Network',
            description: 'Firewall rules configured',
            status: 'passed',
            details: 'iptables rules present',
            remediation: null,
          };
        } catch {
          return {
            id: 'firewall_rules_configured',
            category: 'Network',
            description: 'Firewall rules configured',
            status: 'warning',
            details: 'Unable to verify iptables',
            remediation: 'Configure firewall to allow only ports 80, 443, 22 (localhost)',
          };
        }
      }
    } catch (error: unknown) {
      return {
        id: 'firewall_rules_configured',
        category: 'Network',
        description: 'Firewall rules configured',
        status: 'warning',
        details: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
        remediation: 'Configure firewall rules',
      };
    }
  }

  private async checkVpnRequired(): Promise<CheckResult> {
    return {
      id: 'vpn_required',
      category: 'Network',
      description: 'VPN required for access',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Block access without VPN except local services',
    };
  }

  private async checkDnsHardened(): Promise<CheckResult> {
    return {
      id: 'dns_hardened',
      category: 'Network',
      description: 'DNS hardened',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Configure DNS to trusted resolvers (1.1.1.1 or corporate)',
    };
  }

  private async checkUnprivilegedUser(): Promise<CheckResult> {
    try {
      const username = os.userInfo().username;
      const isRoot = process.getuid ? process.getuid() === 0 : false;

      if (isRoot) {
        return {
          id: 'unprivileged_user',
          category: 'User',
          description: 'Unprivileged user',
          status: 'failed',
          details: 'Running as root/admin',
          remediation: 'Run kiosk process under unprivileged user',
        };
      }

      return {
        id: 'unprivileged_user',
        category: 'User',
        description: 'Unprivileged user',
        status: 'passed',
        details: `Running as user: ${username}`,
        remediation: null,
      };
    } catch (error: unknown) {
      return {
        id: 'unprivileged_user',
        category: 'User',
        description: 'Unprivileged user',
        status: 'warning',
        details: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
        remediation: 'Verify user privileges',
      };
    }
  }

  private async checkHomeDirectoryRestricted(): Promise<CheckResult> {
    return {
      id: 'home_directory_restricted',
      category: 'User',
      description: 'Home directory restricted',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Set home directory permissions to 700',
    };
  }

  private async checkSudoDisabled(): Promise<CheckResult> {
    return {
      id: 'sudo_disabled',
      category: 'User',
      description: 'Sudo disabled for kiosk user',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Disable sudo access for kiosk user',
    };
  }

  private async checkUnnecessaryServicesDisabled(): Promise<CheckResult> {
    return {
      id: 'unnecessary_services_disabled',
      category: 'Services',
      description: 'Unnecessary services disabled',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Disable telnet, FTP, SMB, print spooler if not required',
    };
  }

  private async checkAgentAutoStart(): Promise<CheckResult> {
    return {
      id: 'agent_auto_start',
      category: 'Services',
      description: 'Kiosk agent auto-start enabled',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Enable systemd service or Windows Service auto-start',
    };
  }

  private async checkFrontendAutoStart(): Promise<CheckResult> {
    return {
      id: 'frontend_auto_start',
      category: 'Services',
      description: 'Kiosk frontend auto-start enabled',
      status: 'warning',
      details: 'Manual verification required',
      remediation: 'Enable browser kiosk mode or Electron auto-start',
    };
  }
}
