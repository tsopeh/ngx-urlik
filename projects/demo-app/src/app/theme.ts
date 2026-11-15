import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

const themeKey = 'taste-track:theme';

export type ThemePreference = 'system' | 'light' | 'dark';

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(themeKey);
  } catch {
    // Storage is blocked, so there is no saved choice.
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly preference = signal<ThemePreference>(this.readPreference());

  constructor() {
    this.apply(this.preference());
  }

  select(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(themeKey, preference);
    } catch {
      // Storage is blocked, so the choice lasts until the page closes.
    }
    this.apply(preference);
  }

  private readPreference(): ThemePreference {
    const stored = readStoredTheme();
    const chosen = stored === 'light' || stored === 'dark';
    return chosen ? stored : 'system';
  }

  private apply(preference: ThemePreference): void {
    if (preference === 'system') {
      this.document.documentElement.removeAttribute('data-theme');
    } else {
      this.document.documentElement.dataset['theme'] = preference;
    }
  }
}
