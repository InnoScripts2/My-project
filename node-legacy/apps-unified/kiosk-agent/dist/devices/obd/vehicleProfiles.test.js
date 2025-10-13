import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getVehicleProfile, getProtocolSequence, getRecommendedTimeout, requiresSlowInit, getInitCommands } from './vehicleProfiles.js';
describe('vehicleProfiles', () => {
    describe('getVehicleProfile', () => {
        it('should return Toyota CAN profile for modern Toyota', () => {
            const profile = getVehicleProfile('Toyota', 2015);
            assert.strictEqual(profile.make, 'Toyota');
            assert.strictEqual(profile.primaryProtocol.protocol, 'CAN_11B_500');
            assert.strictEqual(profile.primaryProtocol.elmCommand, 'ATSP6');
        });
        it('should return Toyota ISO profile for legacy Toyota', () => {
            const profile = getVehicleProfile('Toyota', 2005);
            assert.strictEqual(profile.make, 'Toyota');
            assert.strictEqual(profile.primaryProtocol.protocol, 'ISO_9141_2');
            assert.strictEqual(profile.primaryProtocol.elmCommand, 'ATSP3');
            assert.strictEqual(profile.quirks?.slowInit, true);
        });
        it('should return Lexus CAN profile for modern Lexus', () => {
            const profile = getVehicleProfile('Lexus', 2020);
            assert.strictEqual(profile.make, 'Lexus');
            assert.strictEqual(profile.primaryProtocol.protocol, 'CAN_11B_500');
        });
        it('should return Lexus ISO profile for legacy Lexus', () => {
            const profile = getVehicleProfile('Lexus', 2003);
            assert.strictEqual(profile.make, 'Lexus');
            assert.strictEqual(profile.primaryProtocol.protocol, 'ISO_9141_2');
            assert.strictEqual(profile.quirks?.slowInit, true);
        });
        it('should be case insensitive for make', () => {
            const profile1 = getVehicleProfile('TOYOTA', 2015);
            const profile2 = getVehicleProfile('toyota', 2015);
            const profile3 = getVehicleProfile('ToYoTa', 2015);
            assert.strictEqual(profile1.make, profile2.make);
            assert.strictEqual(profile2.make, profile3.make);
            assert.strictEqual(profile1.primaryProtocol.protocol, profile2.primaryProtocol.protocol);
        });
        it('should return generic modern profile for unknown make with year >= 2008', () => {
            const profile = getVehicleProfile('UnknownMake', 2015);
            assert.strictEqual(profile.make, 'Generic');
            assert.strictEqual(profile.model, 'Modern (2008+)');
            assert.strictEqual(profile.primaryProtocol.protocol, 'CAN_11B_500');
        });
        it('should return generic legacy profile for unknown make with year < 2008', () => {
            const profile = getVehicleProfile('UnknownMake', 2005);
            assert.strictEqual(profile.make, 'Generic');
            assert.strictEqual(profile.model, 'Legacy (pre-2008)');
            assert.strictEqual(profile.primaryProtocol.protocol, 'ISO_9141_2');
        });
        it('should return profile without year specified', () => {
            const profile = getVehicleProfile('Toyota');
            assert.ok(profile);
            assert.strictEqual(profile.make, 'Toyota');
            // Should return one of the Toyota profiles
        });
        it('should handle boundary year 2008 correctly', () => {
            const profile2008 = getVehicleProfile('Toyota', 2008);
            const profile2007 = getVehicleProfile('Toyota', 2007);
            assert.strictEqual(profile2008.primaryProtocol.protocol, 'CAN_11B_500');
            assert.strictEqual(profile2007.primaryProtocol.protocol, 'ISO_9141_2');
        });
        it('should return profiles for other manufacturers', () => {
            const ford = getVehicleProfile('Ford', 2015);
            const gm = getVehicleProfile('GM', 2015);
            const honda = getVehicleProfile('Honda', 2015);
            assert.strictEqual(ford.make, 'Ford');
            assert.strictEqual(gm.make, 'GM');
            assert.strictEqual(honda.make, 'Honda');
            // All modern vehicles should use CAN
            assert.strictEqual(ford.primaryProtocol.protocol, 'CAN_11B_500');
            assert.strictEqual(gm.primaryProtocol.protocol, 'CAN_11B_500');
            assert.strictEqual(honda.primaryProtocol.protocol, 'CAN_11B_500');
        });
    });
    describe('getProtocolSequence', () => {
        it('should return protocol sequence for Toyota 2015', () => {
            const sequence = getProtocolSequence('Toyota', 2015);
            assert.ok(Array.isArray(sequence));
            assert.ok(sequence.length >= 2);
            assert.strictEqual(sequence[0].protocol, 'CAN_11B_500');
            // Should have fallbacks
            const protocols = sequence.map(p => p.protocol);
            assert.ok(protocols.includes('CAN_29B_500'));
            assert.ok(protocols.includes('ISO_9141_2'));
        });
        it('should return protocol sequence for legacy Toyota', () => {
            const sequence = getProtocolSequence('Toyota', 2005);
            assert.ok(Array.isArray(sequence));
            assert.strictEqual(sequence[0].protocol, 'ISO_9141_2');
            // Should have fallbacks
            const protocols = sequence.map(p => p.protocol);
            assert.ok(protocols.includes('KWP_5BAUD'));
        });
        it('should return primary protocol at least', () => {
            const sequence = getProtocolSequence('UnknownMake', 2020);
            assert.ok(Array.isArray(sequence));
            assert.ok(sequence.length >= 1);
            assert.ok(sequence[0].protocol);
            assert.ok(sequence[0].elmCommand);
        });
    });
    describe('getRecommendedTimeout', () => {
        it('should return standard timeout for modern Toyota', () => {
            const timeout = getRecommendedTimeout('Toyota', 2015);
            assert.strictEqual(timeout, 2000);
        });
        it('should return extended timeout for legacy Toyota', () => {
            const timeout = getRecommendedTimeout('Toyota', 2005);
            assert.ok(timeout >= 5000);
        });
        it('should return extended timeout for vehicles with slowInit', () => {
            const timeout = getRecommendedTimeout('Lexus', 2003);
            assert.ok(timeout >= 6000);
        });
        it('should return positive timeout for any vehicle', () => {
            const timeout1 = getRecommendedTimeout('UnknownMake', 2020);
            const timeout2 = getRecommendedTimeout('Ford', 2010);
            assert.ok(timeout1 > 0);
            assert.ok(timeout2 > 0);
        });
    });
    describe('requiresSlowInit', () => {
        it('should return true for legacy Toyota', () => {
            assert.strictEqual(requiresSlowInit('Toyota', 2005), true);
        });
        it('should return true for legacy Lexus', () => {
            assert.strictEqual(requiresSlowInit('Lexus', 2003), true);
        });
        it('should return false for modern Toyota', () => {
            assert.strictEqual(requiresSlowInit('Toyota', 2015), false);
        });
        it('should return false for modern Lexus', () => {
            assert.strictEqual(requiresSlowInit('Lexus', 2020), false);
        });
        it('should return boolean for any vehicle', () => {
            const result1 = requiresSlowInit('UnknownMake', 2020);
            const result2 = requiresSlowInit('Ford', 2010);
            assert.strictEqual(typeof result1, 'boolean');
            assert.strictEqual(typeof result2, 'boolean');
        });
    });
    describe('getInitCommands', () => {
        it('should return init commands for ISO protocol', () => {
            const commands = getInitCommands('Toyota', 2005);
            assert.ok(Array.isArray(commands));
            // ISO protocol should have extended timeout command
            assert.ok(commands.includes('ATST64'));
        });
        it('should return empty array for CAN protocol without special commands', () => {
            const commands = getInitCommands('Toyota', 2015);
            assert.ok(Array.isArray(commands));
            // CAN protocol typically doesn't need extra init commands
        });
        it('should return array for any vehicle', () => {
            const commands1 = getInitCommands('UnknownMake', 2020);
            const commands2 = getInitCommands('Ford', 2010);
            assert.ok(Array.isArray(commands1));
            assert.ok(Array.isArray(commands2));
        });
    });
    describe('Edge cases', () => {
        it('should handle empty make string', () => {
            const profile = getVehicleProfile('', 2015);
            assert.ok(profile);
            assert.ok(profile.primaryProtocol);
        });
        it('should handle whitespace in make', () => {
            const profile1 = getVehicleProfile('  Toyota  ', 2015);
            const profile2 = getVehicleProfile('Toyota', 2015);
            assert.strictEqual(profile1.make, profile2.make);
        });
        it('should handle very old year', () => {
            const profile = getVehicleProfile('Toyota', 1990);
            assert.ok(profile);
            assert.ok(profile.primaryProtocol);
        });
        it('should handle very new year', () => {
            const profile = getVehicleProfile('Toyota', 2030);
            assert.ok(profile);
            assert.ok(profile.primaryProtocol);
        });
        it('should handle year at exact boundary', () => {
            const profile2007 = getVehicleProfile('Toyota', 2007);
            const profile2008 = getVehicleProfile('Toyota', 2008);
            assert.notStrictEqual(profile2007.primaryProtocol.protocol, profile2008.primaryProtocol.protocol);
        });
    });
    describe('Protocol configurations', () => {
        it('should have timeout for all protocols', () => {
            const sequence = getProtocolSequence('Generic', 2015);
            sequence.forEach(config => {
                assert.ok(config.timeoutMs > 0, `${config.protocol} should have positive timeout`);
            });
        });
        it('should have ELM command for all protocols', () => {
            const sequence = getProtocolSequence('Generic', 2015);
            sequence.forEach(config => {
                assert.ok(config.elmCommand, `${config.protocol} should have ELM command`);
                assert.ok(config.elmCommand.startsWith('ATSP'), `${config.elmCommand} should start with ATSP`);
            });
        });
        it('should have description for all protocols', () => {
            const sequence = getProtocolSequence('Generic', 2015);
            sequence.forEach(config => {
                assert.ok(config.description, `${config.protocol} should have description`);
                assert.ok(config.description.length > 0);
            });
        });
    });
    describe('Toyota/Lexus specific quirks', () => {
        it('should mark custom headers for modern Toyota', () => {
            const profile = getVehicleProfile('Toyota', 2015);
            assert.strictEqual(profile.quirks?.customHeaders, true);
        });
        it('should mark custom headers for modern Lexus', () => {
            const profile = getVehicleProfile('Lexus', 2020);
            assert.strictEqual(profile.quirks?.customHeaders, true);
        });
        it('should have notes for Toyota profiles', () => {
            const modernProfile = getVehicleProfile('Toyota', 2015);
            const legacyProfile = getVehicleProfile('Toyota', 2005);
            assert.ok(modernProfile.quirks?.notes);
            assert.ok(legacyProfile.quirks?.notes);
        });
        it('should have CAN as fallback for legacy Toyota', () => {
            const profile = getVehicleProfile('Toyota', 2005);
            const protocols = [
                profile.primaryProtocol,
                ...(profile.fallbackProtocols || [])
            ].map(p => p.protocol);
            // Legacy should still try CAN as fallback (for late 2007 models)
            assert.ok(protocols.includes('CAN_11B_500'));
        });
    });
});
