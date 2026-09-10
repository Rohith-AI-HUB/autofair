import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: 'var(--color-navy)',
        'navy-2': 'var(--color-navy-2)',
        'navy-3': 'var(--color-navy-3)',
        teal: 'var(--color-teal)',
        'teal-dark': 'var(--color-teal-dark)',
        'teal-bg': 'var(--color-teal-bg)',
        'teal-line': 'var(--color-teal-line)',
        amber: 'var(--color-amber)',
        'off-white': 'var(--color-off-white)',
        coral: 'var(--color-coral)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        line: 'var(--color-line)',
        'line-dark': 'var(--color-line-dark)',
        'teal-bright': 'var(--color-teal-bright)',
        'ink-soft': 'var(--color-ink-soft)',
        'slate-mute': 'var(--color-slate-mute)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'monospace'],
        display: ['var(--font-sans)', 'Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
