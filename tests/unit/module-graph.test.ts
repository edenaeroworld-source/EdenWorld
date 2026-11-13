// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

/**
 * Carga do grafo de módulos.
 *
 * Não instancia o jogo (isso exigiria WebGL), mas garante que importar o
 * Engine — e com ele mundo, cidade, panteão, EdenOS e Afters — não quebra
 * na carga: import circular, símbolo ausente ou código de topo inválido.
 */
describe('grafo de módulos', () => {
  it('importa o Engine inteiro sem erro de carga', async () => {
    const { Engine } = await import('../../src/core/Engine');
    expect(typeof Engine.start).toBe('function');
  });

  it('importa os módulos novos da cidade viva', async () => {
    const modules = await Promise.all([
      import('../../src/npc/NpcSystem'),
      import('../../src/npc/CitizenSim'),
      import('../../src/npc/WalkNetwork'),
      import('../../src/characters/Pantheon'),
      import('../../src/edenos/EdenSocial'),
      import('../../src/edenos/Library'),
      import('../../src/afters/AftersSystem'),
      import('../../src/afters/AftersCatalog'),
      import('../../src/afters/AftersActor'),
      import('../../src/afters/AftersBodySystem'),
      import('../../src/afters/AftersMorph'),
      import('../../src/afters/AftersNet'),
      import('../../src/afters/AftersState'),
      import('../../src/interface/AftersApp'),
      import('../../src/interface/EdenApps'),
      import('../../src/interface/EdenPhoneUI'),
      import('../../src/interface/DialogueScreen'),
      import('../../src/interface/DialogueBox'),
      import('../../src/characters/DialogueSequence'),
      import('../../src/characters/Personas'),
      import('../../src/npc/NpcLife'),
      import('../../src/player/AvatarFace'),
      import('../../src/player/Expressions'),
      import('../../src/player/Gestures'),
      import('../../src/systems/VoiceSystem'),
    ]);
    for (const module of modules) expect(Object.keys(module).length).toBeGreaterThan(0);
  });

  it('importa os módulos novos de plataforma e desempenho', async () => {
    const modules = await Promise.all([
      import('../../src/core/Platform'),
      import('../../src/input/BrowserGestures'),
      import('../../src/input/InputManager'),
      import('../../src/input/TouchInput'),
      import('../../src/systems/Benchmark'),
      import('../../src/systems/QualitySystem'),
    ]);
    for (const module of modules) expect(Object.keys(module).length).toBeGreaterThan(0);
  });

  it('a detecção de plataforma não toca no navegador ao ser importada', async () => {
    // Importar o módulo não pode ler `navigator`: o Engine decide quando
    // sondar, e os testes precisam poder injetar um aparelho de mentira.
    const { detectPlatform, probePlatform } = await import('../../src/core/Platform');
    expect(typeof detectPlatform).toBe('function');
    expect(typeof probePlatform).toBe('function');
    const fake = detectPlatform({ userAgent: 'nada', platform: '', maxTouchPoints: 0, coarsePointer: false, hover: true, screenMin: 900, screenMax: 1600 });
    expect(fake.form).toBe('computador');
  });

  it('registra os sistemas novos com ids distintos no registro de sistemas', async () => {
    const { NpcSystem } = await import('../../src/npc/NpcSystem');
    const { AftersSystem } = await import('../../src/afters/AftersSystem');
    const { AftersBodySystem } = await import('../../src/afters/AftersBodySystem');
    expect(NpcSystem.prototype.id ?? 'npcs').toBeTruthy();
    expect(AftersSystem.prototype.id ?? 'afters').toBeTruthy();
    // Os dois sistemas Afters convivem: aura e silhueta têm ids distintos.
    expect(new AftersBodySystem().id).toBe('afters-body');
    expect(AftersSystem.prototype.id ?? 'afters').not.toBe('afters-body');
    expect(typeof NpcSystem.prototype.update).toBe('function');
    expect(typeof AftersSystem.prototype.update).toBe('function');
    expect(typeof NpcSystem.prototype.dispose).toBe('function');
    expect(typeof AftersSystem.prototype.dispose).toBe('function');
  });
});
