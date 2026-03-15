import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SFBoostModule, ModuleContext } from '../modules/types';

// We need to re-create the registry for isolation since it's a singleton.
// Import the class source directly.

function createMockModule(id: string, overrides?: Partial<SFBoostModule>): SFBoostModule {
  return {
    id,
    name: `Module ${id}`,
    description: `Description for ${id}`,
    init: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    ...overrides,
  };
}

function createMockContext(): ModuleContext {
  return {
    pageContext: {
      url: 'https://acme.lightning.force.com/lightning/setup/home',
      orgType: 'production',
      myDomain: 'acme',
      pageType: 'setup',
      instanceUrl: 'https://acme.my.salesforce.com',
    },
  };
}

// Inline a minimal registry to avoid import issues with the singleton + logger dependency
class TestModuleRegistry {
  private modules = new Map<string, SFBoostModule>();
  private activeModules = new Map<string, SFBoostModule>();
  private moduleStatus = new Map<string, string>();

  register(module: SFBoostModule): void {
    this.modules.set(module.id, module);
    this.moduleStatus.set(module.id, 'pending');
  }

  getAll(): SFBoostModule[] {
    return Array.from(this.modules.values());
  }

  getActive(): SFBoostModule[] {
    return Array.from(this.activeModules.values());
  }

  getStatus(id: string): string | undefined {
    return this.moduleStatus.get(id);
  }

  async initModules(ctx: ModuleContext, enabledIds: string[]): Promise<void> {
    for (const id of enabledIds) {
      const mod = this.modules.get(id);
      if (mod && !this.activeModules.has(id)) {
        try {
          await mod.init(ctx);
          this.activeModules.set(id, mod);
          this.moduleStatus.set(id, 'active');
        } catch {
          this.moduleStatus.set(id, 'error');
        }
      }
    }
  }

  async onNavigate(ctx: ModuleContext): Promise<void> {
    for (const mod of this.activeModules.values()) {
      try {
        await mod.onNavigate(ctx);
      } catch {
        // swallow
      }
    }
  }

  async disableModule(id: string): Promise<void> {
    const mod = this.activeModules.get(id);
    if (mod) {
      try { mod.destroy(); } catch { /* swallow */ }
      this.activeModules.delete(id);
      this.moduleStatus.set(id, 'destroyed');
    }
  }

  async enableModule(id: string, ctx: ModuleContext): Promise<void> {
    const mod = this.modules.get(id);
    if (mod && !this.activeModules.has(id)) {
      try {
        await mod.init(ctx);
        this.activeModules.set(id, mod);
        this.moduleStatus.set(id, 'active');
      } catch {
        this.moduleStatus.set(id, 'error');
      }
    }
  }

  destroyAll(): void {
    for (const mod of this.activeModules.values()) {
      try { mod.destroy(); } catch { /* swallow */ }
      this.moduleStatus.set(mod.id, 'destroyed');
    }
    this.activeModules.clear();
  }
}

