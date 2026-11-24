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
import { ɵqueryRouteSupport } from 'ngx-urlik';

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
   * Milliseconds to wait after the last keystroke before a field writes. Values set by code write
   * at once. Signal Forms use the schema's `debounce()` rule instead.
   */
  readonly debounce?: { readonly [K in keyof Q]?: number };
}

type SyncHost<Q extends QueryState> = {
  reset(query: Q): void;
  /** Sets these fields in the form, without reporting them as a change. */
  write(changes: Changes<Q>): void;
  /** Whether a field's validators pass, with no async validator still running. */
  valid(param: keyof Q): boolean;
  /** The form's current values, passed as `draft` to `beforeWrite`. */
  draft(): Q;
};

const fieldsOf = <Q extends QueryState>(query: Q) => Object.keys(query) as (keyof Q)[];

type Changes<Q extends QueryState> = { -readonly [K in keyof Q]?: Q[K] };

/**
 * Shared reconciliation between a form's model values and a route's query parameters. Form-system
 * details (Reactive Forms debounce timers, Signal Forms effects and submit actions) stay in each
 * binding function.
 */
function createQuerySync<Q extends QueryState>(
  route: QueryRoute<Q>,
  host: SyncHost<Q>,
  options: QueryParamsBindingOptions<Q>,
) {
  const destroyRef = inject(DestroyRef);
  const errorHandler = inject(ErrorHandler);
  const support = ɵqueryRouteSupport(route);
  const sameValue = (param: keyof Q, a: unknown, b: unknown) =>
    support ? support.sameValue(String(param), a, b) : Object.is(a, b);
  const sameFields = (a: Changes<Q>, b: Changes<Q>) =>
    Object.keys(a).length === Object.keys(b).length &&
    fieldsOf(a).every((param) => param in b && sameValue(param, a[param], b[param]));
  // The route can go inactive before the binding is destroyed. The form then keeps its values.
  const read = (): Q | undefined => {
    if (support) {
      return support.readIfActive() as Q | undefined;
    }
    try {
      return route.params().query;
    } catch {
      return undefined;
    }
  };

  let model = route.params().query;
  // The query parameter values the form last took in. A field follows its query parameter only
  // when that parameter changes, so a navigation that changes other query parameters leaves a
  // draft alone.
  let lastUrl = model;
  // Fields whose validators failed with writeOn: 'change'. They try again when the form's validity
  // changes.
  const invalid = new Set<keyof Q>();
  // Each write gets the next number. `running` is the newest write, until it settles.
  let writes = 0;
  let running: { readonly id: number; readonly patch: Partial<Q>; fields: Changes<Q> } | null =
    null;
  // Settles after the newest write does. An older write resolves as the newer one that carried it,
  // so waiting for the newest covers them all.
  let newestWrite: Promise<void> = Promise.resolve();
  let destroyed = false;
  host.reset(model);

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

  const followUrl = () => {
    const incoming = read();
    if (!incoming) {
      return;
    }
    const changes: Changes<Q> = {};
    for (const param of fieldsOf(incoming)) {
      const urlChanged = !sameValue(param, lastUrl[param], incoming[param]);
      const differs = !sameValue(param, model[param], incoming[param]);
      if (urlChanged && differs && !invalid.has(param)) {
        changes[param] = incoming[param];
      }
    }
    lastUrl = incoming;
    if (fieldsOf(changes).length) {
      model = { ...model, ...changes };
      host.write(changes);
    }
  };

  // When a field's model and draft still match what was written, it takes the URL's value, so a
  // clamped, unserializable, or null-cleared value doesn't stay in the form after the write
  // resolves true.
  const takeWrittenValues = (fields: Changes<Q>) => {
    const url = read();
    if (!url) {
      return;
    }
    const currentDraft = host.draft();
    const changes: Changes<Q> = {};
    for (const param of fieldsOf(fields)) {
      const matchesWrittenValue =
        Object.is(model[param], fields[param]) && Object.is(currentDraft[param], fields[param]);
      const shouldTakeUrlValue =
        matchesWrittenValue && !sameValue(param, url[param], fields[param]);
      if (shouldTakeUrlValue) {
        changes[param] = url[param];
      }
    }
    if (fieldsOf(changes).length) {
      model = { ...model, ...changes };
      host.write(changes);
    }
  };

  const send = (fields: Changes<Q>, patch: Partial<Q>) => {
    const hasFields = fieldsOf(fields).length > 0;
    const id = ++writes;
    const entry = { id, patch, fields };
    running = entry;
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
          takeWrittenValues(entry.fields);
        } else {
          const newestDeclined = id === writes && hasFields;
          if (newestDeclined) {
            // An older write was replaced by a newer one from this form, so it isn't a decline.
            reportFailure({ kind: 'declined' });
          }
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
      const differs = !sameValue(param, model[param], url[param]);
      const holdBack = differs && options.writeOn !== 'submit' && !host.valid(param);
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
        patch = options.beforeWrite(fields, host.draft());
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
    // The same write again would change nothing, so keep the running write and record the latest
    // written fields for takeWrittenValues().
    const nothingNew = running ? sameFields(running.patch, patch) : !fieldsOf(patch).length;
    if (nothingNew) {
      if (running) {
        running.fields = fields;
      }
    } else {
      send(fields, patch);
    }
  };

  const apply = (changes: Changes<Q>) => {
    const changed = fieldsOf(changes).some(
      (param) => !sameValue(param, model[param], changes[param]),
    );
    if (changed) {
      model = { ...model, ...changes };
      // With writeOn: 'submit', the edit waits in the model until the form is submitted.
      if (options.writeOn !== 'submit') {
        writeDraft();
      }
    }
  };

  const submit = async () => {
    if (options.writeOn === 'submit') {
      writeDraft();
    }
    await newestWrite;
  };

  return {
    sameValue,
    apply,
    checkValidity: () => {
      const released = [...invalid].some((param) => host.valid(param));
      if (released) {
        writeDraft();
      }
    },
    submit,
    finishWrite: (hasErrors: boolean) => (hasErrors ? newestWrite : submit()),
    /**
     * Reads `params()` in an effect and updates the form on changes. Call it after subscribing to
     * the form's changes.
     */
    start: (onDestroy: () => void) => {
      const urlEffect = effect(() => followUrl());
      destroyRef.onDestroy(() => {
        destroyed = true;
        onDestroy();
        urlEffect.destroy();
      });
    },
  };
}

