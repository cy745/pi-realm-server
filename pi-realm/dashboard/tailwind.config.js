/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Minimalist palette: monochromatic with purple accent
        ink: {
          900: '#0A0A0A',
          800: '#171717',
          700: '#262626',
          600: '#404040',
          500: '#525252',
          400: '#737373',
          300: '#A3A3A3',
          200: '#D4D4D4',
          100: '#E5E5E5',
          50: '#F5F5F5',
        },
        accent: {
          50: '#FAF5FF',
          100: '#F3E8FF',
          200: '#E9D5FF',
          300: '#D8B4FE',
          400: '#C084FC',
          500: '#A855F7',
          600: '#9333EA',
          700: '#7E22CE',
          800: '#6B21A8',
          900: '#581C87',
        },
        // Semantic status colors
        status: {
          online: '#22C55E',
          idle: '#EAB308',
          error: '#EF4444',
          offline: '#737373',
        },
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
};
