import { registry } from '../registry';
import type { SFBoostModule, ModuleContext } from '../types';

let observer: MutationObserver | null = null;
let currentCtx: ModuleContext | null = null;

function checkAndRemoveNavBar(): boolean {
    // Find the exact layout container that holds the DevOps Center panel
    const navBars = document.querySelectorAll('lightning-layout.navBar-container');
    let removed = false;

    navBars.forEach((navBar) => {
        // Check if it contains the devops elements to avoid removing unrelated navbars
        if (navBar.querySelector('devops_center-org-info, devops_center-panel-button')) {
            navBar.remove();
            removed = true;
        }
    });

    return removed;
}

function startObserver(): void {
    // Initial check
    if (checkAndRemoveNavBar()) {
        // If we removed it immediately, we might not need the observer, 
        // but in SPAs, it might come back on navigation. We'll keep observing but only on body.
    }

    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver(() => {
        checkAndRemoveNavBar();
    });

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
    description: 'Removes the useless DevOps Center navigation bar at the top of Setup pages.',
    defaultEnabled: true,

    async init(ctx: ModuleContext) {
        currentCtx = ctx;
        if (window.top !== window.self) return;
        startObserver();
    },

    async onNavigate(ctx: ModuleContext) {
        currentCtx = ctx;
        if (window.top !== window.self) return;

        // Attempt removal again instantly on navigation, as DOM might rebuild
        checkAndRemoveNavBar();
    },

    destroy() {
        stopObserver();
        currentCtx = null;
    },
};

registry.register(hideDevopsBar);
