/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        collect: 'var(--collect)',
        edit: 'var(--edit)',
        upload: 'var(--upload)',
        comment: 'var(--comment)',
        good: 'var(--good)',
        warn: 'var(--warn)',
        crit: 'var(--crit)'
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Apple SD Gothic Neo',
          'Pretendard', 'Segoe UI', 'Roboto', 'sans-serif'
        ],
        mono: ['SF Mono', 'ui-monospace', 'JetBrains Mono', 'Menlo', 'monospace']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,18,29,.04), 0 8px 24px rgba(16,18,29,.06)'
      }
    }
  },
  plugins: []
}