// Angular calls a control's change listeners when code sets it, to show the value in its input, but
// not when the user types. They run before valueChanges. Angular has no public way to remove one,
// so each control registers one listener for its life, which forwards to the active bindings'
// listeners.
const listenersByControl = new WeakMap<FormControl<unknown>, Set<(value: unknown) => void>>();
const controlChangeListeners = (control: FormControl<unknown>) => {
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
  const timers = new Map<keyof Q, ReturnType<typeof setTimeout>>();
  const clearTimer = (param: keyof Q) => {
    clearTimeout(timers.get(param));
    timers.delete(param);
  };
  const readForm = () => form.getRawValue() as Q;
  let lastSeen!: Q;

  const sync = createQuerySync(
    route,
    {
      reset: (query) => {
        lastSeen = query;
        form.reset(query as never, { emitEvent: false });
      },
      write: (changes) => {
        for (const param of fieldsOf(changes)) {
          clearTimer(param);
        }
        lastSeen = { ...lastSeen, ...changes };
        form.patchValue(changes as never, { emitEvent: false });
      },
      valid: (param) => {
        const control = (form.controls as Record<keyof Q, AbstractControl>)[param];
        return !control.invalid && !control.pending;
      },
      draft: readForm,
    },
    options,
  );

  const flushTimers = () => {
    if (!timers.size) {
      return;
    }
    const waiting: Changes<Q> = {};
    const current = readForm();
    for (const [param, timer] of timers) {
      clearTimeout(timer);
      waiting[param] = current[param];
    }
    timers.clear();
    sync.apply(waiting);
  };

  const recordedCodeValues = new Map<keyof Q, unknown>();
  const controls = form.controls as Record<string, FormControl<unknown>>;
  const stopListening = Object.entries(controls).map(([param, control]) => {
    const listeners = controlChangeListeners(control);
    const listener = (value: unknown) => recordedCodeValues.set(param, value);
    listeners.add(listener);
    return () => listeners.delete(listener);
  });

  const valueSubscription = form.valueChanges.subscribe(() => {
    const next = readForm();
    // A set with emitEvent: false leaves its entry behind, so only a matching value counts.
    const fieldsSetByCode = new Set(
      fieldsOf(next).filter(
        (param) =>
          recordedCodeValues.has(param) && Object.is(recordedCodeValues.get(param), next[param]),
      ),
    );
    recordedCodeValues.clear();
    const immediate: Changes<Q> = {};
    for (const param of fieldsOf(next)) {
      const setByCode = fieldsSetByCode.has(param);
      const unchangedTyping = !setByCode && sync.sameValue(param, lastSeen[param], next[param]);
      if (unchangedTyping) {
        continue;
      }
      // As with Signal Forms' debounce(), only typing waits. A value set by code moves in right
      // away and replaces typing still waiting.
      const delay = setByCode ? undefined : options.debounce?.[param];
      if (delay === undefined) {
        clearTimer(param);
        immediate[param] = next[param];
        continue;
      }
      clearTimeout(timers.get(param));
      timers.set(
        param,
        setTimeout(() => {
          timers.delete(param);
          sync.apply({ [param]: readForm()[param] } as Changes<Q>);
        }, delay),
      );
    }
    lastSeen = next;
    sync.apply(immediate);
  });

  const statusSubscription = form.statusChanges.subscribe(() => sync.checkValidity());
  // A <form [formGroup]> sends this event when it's submitted. Like Signal Forms' submit(), a
  // pending async validator doesn't count as an error.
  const submitSubscription = form.events.subscribe((event) => {
    if (event instanceof FormSubmittedEvent) {
      flushTimers();
      if (!form.invalid) {
        void sync.submit();
      }
    }
  });

  sync.start(() => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    for (const stop of stopListening) {
      stop();
    }
    valueSubscription.unsubscribe();
    statusSubscription.unsubscribe();
    submitSubscription.unsubscribe();
  });

  return {
    write: () => {
      flushTimers();
      return sync.finishWrite(form.invalid);
    },
  };
}

