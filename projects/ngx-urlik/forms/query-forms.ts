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
import { AbstractControl, FormControl, FormGroup, FormSubmittedEvent } from '@angular/forms';
import { FieldTree, form as signalForm, SchemaOrSchemaFn } from '@angular/forms/signals';
import { ɵqueryDefaults } from 'ngx-urlik';

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
   * `'change'`, the default, writes each edited field once its validators pass, async ones
   * included. Until then, the URL keeps the field's old value. `'submit'` writes every edit, typed
   * or set by code, only when the form is submitted without errors.
   */
  readonly writeOn?: 'change' | 'submit';
  /**
   * Runs right before a write navigates. Gets the fields about to be written and the whole draft.
   * Returns the fields to write, such as the patch plus `minRating: 0`.
   */
  readonly beforeWrite?: (patch: Partial<Q>, draft: Q) => Partial<Q>;
  readonly onWriteFailure?: (failure: QueryWriteFailure) => void;
}

export interface QueryParamsBinding {
  /**
   * Does what a submit does. It writes typing still waiting for its debounce. With
   * `writeOn: 'change'`, it writes each field whose validators pass. With `writeOn: 'submit'`, it
   * writes the whole draft, unless the form has errors. Resolves once the form's newest write
   * settles, even one that was already running.
   *
   * As a Signal Form's submit action, it resolves once the write starts. Angular ignores a submit
   * while the last one runs, so waiting longer would drop the user's next submit.
   */
  readonly write: () => Promise<void>;
}

export interface QueryParamsFormGroupOptions<
  Q extends QueryState,
> extends QueryParamsBindingOptions<Q> {
  /**
   * Milliseconds a field waits after the user's last keystroke before it writes. A value set by
   * code writes right away. Signal Forms use the schema's `debounce()` rule instead.
   */
  readonly debounce?: { readonly [K in keyof Q]?: number };
}

type BindingAdapter<Q extends QueryState> = {
  reset(query: Q): void;
  /** Sets these fields in the form, without reporting them as a change. */
  write(changes: Changes<Q>): void;
  /** Whether a field's validators pass, with no async validator still running. */
  valid(param: keyof Q): boolean;
  /** Reports each change, with the fields that code set rather than the user typed. */
  changes(emit: (query: Q, setByCode?: ReadonlySet<keyof Q>) => void): () => void;
  /**
   * The form's value right now. Signal Forms report changes from an effect, and a submit action runs
   * before that effect sees the latest value.
   */
  current?(): Q;
  validityChanges(notify: () => void): () => void;
  /**
   * Reports each submit, and whether the form had errors. Signal Forms leave this out: their
   * submit() ends any wait, and runs the form's submit action only without errors.
   */
  submits?(notify: (hasErrors: boolean) => void): () => void;
};

const fieldsOf = <Q extends QueryState>(query: Q) => Object.keys(query) as (keyof Q)[];

type Changes<Q extends QueryState> = { -readonly [K in keyof Q]?: Q[K] };

const sameFields = <Q extends QueryState>(a: Changes<Q>, b: Changes<Q>) =>
  Object.keys(a).length === Object.keys(b).length &&
  fieldsOf(a).every((param) => param in b && Object.is(a[param], b[param]));

/** Does what a submit does, and resolves once the form's newest write settles. */
type SubmitWrite = (hasErrors: boolean) => Promise<void>;

