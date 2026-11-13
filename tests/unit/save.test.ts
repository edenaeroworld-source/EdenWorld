import { describe, expect, it } from 'vitest';
import { defaultAftersBody } from '../../src/afters/AftersState';
import { WORLD } from '../../src/core/Config';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { ProgressSystem } from '../../src/systems/ProgressSystem';
import {
  type KeyValueStorage,
  SAVE_VERSION,
  SaveSystem,
  createNewSave,
  emptyProgress,
  sanitizeGraphicsSettings,
  sanitizeSave,
} from '../../src/systems/SaveSystem';

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const NOW = 1_800_000_000_000;

describe('sanitizeSave', () => {
  it('recusa conteúdo que não é um salvamento', () => {
    expect(sanitizeSave(null)).toBeNull();
    expect(sanitizeSave([])).toBeNull();
    expect(sanitizeSave('texto')).toBeNull();
    expect(sanitizeSave({})).toBeNull();
    expect(sanitizeSave({ version: 'x' })).toBeNull();
    expect(sanitizeSave({ version: 0 })).toBeNull();
    expect(sanitizeSave({ version: SAVE_VERSION + 1 })).toBeNull();
  });

  it('completa um salvamento mínimo com os padrões', () => {
    const save = sanitizeSave({ version: 1 }, NOW);
    expect(save).toEqual(createNewSave(NOW));
  });

  it('um salvamento novo passa pela validação sem alterações', () => {
    const fresh = createNewSave(NOW);
    expect(sanitizeSave(JSON.parse(JSON.stringify(fresh)), NOW)).toEqual(fresh);
  });

  it('limpa valores fora do esperado', () => {
    const save = sanitizeSave(
      {
        version: 1,
        profile: { name: '  <script>Ana</script>  ', appearance: { outfit: 'armadura', height: -3 }, created: 'sim' },
        player: { x: 12.5, y: Number.NaN, z: -30, heading: 100 },
        world: { hours: 99, day: -4 },
        progress: {
          crystals: ['cristal-1', 'cristal-1', 42, '', 'com espaço', '<img>', 'a'.repeat(200), 'ok.id:2'],
          entries: 'nada',
          wishes: 3.9,
          photos: -5,
          distance: Number.POSITIVE_INFINITY,
          sphereMode: 400,
        },
        settings: {
          graphics: { quality: 'cinematica' },
          audio: { master: 4, music: -1, muted: 'não' },
          gameplay: { timePace: 'turbo', hints: false },
        },
      },
      NOW,
    );
    expect(save).not.toBeNull();
    if (!save) return;
    expect(save.profile.name).toBe('scriptAna/script');
    expect(save.profile.appearance.outfit).toBe(DEFAULT_APPEARANCE.outfit);
    expect(save.profile.appearance.height).toBe(0.9);
    expect(save.profile.created).toBe(false);
    expect(save.player).toEqual({ x: 12.5, y: 0, z: -30, heading: Math.PI * 2 });
    expect(save.world).toEqual({ hours: 23.999, day: 1 });
    expect(save.progress.crystals).toEqual(['cristal-1', 'ok.id:2']);
    expect(save.progress.entries).toEqual([]);
    expect(save.progress.wishes).toBe(3);
    expect(save.progress.photos).toBe(0);
    expect(save.progress.distance).toBe(0);
    expect(save.progress.sphereMode).toBe(16);
    expect(save.settings.graphics).toBeNull();
    expect(save.settings.audio.master).toBe(1);
    expect(save.settings.audio.music).toBe(0);
    expect(save.settings.audio.muted).toBe(false);
    expect(save.settings.gameplay.timePace).toBe('normal');
    expect(save.settings.gameplay.hints).toBe(false);
  });

  it('descarta posição do jogador incompleta', () => {
    expect(sanitizeSave({ version: 1, player: { x: 4 } })?.player).toBeNull();
    expect(sanitizeSave({ version: 1, player: 'aqui' })?.player).toBeNull();
  });

  it('descarta posição fora do limite jogável (o jogador recomeça na praça)', () => {
    const edge = WORLD.boundaryRadius;
    expect(sanitizeSave({ version: 1, player: { x: edge - 1, y: 0, z: 0, heading: 0 } })?.player).toEqual({ x: edge - 1, y: 0, z: 0, heading: 0 });
    expect(sanitizeSave({ version: 1, player: { x: edge + 1, y: 0, z: 0, heading: 0 } })?.player).toBeNull();
    expect(sanitizeSave({ version: 1, player: { x: 1e12, y: -1e9, z: -1e12, heading: 0 } })?.player).toBeNull();
    expect(sanitizeSave({ version: 1, player: { x: Number.POSITIVE_INFINITY, y: 0, z: 0, heading: 0 } })?.player).toBeNull();
  });

  it('ignora chaves perigosas ou desconhecidas', () => {
    const raw = JSON.parse('{"version":1,"__proto__":{"admin":true},"extra":{"x":1},"profile":{"constructor":{"prototype":{"hack":1}}}}') as unknown;
    const save = sanitizeSave(raw, NOW);
    expect(save).not.toBeNull();
    expect(Object.keys(save ?? {})).toEqual(Object.keys(createNewSave(NOW)));
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
    expect(({} as Record<string, unknown>).hack).toBeUndefined();
  });

  it('valida as preferências gráficas', () => {
    expect(sanitizeGraphicsSettings(null)).toBeNull();
    expect(sanitizeGraphicsSettings({ quality: 'media', resolutionScale: 0.1, shadows: 'x' })).toEqual({
      quality: 'media',
      shadows: true,
      waterReflections: true,
      resolutionScale: 0.5,
      dynamicResolution: true,
      fpsTarget: 60,
      showFps: false,
    });
    // Ultra é um nível de verdade desde a revisão de multiplataforma.
    expect(sanitizeGraphicsSettings({ quality: 'ultra' })?.quality).toBe('ultra');
    expect(sanitizeGraphicsSettings({ quality: 'ultra' })?.dynamicResolution).toBe(false);
    // Meta de quadros: só 30 ou 60; qualquer outra coisa cai no padrão.
    expect(sanitizeGraphicsSettings({ quality: 'baixa', fpsTarget: 30 })?.fpsTarget).toBe(30);
    expect(sanitizeGraphicsSettings({ quality: 'baixa', fpsTarget: 144 })?.fpsTarget).toBe(60);
  });
});

