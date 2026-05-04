import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

const ThemeContext = createContext(null);

export const THEME_STORAGE_KEY = 'voice-agent-theme';

function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  return 'dark';
}

function applyDomTheme(theme) {
  const root = document.documentElement;
  const isDark = theme === 'dark';
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  // Keep .dark for any external CSS; Tailwind uses data-theme via tailwind.config.
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme());

  useLayoutEffect(() => {
    applyDomTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return;
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
