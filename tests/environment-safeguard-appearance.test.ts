import { describe, expect, it } from 'vitest';
import { tokens } from '../lib/design-tokens';
import {
  getTitlePrefix,
  resolveEnvironmentAppearance,
} from '../modules/environment-safeguard/appearance';
import {
  buildColoredFaviconDataUrl,
  buildColoredFaviconSvg,
} from '../modules/environment-safeguard/favicon';

describe('environment-safeguard appearance', () => {
  it('uses sandbox name as the default badge label', () => {
    expect(resolveEnvironmentAppearance('sandbox', {}, 'devhub')).toEqual({
      backgroundColor: tokens.color.envSandbox,
      textColor: tokens.color.textOnPrimary,
      label: 'DEVHUB',
    });
  });

  it('respects custom badge colors when they are valid', () => {
    expect(resolveEnvironmentAppearance('production', {
      badgeColor: '#123456',
      badgeTextColor: 'rgb(255, 255, 255)',
      badgeLabel: 'LIVE',
    })).toEqual({
      backgroundColor: '#123456',
      textColor: 'rgb(255, 255, 255)',
      label: 'LIVE',
    });
  });

  it('falls back to default colors when stored css colors are invalid', () => {
    expect(resolveEnvironmentAppearance('developer', {
      badgeColor: 'not-a-color',
      badgeTextColor: 'also-not-a-color',
    })).toEqual({
      backgroundColor: tokens.color.envDeveloper,
      textColor: tokens.color.textOnPrimary,
      label: 'DEV',
    });
  });

  it('builds title prefixes per org type', () => {
    expect(getTitlePrefix('production')).toBe('[PROD]');
    expect(getTitlePrefix('sandbox', 'uat')).toBe('[SBX: uat]');
    expect(getTitlePrefix('code-builder')).toBe('[CB]');
  });
});

describe('environment-safeguard favicon', () => {
  it('renders an svg with the requested color and accessible title', () => {
    const svg = buildColoredFaviconSvg('#16a34a', 'SANDBOX');
    expect(svg).toContain('fill="#16a34a"');
    expect(svg).toContain('<title>SF Boost SANDBOX</title>');
  });

  it('encodes the svg as a data url', () => {
    const url = buildColoredFaviconDataUrl({
      backgroundColor: '#dc2626',
      label: 'PRODUCTION',
    });

    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(url.replace('data:image/svg+xml,', ''))).toContain('SF Boost PRODUCTION');
  });
});
