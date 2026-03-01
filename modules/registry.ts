import type { SFBoostModule, ModuleContext } from './types';

class ModuleRegistry {
  private modules = new Map<string, SFBoostModule>();
  private activeModules = new Map<string, SFBoostModule>();

  register(module: SFBoostModule): void {
    this.modules.set(module.id, module);
  }

  getAll(): SFBoostModule[] {
    return Array.from(this.modules.values());
  }

  getActive(): SFBoostModule[] {
    return Array.from(this.activeModules.values());
  }

  async initModules(ctx: ModuleContext, enabledIds: string[]): Promise<void> {
    for (const id of enabledIds) {
      const mod = this.modules.get(id);
      if (mod && !this.activeModules.has(id)) {
        try {
          await mod.init(ctx);
          this.activeModules.set(id, mod);
        } catch (e) {
          console.error(`[SF Boost] Failed to init module "${id}":`, e);
        }
      }
    }
  }

  async onNavigate(ctx: ModuleContext): Promise<void> {
    for (const mod of this.activeModules.values()) {
      try {
        await mod.onNavigate(ctx);
      } catch (e) {
        console.error(`[SF Boost] Module "${mod.id}" onNavigate error:`, e);
      }
    }
  }

  async disableModule(id: string): Promise<void> {
    const mod = this.activeModules.get(id);
    if (mod) {
      mod.destroy();
      this.activeModules.delete(id);
    }
  }

  async enableModule(id: string, ctx: ModuleContext): Promise<void> {
    const mod = this.modules.get(id);
    if (mod && !this.activeModules.has(id)) {
      await mod.init(ctx);
      this.activeModules.set(id, mod);
    }
  }

  destroyAll(): void {
    for (const mod of this.activeModules.values()) {
      mod.destroy();
    }
    this.activeModules.clear();
  }
}

export const registry = new ModuleRegistry();
