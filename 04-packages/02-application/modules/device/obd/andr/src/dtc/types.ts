export interface ObdDtcDefinition {
  /** Fully qualified diagnostic trouble code (e.g. P0420). */
  code: string;
  /** High level system classification (powertrain, chassis, body, network). */
  system: 'powertrain' | 'chassis' | 'body' | 'network';
  /** Human readable summary based on SAE J2012 wording. */
  label: string;
  /** Additional notes or citation references. */
  notes?: string;
}
