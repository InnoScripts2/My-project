/**
 * GuacamoleProxy Module
 * 
 * Manages Apache Guacamole RDP/SSH connections:
 * - Connection creation
 * - Session management
 * - Session logging
 */

import axios from 'axios';
import type { Credentials, Connection, LogEntry } from './types.js';

export class GuacamoleProxy {
  private guacamoleUrl: string;
  private authToken: string | null = null;

  constructor() {
    this.guacamoleUrl = process.env.GUACAMOLE_URL || 'https://guacamole.internal:8443';
  }

  async createConnection(
    protocol: 'RDP' | 'SSH',
    host: string,
    port: number,
    credentials: Credentials
  ): Promise<Connection> {
    try {
      await this.authenticate();

      const connectionConfig = {
        parentIdentifier: 'ROOT',
        name: `${protocol}-${host}-${Date.now()}`,
        protocol: protocol.toLowerCase(),
        parameters: this.buildParameters(protocol, host, port, credentials),
        attributes: {},
      };

      const response = await axios.post(
        `${this.guacamoleUrl}/api/session/data/mysql/connections`,
        connectionConfig,
        {
          headers: {
            'Guacamole-Token': this.authToken,
          },
        }
      );

      return {
        connectionId: response.data.identifier,
        protocol,
        host,
        createdAt: new Date().toISOString(),
        userId: credentials.username,
        status: 'active',
      };
    } catch (error: unknown) {
      throw new Error(
        `Failed to create connection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listConnections(): Promise<Connection[]> {
    try {
      await this.authenticate();

      const response = await axios.get(
        `${this.guacamoleUrl}/api/session/data/mysql/connections`,
        {
          headers: {
            'Guacamole-Token': this.authToken,
          },
        }
      );

      const connections: Connection[] = [];
      for (const [id, conn] of Object.entries(response.data)) {
        const connData = conn as { protocol: string; name: string; lastActive?: number };
        connections.push({
          connectionId: id,
          protocol: connData.protocol.toUpperCase() as 'RDP' | 'SSH',
          host: connData.name,
          createdAt: new Date().toISOString(),
          userId: 'unknown',
          status: 'active',
        });
      }

      return connections;
    } catch (error: unknown) {
      throw new Error(
        `Failed to list connections: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async terminateConnection(connectionId: string): Promise<void> {
    try {
      await this.authenticate();

      await axios.delete(
        `${this.guacamoleUrl}/api/session/data/mysql/connections/${connectionId}`,
        {
          headers: {
            'Guacamole-Token': this.authToken,
          },
        }
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to terminate connection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getSessionLogs(connectionId: string): Promise<LogEntry[]> {
    try {
      await this.authenticate();

      const response = await axios.get(
        `${this.guacamoleUrl}/api/session/data/mysql/history/connections/${connectionId}`,
        {
          headers: {
            'Guacamole-Token': this.authToken,
          },
        }
      );

      const logs: LogEntry[] = [];
      for (const entry of response.data) {
        logs.push({
          timestamp: new Date(entry.startDate).toISOString(),
          event: entry.active ? 'session_active' : 'session_ended',
          details: {
            connectionId,
            username: entry.username,
            duration: entry.duration || 0,
          },
        });
      }

      return logs;
    } catch (error: unknown) {
      throw new Error(
        `Failed to get session logs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async authenticate(): Promise<void> {
    if (this.authToken) return;

    try {
      const username = process.env.GUACAMOLE_USERNAME || 'admin';
      const password = process.env.GUACAMOLE_PASSWORD || '';

      const response = await axios.post(
        `${this.guacamoleUrl}/api/tokens`,
        new URLSearchParams({
          username,
          password,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.authToken = response.data.authToken;
    } catch (error: unknown) {
      throw new Error(
        `Failed to authenticate: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private buildParameters(
    protocol: 'RDP' | 'SSH',
    host: string,
    port: number,
    credentials: Credentials
  ): Record<string, string> {
    const params: Record<string, string> = {
      hostname: host,
      port: port.toString(),
      username: credentials.username,
    };

    if (protocol === 'RDP') {
      if (credentials.password) {
        params.password = credentials.password;
      }
      if (credentials.domain) {
        params.domain = credentials.domain;
      }
      params['security'] = 'nla';
      params['ignore-cert'] = 'true';
    } else if (protocol === 'SSH') {
      if (credentials.password) {
        params.password = credentials.password;
      }
      if (credentials.privateKey) {
        params['private-key'] = credentials.privateKey;
      }
    }

    return params;
  }
}
