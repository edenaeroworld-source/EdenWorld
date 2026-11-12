import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { type GameSystem, SystemRegistry } from '../../src/core/GameSystem';

interface Events {
  ping: number;
  text: string;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EventBus', () => {
  it('entrega eventos aos inscritos e permite cancelar', () => {
    const bus = new EventBus<Events>();
    const got: number[] = [];
    const off = bus.on('ping', (n) => got.push(n));
    bus.emit('ping', 1);
    bus.emit('text', 'ignorado');
    off();
    bus.emit('ping', 2);
    expect(got).toEqual([1]);
  });

  it('once dispara uma única vez', () => {
    const bus = new EventBus<Events>();
    let count = 0;
    bus.once('ping', () => count++);
    bus.emit('ping', 1);
    bus.emit('ping', 2);
    expect(count).toBe(1);
  });

  it('um handler com erro não impede os demais', () => {
    const bus = new EventBus<Events>();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reached = false;
    bus.on('ping', () => {
      throw new Error('falhou');
    });
    bus.on('ping', () => (reached = true));
    bus.emit('ping', 1);
    expect(reached).toBe(true);
    expect(error).toHaveBeenCalledOnce();
  });

  it('handlers podem se remover durante a emissão', () => {
    const bus = new EventBus<Events>();
    const calls: string[] = [];
    const offA = bus.on('ping', () => {
      calls.push('a');
      offA();
    });
    bus.on('ping', () => calls.push('b'));
    bus.emit('ping', 1);
    bus.emit('ping', 2);
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});

describe('SystemRegistry', () => {
  it('atualiza na ordem de registro e libera na ordem inversa', () => {
    const log: string[] = [];
    const make = (id: string): GameSystem => ({
      id,
      update: () => log.push(`update:${id}`),
      dispose: () => log.push(`dispose:${id}`),
    });
    const registry = new SystemRegistry();
    registry.register(make('a'));
    registry.register(make('b'));
    registry.update(0.016, 1);
    registry.dispose();
    expect(log).toEqual(['update:a', 'update:b', 'dispose:b', 'dispose:a']);
    expect(registry.list()).toHaveLength(0);
  });

  it('recusa ids duplicados e permite remover', () => {
    const registry = new SystemRegistry();
    let disposed = false;
    registry.register({ id: 'x', dispose: () => (disposed = true) });
    expect(() => registry.register({ id: 'x' })).toThrow(/já registrado/);
    expect(registry.has('x')).toBe(true);
    registry.unregister('x');
    expect(disposed).toBe(true);
    expect(registry.get('x')).toBeUndefined();
  });

  it('aceita sistemas sem update nem dispose', () => {
    const registry = new SystemRegistry();
    registry.register({ id: 'somente-dados' });
    expect(() => registry.update(0.016, 0)).not.toThrow();
    expect(() => registry.dispose()).not.toThrow();
  });
});
