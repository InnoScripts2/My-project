/**
 * Fake OBD Device
 * Mock OBD adapter for development and testing
 */

import { EventEmitter } from 'events';
import type { ObdDriver, ObdMode, PidIdentifier, DtcCode } from '../drivers/ObdDriverInterface.js';
import { getScenarioData, type ScenarioType, type ScenarioData } from './Scenarios.js';

export interface FakeObdDeviceConfig {
  scenario?: ScenarioType;
  responseDelay?: number;
}

export class FakeObdDevice extends EventEmitter implements ObdDriver {
  private connected = false;
  private initSequenceComplete = false;
  private config: Required<FakeObdDeviceConfig>;
  private scenarioData: ScenarioData;

  constructor(config: FakeObdDeviceConfig = {}) {
    super();
    this.config = {
      scenario: config.scenario || 'Idle',
      responseDelay: config.responseDelay ?? 75,
    };
    this.scenarioData = getScenarioData(this.config.scenario);
  }

  /**
   * Connect (simulated)
   */
  async connect(): Promise<void> {
    await this.delay(200);
    this.connected = true;
    this.initSequenceComplete = false;
    this.emit('connected');
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.initSequenceComplete = false;
    this.emit('disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send command (simulated)
   */
  async sendCommand(command: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Fake OBD device not connected');
    }

    await this.delay(this.config.responseDelay);

    const cmd = command.trim().toUpperCase();

    // AT commands (initialization)
    if (cmd.startsWith('AT')) {
      if (cmd === 'ATZ') {
        this.initSequenceComplete = true;
        return 'ELM327 v1.5';
      }
      return 'OK';
    }

    // Mode 01 PIDs
    if (cmd.startsWith('01')) {
      const pid = cmd.substring(2);
      return this.handleMode01(pid);
    }

    // Mode 03 - Request DTCs
    if (cmd === '03') {
      return this.handleMode03();
    }

    // Mode 04 - Clear DTCs
    if (cmd === '04') {
      return '44';
    }

    // Mode 09 - Vehicle info
    if (cmd.startsWith('09')) {
      return this.handleMode09(cmd.substring(2));
    }

    // UDS commands (0x22 ReadDataByIdentifier)
    if (cmd.startsWith('22')) {
      return this.handleUdsRead(cmd.substring(2));
    }

    return 'NO DATA';
  }

  /**
   * Request PID (simplified interface)
   */
  async requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string> {
    const response = await this.sendCommand(`${mode}${pid}`);
    
    // Parse response to extract data bytes
    const match = response.match(/[0-9A-F]{2}\s*[0-9A-F]{2,}/i);
    return match ? match[0].replace(/\s/g, '') : '';
  }

  /**
   * Request DTCs
   */
  async requestDtc(): Promise<DtcCode[]> {
    await this.delay(this.config.responseDelay);
    
    return this.scenarioData.dtcCodes.map(code => ({
      code,
      type: this.getDtcType(code),
    }));
  }

  /**
   * Clear DTCs
   */
  async clearDtc(): Promise<void> {
    await this.delay(this.config.responseDelay);
    // In fake mode, just succeed
  }

  /**
   * Set scenario on the fly
   */
  setScenario(scenario: ScenarioType): void {
    this.config.scenario = scenario;
    this.scenarioData = getScenarioData(scenario);
    this.emit('scenario_changed', scenario);
  }

  /**
   * Handle Mode 01 PIDs
   */
  private handleMode01(pid: string): string {
    const data = this.scenarioData;
    
    switch (pid) {
      case '0C': // RPM
        return `41 0C ${this.encodeValue(data.rpm * 4, 2)}`;
      case '0D': // Speed
        return `41 0D ${this.encodeValue(data.speed, 1)}`;
      case '05': // Coolant temp
        return `41 05 ${this.encodeValue(data.coolantTemp + 40, 1)}`;
      case '0F': // Intake air temp
        return `41 0F ${this.encodeValue(data.intakeAirTemp + 40, 1)}`;
      case '11': // Throttle position
        return `41 11 ${this.encodeValue(Math.floor(data.throttlePosition * 255 / 100), 1)}`;
      case '04': // Engine load
        return `41 04 ${this.encodeValue(Math.floor(data.engineLoad * 255 / 100), 1)}`;
      case '2F': // Fuel level
        return `41 2F ${this.encodeValue(Math.floor(data.fuelLevel * 255 / 100), 1)}`;
      case '10': // MAF
        return `41 10 ${this.encodeValue(data.maf * 100, 2)}`;
      default:
        return 'NO DATA';
    }
  }

  /**
   * Handle Mode 03 (DTCs)
   */
  private handleMode03(): string {
    const dtcs = this.scenarioData.dtcCodes;
    
    if (dtcs.length === 0) {
      return '43 00';
    }

    const hexCodes = dtcs.map(code => {
      // Convert P0420 to hex 0420, P0171 to 0171, etc.
      const typeChar = code[0];
      const typeCode = { 'P': 0, 'C': 1, 'B': 2, 'U': 3 }[typeChar] || 0;
      const dtcNum = parseInt(code.substring(1), 16);
      const fullCode = (typeCode << 14) | dtcNum;
      return fullCode.toString(16).toUpperCase().padStart(4, '0');
    });

    return `43 ${hexCodes.join(' ')}`;
  }

  /**
   * Handle Mode 09 (Vehicle info)
   */
  private handleMode09(pid: string): string {
    if (pid === '02' && this.scenarioData.vin) {
      // VIN
      const vinHex = Buffer.from(this.scenarioData.vin).toString('hex').toUpperCase();
      return `49 02 ${vinHex}`;
    }
    return 'NO DATA';
  }

  /**
   * Handle UDS Read Data by Identifier
   */
  private handleUdsRead(did: string): string {
    const didNum = parseInt(did, 16);
    const data = this.scenarioData;

    // ISO 14229 DIDs
    if (didNum === 0xF190 && data.vin) {
      // VIN
      const vinHex = Buffer.from(data.vin).toString('hex').toUpperCase();
      return `62 F190 ${vinHex}`;
    }

    if (didNum === 0xF18C && data.ecuName) {
      // ECU Serial/Name
      const nameHex = Buffer.from(data.ecuName).toString('hex').toUpperCase();
      return `62 F18C ${nameHex}`;
    }

    // Toyota hybrid DIDs
    if (didNum === 0x0100 && data.hvVoltage !== undefined) {
      // HV Battery Voltage
      const voltage = Math.floor(data.hvVoltage * 10);
      return `62 0100 ${this.encodeValue(voltage, 2)}`;
    }

    if (didNum === 0x0101 && data.hvCurrent !== undefined) {
      // HV Battery Current
      const current = Math.floor((data.hvCurrent + 100) * 10);
      return `62 0101 ${this.encodeValue(current, 2)}`;
    }

    if (didNum === 0x0102 && data.hvSoc !== undefined) {
      // SOC
      return `62 0102 ${this.encodeValue(data.hvSoc, 1)}`;
    }

    if (didNum === 0x0103 && data.hvBatteryTemp !== undefined) {
      // Battery temp
      return `62 0103 ${this.encodeValue(data.hvBatteryTemp + 40, 1)}`;
    }

    if (didNum === 0x0110 && data.inverterTemp !== undefined) {
      // Inverter temp
      return `62 0110 ${this.encodeValue(data.inverterTemp + 40, 1)}`;
    }

    if (didNum === 0x0120 && data.mg1Speed !== undefined) {
      // MG1 Speed
      return `62 0120 ${this.encodeValue(data.mg1Speed, 2)}`;
    }

    if (didNum === 0x0121 && data.mg2Speed !== undefined) {
      // MG2 Speed
      return `62 0121 ${this.encodeValue(data.mg2Speed, 2)}`;
    }

    return '7F 22 31'; // Negative response: request out of range
  }

  /**
   * Encode value to hex string
   */
  private encodeValue(value: number, bytes: number): string {
    const val = Math.max(0, Math.floor(value));
    return val.toString(16).toUpperCase().padStart(bytes * 2, '0').match(/.{2}/g)?.join(' ') || '00';
  }

  /**
   * Get DTC type from code
   */
  private getDtcType(code: string): 'Powertrain' | 'Chassis' | 'Body' | 'Network' {
    const firstChar = code[0];
    switch (firstChar) {
      case 'P': return 'Powertrain';
      case 'C': return 'Chassis';
      case 'B': return 'Body';
      case 'U': return 'Network';
      default: return 'Powertrain';
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