describe('SaveSystem', () => {
  it('grava e recarrega o mesmo conteúdo', () => {
    const storage = new MemoryStorage();
    const system = new SaveSystem(storage, 'teste');
    const first = system.load(NOW);
    expect(first.status).toBe('novo');
    first.data.profile.name = 'Aurora';
    first.data.profile.created = true;
    first.data.player = { x: 12.5, y: 2, z: -30, heading: 1.2 };
    first.data.progress.crystals.push('cristal-praca-1');
    expect(system.save(first.data, NOW + 5000)).toBe(true);
    const second = new SaveSystem(storage, 'teste').load(NOW + 9000);
    expect(second.status).toBe('carregado');
    expect(second.data).toEqual(first.data);
    expect(second.data.updatedAt).toBe(NOW + 5000);
  });

  it('salvamento corrompido vira um jogo novo, com cópia de segurança', () => {
    const storage = new MemoryStorage();
    storage.items.set('teste', '{"version":1,"profile":');
    const system = new SaveSystem(storage, 'teste');
    const result = system.load(NOW);
    expect(result.status).toBe('corrompido');
    expect(result.data).toEqual(createNewSave(NOW));
    expect(storage.items.get(system.backupKey)).toBe('{"version":1,"profile":');
  });

  it('salvamento de uma versão futura não é sobrescrito sem cópia', () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ version: SAVE_VERSION + 3, profile: { name: 'Do futuro' } });
    storage.items.set('teste', future);
    const system = new SaveSystem(storage, 'teste');
    expect(system.load(NOW).status).toBe('corrompido');
    expect(storage.items.get(system.backupKey)).toBe(future);
  });

  it('funciona só em memória quando o armazenamento não existe', () => {
    const system = new SaveSystem(null);
    expect(system.persistent).toBe(false);
    const result = system.load(NOW);
    expect(result.status).toBe('indisponivel');
    expect(system.save(result.data, NOW)).toBe(false);
    expect(system.lastWriteOk).toBe(false);
    expect(() => system.clear()).not.toThrow();
  });

  it('sinaliza falha de gravação sem lançar erro', () => {
    const storage = new MemoryStorage();
    const system = new SaveSystem(storage, 'teste');
    const data = createNewSave(NOW);
    storage.failWrites = true;
    expect(system.save(data, NOW)).toBe(false);
    expect(system.lastWriteOk).toBe(false);
    storage.failWrites = false;
    expect(system.save(data, NOW)).toBe(true);
    expect(system.lastWriteOk).toBe(true);
  });

  it('clear apaga o salvamento', () => {
    const storage = new MemoryStorage();
    const system = new SaveSystem(storage, 'teste');
    system.save(createNewSave(NOW), NOW);
    system.clear();
    expect(system.load(NOW).status).toBe('novo');
  });

  it('parse recusa textos vazios, enormes ou inválidos', () => {
    expect(SaveSystem.parse('')).toBeNull();
    expect(SaveSystem.parse('não é json')).toBeNull();
    expect(SaveSystem.parse(' '.repeat(2_000_001))).toBeNull();
    const data = createNewSave(NOW);
    expect(SaveSystem.parse(SaveSystem.serialize(data), NOW)).toEqual(data);
  });
});

