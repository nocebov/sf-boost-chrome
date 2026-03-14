// SF Boost Design Tokens — single source of truth for all visual values

export const tokens = {
  color: {
    // Brand
    primary: '#0176d3',
    primaryHover: '#014486',
    primaryLight: '#e8f0fe',
    primaryBorder: '#b8d4f0',

    // Text hierarchy
    textPrimary: '#181818',
    textSecondary: '#475569',
    textTertiary: '#6b7280',
    textMuted: '#9ca3af',
    textOnPrimary: '#fff',
    textSalesforceGray: '#706e6b',

    // Surfaces
    surfaceBase: '#ffffff',
    surfaceRaised: '#f9fafb',
    surfaceSubtle: '#f3f4f6',
    surfaceSelected: '#f0f4ff',
    surfaceHighlight: '#fef08a',
    surfaceDark: '#1a1a2e',

    // Borders
    borderDefault: '#e5e7eb',
    borderInput: '#d8dde6',
    borderMuted: '#d1d5db',

    // Semantic
    success: '#16a34a',
    successLight: '#f0fdf4',
    successBorder: '#86efac',
    successText: '#166534',

    error: '#dc2626',
    errorLight: '#fef2f2',
    errorBorder: '#fca5a5',
    errorText: '#991b1b',

    warning: '#d97706',
    warningLight: '#fffaf0',
    warningBorder: '#fde68a',
    warningText: '#92400e',

    info: '#2563eb',
    infoLight: '#eff6ff',
    infoBorder: '#bfdbfe',
    infoText: '#1d4ed8',

    // Environment badge colors (unique to environment-safeguard)
    envProduction: '#dc2626',
    envSandbox: '#16a34a',
    envDeveloper: '#2563eb',
    envScratch: '#7c3aed',
    envTrailhead: '#0d9488',
    envUnknown: '#6b7280',
  },

  font: {
    family: {
      sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    },
    size: {
      xs: '10px',
      sm: '11px',
      base: '13px',
      md: '14px',
      lg: '16px',
    },
    weight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },

  space: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
  },

  radius: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    pill: '999px',
    full: '50%',
  },

  shadow: {
    xs: '0 1px 3px rgba(0,0,0,0.06)',
    sm: '0 1px 4px rgba(0,0,0,0.15)',
    md: '0 4px 12px rgba(0,0,0,0.15)',
    lg: '0 20px 60px rgba(0,0,0,0.3)',
  },

  zIndex: {
    badge: '99999',
    fab: '999998',
    overlay: '9999999',
    modalBackdrop: '99999998',
    modal: '99999999',
    toast: '100000000',
  },

  transition: {
    fast: '0.1s',
    normal: '0.15s',
    slow: '0.2s',
    modalEase: '0.15s cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const;
