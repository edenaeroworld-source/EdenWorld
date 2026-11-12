import { describe, expect, it } from 'vitest';
import {
  QUALITY_LEVELS,
  QualitySystem,
  defaultGraphicsSettings,
  isQualityLevel,
  suggestQualityLevel,
} from '../../src/systems/QualitySystem';

describe('QualitySystem', () => {
  it('sugere o nível inicial pelo dispositivo', () => {
    const base = { isTouchDevice: false, hardwareConcurrency: 8, deviceMemory: 8, gpuName: 'ANGLE (NVIDIA GeForce)' };
    expect(suggestQualityLevel(base)).toBe('alta');
    expect(suggestQualityLevel({ ...base, hardwareConcurrency: 4 })).toBe('media');
    expect(suggestQualityLevel({ ...base, hardwareConcurrency: 2 })).toBe('baixa');
    expect(suggestQualityLevel({ ...base, isTouchDevice: true })).toBe('media');
    expect(suggestQualityLevel({ ...base, isTouchDevice: true, deviceMemory: 3 })).toBe('baixa');
    expect(suggestQualityLevel({ ...base, gpuName: 'Google SwiftShader' })).toBe('baixa');
  });

  it('valida níveis de qualidade', () => {
    expect(isQualityLevel('media')).toBe(true);
    expect(isQualityLevel('ultra')).toBe(false);
    expect(isQualityLevel(2)).toBe(false);
  });

  it('os presets ficam mais exigentes a cada nível', () => {
    const [low, mid, high] = QUALITY_LEVELS.map((level) => QualitySystem.preset(level));
    expect(low.resolutionScale).toBeLessThanOrEqual(mid.resolutionScale);
    expect(mid.resolutionScale).toBeLessThanOrEqual(high.resolutionScale);
    expect(low.shadows).toBe(false);
    expect(high.shadows).toBe(true);
    expect(low.waterReflections).toBe(false);
    expect(high.waterReflections).toBe(true);
  });

  it('combina o preset com as preferências do jogador', () => {
    const quality = new QualitySystem(defaultGraphicsSettings('alta'));
    expect(quality.current.shadows).toBe(true);
    const seen: boolean[] = [];
    const off = quality.onChange((profile) => seen.push(profile.shadows));
    quality.update({ shadows: false });
    expect(quality.current.shadows).toBe(false);
    quality.update({ resolutionScale: 0.1 });
    expect(quality.graphics.resolutionScale).toBe(0.5);
    off();
    quality.update({ shadows: true });
    expect(seen).toEqual([false, false]);
    // Baixa nunca liga sombras, mesmo com a preferência ativa.
    quality.update({ quality: 'baixa' });
    expect(quality.current.shadows).toBe(false);
  });

  it('a resolução dinâmica reduz com FPS baixo e recupera com folga', () => {
    const quality = new QualitySystem({ ...defaultGraphicsSettings('media'), dynamicResolution: true });
    const initial = quality.current.resolutionScale;
    for (let i = 0; i < 200; i++) quality.monitor(0.05, 18);
    expect(quality.dynamicResolutionScale).toBeLessThan(1);
    expect(quality.current.resolutionScale).toBeLessThan(initial);
    const reduced = quality.dynamicResolutionScale;
    for (let i = 0; i < 4000; i++) quality.monitor(0.05, 60);
    expect(quality.dynamicResolutionScale).toBeGreaterThan(reduced);
    expect(quality.dynamicResolutionScale).toBe(1);
    // Nunca abaixo do piso, por pior que seja o FPS.
    for (let i = 0; i < 5000; i++) quality.monitor(0.05, 5);
    expect(quality.dynamicResolutionScale).toBeGreaterThanOrEqual(0.55);
  });

  it('desligar a resolução dinâmica restaura a escala', () => {
    const quality = new QualitySystem({ ...defaultGraphicsSettings('media'), dynamicResolution: true });
    for (let i = 0; i < 200; i++) quality.monitor(0.05, 18);
    quality.update({ dynamicResolution: false });
    expect(quality.dynamicResolutionScale).toBe(1);
    for (let i = 0; i < 200; i++) quality.monitor(0.05, 18);
    expect(quality.dynamicResolutionScale).toBe(1);
  });
});
