import { Component, inject, signal } from '@angular/core';
import { AppRouter } from './app-router';
import { Preferences } from './preferences';
import { TasteTrackRepository } from './backend';
import { ThemeService, type ThemePreference } from './theme';

@Component({
  template: `
    <section class="page-stack narrow">
      <header class="page-header">
        <div>
          <p class="eyebrow">TasteTrack</p>
          <h1>Settings</h1>
          <p>Appearance is stored separately from your resettable demo journal.</p>
        </div>
      </header>
      <section class="panel">
        <h2>Appearance</h2>
        <div class="segmented">
          @for (choice of themes; track choice) {
            <button
              type="button"
              [class.selected]="theme.preference() === choice"
              (click)="theme.select(choice)"
            >
              {{ choice }}
            </button>
          }
        </div>
      </section>
      <section class="panel danger">
        <h2>Reset demo data</h2>
        <p>
          Restore the original fictional catalog, library, ratings, counts, and history, and forget
          the remembered page size and seasons. Your theme will remain unchanged.
        </p>
        <button
          class="button danger-button"
          type="button"
          [disabled]="resetting()"
          (click)="reset()"
        >
          {{ resetting() ? 'Resetting…' : 'Reset TasteTrack' }}
        </button>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
      </section>
    </section>
  `,
})
export class SettingsPage {
  private readonly routes = inject(AppRouter).routes;
  private readonly repository = inject(TasteTrackRepository);
  private readonly preferences = inject(Preferences);
  protected readonly theme = inject(ThemeService);
  protected readonly themes: readonly ThemePreference[] = ['system', 'light', 'dark'];
  protected readonly resetting = signal(false);
  protected readonly error = signal('');
  protected async reset() {
    if (!confirm('Reset all TasteTrack demo data?')) {
      return;
    }
    this.resetting.set(true);
    this.error.set('');
    try {
      await this.repository.reset();
      this.preferences.clear();
      await this.routes.MOVIES.navigate();
    } catch {
      // Resetting twice ends in the same data, so trying again is safe.
      this.error.set('Could not reset TasteTrack. Please try again.');
    } finally {
      this.resetting.set(false);
    }
  }
}
