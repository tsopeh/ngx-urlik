import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { delay, filter, map, type Observable } from 'rxjs';
import { TasteTrackRepository } from './database';
import type { CatalogItem, Contributor } from './domain';

export interface ContributorCredit {
  readonly item: CatalogItem;
  readonly roles: readonly ('Actor' | 'Director' | 'Writer' | 'Production')[];
}

export interface ContributorProfile {
  readonly contributor: Contributor;
  readonly credits: readonly ContributorCredit[];
}

@Injectable({ providedIn: 'root' })
export class ContributorApiService {
  private readonly repository = inject(TasteTrackRepository);
  private readonly dataVersion$ = toObservable(this.repository.dataVersion).pipe(
    filter(() => this.repository.ready()),
  );

  getContributors(kind: 'person' | 'company'): Observable<readonly Contributor[]> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => this.repository.contributors().filter((c) => c.kind === kind)),
    );
  }

  getContributorProfile(id: string): Observable<ContributorProfile | null> {
    return this.dataVersion$.pipe(
      delay(0),
      map(() => {
        const contributor = this.repository.contributors().find((c) => c.id === id);
        if (!contributor) return null;

        const credits = this.repository
          .items()
          .filter((item) => item.kind !== 'episode')
          .flatMap((item) => {
            const roles = item.credits
              .filter((credit) => credit.contributorId === id)
              .map((credit) => credit.role);
            return roles.length ? [{ item, roles }] : [];
          });

        return {
          contributor,
          credits,
        };
      }),
    );
  }
}
