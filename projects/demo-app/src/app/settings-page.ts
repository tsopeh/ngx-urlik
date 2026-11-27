import { Component, inject, signal } from '@angular/core';
import { AppRouter } from './app-router';
import { Preferences } from './preferences';
import { TasteTrackRepository } from './backend';
import { ThemeService, type ThemePreference } from './theme';
import { backendSpeeds, declinedMinRating, DemoLab } from './demo-lab';

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
      <section class="panel">
        <h2>Demo lab</h2>
        <p>
          See how ngx-urlik handles a slow backend and a write that a guard declines. These settings
          reset when you reload the page.
        </p>
        <fieldset class="segmented">
          <legend>Backend speed</legend>
          @for (speed of speeds; track speed.value) {
            <button
              type="button"
              [class.selected]="lab.backendSpeed() === speed.value"
              [attr.aria-pressed]="lab.backendSpeed() === speed.value"
              (click)="lab.backendSpeed.set(speed.value)"
            >
              {{ speed.label }}
            </button>
          }
        </fieldset>
        <label class="checkbox"
          ><input
            type="checkbox"
            [checked]="lab.declineTopRatings()"
            (change)="lab.declineTopRatings.set($any($event.target).checked)"
          />
          Decline a Library minimum rating of {{ declinedMinRating }} or more</label
        >
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
  styles: `
    fieldset button {
      text-transform: none;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0 0 1rem;
      flex-wrap: wrap;
    }
    legend {
      color: var(--text-muted);
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
    }
    .checkbox {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.9rem;
      color: var(--text-body);
    }
    .checkbox input {
      width: auto;
    }
  `,
})
export class SettingsPage {
  protected readonly lab = inject(DemoLab);
  protected readonly declinedMinRating = declinedMinRating;
  protected readonly speeds = backendSpeeds;
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
