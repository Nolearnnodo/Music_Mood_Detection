/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class', // <--- 关键修改：改为手动类名控制
  theme: {
    extend: {
      colors: {
        'mood-bg': 'var(--bg-color)',
        'mood-card': 'var(--card-color)',
        'mood-text': 'var(--text-color)',
        'mood-border': 'var(--border-color)'
      }
    }
  },
  plugins: []
};
