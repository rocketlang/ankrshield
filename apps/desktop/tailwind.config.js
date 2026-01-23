/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class', // Enable dark mode via class
  theme: {
    extend: {
      colors: {
        // AnkrShield brand colors
        'ankr-green': '#4caf50',
        'ankr-blue': '#2196f3',
        'ankr-red': '#f44336',
        'ankr-orange': '#ff9800',
        'ankr-purple': '#9c27b0',
      },
      minWidth: {
        'electron': '800px',
      },
      minHeight: {
        'electron': '600px',
      },
    },
  },
  plugins: [],
};
