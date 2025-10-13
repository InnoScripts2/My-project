/**
 * Scenario Definitions for FakeObdDevice
 * Predefined test scenarios for development and testing
 */

export type ScenarioType = 'Idle' | 'Driving' | 'ColdStart' | 'DtcPresent' | 'HybridToyota' | 'Lexus';

export interface ScenarioData {
  rpm: number;
  speed: number;
  coolantTemp: number;
  intakeAirTemp: number;
  throttlePosition: number;
  engineLoad: number;
  fuelLevel: number;
  maf: number;
  dtcCodes: string[];
  vin?: string;
  ecuName?: string;
  // Hybrid-specific data
  hvVoltage?: number;
  hvCurrent?: number;
  hvSoc?: number;
  hvBatteryTemp?: number;
  inverterTemp?: number;
  mg1Speed?: number;
  mg2Speed?: number;
  mg1Torque?: number;
  mg2Torque?: number;
  hybridStatus?: 'EV' | 'Hybrid' | 'Charging' | 'Error';
}

export const SCENARIO_IDLE: ScenarioData = {
  rpm: 800,
  speed: 0,
  coolantTemp: 85,
  intakeAirTemp: 30,
  throttlePosition: 0,
  engineLoad: 15,
  fuelLevel: 65,
  maf: 5,
  dtcCodes: [],
};

export const SCENARIO_DRIVING: ScenarioData = {
  rpm: 2500,
  speed: 60,
  coolantTemp: 90,
  intakeAirTemp: 35,
  throttlePosition: 45,
  engineLoad: 55,
  fuelLevel: 65,
  maf: 25,
  dtcCodes: [],
};

export const SCENARIO_COLD_START: ScenarioData = {
  rpm: 1200,
  speed: 0,
  coolantTemp: 20,
  intakeAirTemp: 15,
  throttlePosition: 10,
  engineLoad: 80,
  fuelLevel: 65,
  maf: 15,
  dtcCodes: [],
};

export const SCENARIO_DTC_PRESENT: ScenarioData = {
  rpm: 800,
  speed: 0,
  coolantTemp: 85,
  intakeAirTemp: 30,
  throttlePosition: 0,
  engineLoad: 15,
  fuelLevel: 65,
  maf: 5,
  dtcCodes: ['P0420', 'P0171'],
};

export const SCENARIO_HYBRID_TOYOTA: ScenarioData = {
  rpm: 2500,
  speed: 60,
  coolantTemp: 90,
  intakeAirTemp: 35,
  throttlePosition: 45,
  engineLoad: 55,
  fuelLevel: 65,
  maf: 25,
  dtcCodes: [],
  hvVoltage: 245,
  hvCurrent: 15,
  hvSoc: 75,
  hvBatteryTemp: 35,
  inverterTemp: 55,
  mg1Speed: 3500,
  mg2Speed: 2200,
  mg1Torque: 20,
  mg2Torque: 80,
  hybridStatus: 'Hybrid',
};

export const SCENARIO_LEXUS: ScenarioData = {
  rpm: 1800,
  speed: 80,
  coolantTemp: 88,
  intakeAirTemp: 32,
  throttlePosition: 35,
  engineLoad: 45,
  fuelLevel: 70,
  maf: 22,
  dtcCodes: [],
  vin: 'JTXXXXXXXXXX12345',
  ecuName: 'Lexus Premium ECU',
};

export function getScenarioData(scenario: ScenarioType): ScenarioData {
  switch (scenario) {
    case 'Idle':
      return { ...SCENARIO_IDLE };
    case 'Driving':
      return { ...SCENARIO_DRIVING };
    case 'ColdStart':
      return { ...SCENARIO_COLD_START };
    case 'DtcPresent':
      return { ...SCENARIO_DTC_PRESENT };
    case 'HybridToyota':
      return { ...SCENARIO_HYBRID_TOYOTA };
    case 'Lexus':
      return { ...SCENARIO_LEXUS };
    default:
      return { ...SCENARIO_IDLE };
  }
}
