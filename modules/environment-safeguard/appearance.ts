import type { OrgSettings } from '../../lib/storage';
import type { OrgType } from '../../lib/salesforce-urls';
import { tokens } from '../../lib/design-tokens';
import { isValidCssColor } from '../../lib/salesforce-utils';

export interface EnvironmentAppearance {
  backgroundColor: string;
  textColor: string;
  label: string;
}

export const DEFAULT_ENVIRONMENT_APPEARANCE: Record<OrgType, EnvironmentAppearance> = {
  production: {
    backgroundColor: tokens.color.envProduction,
    textColor: tokens.color.textOnPrimary,
    label: 'PRODUCTION',
  },
  sandbox: {
    backgroundColor: tokens.color.envSandbox,
    textColor: tokens.color.textOnPrimary,
    label: 'SANDBOX',
  },
  developer: {
    backgroundColor: tokens.color.envDeveloper,
    textColor: tokens.color.textOnPrimary,
    label: 'DEV',
  },
  scratch: {
    backgroundColor: tokens.color.envScratch,
    textColor: tokens.color.textOnPrimary,
    label: 'SCRATCH',
  },
  trailhead: {
    backgroundColor: tokens.color.envTrailhead,
    textColor: tokens.color.textOnPrimary,
    label: 'TRAILHEAD',
  },
  'code-builder': {
    backgroundColor: tokens.color.envCodeBuilder,
    textColor: tokens.color.textOnPrimary,
    label: 'CODE BUILDER',
  },
  unknown: {
    backgroundColor: tokens.color.envUnknown,
    textColor: tokens.color.textOnPrimary,
    label: 'UNKNOWN',
  },
};

export function resolveEnvironmentAppearance(
  orgType: OrgType,
  settings: OrgSettings = {},
  sandboxName?: string,
): EnvironmentAppearance {
  const defaults = DEFAULT_ENVIRONMENT_APPEARANCE[orgType] ?? DEFAULT_ENVIRONMENT_APPEARANCE.unknown;

  const backgroundColor = settings.badgeColor && isValidCssColor(settings.badgeColor)
    ? settings.badgeColor
    : defaults.backgroundColor;

  const textColor = settings.badgeTextColor && isValidCssColor(settings.badgeTextColor)
    ? settings.badgeTextColor
    : defaults.textColor;

  const label = orgType === 'sandbox' && sandboxName && !settings.badgeLabel
    ? sandboxName.toUpperCase()
    : settings.badgeLabel ?? defaults.label;

  return {
    backgroundColor,
    textColor,
    label,
  };
}

export function getTitlePrefix(orgType: OrgType, sandboxName?: string): string {
  if (orgType === 'sandbox' && sandboxName) return `[SBX: ${sandboxName}]`;
  if (orgType === 'production') return '[PROD]';
  if (orgType === 'developer') return '[DEV]';
  if (orgType === 'scratch') return '[SCRATCH]';
  if (orgType === 'trailhead') return '[TRAIL]';
  if (orgType === 'code-builder') return '[CB]';
  return '';
}
