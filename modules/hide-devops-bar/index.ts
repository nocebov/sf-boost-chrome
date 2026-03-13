import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';

let observer: MutationObserver | null = null;
const TARGET_ATTR = 'data-sfboost-hide-devops-target';
const STYLE_ID = 'sfboost-hide-devops-style';

const DEVOPS_SELECTORS = [
    'devops_center-org-info',
    'devops_center-panel-button',
    'devops_center-app-container',
];
const DEVOPS_CHILD_QUERY = DEVOPS_SELECTORS.join(', ');

function ensureHideStyle(): void {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${TARGET_ATTR}="true"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
}

function markDevopsBarTargets(root: ParentNode = document): void {
    const scope = root instanceof Document || root instanceof Element ? root : document;

    // Mark navBar containers that hold DevOps components
    scope.querySelectorAll<HTMLElement>('lightning-layout.navBar-container').forEach((navBar) => {
        if (navBar.querySelector(DEVOPS_CHILD_QUERY)) {
            navBar.setAttribute(TARGET_ATTR, 'true');
        }
    });

    // Also mark DevOps elements directly if they are top-level or in other containers
    scope.querySelectorAll<HTMLElement>(DEVOPS_CHILD_QUERY).forEach((el) => {
        // Walk up to find the closest meaningful container to hide
        const container = el.closest<HTMLElement>(
            'lightning-layout.navBar-container, [class*="devops"], [class*="DevOps"]'
        );
        if (container) {
            container.setAttribute(TARGET_ATTR, 'true');
        } else {
            el.setAttribute(TARGET_ATTR, 'true');
        }
    });
}

function restoreNavBarTargets(): void {
    document.querySelectorAll<HTMLElement>(`[${TARGET_ATTR}]`).forEach((el) => {
        el.removeAttribute(TARGET_ATTR);
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
                // Also re-check the parent in case the DevOps element was
                // added inside an already-existing container
                if (node.parentElement) {
                    markDevopsBarTargets(node.parentElement);
                }
            }
        }
    });

    // Observe the entire body to catch DevOps bar anywhere in the DOM
    observer.observe(document.body, { childList: true, subtree: true });
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
    description: 'Hides the DevOps Center bottom bar on all pages.',

    async init(ctx: ModuleContext) {
        if (window.top !== window.self) return;
        startObserver();
    },

    async onNavigate(ctx: ModuleContext) {
        if (window.top !== window.self) return;
        // Re-scan on navigation — the bar may re-render in SPA transitions
        markDevopsBarTargets();
    },

    destroy() {
        stopObserver();
        restoreNavBarTargets();
    },
};

registry.register(hideDevopsBar);
