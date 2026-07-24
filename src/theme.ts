import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { createContext, useContext } from 'react';

/** Ink accepts named colors or hex strings. `undefined` = terminal default. */
export type Color = string | undefined;

export interface Theme {
  name: string;
  // Chrome
  primary: Color;         // header text
  primaryBorder: Color;   // header border
  // Selection
  selectedBg: Color;      // background of the highlighted row
  // Lock state
  lockHeld: Color;
  lockStale: Color;
  // Session status
  running: Color;
  input: Color;
  approval: Color;
  // Notices
  info: Color;
  warn: Color;
  error: Color;
  // Input box
  inputBorder: Color;
  inputChevron: Color;
  // Emphasis toggles — turn off for terminals that can't do bold/underline
  useBold: boolean;
  useUnderline: boolean;
  useDim: boolean;
}

/** Default palette — relies on the user's terminal color scheme.
 * Named colors are indexed into the terminal's 16-color palette, so if the
 * user is in a light iTerm profile, "cyan" resolves to their light-cyan. */
export const DEFAULT_THEME: Theme = {
  name: 'default',
  primary: 'cyan',
  primaryBorder: 'cyan',
  selectedBg: 'blue',
  lockHeld: 'green',
  lockStale: 'red',
  running: 'green',
  input: 'yellow',
  approval: 'red',
  info: 'green',
  warn: 'yellow',
  error: 'red',
  inputBorder: 'cyan',
  inputChevron: 'cyan',
  useBold: true,
  useUnderline: true,
  useDim: true,
};

/** No colors — pure text + emphasis. Useful for very old terminals or
 * accessibility (color-blindness / high-contrast). */
export const MONO_THEME: Theme = {
  name: 'mono',
  primary: undefined,
  primaryBorder: 'white',
  selectedBg: 'gray',
  lockHeld: undefined,
  lockStale: undefined,
  running: undefined,
  input: undefined,
  approval: undefined,
  info: undefined,
  warn: undefined,
  error: undefined,
  inputBorder: 'white',
  inputChevron: undefined,
  useBold: true,
  useUnderline: true,
  useDim: true,
};

const BUILT_IN: Record<string, Theme> = {
  default: DEFAULT_THEME,
  mono: MONO_THEME,
};

/** Path to user-supplied theme overrides, XDG-friendly. */
export function themeConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(homedir(), '.config');
  return path.join(base, 'commander', 'theme.json');
}

/** Resolve the active theme following the priority chain:
 *   1. explicit `override` (from --theme flag)
 *   2. $COMMANDER_THEME
 *   3. ~/.config/commander/theme.json (custom object OR {"extends": "mono", ...})
 *   4. DEFAULT_THEME
 */
export function resolveTheme(override?: string): Theme {
  const named = override || process.env.COMMANDER_THEME;
  if (named && BUILT_IN[named]) return BUILT_IN[named];

  const cfgPath = themeConfigPath();
  if (fs.existsSync(cfgPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const base = BUILT_IN[raw.extends] ?? DEFAULT_THEME;
      const { extends: _e, ...overrides } = raw;
      return { ...base, ...overrides, name: overrides.name ?? base.name };
    } catch {
      // fall through — bad config shouldn't crash the app
    }
  }

  if (named && !BUILT_IN[named]) {
    // Named but not a built-in and no config → warn silently by name-only
    return { ...DEFAULT_THEME, name: named };
  }
  return DEFAULT_THEME;
}

export const ThemeContext = createContext<Theme>(DEFAULT_THEME);
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function listBuiltInThemes(): string[] {
  return Object.keys(BUILT_IN);
}
