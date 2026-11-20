import {
  Component,
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  ErrorHandler,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  debounce,
  form as signalForm,
  FormField,
  FormRoot,
  min,
  minLength,
  submit,
} from '@angular/forms/signals';
import { CanActivateFn, NavigationEnd, NavigationStart, Router } from '@angular/router';
import {
  bindQueryParamsToFormGroup,
  bindQueryParamsToSignalForm,
  createQueryParamsFormGroup,
  createQueryParamsSignalForm,
  type SignalFormQueryParamsBinding,
} from 'ngx-urlik/forms';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec, UrlParamCodec } from './params';

@Component({ template: '' })
class Page {}

async function setup(guard: CanActivateFn = () => true) {
  const definition = defineAppRouter(
    { RESULTS: RouteNames.RESULTS },
    {
      routes: [
        {
          path: 'results',
          routeName: RouteNames.RESULTS,
          queryParams: {
            search: queryParam({ codec: stringCodec(), defaultValue: '' }),
            page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
          },
          component: Page,
          canActivate: [guard],
          runGuardsAndResolvers: 'always' as const,
        },
        { path: 'other', component: Page },
        // A page whose chunk takes 50 ms to load.
        {
          path: 'slow',
          loadComponent: () => new Promise((resolve) => setTimeout(() => resolve(Page), 50)),
        },
      ],
    },
  );
  TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/results');
  return { results: TestBed.inject(definition.AppRouter).routes.RESULTS, router };
}

// Sets a control the way Angular's input directives do when the user types.
const typeInto = <T>(control: FormControl<T>, value: T) =>
  control.setValue(value, { emitModelToViewChange: false });

// Types into the first input the way the browser does, so the form's directives see the event.
const typeIntoInput = (element: HTMLElement, value: string) => {
  const input = element.querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
const submitForm = (element: HTMLElement) =>
  element.querySelector('form')?.dispatchEvent(new Event('submit'));

// Moves the fake clock forward by `ms`, firing each timer that comes due, such as a debounce. Then
// it runs effects and lets the navigations they start finish. Only this moves the clock, so a timer
// fires exactly when a test says it does, however fast the machine is.
const elapse = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(0);
};

enum RouteNames {
  A = 'A',
  ABOUT = 'ABOUT',
  B = 'B',
  CATALOG = 'CATALOG',
  CHILD = 'CHILD',
  HOME = 'HOME',
  ITEM = 'ITEM',
  ITEMS = 'ITEMS',
  MOVIES = 'MOVIES',
  RESULTS = 'RESULTS',
  ROOT = 'ROOT',
  SEASONS = 'SEASONS',
}