export function createQueryParamsFormGroup<Q extends QueryState>(
  route: QueryRoute<Q>,
  options: QueryParamsFormGroupOptions<Q> = {},
): QueryParamsBinding & Readonly<{ form: FormGroup<QueryParamsFormControls<Q>> }> {
  const query = route.params().query;
  // A control resets to the value it's created with, so each starts at its field's default. The
  // binding then shows the query parameters' values.
  const defaults = ɵqueryRouteSupport(route)?.defaults;
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

  const sync = createQuerySync(
    route,
    {
      reset: (query) => form().reset(query as never),
      // The write runs inside the URL effect, which must not follow the form's value.
      write: (changes) =>
        untracked(() => form().value.set({ ...form().value(), ...changes } as never)),
      valid: (param) => untracked(() => field(param).valid()),
      draft: () => untracked(() => form().value()),
    },
    options,
  );

  const valueEffect = effect(() => {
    const query = form().value();
    untracked(() => sync.apply(query));
  });
  const validityEffect = effect(() => {
    for (const param of Object.keys(form().value())) {
      field(param).valid();
    }
    untracked(() => sync.checkValidity());
  });

  sync.start(() => {
    valueEffect.destroy();
    validityEffect.destroy();
  });

  return {
    write: () => {
      const state = untracked(form);
      // Inside Angular's submit(), its validator rules already allowed the write.
      const insideSubmit = untracked(state.submitting);
      // As submit() does, this ends every debounce() wait, so typing still waiting is written.
      // Inside submit(), it has already run, and running it again has no effect.
      state.markAsTouched();
      sync.apply(untracked(() => state.value()));
      // With writeOn: 'submit', the form's errors block the write, as in Reactive Forms. Read after
      // markAsTouched(), so the validators have seen the typing it moved into the model.
      const blockedByErrors = !insideSubmit && untracked(state.invalid);
      const written = sync.finishWrite(blockedByErrors);
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