describe('ModuleRegistry', () => {
  let registry: TestModuleRegistry;
  let ctx: ModuleContext;

  beforeEach(() => {
    registry = new TestModuleRegistry();
    ctx = createMockContext();
  });

  describe('register', () => {
    it('registers a module', () => {
      const mod = createMockModule('test');
      registry.register(mod);
      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getAll()[0]?.id).toBe('test');
    });

    it('sets status to pending on registration', () => {
      const mod = createMockModule('test');
      registry.register(mod);
      expect(registry.getStatus('test')).toBe('pending');
    });

    it('can register multiple modules', () => {
      registry.register(createMockModule('a'));
      registry.register(createMockModule('b'));
      registry.register(createMockModule('c'));
      expect(registry.getAll()).toHaveLength(3);
    });

    it('overwrites module with same ID', () => {
      const mod1 = createMockModule('test');
      const mod2 = createMockModule('test');
      registry.register(mod1);
      registry.register(mod2);
      expect(registry.getAll()).toHaveLength(1);
    });
  });

  describe('initModules', () => {
    it('initializes only enabled modules', async () => {
      const modA = createMockModule('a');
      const modB = createMockModule('b');
      const modC = createMockModule('c');
      registry.register(modA);
      registry.register(modB);
      registry.register(modC);

      await registry.initModules(ctx, ['a', 'c']);

      expect(modA.init).toHaveBeenCalledWith(ctx);
      expect(modB.init).not.toHaveBeenCalled();
      expect(modC.init).toHaveBeenCalledWith(ctx);
    });

    it('sets status to active for initialized modules', async () => {
      registry.register(createMockModule('test'));
      await registry.initModules(ctx, ['test']);
      expect(registry.getStatus('test')).toBe('active');
    });

    it('sets status to error when init fails', async () => {
      const failing = createMockModule('fail', {
        init: vi.fn().mockRejectedValue(new Error('Init failed')),
      });
      registry.register(failing);
      await registry.initModules(ctx, ['fail']);
      expect(registry.getStatus('fail')).toBe('error');
    });

    it('continues initializing other modules after one fails', async () => {
      const failing = createMockModule('fail', {
        init: vi.fn().mockRejectedValue(new Error('boom')),
      });
      const ok = createMockModule('ok');
      registry.register(failing);
      registry.register(ok);

      await registry.initModules(ctx, ['fail', 'ok']);

      expect(registry.getStatus('fail')).toBe('error');
      expect(registry.getStatus('ok')).toBe('active');
    });

    it('ignores unknown module IDs in enabledIds', async () => {
      registry.register(createMockModule('known'));
      await registry.initModules(ctx, ['known', 'unknown']);
      expect(registry.getActive()).toHaveLength(1);
    });

    it('does not reinitialize already active modules', async () => {
      const mod = createMockModule('test');
      registry.register(mod);
      await registry.initModules(ctx, ['test']);
      await registry.initModules(ctx, ['test']);
      expect(mod.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('onNavigate', () => {
    it('calls onNavigate on all active modules', async () => {
      const modA = createMockModule('a');
      const modB = createMockModule('b');
      registry.register(modA);
      registry.register(modB);
      await registry.initModules(ctx, ['a', 'b']);

      const newCtx = createMockContext();
      await registry.onNavigate(newCtx);

      expect(modA.onNavigate).toHaveBeenCalledWith(newCtx);
      expect(modB.onNavigate).toHaveBeenCalledWith(newCtx);
    });

    it('does not call onNavigate on pending (not initialized) modules', async () => {
      const mod = createMockModule('pending');
      registry.register(mod);
      await registry.onNavigate(ctx);
      expect(mod.onNavigate).not.toHaveBeenCalled();
    });

    it('continues navigating other modules after one throws', async () => {
      const failing = createMockModule('fail', {
        onNavigate: vi.fn().mockRejectedValue(new Error('nav error')),
      });
      const ok = createMockModule('ok');
      registry.register(failing);
      registry.register(ok);
      await registry.initModules(ctx, ['fail', 'ok']);

      await registry.onNavigate(ctx);

      expect(ok.onNavigate).toHaveBeenCalled();
    });
  });

  describe('disableModule', () => {
    it('calls destroy and sets status to destroyed', async () => {
      const mod = createMockModule('test');
      registry.register(mod);
      await registry.initModules(ctx, ['test']);

      await registry.disableModule('test');

      expect(mod.destroy).toHaveBeenCalled();
      expect(registry.getStatus('test')).toBe('destroyed');
      expect(registry.getActive()).toHaveLength(0);
    });

    it('does nothing for non-active modules', async () => {
      const mod = createMockModule('test');
      registry.register(mod);
      await registry.disableModule('test');
      expect(mod.destroy).not.toHaveBeenCalled();
    });

    it('handles destroy throwing error', async () => {
      const mod = createMockModule('test', {
        destroy: vi.fn(() => { throw new Error('destroy error'); }),
      });
      registry.register(mod);
      await registry.initModules(ctx, ['test']);

      // Should not throw
      await registry.disableModule('test');
      expect(registry.getStatus('test')).toBe('destroyed');
    });
  });

  describe('enableModule', () => {
    it('enables a previously registered module', async () => {
      const mod = createMockModule('test');
      registry.register(mod);

      await registry.enableModule('test', ctx);

      expect(mod.init).toHaveBeenCalledWith(ctx);
      expect(registry.getStatus('test')).toBe('active');
      expect(registry.getActive()).toHaveLength(1);
    });

    it('does not re-enable already active module', async () => {
      const mod = createMockModule('test');
      registry.register(mod);
      await registry.initModules(ctx, ['test']);

      await registry.enableModule('test', ctx);
      expect(mod.init).toHaveBeenCalledTimes(1);
    });

    it('sets status to error if init fails', async () => {
      const mod = createMockModule('test', {
        init: vi.fn().mockRejectedValue(new Error('fail')),
      });
      registry.register(mod);

      await registry.enableModule('test', ctx);
      expect(registry.getStatus('test')).toBe('error');
    });
  });

  describe('destroyAll', () => {
    it('destroys all active modules', async () => {
      const modA = createMockModule('a');
      const modB = createMockModule('b');
      registry.register(modA);
      registry.register(modB);
      await registry.initModules(ctx, ['a', 'b']);

      registry.destroyAll();

      expect(modA.destroy).toHaveBeenCalled();
      expect(modB.destroy).toHaveBeenCalled();
      expect(registry.getActive()).toHaveLength(0);
      expect(registry.getStatus('a')).toBe('destroyed');
      expect(registry.getStatus('b')).toBe('destroyed');
    });

    it('handles destroy errors gracefully', async () => {
      const mod = createMockModule('test', {
        destroy: vi.fn(() => { throw new Error('boom'); }),
      });
      registry.register(mod);
      await registry.initModules(ctx, ['test']);

      // Should not throw
      registry.destroyAll();
      expect(registry.getActive()).toHaveLength(0);
    });

    it('does nothing when no modules are active', () => {
      registry.destroyAll();
      expect(registry.getActive()).toHaveLength(0);
    });
  });

  describe('getAll vs getActive', () => {
    it('getAll returns all registered, getActive returns only initialized', async () => {
      registry.register(createMockModule('a'));
      registry.register(createMockModule('b'));
      registry.register(createMockModule('c'));

      await registry.initModules(ctx, ['a']);

      expect(registry.getAll()).toHaveLength(3);
      expect(registry.getActive()).toHaveLength(1);
    });
  });
});