const bindQueryParams = <Q extends QueryState>(
  route: QueryRoute<Q>,
  adapter: BindingAdapter<Q>,
  options: QueryParamsFormGroupOptions<Q>,
): SubmitWrite => {
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
  // The values the binding compares with the query parameters. Typing into a Reactive Forms field
  // with a debounce moves into the model when its delay ends. Signal Forms run debounce() before
  // their model.
  let model = route.params().query;
  // What the form showed after the last change the binding saw.
  let shown = model;
  // The query parameter values the form last took in. A field follows its query parameter only
  // when that parameter changes, so a navigation that changes other query parameters leaves a
  // draft alone.
  let lastUrl = model;
  // Fields whose validators failed with writeOn: 'change'. They try again when the form's validity
  // changes.
  const invalid = new Set<keyof Q>();
  const timers = new Map<keyof Q, ReturnType<typeof setTimeout>>();
  // Each write gets the next number. `running` is the newest write, until it settles.
  let writes = 0;
  let running: { readonly id: number; readonly patch: Partial<Q> } | null = null;
  // Settles after the newest write does. An older write resolves as the newer one that carried it,
  // so waiting for the newest covers them all.
  let newestWrite: Promise<void> = Promise.resolve();
  let destroyed = false;
  adapter.reset(model);

  const reportFailure = (failure: QueryWriteFailure) => {
    if (options.onWriteFailure) {
      // An error the callback throws goes to ErrorHandler, so write() still resolves.
      try {
        options.onWriteFailure(failure);
      } catch (error) {
        errorHandler.handleError(error);
      }
    } else if (failure.kind === 'error') {
      errorHandler.handleError(failure.error);
    }
  };

  const show = (changes: Changes<Q>) => {
    model = { ...model, ...changes };
    shown = { ...shown, ...changes };
    adapter.write(changes);
  };

  // A field the user hasn't touched since the write takes its query parameter's value. So a value
  // that writes the same text, like a sort picked again, stops differing from its query parameter.
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

  const send = (fields: Changes<Q>, patch: Partial<Q>) => {
    const hasFields = fieldsOf(fields).length > 0;
    const id = ++writes;
    running = { id, patch };
    const settle = () => {
      if (running?.id === id) {
        running = null;
      }
    };
    newestWrite = route.patchQuery(patch, { replaceUrl: options.replaceUrl ?? true }).then(
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

  // Writes every field whose model value differs from the URL. With writeOn: 'change', a field
  // whose validators fail waits. With writeOn: 'submit', the submit already checked the whole form.
  const writeDraft = () => {
    if (destroyed) {
      return;
    }
    // Take in URL changes the effect hasn't seen yet. Otherwise a field nobody edited would be
    // written back over a patch that just reached the URL.
    followUrl();
    const url = read() ?? lastUrl;
    const fields: Changes<Q> = {};
    for (const param of fieldsOf(model)) {
      const differs = !Object.is(model[param], url[param]);
      const holdBack = differs && options.writeOn !== 'submit' && !adapter.valid(param);
      if (holdBack) {
        invalid.add(param);
      } else {
        invalid.delete(param);
      }
      if (differs && !holdBack) {
        fields[param] = model[param];
      }
    }
    let patch: Partial<Q> = fields;
    if (options.beforeWrite && fieldsOf(fields).length) {
      try {
        patch = options.beforeWrite(fields, shown);
      } catch (error) {
        // The URL doesn't change, so the form keeps the draft and a later change can write it.
        errorHandler.handleError(error);
        return;
      }
    }
    // A patch builds on the one still running, so a field the running write set and this one
    // leaves out goes back to its query parameter's value, like typing 'x' and deleting it.
    if (running) {
      const undo: Changes<Q> = {};
      for (const param of fieldsOf(running.patch as Changes<Q>)) {
        if (!(param in patch)) {
          undo[param] = url[param];
        }
      }
      patch = { ...undo, ...patch };
    }
    // The same write again would change nothing.
    const nothingNew = running ? sameFields(running.patch, patch) : !fieldsOf(patch).length;
    if (!nothingNew) {
      send(fields, patch);
    }
  };

  const updateModel = (changes: Changes<Q>) => {
    const changed = fieldsOf(changes).some((param) => !Object.is(model[param], changes[param]));
    if (changed) {
      model = { ...model, ...changes };
      // With writeOn: 'submit', the edit waits in the model until the form is submitted.
      if (options.writeOn !== 'submit') {
        writeDraft();
      }
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
      if (urlChanged && differs && !invalid.has(param)) {
        // A new query parameter value replaces an edit still waiting for its debounce, as in Signal
        // Forms. If the timer kept running, it would write `shown`, which show() sets to the new
        // value, so no test can see this clear. Clearing it drops the edit without relying on that.
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

  const formChanged = (next: Q, setByCode?: ReadonlySet<keyof Q>) => {
    const changes: Changes<Q> = {};
    for (const param of fieldsOf(next)) {
      const fromCode = setByCode?.has(param) ?? false;
      if (!fromCode && Object.is(shown[param], next[param])) {
        continue;
      }
      // As with Signal Forms' debounce(), only typing waits. A value set by code moves in right
      // away and replaces typing still waiting.
      const delay = fromCode ? undefined : options.debounce?.[param];
      if (delay === undefined) {
        // A value set by code replaces typing still waiting. Left running, the timer would write
        // `shown`, which already holds the new value, so no test can see this clear. Clearing it
        // drops the typing without relying on that, as followUrl() does.
        clearTimeout(timers.get(param));
        timers.delete(param);
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
    updateModel(changes);
  };
  const stopFormChanges = adapter.changes(formChanged);

  // Submitting ends every debounce wait, as Signal Forms' submit() does. With writeOn: 'change',
  // each field whose validators pass is then written. With writeOn: 'submit', the whole draft is
  // written, unless the form has errors. It resolves once the form's newest write settles, whether
  // the submit started it or not.
  const submitted = async (hasErrors: boolean) => {
    const latest = adapter.current?.();
    if (latest) {
      formChanged(latest);
    }
    const waiting: Changes<Q> = {};
    for (const [param, timer] of timers) {
      clearTimeout(timer);
      waiting[param] = shown[param];
    }
    timers.clear();
    updateModel(waiting);
    if (options.writeOn === 'submit' && !hasErrors) {
      writeDraft();
    }
    await newestWrite;
  };
  const stopSubmits = adapter.submits?.((hasErrors) => void submitted(hasErrors));

  const stopValidityChanges = adapter.validityChanges(() => {
    const released = [...invalid].some((param) => adapter.valid(param));
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
    stopSubmits?.();
    stopValidityChanges();
    urlEffect.destroy();
  });
  return submitted;
};

// Angular calls a control's change listeners when code sets it, to show the value in its input, but
// not when the user types. They run before valueChanges. Angular has no public way to remove one,
// so each control gets a single listener for its life, and bindings add and remove theirs behind it.
const listenersByControl = new WeakMap<FormControl<unknown>, Set<(value: unknown) => void>>();
const setByCodeListeners = (control: FormControl<unknown>) => {
  const existing = listenersByControl.get(control);
  if (existing) {
    return existing;
  }
  const listeners = new Set<(value: unknown) => void>();
  control.registerOnChange((value: unknown) => {
    for (const listener of listeners) {
      listener(value);
    }
  });
  listenersByControl.set(control, listeners);
  return listeners;
};

export function bindQueryParamsToFormGroup<Q extends QueryState>(
  route: QueryRoute<Q>,
  form: FormGroup<QueryParamsFormControls<Q>>,
  options: QueryParamsFormGroupOptions<Q> = {},
): QueryParamsBinding {
  const submitted = bindQueryParams(
    route,
    {
      reset: (query) => form.reset(query as never, { emitEvent: false }),
      write: (changes) => form.patchValue(changes as never, { emitEvent: false }),
      valid: (param) => {
        const control = (form.controls as Record<keyof Q, AbstractControl>)[param];
        return !control.invalid && !control.pending;
      },
      changes: (emit) => {
        const setByCode = new Map<keyof Q, unknown>();
        const controls = form.controls as Record<string, FormControl<unknown>>;
        const stopListening = Object.entries(controls).map(([param, control]) => {
          const listeners = setByCodeListeners(control);
          const listener = (value: unknown) => setByCode.set(param, value);
          listeners.add(listener);
          return () => listeners.delete(listener);
        });
        const subscription = form.valueChanges.subscribe(() => {
          const query = form.getRawValue() as Q;
          // A set with emitEvent: false leaves its entry behind, so only a matching value counts.
          const fromCode = new Set(
            fieldsOf(query).filter(
              (param) => setByCode.has(param) && Object.is(setByCode.get(param), query[param]),
            ),
          );
          setByCode.clear();
          emit(query, fromCode);
        });
        return () => {
          subscription.unsubscribe();
          for (const stop of stopListening) {
            stop();
          }
        };
      },
      validityChanges: (notify) => {
        const subscription = form.statusChanges.subscribe(() => notify());
        return () => subscription.unsubscribe();
      },
      // A <form [formGroup]> sends this event when it's submitted. Like Signal Forms' submit(), a
      // pending async validator doesn't count as an error.
      submits: (notify) => {
        const subscription = form.events.subscribe((event) => {
          if (event instanceof FormSubmittedEvent) {
            notify(form.invalid);
          }
        });
        return () => subscription.unsubscribe();
      },
    },
    options,
  );
  // A pending async validator doesn't count as an error, as on submit.
  return { write: () => submitted(form.invalid) };
}

export function createQueryParamsFormGroup<Q extends QueryState>(
  route: QueryRoute<Q>,
  options: QueryParamsFormGroupOptions<Q> = {},
): QueryParamsBinding & Readonly<{ form: FormGroup<QueryParamsFormControls<Q>> }> {
  const query = route.params().query;
  // A control resets to the value it's created with, so each starts at its field's default. The
  // binding then shows the query parameters' values.
  const defaults = ɵqueryDefaults(route);
  const controls = Object.fromEntries(
    Object.entries(query).map(([param, value]) => {
      const initial = defaults && Object.hasOwn(defaults, param) ? defaults[param] : value;
      return [param, new FormControl(initial, { nonNullable: true })];
    }),
  ) as QueryParamsFormControls<Q>;
  const form = new FormGroup(controls);
  return { form, ...bindQueryParamsToFormGroup(route, form, options) };
}

type QueryFieldState = () => Readonly<{ valid(): boolean }>;

/**
 * Binds a Signal Form you created to the route's query. With `writeOn: 'submit'`, make the
 * returned `write` the form's submit action, as in
 * `form(model, { submission: { action: () => binding.write() } })`.
 */
export function bindQueryParamsToSignalForm<Q extends QueryState>(
  route: QueryRoute<Q>,
  form: FieldTree<Q>,
  options: QueryParamsBindingOptions<Q> = {},
): QueryParamsBinding {
  const field = (param: keyof Q) =>
    (form as unknown as Record<PropertyKey, QueryFieldState>)[param]();
  const submitted = bindQueryParams(
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
      current: () => untracked(() => form().value()),
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
  return {
    write: () => {
      const state = untracked(form);
      // Inside Angular's submit(), its validator rules already allowed the write.
      const insideSubmit = untracked(state.submitting);
      // As submit() does, this ends every debounce() wait, so typing still waiting is written.
      // Inside submit(), it has already run, and running it again has no effect.
      state.markAsTouched();
      // With writeOn: 'submit', the form's errors block the write, as in Reactive Forms. Read after
      // markAsTouched(), so the validators have seen the typing it moved into the model.
      const written = submitted(!insideSubmit && untracked(state.invalid));
      // Angular ignores a submit while the last one runs, so the user's next submit would be lost
      // while a slow page loads. The submit ends once the write has started.
      return insideSubmit ? Promise.resolve() : written;
    },
  };
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
): QueryParamsBinding & Readonly<{ model: WritableSignal<Q>; form: FieldTree<Q> }> {
  const model = signal(route.params().query) as WritableSignal<Q>;
  // With writeOn: 'submit', submitting a <form [formRoot]>, or calling submit(), writes the draft.
  // The action runs only once the binding below exists.
  const formOptions =
    options.writeOn === 'submit' ? { submission: { action: () => binding.write() } } : {};
  const result = options.schema
    ? signalForm(model, options.schema, formOptions)
    : signalForm(model, formOptions);
  const binding: QueryParamsBinding = bindQueryParamsToSignalForm(route, result, options);
  return { model, form: result, ...binding };
}
