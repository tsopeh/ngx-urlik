import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { provideAppRouter } from './app-router';
import { TasteTrackRepository } from './backend';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  it('says so when a reset fails, and lets the user try again', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideAppRouter(),
        {
          provide: TasteTrackRepository,
          useValue: { reset: () => Promise.reject(new Error('blocked')) },
        },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector<HTMLButtonElement>('button.danger-button')!;

    button.click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not reset TasteTrack.',
      );
    });
    expect(button.disabled).toBe(false);
  });
});
