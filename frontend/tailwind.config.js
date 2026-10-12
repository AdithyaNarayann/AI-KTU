/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080c14",
        surface: "#0f172a",
        border: "#1e293b",
        accent: {
          cyan: "#06b6d4",
          emerald: "#10b981",
          amber: "#f59e0b",
          rose: "#f43f5e",
          purple: "#a855f7",
        }
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shock-flash': 'shock 0.8s ease-out forwards',
        'glow-pulse': 'glow 1.5s ease-in-out infinite',
      },
      keyframes: {
        shock: {
          '0%': { transform: 'scale(1.05)', filter: 'brightness(2) contrast(1.5)' },
          '100%': { transform: 'scale(1)', filter: 'none' },
        },
        glow: {
          '0%, 100%': { opacity: '0.8', filter: 'drop-shadow(0 0 12px rgba(16, 185, 129, 0.8))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 24px rgba(6, 182, 212, 1))' },
        }
      }
    },
  },
  plugins: [],
}
