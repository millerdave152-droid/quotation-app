import defaultTheme from 'tailwindcss/defaultTheme';
import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      /* ─────────────────────────────────────
         COLORS
         Existing POS palette + Lunaris tokens.
         Lunaris vars use --lu- prefix to avoid
         DaisyUI collisions.
         ───────────────────────────────────── */
      colors: {
        /* Existing POS blue palette (unchanged) */
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
          /* Lunaris primary (orange) as DEFAULT + foreground */
          DEFAULT: 'hsl(var(--lu-primary))',
          foreground: 'hsl(var(--lu-primary-foreground))',
        },
        pos: {
          dark: '#1a1a2e',
          darker: '#16213e',
          accent: '#0f3460',
          highlight: '#e94560',
        },

        /* Lunaris semantic colors */
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
        /* Existing POS fonts preserved */
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        /* Lunaris fonts */
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
         SPACING (existing preserved)
         ───────────────────────────────────── */
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
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

      /* ─────────────────────────────────────
         ANIMATIONS (existing preserved)
         ───────────────────────────────────── */
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [
    daisyui,
  ],
  daisyui: {
    themes: ['light', 'dark'],
    darkTheme: 'dark',
  },
};
