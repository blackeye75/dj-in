/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#05060a',
        panel: '#0b0e17',
        edge: '#1b2032',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(255,255,255,0.35)' },
          '100%': { boxShadow: '0 0 0 14px rgba(255,255,255,0)' },
        },
      },
      animation: {
        marquee: 'marquee 18s linear infinite',
        pulseRing: 'pulseRing 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
