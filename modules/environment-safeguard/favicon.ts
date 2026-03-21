import type { EnvironmentAppearance } from './appearance';

const PRIMARY_ICON_ID = 'sfboost-env-favicon';
const SHORTCUT_ICON_ID = 'sfboost-env-favicon-shortcut';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isFaviconLink(node: Node): node is HTMLLinkElement {
  return node instanceof HTMLLinkElement && /\bicon\b/i.test(node.rel);
}

function createInjectedIconLink(id: string, rel: string, href: string): HTMLLinkElement {
  const link = document.createElement('link');
  link.id = id;
  link.rel = rel;
  link.type = 'image/svg+xml';
  link.href = href;
  return link;
}

function removeInjectedIconLinks(): void {
  document.getElementById(PRIMARY_ICON_ID)?.remove();
  document.getElementById(SHORTCUT_ICON_ID)?.remove();
}

export function buildColoredFaviconSvg(backgroundColor: string, label: string): string {
  const title = escapeXml(`SF Boost ${label}`);
  const fill = escapeXml(backgroundColor);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <title>${title}</title>
  <rect x="4" y="4" width="56" height="56" rx="16" fill="${fill}" />
  <path d="M16 18c8-8 24-8 32 0" fill="none" opacity="0.18" stroke="#fff" stroke-linecap="round" stroke-width="4" />
  <g fill="#fff">
    <circle cx="24" cy="35" r="9" />
    <circle cx="34" cy="29" r="11" />
    <circle cx="45" cy="35" r="8" />
    <rect x="18" y="35" width="34" height="11" rx="5.5" />
  </g>
</svg>`.trim();
}

export function buildColoredFaviconDataUrl(appearance: Pick<EnvironmentAppearance, 'backgroundColor' | 'label'>): string {
  return `data:image/svg+xml,${encodeURIComponent(
    buildColoredFaviconSvg(appearance.backgroundColor, appearance.label),
  )}`;
}

export class ColoredFaviconController {
  private observer: MutationObserver | null = null;
  private currentHref: string | null = null;
  private isApplying = false;
  private refreshScheduled = false;

  apply(appearance: Pick<EnvironmentAppearance, 'backgroundColor' | 'label'>): void {
    this.currentHref = buildColoredFaviconDataUrl(appearance);
    this.ensureInjectedIconLinks();
    this.ensureObserver();
  }

  clear(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.currentHref = null;
    this.refreshScheduled = false;
    removeInjectedIconLinks();
  }

  private ensureObserver(): void {
    if (this.observer || !document.head) return;

    this.observer = new MutationObserver((mutations) => {
      if (this.isApplying || !this.currentHref) return;

      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          return isFaviconLink(mutation.target);
        }

        return [...mutation.addedNodes, ...mutation.removedNodes].some(isFaviconLink);
      });

      if (!hasRelevantMutation || this.refreshScheduled) return;

      this.refreshScheduled = true;
      requestAnimationFrame(() => {
        this.refreshScheduled = false;
        if (this.currentHref) {
          this.ensureInjectedIconLinks();
        }
      });
    });

    this.observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'rel'],
    });
  }

  private ensureInjectedIconLinks(): void {
    if (!this.currentHref) return;

    const container = document.head ?? document.documentElement;
    if (!container) return;

    this.isApplying = true;
    try {
      removeInjectedIconLinks();
      container.appendChild(createInjectedIconLink(PRIMARY_ICON_ID, 'icon', this.currentHref));
      container.appendChild(createInjectedIconLink(SHORTCUT_ICON_ID, 'shortcut icon', this.currentHref));
    } finally {
      this.isApplying = false;
    }
  }
}
