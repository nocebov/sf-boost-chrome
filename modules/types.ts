import type { OrgType, PageType } from '../lib/salesforce-urls';

export interface SFPageContext {
  url: string;
  orgType: OrgType;
  myDomain: string;
  sandboxName?: string;
  pageType: PageType;
  objectApiName?: string;
  recordId?: string;
  instanceUrl: string;
}

export interface ModuleContext {
  pageContext: SFPageContext;
}

export interface SFBoostModule {
  id: string;
  name: string;
  description: string;
  init(ctx: ModuleContext): Promise<void>;
  onNavigate(ctx: ModuleContext): Promise<void>;
  destroy(): void;
}