describe('ProgressSystem', () => {
  it('registra cada descoberta uma única vez', () => {
    const progress = new ProgressSystem(emptyProgress());
    expect(progress.collectCrystal('a')).toBe(true);
    expect(progress.collectCrystal('a')).toBe(false);
    expect(progress.readEntry('placa-1')).toBe(true);
    expect(progress.readEntry('placa-1')).toBe(false);
    expect(progress.visitArea('praca')).toBe(true);
    expect(progress.unlockPortal('praca')).toBe(true);
    expect(progress.unlockPortal('praca')).toBe(false);
    expect([progress.crystalCount, progress.entryCount, progress.areaCount, progress.portalCount]).toEqual([1, 1, 1, 1]);
    expect(progress.hasCrystal('a')).toBe(true);
    expect(progress.hasPortal('mirante')).toBe(false);
  });

  it('calcula o percentual de exploração', () => {
    const progress = new ProgressSystem(emptyProgress());
    expect(progress.completion).toBe(0);
    progress.totals = { crystals: 4, entries: 2, areas: 0, portals: 2 };
    progress.collectCrystal('a');
    progress.collectCrystal('b');
    progress.readEntry('x');
    progress.readEntry('y');
    // Cristais 50%, registros 100%, portais 0% → média 50%.
    expect(progress.completion).toBe(50);
    progress.unlockPortal('p1');
    progress.unlockPortal('p2');
    progress.unlockPortal('p3');
    expect(progress.completion).toBe(83);
  });

  it('exporta e reimporta os mesmos dados', () => {
    const progress = new ProgressSystem(emptyProgress());
    progress.collectCrystal('c1');
    progress.visitArea('lago');
    progress.wishes = 2;
    progress.distance = 123.456;
    progress.playSeconds = 61.7;
    const data = progress.toData();
    expect(data.distance).toBe(123.5);
    expect(data.playSeconds).toBe(62);
    const again = new ProgressSystem(data);
    expect(again.toData()).toEqual(data);
    // O salvamento exportado não compartilha referências com o sistema.
    data.crystals.push('intruso');
    expect(progress.hasCrystal('intruso')).toBe(false);
  });

  it('descarta registros que não existem no mundo desta versão', () => {
    const progress = new ProgressSystem({
      ...emptyProgress(),
      crystals: ['cristal-praca', 'cristal-de-outra-versao'],
      entries: ['placa-1', 'placa-2', 'placa-apagada'],
      areas: ['praca', 'lua'],
      portals: ['praca', 'portal-inventado'],
    });
    progress.totals = { crystals: 1, entries: 2, areas: 1, portals: 1 };
    progress.retainKnown({ crystals: ['cristal-praca'], entries: new Set(['placa-1', 'placa-2']), areas: ['praca'], portals: ['praca', 'mirante'] });
    expect([progress.crystalCount, progress.entryCount, progress.areaCount, progress.portalCount]).toEqual([1, 2, 1, 1]);
    expect(progress.hasCrystal('cristal-de-outra-versao')).toBe(false);
    expect(progress.hasPortal('portal-inventado')).toBe(false);
    expect(progress.hasPortal('mirante')).toBe(false);
    expect(progress.completion).toBe(100);
    expect(progress.toData().areas).toEqual(['praca']);
  });
});

