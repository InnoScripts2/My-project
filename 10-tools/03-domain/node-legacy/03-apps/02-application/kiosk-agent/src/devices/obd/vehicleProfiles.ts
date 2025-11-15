/**
 * Vehicle-specific OBD-II profiles for adaptive protocol selection
 * 
 * This module provides configuration profiles for different vehicle manufacturers,
 * with special focus on Toyota and Lexus requirements.
 */

export type ObdProtocol = 
  | 'AUTO'           // ATSP0 - Auto detection
  | 'J1850_PWM'      // ATSP1 - SAE J1850 PWM (41.6 kbps)
  | 'J1850_VPW'      // ATSP2 - SAE J1850 VPW (10.4 kbps)
  | 'ISO_9141_2'     // ATSP3 - ISO 9141-2 (5 baud init, 10.4 kbps)
  | 'KWP_5BAUD'      // ATSP4 - ISO 14230-4 KWP (5 baud init, 10.4 kbps)
  | 'KWP_FAST'       // ATSP5 - ISO 14230-4 KWP (fast init, 10.4 kbps)
  | 'CAN_11B_500'    // ATSP6 - ISO 15765-4 CAN (11 bit ID, 500 kbps)
  | 'CAN_29B_500'    // ATSP7 - ISO 15765-4 CAN (29 bit ID, 500 kbps)
  | 'CAN_11B_250'    // ATSP8 - ISO 15765-4 CAN (11 bit ID, 250 kbps)
  | 'CAN_29B_250';   // ATSP9 - ISO 15765-4 CAN (29 bit ID, 250 kbps)

export interface VehicleProtocolConfig {
  /** Protocol identifier for ELM327 */
  protocol: ObdProtocol;
  /** ELM327 AT command to set protocol */
  elmCommand: string;
  /** Recommended timeout in milliseconds */
  timeoutMs: number;
  /** Additional initialization commands */
  initCommands?: string[];
  /** CAN headers (if applicable) */
  headers?: {
    request: string;
    response: string;
  };
  /** Description of the protocol */
  description: string;
}

export interface VehicleProfile {
  /** Vehicle manufacturer */
  make: string;
  /** Model name (optional, for specific overrides) */
  model?: string;
  /** Model year range */
  yearRange?: {
    min?: number;
    max?: number;
  };
  /** Primary protocol to try first */
  primaryProtocol: VehicleProtocolConfig;
  /** Fallback protocols to try if primary fails */
  fallbackProtocols?: VehicleProtocolConfig[];
  /** Vehicle-specific quirks and workarounds */
  quirks?: {
    /** Requires longer init delay */
    slowInit?: boolean;
    /** Needs specific header configuration */
    customHeaders?: boolean;
    /** Requires extended timeout for certain commands */
    extendedTimeout?: boolean;
    /** Known issues or limitations */
    notes?: string;
  };
}

/**
 * Protocol configurations for ELM327
 */
const PROTOCOL_CONFIGS: Record<ObdProtocol, VehicleProtocolConfig> = {
  AUTO: {
    protocol: 'AUTO',
    elmCommand: 'ATSP0',
    timeoutMs: 5000,
    description: 'Automatic protocol detection'
  },
  J1850_PWM: {
    protocol: 'J1850_PWM',
    elmCommand: 'ATSP1',
    timeoutMs: 2000,
    description: 'SAE J1850 PWM (Ford, 41.6 kbps)'
  },
  J1850_VPW: {
    protocol: 'J1850_VPW',
    elmCommand: 'ATSP2',
    timeoutMs: 2000,
    description: 'SAE J1850 VPW (GM, 10.4 kbps)'
  },
  ISO_9141_2: {
    protocol: 'ISO_9141_2',
    elmCommand: 'ATSP3',
    timeoutMs: 5000,
    initCommands: ['ATST64'], // 4 second timeout for slow init
    description: 'ISO 9141-2 (Asian vehicles pre-2008, 10.4 kbps)'
  },
  KWP_5BAUD: {
    protocol: 'KWP_5BAUD',
    elmCommand: 'ATSP4',
    timeoutMs: 5000,
    initCommands: ['ATST64'],
    description: 'ISO 14230-4 KWP2000 5 baud init (European vehicles)'
  },
  KWP_FAST: {
    protocol: 'KWP_FAST',
    elmCommand: 'ATSP5',
    timeoutMs: 3000,
    description: 'ISO 14230-4 KWP2000 fast init (European vehicles)'
  },
  CAN_11B_500: {
    protocol: 'CAN_11B_500',
    elmCommand: 'ATSP6',
    timeoutMs: 2000,
    headers: {
      request: '7DF',  // Broadcast request
      response: '7E8'  // ECU response (engine)
    },
    description: 'ISO 15765-4 CAN 11-bit 500 kbps (Most modern vehicles)'
  },
  CAN_29B_500: {
    protocol: 'CAN_29B_500',
    elmCommand: 'ATSP7',
    timeoutMs: 2000,
    headers: {
      request: '18DB33F1',  // Extended CAN ID
      response: '18DAF110'
    },
    description: 'ISO 15765-4 CAN 29-bit 500 kbps (Some modern vehicles)'
  },
  CAN_11B_250: {
    protocol: 'CAN_11B_250',
    elmCommand: 'ATSP8',
    timeoutMs: 2000,
    description: 'ISO 15765-4 CAN 11-bit 250 kbps (Rare)'
  },
  CAN_29B_250: {
    protocol: 'CAN_29B_250',
    elmCommand: 'ATSP9',
    timeoutMs: 2000,
    description: 'ISO 15765-4 CAN 29-bit 250 kbps (Rare)'
  }
};

