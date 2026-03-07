import type { SFBoostModule, ModuleContext } from './types';
import { logger } from '../lib/logger';

export type ModuleStatus = 'pending' | 'active' | 'error' | 'destroyed';

class ModuleRegistry {
  private modules = new Map<string, SFBoostModule>();
  private activeModules = new Map<string, SFBoostModule>();
  private moduleStatus = new Map<string, ModuleStatus>();

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

  getStatus(id: string): ModuleStatus | undefined {
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
        } catch (e) {
          this.moduleStatus.set(id, 'error');
          logger.error(`Failed to init module "${id}": ${e}`, id);
        }
      }
    }
  }

  async onNavigate(ctx: ModuleContext): Promise<void> {
    for (const mod of this.activeModules.values()) {
      try {
        await mod.onNavigate(ctx);
      } catch (e) {
        logger.error(`Module "${mod.id}" onNavigate error: ${e}`, mod.id);
      }
    }
  }

  async disableModule(id: string): Promise<void> {
    const mod = this.activeModules.get(id);
    if (mod) {
      try { mod.destroy(); } catch (e) {
        logger.error(`Module "${id}" destroy error: ${e}`, id);
      }
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
      } catch (e) {
        this.moduleStatus.set(id, 'error');
        logger.error(`Failed to enable module "${id}": ${e}`, id);
      }
    }
  }

  destroyAll(): void {
    for (const mod of this.activeModules.values()) {
      try { mod.destroy(); } catch (e) {
        logger.error(`Module "${mod.id}" destroy error: ${e}`, mod.id);
      }
      this.moduleStatus.set(mod.id, 'destroyed');
    }
    this.activeModules.clear();
  }
}

export const registry = new ModuleRegistry();
