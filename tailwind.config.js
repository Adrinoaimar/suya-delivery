/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        suya: {
          green: '#0B7048',
          'green-dark': '#075738',
          'green-light': '#18875E',
          lime: '#74B85B',
          'lime-soft': '#E4F2E7',
          sun: '#E9B52B',
          'sun-soft': '#FFF4D2',
          ivory: '#F0F7F3',
          carbon: '#152A20',
          mist: '#DDE9E2',
          muted: '#52675D',
          border: 'rgba(190, 213, 201, 0.75)',
          danger: '#C83E32',
          'danger-soft': '#FBEAE8',
          info: '#377F9C',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        btn: '14px',
        card: '20px',
        promo: '28px',
        sheet: '28px',
      },
      boxShadow: {
        soft: '0 18px 48px rgba(12, 49, 32, 0.12)',
        card: '0 8px 24px rgba(12, 49, 32, 0.08)',
        sheet: '0 -16px 44px rgba(12, 49, 32, 0.14)',
        lens: 'inset 0 1px 0 rgba(255,255,255,.82), 0 18px 48px rgba(12,49,32,.12)',
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
          from: { opacity: '0', transform: 'translateY(8px)' },
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
        'slide-up': 'slide-up 280ms cubic-bezier(.16,1,.3,1) forwards',
        'sheet-up': 'sheet-up 280ms cubic-bezier(.16,1,.3,1) forwards',
        'badge-pulse': 'badge-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