/**
 * Toyota/Lexus specific profiles
 */
const TOYOTA_PROFILES: VehicleProfile[] = [
  {
    make: 'Toyota',
    yearRange: { min: 2008 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.CAN_29B_500,
      PROTOCOL_CONFIGS.ISO_9141_2
    ],
    quirks: {
      customHeaders: true,
      notes: 'Modern Toyota uses CAN 11-bit 500 kbps. Some hybrids may use extended CAN.'
    }
  },
  {
    make: 'Toyota',
    yearRange: { max: 2007 },
    primaryProtocol: PROTOCOL_CONFIGS.ISO_9141_2,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.KWP_5BAUD,
      PROTOCOL_CONFIGS.CAN_11B_500
    ],
    quirks: {
      slowInit: true,
      extendedTimeout: true,
      notes: 'Legacy Toyota uses ISO 9141-2 with slow 5 baud init. Requires patience.'
    }
  },
  {
    make: 'Lexus',
    yearRange: { min: 2008 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.CAN_29B_500,
      PROTOCOL_CONFIGS.ISO_9141_2
    ],
    quirks: {
      customHeaders: true,
      notes: 'Lexus follows same protocol as Toyota for same year range.'
    }
  },
  {
    make: 'Lexus',
    yearRange: { max: 2007 },
    primaryProtocol: PROTOCOL_CONFIGS.ISO_9141_2,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.KWP_5BAUD,
      PROTOCOL_CONFIGS.CAN_11B_500
    ],
    quirks: {
      slowInit: true,
      extendedTimeout: true,
      notes: 'Legacy Lexus uses ISO 9141-2 with slow init.'
    }
  }
];

/**
 * Generic profiles for other manufacturers
 */
