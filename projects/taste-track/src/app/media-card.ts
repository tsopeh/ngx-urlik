import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UrlTree } from '@angular/router';
import type { CatalogItem, PersonalState } from './backend';

@Component({
  selector: 'app-media-card',
  imports: [RouterLink],
  template: `
    <article class="media-card">
      <a
        class="cover cover-{{ item().accent }}"
        [routerLink]="url()"
        [attr.aria-label]="'Open ' + item().title"
      >
        @if (item().id === 'mov_the-last-algorithm') {
          <img src="artwork/the-last-algorithm.png" alt="" />
        }
        <span>{{ item().kind }}</span
        ><strong>{{ initials() }}</strong
        ><small>{{ item().year }}</small>
      </a>
      <div class="card-copy">
        <p class="meta">{{ item().kind }} · {{ item().year }}</p>
        <h3>
          <a [routerLink]="url()">{{ item().title }}</a>
        </h3>
        <p>{{ item().subtitle }}</p>
        <div class="card-actions">
          @if (state()?.rating; as rating) {
            <span class="rating">★ {{ rating }}/10</span>
          }
          <button
            type="button"
            (click)="favorite.emit(item())"
            [attr.aria-label]="state()?.favorite ? 'Remove favorite' : 'Add favorite'"
          >
            {{ state()?.favorite ? '♥' : '♡' }}
          </button>
        </div>
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .media-card {
      display: grid;
      gap: 0.8rem;
    }
    .cover {
      position: relative;
      isolation: isolate;
      aspect-ratio: 3 / 4;
      border-radius: 1rem;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: var(--cover-ink);
      text-decoration: none;
      box-shadow: var(--shadow-card);
      overflow: hidden;
    }
    .cover img {
      position: absolute;
      z-index: -1;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .cover:has(img)::after {
      content: '';
      position: absolute;
      z-index: -1;
      inset: 0;
      background: linear-gradient(180deg, rgb(20 8 20 / 35%), transparent 45%, rgb(20 8 20 / 55%));
    }
    .cover span,
    .cover small {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.66rem;
    }
    .cover strong {
      font-size: clamp(2rem, 5vw, 4.5rem);
      letter-spacing: -0.08em;
      max-width: 4ch;
      line-height: 0.8;
    }
    .cover-plum {
      background: var(--cover-plum);
    }
    .cover-coral {
      background: var(--cover-coral);
    }
    .cover-amber {
      background: var(--cover-amber);
    }
    .cover-teal {
      background: var(--cover-teal);
    }
    .cover-blue {
      background: var(--cover-blue);
    }
    .cover-rose {
      background: var(--cover-rose);
    }
    .card-copy {
      min-width: 0;
    }
    h3 {
      margin: 0.15rem 0;
      font-size: 1rem;
    }
    h3 a {
      color: var(--text-strong);
      text-decoration: none;
    }
    p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.82rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.65rem;
    }
    .card-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 2rem;
    }
    .rating {
      color: var(--accent-warm);
      font-size: 0.78rem;
      font-weight: 700;
    }
    button {
      border: 0;
      background: transparent;
      color: var(--accent-primary);
      font-size: 1.35rem;
      cursor: pointer;
    }
  `,
})
export class MediaCard {
  readonly item = input.required<CatalogItem>();
  readonly state = input<PersonalState>();
  readonly url = input.required<UrlTree | null>();
  readonly favorite = output<CatalogItem>();
  protected initials(): string {
    return this.item()
      .title.split(/\s+/)
      .slice(0, 3)
      .map((part) => part[0])
      .join('');
  }
}