describe('query forms', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commits a multi-field reactive edit in one navigation', async () => {
    const { results, router } = await setup();
    await router.navigateByUrl('/results?search=old&page=4&campaign=summer');
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });
    const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
    form.patchValue({ search: 'new', page: 1 });

    await elapse();
    expect(router.url).toBe('/results?search=new&campaign=summer');
    expect(starts).toEqual(['/results?search=new&campaign=summer']);
    expect(form.getRawValue()).toEqual({ search: 'new', page: 1 });
  });

  it("resets a created form group to the route's defaults", async () => {
    const { results, router } = await setup();
    await router.navigateByUrl('/results?search=oak&page=3');
    const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));

    form.reset();
    expect(form.getRawValue()).toEqual({ search: '', page: 1 });
    await elapse();
    expect(router.url).toBe('/results');
  });

  it('commits a multi-field signal form edit in one navigation', async () => {
    const { results, router } = await setup();
    const starts: string[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        starts.push(event.url);
      }
    });
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(results));
    binding.model.update((query) => ({ ...query, search: 'new', page: 2 }));
    TestBed.flushEffects();

    await elapse();
    expect(router.url).toBe('/results?search=new&page=2');
    expect(starts).toEqual(['/results?search=new&page=2']);
  });

  it('keeps an invalid draft when a navigation changes that field', async () => {
    const { results, router } = await setup();
    const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
    form.controls.search.addValidators(Validators.minLength(10));
    form.controls.search.setValue('draft');
    expect(form.controls.search.value).toBe('draft');
    expect(router.url).toBe('/results');

    await router.navigateByUrl('/results?search=external');
    TestBed.flushEffects();
    expect(form.controls.search.value).toBe('draft');
  });

  it('adds up a form edit and a patch made in the same step', async () => {
    const { results, router } = await setup();
    const onWriteFailure = vi.fn();
    const { form } = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { onWriteFailure }),
    );
    form.controls.search.setValue('first');
    const direct = results.patchQuery({ page: 2 });

    expect(await direct).toBe(true);
    expect(router.url).toBe('/results?search=first&page=2');
    expect(onWriteFailure).not.toHaveBeenCalled();
  });

  it('writes only the edited field over a patch that just landed', async () => {
    const { results, router } = await setup();
    const { model } = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(results));
    model.update((query) => ({ ...query, search: 'elm' }));
    await results.patchQuery({ page: 2 });

    // The patch reaches the URL before the form writes. The form still shows page 1, but nobody
    // edited it.
    await elapse();
    expect(router.url).toBe('/results?page=2&search=elm');
    expect(model()).toEqual({ search: 'elm', page: 2 });
  });

  it('keeps the draft and reports a decline when a navigation cancels the write', async () => {
    const { results, router } = await setup();
    const onWriteFailure = vi.fn();
    const { form } = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { onWriteFailure }),
    );
    form.controls.search.setValue('first');
    const direct = router.navigateByUrl('/results?page=2');

    expect(await direct).toBe(true);
    expect(router.url).toBe('/results?page=2');
    await elapse();
    expect(onWriteFailure).toHaveBeenCalledWith({ kind: 'declined' });
    TestBed.flushEffects();
    // The form keeps the draft, but the URL never gets it.
    expect(form.getRawValue()).toEqual({ search: 'first', page: 2 });
  });

  it("doesn't report a decline when the user's next edit replaces the write", async () => {
    const { results, router } = await setup();
    const onWriteFailure = vi.fn();
    const write = vi.spyOn(results, 'patchQuery');
    const { form } = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { onWriteFailure }),
    );
    form.controls.search.setValue('e');
    form.controls.search.setValue('el');

    // The second write overtakes the first and carries its field, so both resolve true.
    expect(await write.mock.results[0].value).toBe(true);
    expect(await write.mock.results[1].value).toBe(true);
    expect(router.url).toBe('/results?search=el');
    expect(onWriteFailure).not.toHaveBeenCalled();
  });

  it('writes a draft that a navigation cancelled with the next change', async () => {
    const { results, router } = await setup();
    const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
    form.controls.search.setValue('first');
    await router.navigateByUrl('/results?page=2');
    TestBed.flushEffects();
    expect(router.url).toBe('/results?page=2');

    form.controls.page.setValue(3);
    await elapse();
    expect(router.url).toBe('/results?page=3&search=first');
  });

  it('follows a URL change that is written into a signal form in one effect run', async () => {
    const { results, router } = await setup();
    let reads = 0;
    const counted = {
      params: () => {
        reads++;
        return results.params();
      },
      patchQuery: results.patchQuery.bind(results),
    } as typeof results;
    const binding = TestBed.runInInjectionContext(() => createQueryParamsSignalForm(counted));
    TestBed.flushEffects();

    // The binding writes the new search into the form from inside its URL effect. That write
    // must not make the effect follow the form, or it runs a second time after the write.
    reads = 0;
    await router.navigateByUrl('/results?search=b');
    TestBed.flushEffects();

    expect(binding.model().search).toBe('b');
    expect(reads).toBe(1);
  });

  describe('with an object field', () => {
    type Sort = { readonly field: string; readonly direction: 'asc' | 'desc' };
    const sortCodec: UrlParamCodec<Sort> = {
      serialize: (value) => `${value.field}:${value.direction}`,
      deserialize: (raw) => {
        const [field, direction] = raw.split(':');
        return direction === 'asc' || direction === 'desc' ? { field, direction } : null;
      },
    };
    const sortSetup = async () => {
      const definition = defineAppRouter(
        { RESULTS: RouteNames.RESULTS },
        {
          routes: [
            {
              path: 'results',
              routeName: RouteNames.RESULTS,
              queryParams: {
                sort: queryParam({
                  codec: sortCodec,
                  defaultValue: { field: 'title', direction: 'asc' },
                }),
                page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
              },
              component: Page,
            },
          ],
        },
      );
      TestBed.configureTestingModule({ providers: [definition.provideAppRouter()] });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/results?sort=year:desc');
      return { results: TestBed.inject(definition.AppRouter).routes.RESULTS, router };
    };

    it("doesn't write or run beforeWrite when picking the sort that is already chosen", async () => {
      const { results, router } = await sortSetup();
      const onWriteFailure = vi.fn();
      const write = vi.spyOn(results, 'patchQuery');
      const written: string[][] = [];
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, {
          onWriteFailure,
          beforeWrite: (patch) => {
            written.push(Object.keys(patch));
            return patch;
          },
        }),
      );

      // A new object with the same URL text doesn't differ from the query parameter.
      form.controls.sort.setValue({ field: 'year', direction: 'desc' });
      await elapse();
      expect(write).not.toHaveBeenCalled();
      expect(written).toEqual([]);
      expect(onWriteFailure).not.toHaveBeenCalled();

      form.controls.page.setValue(2);
      await elapse();
      expect(router.url).toBe('/results?sort=year:desc&page=2');
      expect(written).toEqual([['page']]);
    });
  });

  it("doesn't write a form edit that goes back to the URL's value", async () => {
    const { results, router } = await setup();
    await router.navigateByUrl('/results?search=elm');
    const write = vi.spyOn(results, 'patchQuery');
    const { form } = TestBed.runInInjectionContext(() =>
      createQueryParamsFormGroup(results, { debounce: { search: 20 } }),
    );
    let runs = 0;
    const query = computed(() => {
      runs++;
      return results.params().query;
    });
    const before = results.params();
    query();

    // The user types a letter and deletes it before the debounce ends.
    typeInto(form.controls.search, 'elms');
    typeInto(form.controls.search, 'elm');
    await elapse(20);
    expect(write).not.toHaveBeenCalled();
    TestBed.tick();
    expect(results.params()).toBe(before);
    query();
    expect(runs).toBe(1);
  });

  describe('validators', () => {
    it("doesn't write a reactive field until it is valid, and writes an empty value", async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
      form.controls.search.addValidators(Validators.minLength(3));

      form.controls.search.setValue('el');
      form.controls.page.setValue(2);
      await elapse();
      expect(router.url).toBe('/results?page=2');
      form.controls.search.setValue('elm');
      await elapse();
      expect(router.url).toBe('/results?page=2&search=elm');
      form.controls.search.setValue('');
      await elapse();
      expect(router.url).toBe('/results?page=2');
    });

    it("doesn't report a decline when an invalid field goes back to its URL value", async () => {
      const { results, router } = await setup();
      const onWriteFailure = vi.fn();
      const write = vi.spyOn(results, 'patchQuery');
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );
      form.controls.search.addValidators(Validators.minLength(3));

      form.controls.search.setValue('e');
      form.controls.search.setValue('');

      expect(write).not.toHaveBeenCalled();
      expect(router.url).toBe('/results');
      expect(onWriteFailure).not.toHaveBeenCalled();
    });

    it('writes a reactive field once its async validator passes', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
      let settle!: (errors: null | { taken: true }) => void;
      form.controls.search.addAsyncValidators(() => new Promise((resolve) => (settle = resolve)));

      form.controls.search.setValue('elm');
      await elapse();
      expect(router.url).toBe('/results');
      settle(null);
      await elapse();
      expect(router.url).toBe('/results?search=elm');
    });

    it('writes a disabled reactive field that changes', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));
      form.controls.search.disable();

      form.controls.search.setValue('elm');
      await elapse();
      expect(router.url).toBe('/results?search=elm');
    });

    it("doesn't write a signal form field until its schema passes", async () => {
      const { results, router } = await setup();
      const binding = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, {
          schema: (fields) => minLength(fields.search, 3),
        }),
      );

      binding.model.update((query) => ({ ...query, search: 'el', page: 2 }));
      TestBed.tick();
      await elapse();
      expect(router.url).toBe('/results?page=2');
      binding.model.update((query) => ({ ...query, search: 'elm' }));
      TestBed.tick();
      await elapse();
      expect(router.url).toBe('/results?page=2&search=elm');
    });
  });

  describe("writeOn: 'submit'", () => {
    // Set by each test before it creates a component.
    let results: Awaited<ReturnType<typeof setup>>['results'];

    @Component({
      imports: [ReactiveFormsModule],
      template: `
        <form [formGroup]="form">
          <input [formControl]="form.controls.search" />
        </form>
      `,
    })
    class ReactiveFilters {
      readonly form = createQueryParamsFormGroup(results, { writeOn: 'submit' }).form;
    }

    it('writes typing and values set by code only when a <form [formGroup]> is submitted', async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const fixture = TestBed.createComponent(ReactiveFilters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      typeIntoInput(element, 'elm');
      fixture.componentInstance.form.controls.page.setValue(2);
      await elapse();
      expect(router.url).toBe('/results');
      // The form itself has the edits, so other controls can react to them.
      expect(fixture.componentInstance.form.getRawValue()).toEqual({ search: 'elm', page: 2 });

      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results?search=elm&page=2');
      expect(starts).toEqual(['/results?search=elm&page=2']);
    });

    it("doesn't write when the submitted form has errors, and keeps the edits", async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(ReactiveFilters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      fixture.componentInstance.form.controls.search.addValidators(Validators.minLength(3));

      typeIntoInput(element, 'el');
      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results');
      expect(fixture.componentInstance.form.controls.search.value).toBe('el');

      typeIntoInput(element, 'elm');
      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results?search=elm');
    });

    it('takes a URL change into a field over its unsubmitted edit, and keeps the others', async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(ReactiveFilters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const { form } = fixture.componentInstance;

      typeIntoInput(element, 'elm');
      form.controls.page.setValue(2);
      await router.navigateByUrl('/results?search=oak');
      TestBed.flushEffects();
      expect(form.getRawValue()).toEqual({ search: 'oak', page: 2 });

      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results?search=oak&page=2');
    });

    @Component({
      imports: [FormRoot, FormField],
      template: `
        <form [formRoot]="form">
          <input [formField]="form.search" />
        </form>
      `,
    })
    class SignalFilters {
      readonly binding = createQueryParamsSignalForm(results, {
        schema: (fields) => {
          debounce(fields.search, 10_000);
          minLength(fields.search, 3);
        },
        writeOn: 'submit',
      });
      readonly form = this.binding.form;
    }

    it('writes a Signal Form when a <form [formRoot]> is submitted, waiting typing included', async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(SignalFilters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      typeIntoInput(element, 'elm');
      fixture.componentInstance.binding.model.update((query) => ({ ...query, page: 2 }));
      TestBed.tick();
      await elapse();
      expect(router.url).toBe('/results');

      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results?search=elm&page=2');
    });

    it("doesn't write a Signal Form submitted with errors", async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(SignalFilters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      typeIntoInput(element, 'el');
      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results');
      expect(fixture.componentInstance.binding.model().search).toBe('el');
    });

    it('takes the next Signal Form submit while the last write still waits for a guard', async () => {
      let allow!: (allowed: boolean) => void;
      const guard = new Promise<boolean>((resolve) => {
        allow = resolve;
      });
      ({ results } = await setup((route) =>
        route.queryParamMap.get('search') === 'elm' ? guard : true,
      ));
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(SignalFilters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      typeIntoInput(element, 'elm');
      submitForm(element);
      await elapse();
      // The user changes the search and presses Enter again before the guard answers.
      typeIntoInput(element, 'oak');
      submitForm(element);
      allow(true);
      await elapse();
      expect(router.url).toBe('/results?search=oak');
    });

    it('writes typing that debounce() still holds when the write comes from code', async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const fixture = TestBed.createComponent(SignalFilters);
      fixture.detectChanges();

      typeIntoInput(fixture.nativeElement as HTMLElement, 'elm');
      await fixture.componentInstance.binding.write();
      expect(router.url).toBe('/results?search=elm');
    });

    it('writes a reactive form from code with the returned write, unless it has errors', async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const form = new FormGroup({
        search: new FormControl('', { nonNullable: true, validators: Validators.minLength(3) }),
        page: new FormControl(1, { nonNullable: true }),
      });
      const { write } = TestBed.runInInjectionContext(() =>
        bindQueryParamsToFormGroup(results, form, { writeOn: 'submit' }),
      );

      // The page is valid, but the search's error stops the whole form from being written.
      form.controls.page.setValue(2);
      form.controls.search.setValue('el');
      await write();
      expect(router.url).toBe('/results');
      form.controls.search.setValue('elm');
      await write();
      expect(router.url).toBe('/results?search=elm&page=2');
    });

    it('writes a created form from code with the returned write, unless it has errors', async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const reactive = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { writeOn: 'submit' }),
      );
      const signals = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, {
          schema: (fields) => minLength(fields.search, 3),
          writeOn: 'submit',
        }),
      );

      reactive.form.controls.page.setValue(2);
      await reactive.write();
      expect(router.url).toBe('/results?page=2');
      signals.model.update((query) => ({ ...query, search: 'el' }));
      await signals.write();
      expect(router.url).toBe('/results?page=2');
      signals.model.update((query) => ({ ...query, search: 'elm' }));
      await signals.write();
      expect(router.url).toBe('/results?page=2&search=elm');
    });

    it("follows a Signal Form's own validator rules inside Angular's submit()", async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const model = signal(results.params().query);
      const search = TestBed.runInInjectionContext(() =>
        signalForm(model, (fields) => minLength(fields.search, 3), {
          submission: { action: () => binding.submitAction(), ignoreValidators: 'all' },
        }),
      );
      const binding: SignalFormQueryParamsBinding = TestBed.runInInjectionContext(() =>
        bindQueryParamsToSignalForm(results, search, { writeOn: 'submit' }),
      );

      model.update((query) => ({ ...query, search: 'el' }));
      await submit(search);
      await elapse();
      expect(router.url).toBe('/results?search=el');
    });

    it('writes a Signal Form you built when its submit action calls the returned submitAction', async () => {
      ({ results } = await setup());
      const router = TestBed.inject(Router);
      const model = signal(results.params().query);
      const search = TestBed.runInInjectionContext(() =>
        signalForm(model, { submission: { action: () => binding.submitAction() } }),
      );
      const binding: SignalFormQueryParamsBinding = TestBed.runInInjectionContext(() =>
        bindQueryParamsToSignalForm(results, search, { writeOn: 'submit' }),
      );

      model.update((query) => ({ ...query, search: 'elm' }));
      TestBed.tick();
      await elapse();
      expect(router.url).toBe('/results');

      await submit(search);
      await elapse();
      expect(router.url).toBe('/results?search=elm');
    });
  });

  describe('write()', () => {
    it('resolves once the typing it writes is in the URL', async () => {
      const { results, router } = await setup();
      const { form, write } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 10_000 } }),
      );

      typeInto(form.controls.search, 'elm');
      await write();
      expect(router.url).toBe('/results?search=elm');
    });

    it('resolves once a write already running settles', async () => {
      const { results, router } = await setup();
      const { form, write } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results),
      );

      // The value set by code is already on its way, so write() has nothing new to send.
      form.controls.search.setValue('elm');
      await write();
      expect(router.url).toBe('/results?search=elm');
    });

    it('writes only the valid fields of a Reactive form with errors', async () => {
      const { results, router } = await setup();
      const form = new FormGroup({
        search: new FormControl('', { nonNullable: true }),
        page: new FormControl(1, { nonNullable: true, validators: Validators.min(1) }),
      });
      // The delays outlast the test, so only write() sends the typing.
      const { write } = TestBed.runInInjectionContext(() =>
        bindQueryParamsToFormGroup(results, form, { debounce: { search: 10_000, page: 10_000 } }),
      );

      typeInto(form.controls.search, 'elm');
      typeInto(form.controls.page, 0);
      await write();
      expect(router.url).toBe('/results?search=elm');

      // The page stayed in the form, so it's written once it passes.
      typeInto(form.controls.page, 2);
      await write();
      expect(router.url).toBe('/results?search=elm&page=2');
    });

    it('writes only the valid fields of a Signal Form with errors', async () => {
      const { results, router } = await setup();
      const { form, write } = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, {
          schema: (fields) => {
            debounce(fields.search, 10_000);
            min(fields.page, 1);
          },
        }),
      );

      form.page().controlValue.set(0);
      form.search().controlValue.set('elm');
      await write();
      expect(router.url).toBe('/results?search=elm');
      expect(form.page().value()).toBe(0);
    });
  });

  describe('debounce', () => {
    it('writes a debounced field after its last change without delaying other fields', async () => {
      const { results, router } = await setup();
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 200 } }),
      );

      typeInto(form.controls.search, 'e');
      typeInto(form.controls.search, 'el');
      form.controls.page.setValue(2);
      await elapse();
      expect(router.url).toBe('/results?page=2');
      typeInto(form.controls.search, 'elm');
      await elapse(199);
      expect(router.url).toBe('/results?page=2');
      await elapse(1);
      expect(router.url).toBe('/results?page=2&search=elm');
      expect(starts).toEqual(['/results?page=2', '/results?page=2&search=elm']);
    });

    it('waits for what the user types into inputs and selects', async () => {
      const { results, router } = await setup();
      @Component({
        imports: [ReactiveFormsModule],
        template: `
          <form [formGroup]="form">
            <input [formControl]="form.controls.search" />
            <select [formControl]="form.controls.page">
              <option [ngValue]="1">1</option>
              <option [ngValue]="2">2</option>
            </select>
          </form>
        `,
      })
      class Filters {
        readonly form = createQueryParamsFormGroup(results, {
          debounce: { search: 200, page: 200 },
        }).form;
      }
      const fixture = TestBed.createComponent(Filters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      typeIntoInput(element, 'elm');
      const select = element.querySelector('select') as HTMLSelectElement;
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change'));
      await elapse(199);
      expect(router.url).toBe('/results');
      await elapse(1);
      expect(router.url).toBe('/results?search=elm&page=2');
    });

    it('writes typing still waiting when the form is submitted', async () => {
      const { results, router } = await setup();
      @Component({
        imports: [ReactiveFormsModule],
        template: `
          <form [formGroup]="form">
            <input [formControl]="form.controls.search" />
          </form>
        `,
      })
      class Filters {
        readonly form = createQueryParamsFormGroup(results, { debounce: { search: 10_000 } }).form;
      }
      const fixture = TestBed.createComponent(Filters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      typeIntoInput(element, 'elm');
      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results?search=elm');
    });

    // Each field checks its own validators, so a submit with errors still writes the valid ones.
    it('writes valid typing still waiting when a form with errors is submitted', async () => {
      const { results, router } = await setup();
      @Component({
        imports: [ReactiveFormsModule],
        template: `
          <form [formGroup]="form">
            <input [formControl]="form.controls.search" />
          </form>
        `,
      })
      class Filters {
        readonly form = new FormGroup({
          search: new FormControl('', { nonNullable: true }),
          page: new FormControl(1, { nonNullable: true, validators: Validators.min(1) }),
        });
        readonly binding = bindQueryParamsToFormGroup(results, this.form, {
          debounce: { search: 10_000 },
        });
      }
      const fixture = TestBed.createComponent(Filters);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      typeIntoInput(element, 'elm');
      fixture.componentInstance.form.controls.page.setValue(0);
      expect(fixture.componentInstance.form.invalid).toBe(true);
      submitForm(element);
      await elapse();
      expect(router.url).toBe('/results?search=elm');
    });

    it('writes valid typing debounce() still holds when a Signal Form with errors is submitted', async () => {
      const { results, router } = await setup();
      const { model, form } = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, {
          schema: (fields) => {
            debounce(fields.search, 10_000);
            min(fields.page, 1);
          },
        }),
      );

      model.update((query) => ({ ...query, page: 0 }));
      form.search().controlValue.set('elm');
      // Angular skips the action of a form with errors, but its submit() still ends the wait.
      expect(await submit(form, () => Promise.resolve())).toBe(false);
      await elapse();
      expect(router.url).toBe('/results?search=elm');
    });

    it('waits for typing that follows a URL change to the same field', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 200 } }),
      );

      // The form takes oak from the URL, and the user's next keystroke has to wait.
      await router.navigateByUrl('/results?search=oak');
      TestBed.flushEffects();
      typeInto(form.controls.search, 'oaks');
      await elapse(199);
      expect(router.url).toBe('/results?search=oak');
      await elapse(1);
      expect(router.url).toBe('/results?search=oaks');
    });

    it('delays a debounced field set from code until the delay ends, or until write() is called', async () => {
      const { results, router } = await setup();
      const { form, write } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 200 } }),
      );

      form.patchValue({ search: 'elm' });
      await elapse(199);
      expect(router.url).toBe('/results');
      await elapse(1);
      expect(router.url).toBe('/results?search=elm');

      form.patchValue({ search: 'oak' });
      await write();
      expect(router.url).toBe('/results?search=oak');
    });

    it('lets a later value replace typing still waiting on the same debounce', async () => {
      const { results, router } = await setup();
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 200 } }),
      );

      typeInto(form.controls.search, 'el');
      form.controls.search.setValue('oak');
      await elapse(199);
      expect(router.url).toBe('/results');
      await elapse(1);
      expect(router.url).toBe('/results?search=oak');
      expect(starts).toEqual(['/results?search=oak']);
    });

    it('writes a debounced field on top of a navigation that changes other fields', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 } }),
      );

      typeInto(form.controls.search, 'stale');
      await router.navigateByUrl('/results?page=3');
      await elapse(40);
      expect(router.url).toBe('/results?page=3&search=stale');
      expect(form.controls.search.value).toBe('stale');
    });

    it('lets the user leave while a debounced edit waits', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 10 } }),
      );

      typeInto(form.controls.search, 'elm');
      const leaving = router.navigateByUrl('/slow');
      // The delay ends while the next page still loads, and the write must not cancel that
      // navigation.
      await elapse(10);
      expect(router.url).toBe('/results');
      await elapse(40);
      expect(await leaving).toBe(true);
      expect(router.url).toBe('/slow');
    });

    it('drops a debounced reactive edit when a navigation changes that field', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 } }),
      );

      // The user types, then presses Back to a URL with another search before the delay ends.
      typeInto(form.controls.search, 'elm');
      await router.navigateByUrl('/results?search=oak');
      TestBed.flushEffects();
      expect(form.controls.search.value).toBe('oak');

      await elapse(40);
      expect(router.url).toBe('/results?search=oak');
    });

    it('drops a debounced signal form edit when a navigation changes that field', async () => {
      const { results, router } = await setup();
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, { schema: (fields) => debounce(fields.search, 40) }),
      );

      // controlValue is what an input bound with [formField] sets on each keystroke.
      form.search().controlValue.set('elm');
      await router.navigateByUrl('/results?search=oak');
      TestBed.flushEffects();
      expect(form.search().controlValue()).toBe('oak');

      await elapse(40);
      expect(router.url).toBe('/results?search=oak');
    });

    it.each(['after', 'before'])(
      "keeps a debounced edit when that field's earlier write lands, if the form follows the URL %s the write settles",
      async (order) => {
        const { results, router } = await setup();
        const { form } = TestBed.runInInjectionContext(() =>
          createQueryParamsFormGroup(results, { debounce: { search: 20 } }),
        );
        const starts: string[] = [];
        router.events.subscribe((event) => {
          if (event instanceof NavigationStart) {
            starts.push(event.url);
            // The user types again while the write of 'el' runs.
            if (event.url === '/results?search=el') {
              typeInto(form.controls.search, 'elm');
            }
          }
          if (event instanceof NavigationEnd && order === 'before') {
            TestBed.flushEffects();
          }
        });

        typeInto(form.controls.search, 'el');
        await elapse(20);
        expect(router.url).toBe('/results?search=el');
        await elapse(20);
        expect(router.url).toBe('/results?search=elm');
        expect(starts).toEqual(['/results?search=el', '/results?search=elm']);
        expect(form.controls.search.value).toBe('elm');
      },
    );
  });

  describe('beforeWrite', () => {
    const resetPage = <P extends { search?: string; page?: number }>(patch: P): P =>
      'search' in patch ? { page: 1, ...patch } : patch;

    it('resets the page in the same reactive write as a debounced search', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?page=4');
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 40 }, beforeWrite: resetPage }),
      );

      typeInto(form.controls.search, 'el');
      typeInto(form.controls.search, 'elm');
      await elapse(40);
      expect(router.url).toBe('/results?search=elm');
      expect(starts).toEqual(['/results?search=elm']);
      expect(form.controls.page.value).toBe(1);
      expect(form.controls.search.value).toBe('elm');

      form.controls.page.setValue(3);
      await elapse();
      expect(router.url).toBe('/results?search=elm&page=3');
      expect(starts).toEqual(['/results?search=elm', '/results?search=elm&page=3']);
    });

    it('resets the page in the same signal form write as a search', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?page=4');
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const binding = TestBed.runInInjectionContext(() =>
        createQueryParamsSignalForm(results, { beforeWrite: resetPage }),
      );

      binding.model.update((query) => ({ ...query, search: 'elm' }));
      TestBed.tick();
      await elapse();
      expect(router.url).toBe('/results?search=elm');
      expect(starts).toEqual(['/results?search=elm']);
      expect(binding.model()).toEqual({ search: 'elm', page: 1 });
    });

    it("doesn't reset the page when a debounced search ends where it started", async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?search=oak&page=3');
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { debounce: { search: 20 }, beforeWrite: resetPage }),
      );

      typeInto(form.controls.search, 'oakx');
      typeInto(form.controls.search, 'oak');
      await elapse(20);
      expect(router.url).toBe('/results?search=oak&page=3');
      expect(form.getRawValue()).toEqual({ search: 'oak', page: 3 });
    });

    it("doesn't reset the page when an invalid search goes back to its URL value", async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?page=3');
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { beforeWrite: resetPage }),
      );
      form.controls.search.addValidators(Validators.minLength(3));

      form.controls.search.setValue('a');
      form.controls.search.setValue('');
      await elapse();
      expect(router.url).toBe('/results?page=3');
      expect(form.getRawValue()).toEqual({ search: '', page: 3 });
    });

    it('keeps the page when a search goes back to its URL value while its write runs', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?search=oak&page=3');
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { beforeWrite: resetPage }),
      );

      // The 'elm' write is still running. Going back to 'oak' writes the search, and the page the
      // reset changed, back to their URL values.
      form.controls.search.setValue('elm');
      form.controls.search.setValue('oak');
      await elapse();
      expect(router.url).toBe('/results?search=oak&page=3');
      expect(form.controls.search.value).toBe('oak');
    });

    it('reports a throwing beforeWrite and skips the write', async () => {
      const { results, router } = await setup();
      const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError');
      const failure = new Error('beforeWrite failed');
      const starts: string[] = [];
      router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          starts.push(event.url);
        }
      });
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, {
          beforeWrite: () => {
            throw failure;
          },
        }),
      );

      form.controls.search.setValue('elm');
      await elapse();
      expect(handleError).toHaveBeenCalledWith(failure);
      expect(starts).toEqual([]);
      expect(router.url).toBe('/results');
      expect(form.controls.search.value).toBe('elm');
    });
  });

  describe('failures', () => {
    it('sends errors to ErrorHandler without onWriteFailure, and keeps declines silent', async () => {
      const { results, router } = await setup();
      const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError');
      const { form } = TestBed.runInInjectionContext(() => createQueryParamsFormGroup(results));

      form.controls.search.setValue('first');
      await router.navigateByUrl('/results?page=2');
      await elapse();
      expect(router.url).toBe('/results?page=2');
      expect(handleError).not.toHaveBeenCalled();

      await router.navigateByUrl('/other');
      form.controls.search.setValue('lost');
      await elapse();
      expect(handleError).toHaveBeenCalledTimes(1);
      expect(handleError.mock.calls[0][0]).toEqual(
        new Error(
          "RESULTS: route 'results' isn't active, so it has no params to read. Check ifActive() first.",
        ),
      );
    });

    it('sends an error that onWriteFailure throws to ErrorHandler, and write() still resolves', async () => {
      const { results, router } = await setup(
        (route) => route.queryParamMap.get('search') !== 'blocked',
      );
      const handleError = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError');
      const thrown = new Error('onWriteFailure failed');
      const { form, write } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, {
          onWriteFailure: () => {
            throw thrown;
          },
        }),
      );

      form.controls.search.setValue('blocked');
      await expect(write()).resolves.toBeUndefined();
      expect(handleError).toHaveBeenCalledWith(thrown);
      expect(router.url).toBe('/results');
    });

    it('keeps its values when its route stops showing, and reports an edit then as an error', async () => {
      const { results, router } = await setup();
      await router.navigateByUrl('/results?search=oak');
      const onWriteFailure = vi.fn();
      const { form } = TestBed.runInInjectionContext(() =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );

      await router.navigateByUrl('/other');
      TestBed.flushEffects();
      expect(form.getRawValue()).toEqual({ search: 'oak', page: 1 });

      form.controls.search.setValue('elm');
      await elapse();
      expect(onWriteFailure).toHaveBeenCalledWith({ kind: 'error', error: expect.any(Error) });
      expect(router.url).toBe('/other');
      expect(form.controls.search.value).toBe('elm');
    });
  });

  describe('lifetime', () => {
    const createIn = <T>(injector: EnvironmentInjector, create: () => T): T =>
      runInInjectionContext(injector, create);

    it('drops an edit still waiting for its debounce when it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const { form } = createIn(injector, () =>
        createQueryParamsFormGroup(results, { debounce: { search: 20 } }),
      );

      typeInto(form.controls.search, 'elm');
      injector.destroy();
      await elapse(20);

      expect(router.url).toBe('/results');
    });

    it('lets a write that already started finish, and reports nothing after it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const onWriteFailure = vi.fn();
      const { form } = createIn(injector, () =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );

      const write = vi.spyOn(results, 'patchQuery');

      form.controls.search.setValue('elm');
      expect(write).toHaveBeenCalledWith({ search: 'elm' }, { replaceUrl: true });
      const cancelling = router.navigateByUrl('/results?page=2');
      injector.destroy();
      await cancelling;
      await elapse();

      expect(router.url).toBe('/results?page=2');
      expect(onWriteFailure).not.toHaveBeenCalled();
    });

    it('reports nothing for a write that fails after it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const onWriteFailure = vi.fn();
      const { form } = createIn(injector, () =>
        createQueryParamsFormGroup(results, { onWriteFailure }),
      );
      await router.navigateByUrl('/other');

      form.controls.search.setValue('elm');
      injector.destroy();
      await elapse();

      expect(onWriteFailure).not.toHaveBeenCalled();
    });

    it('writes once when a form outlives earlier bindings and is bound again', async () => {
      const { results, router } = await setup();
      const form = new FormGroup({
        search: new FormControl('', { nonNullable: true }),
        page: new FormControl(1, { nonNullable: true }),
      });
      for (let visit = 0; visit < 3; visit++) {
        const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
        createIn(injector, () => bindQueryParamsToFormGroup(results, form));
        injector.destroy();
      }
      const write = vi.spyOn(results, 'patchQuery');
      TestBed.runInInjectionContext(() => bindQueryParamsToFormGroup(results, form));

      form.controls.search.setValue('elm');
      await elapse();
      expect(router.url).toBe('/results?search=elm');
      expect(write).toHaveBeenCalledTimes(1);
    });

    it('stops following the URL when it is destroyed', async () => {
      const { results, router } = await setup();
      const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const { form } = createIn(injector, () => createQueryParamsFormGroup(results));

      injector.destroy();
      await router.navigateByUrl('/results?search=after');
      TestBed.flushEffects();

      expect(form.controls.search.value).toBe('');
    });
  });
});
