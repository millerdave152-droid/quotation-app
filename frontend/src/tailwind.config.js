const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      /* ─────────────────────────────────────
         COLORS
         Lunaris tokens use --lu- CSS vars
         to avoid DaisyUI collisions.
         ───────────────────────────────────── */
      colors: {
        background: 'hsl(var(--lu-background))',
        foreground: 'hsl(var(--lu-foreground))',

        card: {
          DEFAULT: 'hsl(var(--lu-card))',
          foreground: 'hsl(var(--lu-card-foreground))',
        },

        popover: {
          DEFAULT: 'hsl(var(--lu-popover))',
          foreground: 'hsl(var(--lu-popover-foreground))',
        },

        primary: {
          DEFAULT: 'hsl(var(--lu-primary))',
          foreground: 'hsl(var(--lu-primary-foreground))',
        },

        secondary: {
          DEFAULT: 'hsl(var(--lu-secondary))',
          foreground: 'hsl(var(--lu-secondary-foreground))',
        },

        muted: {
          DEFAULT: 'hsl(var(--lu-muted))',
          foreground: 'hsl(var(--lu-muted-foreground))',
        },

        accent: {
          DEFAULT: 'hsl(var(--lu-accent))',
          foreground: 'hsl(var(--lu-accent-foreground))',
        },

        destructive: {
          DEFAULT: 'hsl(var(--lu-destructive))',
        },

        border: 'hsl(var(--lu-border))',
        input: 'hsl(var(--lu-input))',
        ring: 'hsl(var(--lu-ring))',

        error: {
          DEFAULT: 'hsl(var(--lu-error))',
          foreground: 'hsl(var(--lu-error-foreground))',
        },

        success: {
          DEFAULT: 'hsl(var(--lu-success))',
          foreground: 'hsl(var(--lu-success-foreground))',
        },

        warning: {
          DEFAULT: 'hsl(var(--lu-warning))',
          foreground: 'hsl(var(--lu-warning-foreground))',
        },

        info: {
          DEFAULT: 'hsl(var(--lu-info))',
          foreground: 'hsl(var(--lu-info-foreground))',
        },

        sidebar: {
          DEFAULT: 'hsl(var(--lu-sidebar))',
          foreground: 'hsl(var(--lu-sidebar-foreground))',
          primary: 'hsl(var(--lu-sidebar-primary))',
          'primary-foreground': 'hsl(var(--lu-sidebar-primary-foreground))',
          accent: 'hsl(var(--lu-sidebar-accent))',
          'accent-foreground': 'hsl(var(--lu-sidebar-accent-foreground))',
          border: 'hsl(var(--lu-sidebar-border))',
          ring: 'hsl(var(--lu-sidebar-ring))',
        },

        black: 'hsl(var(--lu-black))',
        white: 'hsl(var(--lu-white))',
      },

      /* ─────────────────────────────────────
         TYPOGRAPHY
         ───────────────────────────────────── */
      fontFamily: {
        primary: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
        secondary: ['Geist', ...defaultTheme.fontFamily.sans],
      },

      fontSize: {
        '2xs':     ['0.5625rem', { lineHeight: '1.4' }],     /*  9px — fine print      */
        'lu-xs':   ['0.75rem',   { lineHeight: '1.5' }],     /* 12px — captions        */
        'lu-sm':   ['0.875rem',  { lineHeight: '1.43' }],    /* 14px — body small      */
        'lu-base': ['1rem',      { lineHeight: '1.5' }],     /* 16px — body default    */
        'lu-lg':   ['1.125rem',  { lineHeight: '1.56' }],    /* 18px — card titles     */
        'lu-xl':   ['1.25rem',   { lineHeight: '1.4' }],     /* 20px — modal titles    */
        'lu-2xl':  ['1.5rem',    { lineHeight: '1.5' }],     /* 24px — section heads   */
        'lu-3xl':  ['1.75rem',   { lineHeight: '1.3' }],     /* 28px — page heads      */
        'lu-4xl':  ['2rem',      { lineHeight: '1.25' }],    /* 32px — hero / display  */
      },

      fontWeight: {
        normal:   '400',
        medium:   '500',
        semibold: '600',
        bold:     '700',
      },

      /* ─────────────────────────────────────
         BORDER RADIUS
         lu- prefixed to preserve Tailwind defaults
         ───────────────────────────────────── */
      borderRadius: {
        'lu-none': '0px',
        'lu-xs':   '2px',
        'lu-sm':   '4px',
        'lu-md':   '8px',
        'lu-lg':   '12px',
        'lu-xl':   '16px',
        'lu-pill': '999px',
      },

      /* ─────────────────────────────────────
         BOX SHADOWS
         lu- prefixed to preserve Tailwind defaults
         ───────────────────────────────────── */
      boxShadow: {
        'lu-sm': '0 1px 2px hsl(0 0% 0% / 0.05)',
        'lu-md': '0 2px 4px -1px hsl(0 0% 0% / 0.06)',
      },

      /* ─────────────────────────────────────
         Z-INDEX
         ───────────────────────────────────── */
      zIndex: {
        'dropdown': '50',
        'sticky':   '100',
        'overlay':  '200',
        'modal':    '300',
        'popover':  '400',
        'tooltip':  '500',
        'toast':    '600',
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: ['light', 'dark'],
    darkTheme: 'dark',
  },
}
