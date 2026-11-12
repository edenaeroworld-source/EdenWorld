import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { fovForAspect } from '../../src/camera/ThirdPersonCamera';
import { OfflineEdenConnect } from '../../src/eden-connect/EdenConnect';
import type { Interactable } from '../../src/interactions/Interactable';
import { InteractionSystem } from '../../src/interactions/InteractionSystem';
import { MAP_EXTENT, worldToMap } from '../../src/interface/MapRenderer';
import { FUTURE_EVENTS, FUTURE_FEATURES, getFeature } from '../../src/shared/FutureFeatures';
import { LocalSocial } from '../../src/social/SocialSystem';

const item = (id: string, x: number, z: number, patch: Partial<Interactable> = {}): Interactable => ({
  id,
  name: id,
  action: 'Usar',
  position: new Vector3(x, 0, z),
  range: 3,
  enabled: true,
  payload: { type: 'esfera' },
  ...patch,
});

describe('InteractionSystem', () => {
  it('escolhe o objeto ao alcance e avisa quando o alvo muda', () => {
    const near = item('perto', 0, 2);
    const far = item('longe', 0, 20);
    const system = new InteractionSystem([near, far]);
    const changes: (string | null)[] = [];
    system.onTargetChange = (target) => changes.push(target?.id ?? null);
    system.update(0, 0, 0, 0, 0);
    expect(system.current).toBe(near);
    system.update(0, 0, 0, 0, 0.1);
    system.update(0, 0, 10, 0, 0.2);
    expect(system.current).toBeNull();
    expect(changes).toEqual(['perto', null]);
  });

  it('prefere o que está à frente do jogador', () => {
    const front = item('frente', 0, 2.5);
    const back = item('tras', 0, -2);
    const system = new InteractionSystem([back, front]);
    system.update(0, 0, 0, 0, 0);
    expect(system.current).toBe(front);
    const turned = new InteractionSystem([back, front]);
    turned.update(0, 0, 0, Math.PI, 0);
    expect(turned.current).toBe(back);
  });

  it('usa histerese para não alternar entre alvos equivalentes', () => {
    const a = item('a', -1, 1.5);
    const b = item('b', 1, 1.5);
    const system = new InteractionSystem([a, b]);
    system.update(-0.2, 0, 0, 0, 0);
    expect(system.current).toBe(a);
    system.update(0.2, 0, 0, 0, 0.1);
    expect(system.current).toBe(a);
    system.update(1, 0, 0.6, 0, 0.2);
    expect(system.current).toBe(b);
  });

  it('ignora itens desativados, em outro andar ou em espera', () => {
    const disabled = item('off', 0, 1, { enabled: false });
    const upstairs = item('alto', 0, 1, { position: new Vector3(0, 6, 1) });
    const cooling = item('fonte', 0, 1, { cooldown: 5, payload: { type: 'fonte', splashAt: { x: 0, y: 0, z: 1 } } });
    const system = new InteractionSystem([disabled, upstairs, cooling]);
    let used = 0;
    system.register('fonte', () => used++);
    system.update(0, 0, 0, 0, 10);
    expect(system.current).toBe(cooling);
    expect(system.interact(10)).toBe(true);
    expect(used).toBe(1);
    expect(system.current).toBeNull();
    system.update(0, 0, 0, 0, 12);
    expect(system.current).toBeNull();
    system.update(0, 0, 0, 0, 15.1);
    expect(system.current).toBe(cooling);
  });

  it('entrega o conteúdo certo ao handler do tipo', () => {
    const sign = item('placa', 0, 1, { payload: { type: 'placa', title: 'Praça', paragraphs: ['Olá'], entryId: 'praca' } });
    const system = new InteractionSystem([sign]);
    const titles: string[] = [];
    system.register('placa', (_item, payload) => titles.push(payload.title));
    expect(system.interact(0)).toBe(false);
    system.update(0, 0, 0, 0, 0);
    expect(system.interact(0)).toBe(true);
    expect(titles).toEqual(['Praça']);
  });

  it('sem handler ou desativado, nada acontece', () => {
    const system = new InteractionSystem([item('x', 0, 1)]);
    system.update(0, 0, 0, 0, 0);
    expect(system.interact(0)).toBe(false);
    system.register('esfera', () => {});
    system.enabled = false;
    expect(system.interact(0)).toBe(false);
    system.update(0, 0, 0, 0, 1);
    expect(system.current).toBeNull();
  });
});

describe('câmera e mapa', () => {
  it('o campo de visão cresce em telas estreitas e respeita o limite', () => {
    expect(fovForAspect(55, 16 / 9)).toBe(55);
    const portrait = fovForAspect(55, 9 / 16);
    expect(portrait).toBeGreaterThan(55);
    expect(portrait).toBeLessThanOrEqual(86);
    expect(fovForAspect(55, 0.01)).toBe(86);
    expect(fovForAspect(55, 1)).toBeGreaterThan(fovForAspect(55, 1.2));
  });

  it('converte coordenadas do mundo para o mapa com o norte para cima', () => {
    expect(worldToMap(0, 0, 400)).toEqual({ x: 200, y: 200 });
    expect(worldToMap(-MAP_EXTENT, -MAP_EXTENT, 400)).toEqual({ x: 0, y: 0 });
    expect(worldToMap(MAP_EXTENT, MAP_EXTENT, 400)).toEqual({ x: 400, y: 400 });
    // Norte (−Z) fica acima do centro.
    expect(worldToMap(0, -100, 400).y).toBeLessThan(200);
  });
});

describe('recursos futuros e serviços off-line', () => {
  it('nenhum recurso planejado se apresenta como disponível', () => {
    expect(FUTURE_FEATURES.length).toBeGreaterThan(0);
    for (const feature of FUTURE_FEATURES) {
      expect(feature.status).toBe('em-breve');
      expect(feature.summary.length).toBeGreaterThan(10);
      expect(feature.details.length).toBeGreaterThan(0);
    }
    const ids = [...FUTURE_FEATURES.map((f) => f.id), ...FUTURE_EVENTS.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(getFeature('eden-connect')?.name).toBe('Éden Connect');
    expect(getFeature('nao-existe')).toBeUndefined();
  });

  it('Éden Connect off-line nunca inicia sessão', async () => {
    const connect = new OfflineEdenConnect('Viajante');
    expect(connect.available).toBe(false);
    expect(connect.status).toBe('indisponivel');
    await expect(connect.signIn()).resolves.toBe(false);
    connect.setDisplayName('Aurora');
    expect(connect.profile).toEqual({ id: 'local', displayName: 'Aurora', local: true });
    await expect(connect.signOut()).resolves.toBeUndefined();
  });

  it('a camada social local não tem outros jogadores', () => {
    const social = new LocalSocial();
    expect(social.online).toBe(false);
    expect(social.nearby).toHaveLength(0);
    expect(() => social.publish({ x: 0, y: 0, z: 0, heading: 0, motion: 'idle' })).not.toThrow();
    expect(() => social.sendEmote('aceno')).not.toThrow();
  });
});
