import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';

export default function ThemeManager() {
  const { theme, customTheme } = useAppStore();

  useEffect(() => {
    // Remove all theme classes first
    const themeClasses = [
      'theme-neon', 'theme-ocean', 'theme-forest', 'theme-sunset', 
      'theme-dracula', 'theme-synthwave', 'theme-nord', 'theme-monokai', 'theme-cyberpunk', 'theme-custom'
    ];
    document.documentElement.classList.remove(...themeClasses);

    if (theme !== 'classic') {
      document.documentElement.classList.add(`theme-${theme}`);
    }

    if (theme === 'custom') {
      applyCustomTheme(customTheme.primaryColor, customTheme.intensity, customTheme.appearance);
    } else {
      // Clear custom styles
      const styleTag = document.getElementById('custom-theme-styles');
      if (styleTag) styleTag.remove();
    }
  }, [theme, customTheme]);

  const applyCustomTheme = (color: string, intensity: number, appearance: 'dark' | 'light') => {
    let styleTag = document.getElementById('custom-theme-styles') as HTMLStyleElement;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'custom-theme-styles';
      document.head.appendChild(styleTag);
    }

    const rgb = hexToRgb(color);
    if (!rgb) return;

    const r = rgb.r;
    const g = rgb.g;
    const b = rgb.b;

    // Calculate background colors based on appearance
    const isDark = appearance === 'dark';
    
    // Base colors (Zinc-like but shifted towards the custom color if intense)
    const tintFactor = intensity / 400; // Subtle tinting
    
    const mix = (c1: number, c2: number, factor: number) => Math.round(c1 * (1 - factor) + c2 * factor);

    const zinc950 = isDark ? { r: 3, g: 3, b: 8 } : { r: 248, g: 250, b: 252 };
    const zinc900 = isDark ? { r: 10, g: 10, b: 15 } : { r: 241, g: 245, b: 249 };
    const zinc800 = isDark ? { r: 24, g: 24, b: 27 } : { r: 226, g: 232, b: 240 };
    
    const bg950 = `rgb(${mix(zinc950.r, r, tintFactor)}, ${mix(zinc950.g, g, tintFactor)}, ${mix(zinc950.b, b, tintFactor)})`;
    const bg900 = `rgb(${mix(zinc900.r, r, tintFactor)}, ${mix(zinc900.g, g, tintFactor)}, ${mix(zinc900.b, b, tintFactor)})`;
    const bg800 = `rgb(${mix(zinc800.r, r, tintFactor)}, ${mix(zinc800.g, g, tintFactor)}, ${mix(zinc800.b, b, tintFactor)})`;

    // Text colors
    const text100 = isDark ? '#f4f4f5' : '#18181b';
    const text200 = isDark ? '#e4e4e7' : '#27272a';
    const text300 = isDark ? '#d4d4d8' : '#3f3f46';
    const text400 = isDark ? '#a1a1aa' : '#52525b';

    // Accents
    const accent500 = `rgb(${r}, ${g}, ${b})`;
    const accent400 = `rgba(${r}, ${g}, ${b}, 0.8)`;
    const accent600 = `rgba(${r}, ${g}, ${b}, 1)`;

    styleTag.textContent = `
      .theme-custom {
        --color-zinc-950: ${bg950} !important;
        --color-zinc-900: ${bg900} !important;
        --color-zinc-800: ${bg800} !important;
        --color-zinc-700: rgba(${r}, ${g}, ${b}, 0.15) !important;
        --color-zinc-600: rgba(${r}, ${g}, ${b}, 0.25) !important;
        
        --color-zinc-100: ${text100} !important;
        --color-zinc-200: ${text200} !important;
        --color-zinc-300: ${text300} !important;
        --color-zinc-400: ${text400} !important;

        --color-indigo-600: ${accent600} !important;
        --color-indigo-500: ${accent500} !important;
        --color-indigo-400: ${accent400} !important;
        
        --color-emerald-600: ${isDark ? 'rgba(34, 197, 94, 1)' : 'rgba(22, 163, 74, 1)'} !important;
        --color-emerald-500: ${isDark ? 'rgba(34, 197, 94, 0.8)' : 'rgba(22, 163, 74, 0.8)'} !important;
        --color-emerald-400: ${isDark ? 'rgba(34, 197, 94, 0.6)' : 'rgba(22, 163, 74, 0.6)'} !important;
      }

      .theme-custom .speaking-ring {
        box-shadow: 0 0 0 4px ${accent500} !important;
      }

      .theme-custom ::-webkit-scrollbar-thumb {
        background: rgba(${r}, ${g}, ${b}, ${0.1 + (intensity / 500)});
        background-clip: padding-box;
      }
      
      .theme-custom ::-webkit-scrollbar-thumb:hover {
        background: rgba(${r}, ${g}, ${b}, ${0.3 + (intensity / 500)});
        background-clip: padding-box;
      }

      /* Sidebar highlight effect similar to screenshot */
      .theme-custom .bg-indigo-500 {
        box-shadow: 0 0 ${intensity / 5}px rgba(${r}, ${g}, ${b}, 0.4);
      }
    `;
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  return null;
}
