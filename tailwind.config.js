/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        suya: {
          green: '#0E6B44',
          'green-dark': '#0A5335',
          'green-light': '#128355',
          lime: '#8CC63F',
          'lime-soft': '#EAF5DA',
          sun: '#FFC107',
          'sun-soft': '#FFF3CD',
          ivory: '#FAF7F1',
          carbon: '#1F2023',
          mist: '#E6E7E9',
          danger: '#C62828',
          'danger-soft': '#FCE9E9',
        },
      },
      fontFamily: {
        display: ['Montserrat', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        btn: '12px',
        card: '16px',
        promo: '20px',
        sheet: '24px',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(31, 32, 35, 0.08)',
        card: '0 2px 12px rgba(31, 32, 35, 0.06)',
        sheet: '0 -8px 30px rgba(31, 32, 35, 0.12)',
      },
      maxWidth: {
        shell: '1280px',
        page: '1440px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'badge-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.12)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        // `forwards` (y no `both`): si la animación no llega a ejecutarse, el elemento
        // queda en su posición final correcta en lugar de fuera de pantalla.
        'fade-in': 'fade-in 200ms ease-out forwards',
        'slide-up': 'slide-up 260ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'badge-pulse': 'badge-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
