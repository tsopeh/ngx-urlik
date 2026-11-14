import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly preference = signal<ThemePreference>(this.readPreference());

  constructor() {
    this.apply(this.preference());
  }

  select(preference: ThemePreference): void {
    this.preference.set(preference);
    localStorage.setItem('taste-track:theme', preference);
    this.apply(preference);
  }

  private readPreference(): ThemePreference {
    const stored = localStorage.getItem('taste-track:theme');
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
