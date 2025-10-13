/**
 * WazuhAgent Module
 * 
 * Manages Wazuh SIEM agent for security monitoring:
 * - File Integrity Monitoring (FIM)
 * - Rootkit Detection
 * - Vulnerability Scanning
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { WazuhConfig, InstallResult, AgentStatus } from './types.js';

export class WazuhAgent {
  private configPath: string;
  private isWindows: boolean;

  constructor() {
    this.isWindows = process.platform === 'win32';
    this.configPath = this.isWindows
      ? 'C:\\Program Files (x86)\\ossec-agent\\ossec.conf'
      : '/var/ossec/etc/ossec.conf';
  }

  async installAgent(): Promise<InstallResult> {
    try {
      if (this.isWindows) {
        return {
          success: false,
          error: 'Windows agent installation requires manual setup',
        };
      }

      const checkCmd = 'which wazuh-control';
      try {
        execSync(checkCmd, { encoding: 'utf-8', timeout: 5000 });
        const version = this.getInstalledVersion();
        return {
          success: true,
          version,
        };
      } catch {
        return {
          success: false,
          error: 'Wazuh agent not installed. Install via package manager.',
        };
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: `Installation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async configureAgent(config: WazuhConfig): Promise<void> {
    const ossecConfig = this.generateOssecConfig(config);

    try {
      await fs.writeFile(this.configPath, ossecConfig, 'utf-8');

      if (!this.isWindows) {
        execSync(`sudo chown root:ossec ${this.configPath}`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
        execSync(`sudo chmod 640 ${this.configPath}`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to configure agent: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async startAgent(): Promise<void> {
    try {
      if (this.isWindows) {
        execSync('net start WazuhSvc', { encoding: 'utf-8', timeout: 10000 });
      } else {
        execSync('sudo /var/ossec/bin/wazuh-control start', {
          encoding: 'utf-8',
          timeout: 10000,
        });
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stopAgent(): Promise<void> {
    try {
      if (this.isWindows) {
        execSync('net stop WazuhSvc', { encoding: 'utf-8', timeout: 10000 });
      } else {
        execSync('sudo /var/ossec/bin/wazuh-control stop', {
          encoding: 'utf-8',
          timeout: 10000,
        });
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to stop agent: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getStatus(): Promise<AgentStatus> {
    try {
      const cmd = this.isWindows
        ? 'wazuh-control status'
        : '/var/ossec/bin/wazuh-control status';

      const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

      const connected = output.includes('running') || output.includes('is running');
      const version = this.getInstalledVersion();

      const policies: string[] = [];
      if (output.includes('syscheck')) policies.push('FIM');
      if (output.includes('rootcheck')) policies.push('RootkitDetection');
      if (output.includes('vulnerability')) policies.push('VulnerabilityScanning');

      return {
        installed: true,
        version,
        connected,
        lastSeen: new Date().toISOString(),
        policies,
      };
    } catch (error: unknown) {
      return {
        installed: false,
        version: 'unknown',
        connected: false,
        lastSeen: new Date().toISOString(),
      };
    }
  }

  private getInstalledVersion(): string {
    try {
      const cmd = this.isWindows ? 'wazuh-control info' : '/var/ossec/bin/wazuh-control info';
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
      const match = output.match(/WAZUH\s+v?(\d+\.\d+\.\d+)/i);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private generateOssecConfig(config: WazuhConfig): string {
    const fimPolicy = config.policies.find((p) => p.name === 'FIM');
    const rootkitPolicy = config.policies.find((p) => p.name === 'RootkitDetection');
    const vulnPolicy = config.policies.find((p) => p.name === 'VulnerabilityScanning');

    const fimDirectories = fimPolicy?.settings?.directories as string[] | undefined;
    const fimRealTime = fimPolicy?.settings?.realTime as boolean | undefined;
    const rootkitInterval = rootkitPolicy?.settings?.interval as number | undefined;
    const vulnScanTime = vulnPolicy?.settings?.scanTime as string | undefined;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ossec_config>
  <client>
    <server>
      <address>${config.serverAddress.split(':')[0]}</address>
      <port>${config.serverAddress.split(':')[1] || '1514'}</port>
      <protocol>tcp</protocol>
    </server>
    <config-profile>${config.groups.join(',')}</config-profile>
    <enrollment>
      <enabled>yes</enabled>
      <authorization_pass_path>/var/ossec/etc/authd.pass</authorization_pass_path>
    </enrollment>
  </client>
`;

    if (fimPolicy?.enabled && fimDirectories) {
      xml += `
  <syscheck>
    <frequency>300</frequency>
    <scan_on_start>yes</scan_on_start>
`;
      for (const dir of fimDirectories) {
        xml += `    <directories${fimRealTime ? ' realtime="yes"' : ''}>${dir}</directories>\n`;
      }
      xml += `    <ignore>/opt/kiosk/node_modules</ignore>
    <ignore type="sregex">.log$</ignore>
  </syscheck>
`;
    }

    if (rootkitPolicy?.enabled) {
      xml += `
  <rootcheck>
    <disabled>no</disabled>
    <frequency>${Math.floor((rootkitInterval || 21600) / 3600)}</frequency>
    <rootkit_files>/var/ossec/etc/rootcheck/rootkit_files.txt</rootkit_files>
    <rootkit_trojans>/var/ossec/etc/rootcheck/rootkit_trojans.txt</rootkit_trojans>
  </rootcheck>
`;
    }

    if (vulnPolicy?.enabled) {
      xml += `
  <vulnerability-detector>
    <enabled>yes</enabled>
    <interval>1d</interval>
    <min_full_scan_interval>6h</min_full_scan_interval>
    <run_on_start>yes</run_on_start>
  </vulnerability-detector>
`;
    }

    xml += `</ossec_config>`;

    return xml;
  }
}
