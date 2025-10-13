/**
 * GuacamoleProxy Module
 *
 * Manages Apache Guacamole RDP/SSH connections:
 * - Connection creation
 * - Session management
 * - Session logging
 */
import axios from 'axios';
export class GuacamoleProxy {
    constructor() {
        this.authToken = null;
        this.guacamoleUrl = process.env.GUACAMOLE_URL || 'https://guacamole.internal:8443';
    }
    async createConnection(protocol, host, port, credentials) {
        try {
            await this.authenticate();
            const connectionConfig = {
                parentIdentifier: 'ROOT',
                name: `${protocol}-${host}-${Date.now()}`,
                protocol: protocol.toLowerCase(),
                parameters: this.buildParameters(protocol, host, port, credentials),
                attributes: {},
            };
            const response = await axios.post(`${this.guacamoleUrl}/api/session/data/mysql/connections`, connectionConfig, {
                headers: {
                    'Guacamole-Token': this.authToken,
                },
            });
            return {
                connectionId: response.data.identifier,
                protocol,
                host,
                createdAt: new Date().toISOString(),
                userId: credentials.username,
                status: 'active',
            };
        }
        catch (error) {
            throw new Error(`Failed to create connection: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async listConnections() {
        try {
            await this.authenticate();
            const response = await axios.get(`${this.guacamoleUrl}/api/session/data/mysql/connections`, {
                headers: {
                    'Guacamole-Token': this.authToken,
                },
            });
            const connections = [];
            for (const [id, conn] of Object.entries(response.data)) {
                const connData = conn;
                connections.push({
                    connectionId: id,
                    protocol: connData.protocol.toUpperCase(),
                    host: connData.name,
                    createdAt: new Date().toISOString(),
                    userId: 'unknown',
                    status: 'active',
                });
            }
            return connections;
        }
        catch (error) {
            throw new Error(`Failed to list connections: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async terminateConnection(connectionId) {
        try {
            await this.authenticate();
            await axios.delete(`${this.guacamoleUrl}/api/session/data/mysql/connections/${connectionId}`, {
                headers: {
                    'Guacamole-Token': this.authToken,
                },
            });
        }
        catch (error) {
            throw new Error(`Failed to terminate connection: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getSessionLogs(connectionId) {
        try {
            await this.authenticate();
            const response = await axios.get(`${this.guacamoleUrl}/api/session/data/mysql/history/connections/${connectionId}`, {
                headers: {
                    'Guacamole-Token': this.authToken,
                },
            });
            const logs = [];
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
        }
        catch (error) {
            throw new Error(`Failed to get session logs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async authenticate() {
        if (this.authToken)
            return;
        try {
            const username = process.env.GUACAMOLE_USERNAME || 'admin';
            const password = process.env.GUACAMOLE_PASSWORD || '';
            const response = await axios.post(`${this.guacamoleUrl}/api/tokens`, new URLSearchParams({
                username,
                password,
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });
            this.authToken = response.data.authToken;
        }
        catch (error) {
            throw new Error(`Failed to authenticate: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    buildParameters(protocol, host, port, credentials) {
        const params = {
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
        }
        else if (protocol === 'SSH') {
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
