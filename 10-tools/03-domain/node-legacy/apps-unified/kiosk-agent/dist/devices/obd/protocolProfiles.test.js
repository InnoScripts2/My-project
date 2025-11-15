/**
 * Тесты для протокольных профилей OBD-II
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getProtocolProfile, getProtocolCommand, isValidProtocol, PROTOCOL_PROFILES, PROTOCOL_SPECS, } from './protocolProfiles.js';
await describe('protocolProfiles', async () => {
    await describe('getProtocolProfile', async () => {
        await it('возвращает профиль auto по умолчанию', () => {
            const profile = getProtocolProfile();
            assert.strictEqual(profile.name, 'auto');
            assert.deepStrictEqual(profile.protocols, ['auto']);
        });
        await it('возвращает профиль toyota_lexus', () => {
            const profile = getProtocolProfile('toyota_lexus');
            assert.strictEqual(profile.name, 'toyota_lexus');
            assert.ok(profile.protocols.includes('iso15765-4'));
            assert.ok(profile.protocols.includes('iso9141-2'));
        });
        await it('возвращает auto для неизвестного профиля', () => {
            const profile = getProtocolProfile('unknown_brand');
            assert.strictEqual(profile.name, 'auto');
        });
        await it('нечувствителен к регистру', () => {
            const profile = getProtocolProfile('TOYOTA_LEXUS');
            assert.strictEqual(profile.name, 'toyota_lexus');
        });
    });
    await describe('getProtocolCommand', async () => {
        await it('возвращает ATSP0 для auto', () => {
            const cmd = getProtocolCommand('auto');
            assert.strictEqual(cmd, 'ATSP0');
        });
        await it('возвращает ATSP6 для iso15765-4', () => {
            const cmd = getProtocolCommand('iso15765-4');
            assert.strictEqual(cmd, 'ATSP6');
        });
        await it('возвращает ATSP3 для iso9141-2', () => {
            const cmd = getProtocolCommand('iso9141-2');
            assert.strictEqual(cmd, 'ATSP3');
        });
        await it('возвращает ATSP0 для неизвестного протокола', () => {
            const cmd = getProtocolCommand('unknown');
            assert.strictEqual(cmd, 'ATSP0');
        });
    });
    await describe('isValidProtocol', async () => {
        await it('возвращает true для валидных протоколов', () => {
            assert.strictEqual(isValidProtocol('auto'), true);
            assert.strictEqual(isValidProtocol('iso15765-4'), true);
            assert.strictEqual(isValidProtocol('iso9141-2'), true);
        });
        await it('возвращает false для невалидных протоколов', () => {
            assert.strictEqual(isValidProtocol('invalid'), false);
            assert.strictEqual(isValidProtocol(''), false);
        });
    });
    await describe('PROTOCOL_PROFILES', async () => {
        await it('содержит профиль toyota_lexus с приоритетом CAN', () => {
            const profile = PROTOCOL_PROFILES.toyota_lexus;
            assert.ok(profile);
            assert.strictEqual(profile.protocols[0], 'iso15765-4');
        });
        await it('все профили имеют валидные протоколы', () => {
            for (const profile of Object.values(PROTOCOL_PROFILES)) {
                for (const protocol of profile.protocols) {
                    assert.ok(isValidProtocol(protocol), `Invalid protocol ${protocol} in profile ${profile.name}`);
                }
            }
        });
        await it('профиль toyota_lexus содержит initCommands', () => {
            const profile = PROTOCOL_PROFILES.toyota_lexus;
            assert.ok(profile.initCommands);
            assert.ok(profile.initCommands.length > 0);
        });
    });
    await describe('PROTOCOL_SPECS', async () => {
        await it('содержит спецификации для всех протоколов', () => {
            const protocols = ['auto', 'iso15765-4', 'iso9141-2', 'kwp2000-5', 'kwp2000-f'];
            for (const protocol of protocols) {
                const spec = PROTOCOL_SPECS[protocol];
                assert.ok(spec, `Missing spec for ${protocol}`);
                assert.strictEqual(spec.id, protocol);
                assert.ok(spec.command.startsWith('ATSP'));
                assert.ok(spec.name);
                assert.ok(spec.description);
            }
        });
    });
});
