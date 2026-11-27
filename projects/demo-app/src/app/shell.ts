import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AppRouter } from './app-router';
import { type LibraryStatus, TasteTrackRepository } from './backend';
import { statusLabels } from './status-labels';
import { type ThemePreference, ThemeService } from './theme';

@Component({
  imports: [RouterLink, RouterOutlet],
  template: `
    <div class="app-frame">
      <aside class="sidebar">
        <a class="brand" [routerLink]="navigation[0].url">
          <span class="brand-mark" aria-hidden="true">T</span>
          <span><strong>TasteTrack</strong><small>Movies, shows, and you</small></span>
        </a>
        <nav aria-label="Primary navigation">
          @for (item of navigation; track item.label) {
            <a
              [routerLink]="item.url"
              [class.active]="item.route.ifActive()"
              [attr.aria-current]="item.route.ifActive() ? 'page' : null"
              >{{ item.icon }} <span>{{ item.label }}</span></a
            >
            @if (item.route === routes.LIBRARY) {
              @for (shortcut of libraryShortcuts; track shortcut.label) {
                <a
                  class="shortcut"
                  [routerLink]="shortcut.url"
                  [class.active]="routes.LIBRARY.ifActive(shortcut.values)"
                  [attr.aria-current]="routes.LIBRARY.ifActive(shortcut.values) ? 'page' : null"
                  >{{ shortcut.label }}</a
                >
              }
            }
          }
        </nav>
        <fieldset class="theme-switcher">
          <legend>Appearance</legend>
          @for (choice of themes; track choice) {
            <button
              type="button"
              [class.selected]="theme.preference() === choice"
              (click)="theme.select(choice)"
            >
              {{ choice }}
            </button>
          }
        </fieldset>
      </aside>
      <main id="main-content">
        @if (repository.error(); as error) {
          <p class="panel" role="alert">{{ error }}</p>
        }
        <!-- A journal that never opened has nothing to show, so pages would wait forever. -->
        @if (!repository.failedToOpen()) {
          <router-outlet />
        }
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
    .app-frame {
      display: grid;
      grid-template-columns: 16rem minmax(0, 1fr);
      min-height: 100vh;
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 1.5rem 1rem;
      border-right: 1px solid var(--border-subtle);
      background: var(--surface-sidebar);
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .brand {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      color: var(--text-strong);
      text-decoration: none;
      padding: 0.25rem 0.5rem;
    }
    .brand span:last-child {
      display: grid;
    }
    .brand strong {
      font-size: 1.15rem;
      letter-spacing: -0.03em;
    }
    .brand small {
      color: var(--text-muted);
      font-size: 0.72rem;
    }
    .brand-mark {
      width: 2.2rem;
      aspect-ratio: 1;
      border-radius: 0.75rem;
      display: grid;
      place-items: center;
      color: var(--text-on-accent);
      background: var(--accent-primary);
      font-weight: 800;
    }
    nav {
      display: grid;
      gap: 0.25rem;
    }
    nav a {
      padding: 0.72rem 0.8rem;
      border-radius: 0.7rem;
      color: var(--text-muted);
      text-decoration: none;
      display: flex;
      gap: 0.7rem;
    }
    nav a:hover,
    nav a.active {
      color: var(--text-strong);
      background: var(--surface-selected);
    }
    nav a.shortcut {
      padding: 0.4rem 0.8rem 0.4rem 2.6rem;
      font-size: 0.85rem;
    }
    .theme-switcher {
      margin-top: auto;
      border: 0;
      padding: 0 0.5rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.25rem;
    }
    legend {
      color: var(--text-muted);
      font-size: 0.72rem;
      margin-bottom: 0.5rem;
    }
    button {
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      background: var(--surface-raised);
      border-radius: 0.5rem;
      padding: 0.4rem;
      text-transform: capitalize;
    }
    button.selected {
      color: var(--text-strong);
      border-color: var(--accent-primary);
    }
    @media (max-width: 760px) {
      .app-frame {
        grid-template-columns: 1fr;
        padding-bottom: 4.5rem;
      }
      .sidebar {
        position: fixed;
        z-index: 10;
        inset: auto 0 0;
        height: auto;
        padding: 0.5rem;
        border: 0;
        border-top: 1px solid var(--border-subtle);
      }
      .brand,
      .theme-switcher,
      nav a.shortcut {
        display: none;
      }
      nav {
        grid-template-columns: repeat(6, 1fr);
      }
      nav a {
        justify-content: center;
        font-size: 1.1rem;
      }
      nav a {
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
        padding: 0.4rem 0.1rem;
      }
      nav a span {
        font-size: 0.6rem;
      }
    }
  `,
})
export class Shell {
  protected readonly repository = inject(TasteTrackRepository);
  protected readonly routes = inject(AppRouter).routes;
  protected readonly theme = inject(ThemeService);
  protected readonly themes: readonly ThemePreference[] = ['system', 'light', 'dark'];
  // Each shortcut is active only while the status filter is exactly its status. The other
  // Library filters, like the search, don't count.
  protected readonly libraryShortcuts = (['saved', 'in-progress', 'completed'] as const).map(
    (status: LibraryStatus) => {
      const values = { query: { statuses: [status] } };
      return {
        label: statusLabels[status],
        url: this.routes.LIBRARY.createUrlTree(values),
        values,
      };
    },
  );
  protected readonly navigation = [
    // Browse opens movies, and stays highlighted on every movie and TV page.
    {
      label: 'Browse',
      icon: '◉',
      route: this.routes.BROWSE,
      url: this.routes.MOVIES.createUrlTree(),
    },
    {
      label: 'Library',
      icon: '♥',
      route: this.routes.LIBRARY,
      url: this.routes.LIBRARY.createUrlTree(),
    },
    {
      label: 'History',
      icon: '↻',
      route: this.routes.HISTORY,
      url: this.routes.HISTORY.createUrlTree(),
    },
    {
      label: 'People',
      icon: '◎',
      route: this.routes.PEOPLE,
      url: this.routes.PEOPLE.createUrlTree(),
    },
    {
      label: 'Studios',
      icon: '▣',
      route: this.routes.STUDIOS,
      url: this.routes.STUDIOS.createUrlTree(),
    },
    {
      label: 'Settings',
      icon: '⚙',
      route: this.routes.SETTINGS,
      url: this.routes.SETTINGS.createUrlTree(),
    },
  ];
}