describe('salvamento v2 (EdenOS, Afters e bandeiras)', () => {
  it('cria um salvamento novo já na versão 2, com os campos novos vazios', () => {
    const save = createNewSave(NOW);
    expect(save.version).toBe(2);
    expect(SAVE_VERSION).toBe(2);
    expect(save.flags).toEqual([]);
    expect(save.social).toEqual({ contacts: [], citizens: [], photos: [], readThreads: [] });
    expect(save.afters.unlocked).toBe(false);
    expect(save.afters.productId).toBeNull();
  });

  it('aceita um salvamento v1 antigo e completa os campos novos', () => {
    const v1 = {
      version: 1,
      createdAt: NOW,
      profile: { name: 'Antigo', created: true, appearance: DEFAULT_APPEARANCE },
      player: { x: 2, y: 0, z: 3, heading: 1 },
      world: { hours: 10, day: 4 },
      progress: { ...emptyProgress(), crystals: ['cristal-01'] },
    };
    const save = sanitizeSave(v1, NOW);
    expect(save).not.toBeNull();
    expect(save?.profile.name).toBe('Antigo');
    expect(save?.progress.crystals).toEqual(['cristal-01']);
    // Campos novos aparecem com o padrão, sem perder o progresso antigo.
    expect(save?.flags).toEqual([]);
    expect(save?.social.contacts).toEqual([]);
    expect(save?.afters.unlocked).toBe(false);
  });

  it('preserva bandeiras, contatos e Afters de um salvamento v2', () => {
    const save = sanitizeSave(
      {
        version: 2,
        flags: ['conheceu-haru', 'sabe-bluebloom'],
        social: { contacts: ['haru'], citizens: ['Nina Aurora'], photos: [], readThreads: ['haru'] },
        afters: { unlocked: true, productId: 'aftercurve', color: '#c9a2ff', intensity: 0.4, particles: true, sound: false },
      },
      NOW,
    );
    expect(save?.flags).toEqual(['conheceu-haru', 'sabe-bluebloom']);
    expect(save?.social.contacts).toEqual(['haru']);
    expect(save?.social.citizens).toEqual(['Nina Aurora']);
    expect(save?.afters.productId).toBe('aftercurve');
    expect(save?.afters.intensity).toBeCloseTo(0.4, 5);
  });

  it('guarda a silhueta dos habitantes mudados por roteiro', () => {
    const save = sanitizeSave(
      {
        version: 2,
        afters: {
          unlocked: true,
          productId: 'afterbust',
          body: { bust: 2, curve: 0, bustActive: true, curveActive: false, duration: 1.6, preset: null },
          citizens: {
            'cidadao:12': { bust: 1.5, curve: 0.5, bustActive: true, curveActive: true, duration: 2, preset: null },
            'divino:luma': { bust: 1.25, curve: 1.5, bustActive: true, curveActive: true, duration: 1.8, preset: null },
            '': { bust: 1 },
          },
        },
      },
      NOW,
    );
    expect(Object.keys(save?.afters.citizens ?? {}).sort()).toEqual(['cidadao:12', 'divino:luma']);
    expect(save?.afters.citizens['cidadao:12'].bust).toBeCloseTo(1.5, 5);
    expect(save?.afters.citizens['divino:luma'].curveActive).toBe(true);
  });

  it('salvamento sem a lista de habitantes carrega com a cidade padrão', () => {
    const save = sanitizeSave({ version: 2, afters: { unlocked: true, productId: 'afterbust' } }, NOW);
    expect(save?.afters.citizens).toEqual({});
  });

  it('limpa bandeiras e dados sociais inválidos sem descartar o salvamento', () => {
    const save = sanitizeSave(
      {
        version: 2,
        flags: ['ok-1', '', 'x'.repeat(200), 42, { a: 1 }],
        social: { contacts: ['haru', 'intruso'], citizens: 'não é lista', photos: 'nada', readThreads: [] },
        afters: 'quebrado',
      },
      NOW,
    );
    expect(save).not.toBeNull();
    expect(save?.flags).toContain('ok-1');
    expect(save?.flags.every((flag) => flag.length > 0 && flag.length <= 64)).toBe(true);
    expect(save?.social.contacts).toEqual(['haru']);
    expect(save?.social.citizens).toEqual([]);
    expect(save?.social.photos).toEqual([]);
    expect(save?.afters.unlocked).toBe(false);
  });

  it('grava e relê o salvamento completo pelo SaveSystem', () => {
    const storage = new MemoryStorage();
    const system = new SaveSystem(storage);
    const save = createNewSave(NOW);
    save.flags = ['conheceu-luma'];
    save.social = { contacts: ['luma'], citizens: ['Gael Brisa'], photos: [], readThreads: [] };
    save.afters = { unlocked: true, productId: 'afterlove', color: '#ff6f91', intensity: 0.8, particles: false, sound: true, body: defaultAftersBody(), citizens: {} };
    expect(system.save(save)).toBe(true);
    const loaded = system.load();
    expect(loaded.status).toBe('carregado');
    expect(loaded.data.flags).toEqual(['conheceu-luma']);
    expect(loaded.data.social.contacts).toEqual(['luma']);
    expect(loaded.data.afters.productId).toBe('afterlove');
  });
});
