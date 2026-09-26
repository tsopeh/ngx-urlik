import { Component, inject, signal } from '@angular/core';
import { AppRouter } from './app-router';
import { TasteTrackRepository } from './database';
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
          Restore the original fictional catalog, personal collection, ratings, counts, and
          activity. Your theme will remain unchanged.
        </p>
        <button
          class="button danger-button"
          type="button"
          [disabled]="resetting()"
          (click)="reset()"
        >
          {{ resetting() ? 'Resetting…' : 'Reset TasteTrack' }}
        </button>
      </section>
    </section>
  `,
})
export class SettingsPage {
  private readonly routes = inject(AppRouter);
  private readonly repository = inject(TasteTrackRepository);
  protected readonly theme = inject(ThemeService);
  protected readonly themes: readonly ThemePreference[] = ['system', 'light', 'dark'];
  protected readonly resetting = signal(false);
  protected async reset() {
    if (!confirm('Reset all TasteTrack demo data?')) return;
    this.resetting.set(true);
    try {
      await this.repository.reset();
      await this.routes.routes.MOVIES.navigate();
    } finally {
      this.resetting.set(false);
    }
  }
}
