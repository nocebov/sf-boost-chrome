import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';

let observer: MutationObserver | null = null;
let currentCtx: ModuleContext | null = null;
const TARGET_ATTR = 'data-sfboost-hide-devops-target';
const STYLE_ID = 'sfboost-hide-devops-style';

function isSetupLikePage(ctx: ModuleContext): boolean {
    try {
        const pathname = new URL(ctx.pageContext.url).pathname;
        return pathname.startsWith('/lightning/setup/')
            || ctx.pageContext.pageType === 'setup'
            || ctx.pageContext.pageType === 'change-set';
    } catch {
        return ctx.pageContext.pageType === 'setup' || ctx.pageContext.pageType === 'change-set';
    }
}

function ensureHideStyle(): void {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${TARGET_ATTR}="true"] {
        display: none !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
}

function markDevopsBarTargets(root: ParentNode = document): void {
    const scope = root instanceof Document || root instanceof Element ? root : document;
    scope.querySelectorAll<HTMLElement>('lightning-layout.navBar-container').forEach((navBar) => {
        if (navBar.querySelector('devops_center-org-info, devops_center-panel-button')) {
            navBar.setAttribute(TARGET_ATTR, 'true');
        }
    });
}

function restoreNavBarTargets(): void {
    document.querySelectorAll<HTMLElement>(`[${TARGET_ATTR}]`).forEach((navBar) => {
        navBar.removeAttribute(TARGET_ATTR);
    });
    document.getElementById(STYLE_ID)?.remove();
}

function startObserver(): void {
    ensureHideStyle();
    markDevopsBarTargets();

    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
                if (!(node instanceof Element)) continue;
                markDevopsBarTargets(node);
            }
        }
    });

    const root = document.querySelector('.oneContent, .mainContentMark') ?? document.body;
    observer.observe(root, { childList: true, subtree: true });
}

function stopObserver(): void {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

const hideDevopsBar: SFBoostModule = {
    id: 'hide-devops-bar',
    name: 'Hide DevOps Center Bar',
    description: 'Hides the DevOps Center navigation bar on Setup pages.',

    async init(ctx: ModuleContext) {
        currentCtx = ctx;
        if (window.top !== window.self) return;
        if (!isSetupLikePage(ctx)) return;
        startObserver();
    },

    async onNavigate(ctx: ModuleContext) {
        currentCtx = ctx;
        if (window.top !== window.self) return;
        stopObserver();
        restoreNavBarTargets();
        if (!isSetupLikePage(ctx)) return;
        startObserver();
    },

    destroy() {
        stopObserver();
        restoreNavBarTargets();
        currentCtx = null;
    },
};

registry.register(hideDevopsBar);