const GENERIC_PROFILES: VehicleProfile[] = [
  {
    make: 'Generic',
    model: 'Modern (2008+)',
    yearRange: { min: 2008 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.CAN_29B_500,
      PROTOCOL_CONFIGS.ISO_9141_2,
      PROTOCOL_CONFIGS.KWP_FAST
    ]
  },
  {
    make: 'Generic',
    model: 'Legacy (pre-2008)',
    yearRange: { max: 2007 },
    primaryProtocol: PROTOCOL_CONFIGS.ISO_9141_2,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.KWP_5BAUD,
      PROTOCOL_CONFIGS.KWP_FAST,
      PROTOCOL_CONFIGS.J1850_VPW,
      PROTOCOL_CONFIGS.J1850_PWM
    ]
  },
  {
    make: 'Ford',
    yearRange: { min: 1996 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.J1850_PWM,
      PROTOCOL_CONFIGS.ISO_9141_2
    ]
  },
  {
    make: 'GM',
    yearRange: { min: 1996 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.J1850_VPW,
      PROTOCOL_CONFIGS.ISO_9141_2
    ]
  },
  {
    make: 'Chrysler',
    yearRange: { min: 1996 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.J1850_VPW,
      PROTOCOL_CONFIGS.ISO_9141_2
    ]
  },
  {
    make: 'Honda',
    yearRange: { min: 2008 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [PROTOCOL_CONFIGS.ISO_9141_2]
  },
  {
    make: 'Nissan',
    yearRange: { min: 2008 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [PROTOCOL_CONFIGS.ISO_9141_2]
  },
  {
    make: 'BMW',
    yearRange: { min: 2001 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.KWP_FAST,
      PROTOCOL_CONFIGS.ISO_9141_2
    ]
  },
  {
    make: 'Mercedes-Benz',
    yearRange: { min: 2001 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.KWP_FAST,
      PROTOCOL_CONFIGS.ISO_9141_2
    ]
  },
  {
    make: 'Volkswagen',
    yearRange: { min: 2004 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.KWP_FAST,
      PROTOCOL_CONFIGS.ISO_9141_2
    ]
  },
  {
    make: 'Audi',
    yearRange: { min: 2004 },
    primaryProtocol: PROTOCOL_CONFIGS.CAN_11B_500,
    fallbackProtocols: [
      PROTOCOL_CONFIGS.KWP_FAST,
      PROTOCOL_CONFIGS.ISO_9141_2
    ]
  }
];

/**
 * All vehicle profiles
 */
const ALL_PROFILES = [...TOYOTA_PROFILES, ...GENERIC_PROFILES];

/**
 * Get vehicle profile by make and optional year
 */
export function getVehicleProfile(
  make: string,
  year?: number
): VehicleProfile {
  const normalizedMake = make.trim().toLowerCase();
  
  // Find matching profiles
  const candidates = ALL_PROFILES.filter(profile => {
    const profileMake = profile.make.toLowerCase();
    if (profileMake !== normalizedMake && profileMake !== 'generic') {
      return false;
    }
    
    // Check year range if specified
    if (year && profile.yearRange) {
      if (profile.yearRange.min && year < profile.yearRange.min) return false;
      if (profile.yearRange.max && year > profile.yearRange.max) return false;
    }
    
    return true;
  });
  
  // Prefer exact make match over generic
  const exactMatch = candidates.find(p => p.make.toLowerCase() === normalizedMake);
  if (exactMatch) return exactMatch;
  
  // Fall back to generic profile based on year
  if (year) {
    const genericModern = candidates.find(
      p => p.make === 'Generic' && p.model === 'Modern (2008+)'
    );
    const genericLegacy = candidates.find(
      p => p.make === 'Generic' && p.model === 'Legacy (pre-2008)'
    );
    
    if (year >= 2008 && genericModern) return genericModern;
    if (year < 2008 && genericLegacy) return genericLegacy;
  }
  
  // Ultimate fallback: generic modern
  return candidates.find(p => p.make === 'Generic' && p.model === 'Modern (2008+)') 
    || candidates[0]
    || {
      make: 'Unknown',
      primaryProtocol: PROTOCOL_CONFIGS.AUTO,
      fallbackProtocols: Object.values(PROTOCOL_CONFIGS).filter(p => p.protocol !== 'AUTO')
    };
}

/**
 * Get all protocols to try for a vehicle in priority order
 */
export function getProtocolSequence(
  make: string,
  year?: number
): VehicleProtocolConfig[] {
  const profile = getVehicleProfile(make, year);
  const sequence = [profile.primaryProtocol];
  
  if (profile.fallbackProtocols) {
    sequence.push(...profile.fallbackProtocols);
  }
  
  return sequence;
}

/**
 * Get recommended timeout for a vehicle
 */
export function getRecommendedTimeout(
  make: string,
  year?: number
): number {
  const profile = getVehicleProfile(make, year);
  let timeout = profile.primaryProtocol.timeoutMs;
  
  if (profile.quirks?.extendedTimeout) {
    timeout = Math.max(timeout, 5000);
  }
  
  if (profile.quirks?.slowInit) {
    timeout = Math.max(timeout, 6000);
  }
  
  return timeout;
}

/**
 * Check if vehicle requires special handling
 */
export function requiresSlowInit(make: string, year?: number): boolean {
  const profile = getVehicleProfile(make, year);
  return profile.quirks?.slowInit ?? false;
}

/**
 * Get initialization commands for a vehicle
 */
export function getInitCommands(
  make: string,
  year?: number
): string[] {
  const profile = getVehicleProfile(make, year);
  return profile.primaryProtocol.initCommands || [];
}

/**
 * Export all protocol configs for external use
 */
export { PROTOCOL_CONFIGS };
