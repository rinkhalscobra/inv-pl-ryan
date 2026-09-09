/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: '#0ea5e9',
          blue: '#2563eb',
          indigo: '#4f46e5',
          violet: '#7c3aed',
          teal: '#14b8a6',
        },
        surface: {
          base: '#070b16',
          shell: '#08111f',
          panel: '#0f172a',
          panelMuted: '#111827',
          line: 'rgba(148, 163, 184, 0.16)',
        },
      },
      boxShadow: {
        'app-glow': '0 18px 52px rgba(79, 70, 229, 0.24)',
        'app-panel': '0 20px 60px rgba(2, 6, 23, 0.34)',
      },
    },
  },
  plugins: [],
};
