/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'mood-bg': 'var(--bg-color)',
        'mood-card': 'var(--card-color)',
        'mood-text': 'var(--text-color)',
        'mood-border': 'var(--border-color)',
        'mood-accent': 'var(--mood-accent)',
        'mood-accent-soft': 'var(--mood-accent-soft)',
        'mood-accent-glow': 'var(--mood-accent-glow)',
        'mood-accent-on': 'var(--mood-accent-on)'
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        display: ['Righteous', 'Poppins', 'sans-serif']
      }
    }
  },
  plugins: []
};
