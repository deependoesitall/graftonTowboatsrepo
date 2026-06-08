/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // GTS site palette
          yellow:  '#D9E84A',   // primary background / hero
          ylight:  '#F0F7A0',   // lighter yellow for gradients
          green:   '#1E3D1E',   // dark forest green — nav, buttons, headings
          gmed:    '#2D5A1E',   // medium green
          glight:  '#3D7A28',   // lighter green accent
          orange:  '#E8640A',   // logo orange — CTA accents
          ored:    '#D44E05',   // deeper orange
          cream:   '#FAF9F0',   // off-white for cards/panels
          navy:    '#1E3D1E',   // alias for green (used throughout code)
          steel:   '#2D5A1E',   // alias
          river:   '#3D7A28',   // alias
          sky:     '#5A9A3C',   // alias
          gold:    '#E8640A',   // alias — maps orange to gold slots
          amber:   '#D44E05',   // alias
          sand:    '#F0F7A0',   // alias
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'Arial Narrow', 'sans-serif'],
        body:    ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'monospace'],
      },
      backgroundImage: {
        'gts-gradient': 'linear-gradient(135deg, #D9E84A 0%, #E8F070 40%, #F0F7A0 100%)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.3s ease-out',
        'slide-in-right':'slide-in-right 0.3s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
