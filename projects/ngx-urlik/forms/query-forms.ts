import {
  DestroyRef,
  effect,
  ErrorHandler,
  inject,
  Signal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { FieldTree, form as signalForm, SchemaOrSchemaFn } from '@angular/forms/signals';

type QueryState = Readonly<Record<string, unknown>>;
type QueryRoute<Q extends QueryState> = {
  readonly params: Signal<{ readonly path: unknown; readonly query: Q }>;
  patchQuery(patch: Partial<Q>, options?: { replaceUrl?: boolean }): Promise<boolean>;
};

export type QueryParamsFormControls<Q extends QueryState> = {
  [K in keyof Q]: FormControl<Q[K]>;
};

export type QueryWriteFailure =
  Readonly<{ kind: 'declined' }> | Readonly<{ kind: 'error'; error: unknown }>;

export interface QueryParamsBindingOptions<Q extends QueryState> {
  readonly replaceUrl?: boolean;
  /**
   * `'valid'` holds a field's draft until its validators pass, including async ones. The default,
   * `'always'`, writes every change.
   */
  readonly writeWhen?: 'always' | 'valid';
  /**
   * Changes a write right before it navigates. Gets the fields about to be written and the whole
   * draft. Returns the fields to write, such as the same patch plus `page: 1`.
   */
  readonly beforeWrite?: (patch: Partial<Q>, draft: Q) => Partial<Q>;
  readonly onWriteFailure?: (failure: QueryWriteFailure) => void;
}

export interface QueryParamsFormGroupOptions<
  Q extends QueryState,
> extends QueryParamsBindingOptions<Q> {
  /**
   * Milliseconds a field waits after its last change before it writes. Signal Forms use the
   * schema's `debounce()` rule instead.
   */
  readonly debounce?: { readonly [K in keyof Q]?: number };
}

type BindingAdapter<Q extends QueryState> = {
  reset(query: Q): void;
  /** Sets these fields in the form, without reporting them as a change. */
  write(changes: Changes<Q>): void;
  /** Whether a field's validators pass, with no async validator still running. */
  valid(param: keyof Q): boolean;
  changes(emit: (query: Q) => void): () => void;
  validityChanges(notify: () => void): () => void;
};

const fieldsOf = <Q extends QueryState>(query: Q) => Object.keys(query) as (keyof Q)[];

type Changes<Q extends QueryState> = { -readonly [K in keyof Q]?: Q[K] };

const sameFields = <Q extends QueryState>(a: Changes<Q>, b: Changes<Q>) =>
  Object.keys(a).length === Object.keys(b).length &&
  fieldsOf(a).every((param) => param in b && Object.is(a[param], b[param]));

const bindQueryParams = <Q extends QueryState>(
  route: QueryRoute<Q>,
  adapter: BindingAdapter<Q>,
  options: QueryParamsFormGroupOptions<Q>,
): void => {
  const destroyRef = inject(DestroyRef);
  const errorHandler = inject(ErrorHandler);
  // The route can go inactive before the binding is destroyed. The form then keeps its values.
  const read = (): Q | undefined => {
    try {
      return route.params().query;
    } catch {
      return undefined;
    }
  };
  // The values the binding compares with the URL. A Reactive Forms field with a debounce moves
  // into the model when its delay ends. Signal Forms run debounce() before their model.
  let model = route.params().query;
  // What the form showed after the last change the binding saw.
  let shown = model;
  // The URL values the form last took in. A field follows the URL only when its URL value changes,
  // so a navigation that changes other fields leaves a draft alone.
  let lastUrl = model;
  // Fields that writeWhen held back. They try again when the form's validity changes.
  const held = new Set<keyof Q>();
  const timers = new Map<keyof Q, ReturnType<typeof setTimeout>>();
  // Each write gets the next number. `running` is the newest write, until it settles.
  let writes = 0;
  let running: { readonly id: number; readonly fields: Changes<Q> } | null = null;
  let destroyed = false;
  adapter.reset(model);

  const reportFailure = (failure: QueryWriteFailure) => {
    if (options.onWriteFailure) {
      options.onWriteFailure(failure);
    } else if (failure.kind === 'error') {
      errorHandler.handleError(failure.error);
    }
  };

  const show = (changes: Changes<Q>) => {
    model = { ...model, ...changes };
    shown = { ...shown, ...changes };
    adapter.write(changes);
  };

  // A field the user hasn't touched since the write takes the URL's value. So a value that writes
  // the same text, like a sort picked again, stops differing from the URL.
  const takeWrittenValues = (fields: Changes<Q>) => {
    const url = read();
    if (!url) {
      return;
    }
    const changes: Changes<Q> = {};
    for (const param of fieldsOf(fields)) {
      const untouched =
        Object.is(model[param], fields[param]) && Object.is(shown[param], fields[param]);
      if (untouched && !Object.is(url[param], fields[param])) {
        changes[param] = url[param];
      }
    }
    if (fieldsOf(changes).length) {
      show(changes);
    }
  };

  const send = (fields: Changes<Q>) => {
    let patch: Partial<Q> = fields;
    const hasFields = fieldsOf(fields).length > 0;
    if (options.beforeWrite && hasFields) {
      try {
        patch = options.beforeWrite(fields, shown);
      } catch (error) {
        // Nothing is written, so the form keeps the draft and a later change can write it.
        errorHandler.handleError(error);
        return;
      }
    }
    const id = ++writes;
    running = { id, fields };
    const settle = () => {
      if (running?.id === id) {
        running = null;
      }
    };
    void route.patchQuery(patch, { replaceUrl: options.replaceUrl ?? true }).then(
      (result) => {
        if (destroyed) {
          return;
        }
        settle();
        if (result) {
          takeWrittenValues(fields);
        } else if (id === writes && hasFields) {
          // An older write was replaced by a newer one from this form, so it isn't a decline.
          reportFailure({ kind: 'declined' });
        }
      },
      (error: unknown) => {
        if (destroyed) {
          return;
        }
        settle();
        reportFailure({ kind: 'error', error });
      },
    );
  };

  // Writes every field whose model value differs from the URL, unless writeWhen holds it back.
  // The newest navigation wins, so each write carries all of them.
  const writeDraft = () => {
    if (destroyed) {
      return;
    }
    const url = read() ?? lastUrl;
    const fields: Changes<Q> = {};
    for (const param of fieldsOf(model)) {
      const differs = !Object.is(model[param], url[param]);
      const holdBack = differs && options.writeWhen === 'valid' && !adapter.valid(param);
      if (holdBack) {
        held.add(param);
      } else {
        held.delete(param);
      }
      if (differs && !holdBack) {
        fields[param] = model[param];
      }
    }
    // The same write again would change nothing. With no fields, a write still navigates to the
    // URL, so it cancels the form's earlier write, like typing 'x' and deleting it.
    const nothingNew = running ? sameFields(running.fields, fields) : !fieldsOf(fields).length;
    if (!nothingNew) {
      send(fields);
    }
  };

  const updateModel = (changes: Changes<Q>) => {
    const changed = fieldsOf(changes).some((param) => !Object.is(model[param], changes[param]));
    if (changed) {
      model = { ...model, ...changes };
      writeDraft();
    }
  };

  const followUrl = () => {
    const incoming = read();
    if (!incoming) {
      return;
    }
    const changes: Changes<Q> = {};
    for (const param of fieldsOf(incoming)) {
      const urlChanged = !Object.is(lastUrl[param], incoming[param]);
      const differs = !Object.is(model[param], incoming[param]);
      if (urlChanged && differs && !held.has(param)) {
        // A new URL value replaces an edit still waiting for its debounce, as in Signal Forms.
        clearTimeout(timers.get(param));
        timers.delete(param);
        changes[param] = incoming[param];
      }
    }
    lastUrl = incoming;
    if (fieldsOf(changes).length) {
      show(changes);
    }
  };

  const stopFormChanges = adapter.changes((next) => {
    const changes: Changes<Q> = {};
    for (const param of fieldsOf(next)) {
      if (Object.is(shown[param], next[param])) {
        continue;
      }
      const delay = options.debounce?.[param];
      if (delay === undefined) {
        changes[param] = next[param];
        continue;
      }
      clearTimeout(timers.get(param));
      timers.set(
        param,
        setTimeout(() => {
          timers.delete(param);
          updateModel({ [param]: shown[param] } as Changes<Q>);
        }, delay),
      );
    }
    shown = next;
    // Fields that changed together, and have no delay, go out in one navigation.
    updateModel(changes);
  });

  const stopValidityChanges = adapter.validityChanges(() => {
    const released = [...held].some((param) => adapter.valid(param));
    if (released) {
      writeDraft();
    }
  });

  // Follow params() in an effect, so the form takes in each committed navigation.
  const urlEffect = effect(() => followUrl());
  destroyRef.onDestroy(() => {
    destroyed = true;
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    stopFormChanges();
    stopValidityChanges();
    urlEffect.destroy();
  });
};

export function bindQueryParamsToFormGroup<Q extends QueryState>(
  route: QueryRoute<Q>,
  form: FormGroup<QueryParamsFormControls<Q>>,
  options: QueryParamsFormGroupOptions<Q> = {},
): void {
  bindQueryParams(
    route,
    {
      reset: (query) => form.reset(query as never, { emitEvent: false }),
      write: (changes) => form.patchValue(changes as never, { emitEvent: false }),
      valid: (param) => {
        const control = (form.controls as Record<keyof Q, AbstractControl>)[param];
        return !control.invalid && !control.pending;
      },
      changes: (emit) => {
        const subscription = form.valueChanges.subscribe(() => emit(form.getRawValue() as Q));
        return () => subscription.unsubscribe();
      },
      validityChanges: (notify) => {
        const subscription = form.statusChanges.subscribe(() => notify());
        return () => subscription.unsubscribe();
      },
    },
    options,
  );
}

export function createQueryParamsFormGroup<Q extends QueryState>(
  route: QueryRoute<Q>,
  options: QueryParamsFormGroupOptions<Q> = {},
): FormGroup<QueryParamsFormControls<Q>> {
  const query = route.params().query;
  const controls = Object.fromEntries(
    Object.entries(query).map(([param, value]) => [
      param,
      new FormControl(value, { nonNullable: true }),
    ]),
  ) as QueryParamsFormControls<Q>;
  const result = new FormGroup(controls);
  bindQueryParamsToFormGroup(route, result, options);
  return result;
}

type QueryFieldState = () => Readonly<{ valid(): boolean }>;

export function bindQueryParamsToSignalForm<Q extends QueryState>(
  route: QueryRoute<Q>,
  form: FieldTree<Q>,
  options: QueryParamsBindingOptions<Q> = {},
): void {
  const field = (param: keyof Q) =>
    (form as unknown as Record<PropertyKey, QueryFieldState>)[param]();
  bindQueryParams(
    route,
    {
      reset: (query) => form().reset(query as never),
      // The write runs inside the URL effect, which must not follow the form's value.
      write: (changes) =>
        untracked(() => form().value.set({ ...form().value(), ...changes } as never)),
      valid: (param) => untracked(() => field(param).valid()),
      changes: (emit) => {
        const watcher = effect(() => {
          const query = form().value();
          untracked(() => emit(query));
        });
        return () => watcher.destroy();
      },
      validityChanges: (notify) => {
        const watcher = effect(() => {
          for (const param of Object.keys(form().value())) {
            field(param).valid();
          }
          untracked(notify);
        });
        return () => watcher.destroy();
      },
    },
    options,
  );
}

export interface CreateQueryParamsSignalFormOptions<
  Q extends QueryState,
> extends QueryParamsBindingOptions<Q> {
  /** Validators and `debounce()` rules for the form. */
  readonly schema?: SchemaOrSchemaFn<Q>;
}

export function createQueryParamsSignalForm<Q extends QueryState>(
  route: QueryRoute<Q>,
  options: CreateQueryParamsSignalFormOptions<Q> = {},
): Readonly<{ model: WritableSignal<Q>; form: FieldTree<Q> }> {
  const model = signal(route.params().query) as WritableSignal<Q>;
  const result = options.schema ? signalForm(model, options.schema) : signalForm(model);
  bindQueryParamsToSignalForm(route, result, options);
  return { model, form: result };
}
