/**
 * FirezoneClient Module
 * 
 * Manages Firezone ZTNA (Zero Trust Network Access):
 * - Resource registration
 * - Access policy management
 * - WireGuard tunnel status
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  AccessPolicy,
  RegistrationResult,
  ConnectionStatus,
} from './types.js';

export class FirezoneClient {
  private configPath: string;
  private statePath: string;

  constructor() {
    this.configPath = process.env.FIREZONE_CONFIG_PATH || '/etc/kiosk/firezone.json';
    this.statePath = process.env.FIREZONE_STATE_PATH || '/var/lib/kiosk/firezone-state.json';
  }

  async registerResource(
    resourceId: string,
    name: string,
    tags: string[]
  ): Promise<RegistrationResult> {
    try {
      const deviceToken = this.generateDeviceToken();
      const gatewayAddress = process.env.FIREZONE_SERVER || 'firezone.internal';

      const registration = {
        resourceId,
        name,
        tags,
        deviceToken,
        gatewayAddress,
        registeredAt: new Date().toISOString(),
      };

      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(registration, null, 2), 'utf-8');

      return {
        resourceId,
        deviceToken,
        gatewayAddress,
      };
    } catch (error: unknown) {
      throw new Error(
        `Failed to register resource: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async updateAccessPolicy(resourceId: string, policy: AccessPolicy): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);

      if (config.resourceId !== resourceId) {
        throw new Error('Resource ID mismatch');
      }

      config.accessPolicy = policy;
      config.updatedAt = new Date().toISOString();

      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error: unknown) {
      throw new Error(
        `Failed to update access policy: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);

      const connected = await this.checkWireGuardTunnel();

      return {
        resourceId: config.resourceId,
        connected,
        gatewayAddress: config.gatewayAddress,
        activeConnections: connected ? 1 : 0,
      };
    } catch (error: unknown) {
      return {
        connected: false,
      };
    }
  }

  async rotateKeys(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);

      config.deviceToken = this.generateDeviceToken();
      config.keysRotatedAt = new Date().toISOString();

      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error: unknown) {
      throw new Error(
        `Failed to rotate keys: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private generateDeviceToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  private async checkWireGuardTunnel(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const output = execSync('wg show', { encoding: 'utf-8', timeout: 5000 });
        return output.includes('interface');
      } else {
        const output = execSync('sudo wg show', { encoding: 'utf-8', timeout: 5000 });
        return output.includes('interface');
      }
    } catch {
      return false;
    }
  }
}
