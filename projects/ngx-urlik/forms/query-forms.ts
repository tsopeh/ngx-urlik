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
import { FormControl, FormGroup } from '@angular/forms';
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
  write(query: Q): void;
  /** Whether a field's validators pass, with no async validator still running. */
  valid(param: keyof Q): boolean;
  changes(emit: (query: Q) => void): () => void;
  validityChanges(notify: () => void): () => void;
};

const fieldsOf = <Q extends QueryState>(query: Q) => Object.keys(query) as (keyof Q)[];

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
  // params() keeps a field's value while its URL text stays the same, and form controls keep a
  // value until the user edits it. So `Object.is` tells which fields changed.
  let formValue = route.params().query;
  // The URL values the form last took in. A field follows the URL only when its URL value changes,
  // so a write from elsewhere leaves a field the user is typing in alone.
  let lastUrl = formValue;
  // Each edit is its own object. A write clears only the edits it sent, so a newer edit stays.
  type Edit = { value: Q[keyof Q] };
  const pending = new Map<keyof Q, Edit>();
  // Fields that writeWhen held back. They try again when the form's validity changes.
  const held = new Set<keyof Q>();
  // How many writes that carry each field are still running.
  const sending = new Map<keyof Q, number>();
  const timers = new Map<keyof Q, ReturnType<typeof setTimeout>>();
  let destroyed = false;
  adapter.reset(formValue);

  const reportFailure = (failure: QueryWriteFailure) => {
    if (options.onWriteFailure) {
      options.onWriteFailure(failure);
    } else if (failure.kind === 'error') {
      errorHandler.handleError(failure.error);
    }
  };

  const countSending = (params: Iterable<keyof Q>, change: 1 | -1) => {
    for (const param of params) {
      sending.set(param, (sending.get(param) ?? 0) + change);
    }
  };

  /** The pending edits of these fields that should write now. */
  const editsToWrite = (params: Iterable<keyof Q>) => {
    const edits = new Map<keyof Q, Edit>();
    for (const param of params) {
      const edit = pending.get(param);
      if (!edit) {
        continue;
      }
      const holdBack = options.writeWhen === 'valid' && !adapter.valid(param);
      if (holdBack) {
        held.add(param);
      } else {
        held.delete(param);
        edits.set(param, edit);
      }
    }
    // An edit back to the URL's value, like typing 'x' and deleting it, has nothing to write. It
    // writes anyway while another write of that field runs, so it can cancel that one.
    const current = read();
    for (const [param, edit] of edits) {
      const backAtUrlValue = current !== undefined && Object.is(current[param], edit.value);
      const writing = (sending.get(param) ?? 0) > 0;
      if (backAtUrlValue && !writing) {
        edits.delete(param);
        pending.delete(param);
        lastUrl = { ...lastUrl, [param]: current[param] };
      }
    }
    return edits;
  };

  const send = (edits: ReadonlyMap<keyof Q, Edit>) => {
    let patch = Object.fromEntries(
      [...edits].map(([param, edit]) => [param, edit.value]),
    ) as Partial<Q>;
    if (options.beforeWrite) {
      try {
        patch = options.beforeWrite(patch, formValue);
      } catch (error) {
        // The edits stay pending, so the form keeps the draft and a later change can write it.
        errorHandler.handleError(error);
        return;
      }
    }
    // A field the user edited again has a newer write, which reports its own failure.
    const stillPending = () => [...edits].some(([param, edit]) => pending.get(param) === edit);
    // Once the write settles, the URL value counts as taken in, and the form keeps what the user
    // typed. With a trimming codec, 'elm ' stays in the input while the URL gets 'elm'. Fields that
    // beforeWrite adds aren't edits, so they come back from the URL. A field edited again takes in
    // the value too, so this write doesn't pass for a navigation from elsewhere.
    const settle = () => {
      countSending(edits.keys(), -1);
      const query = read();
      for (const [param, edit] of edits) {
        if (query) {
          lastUrl = { ...lastUrl, [param]: query[param] };
        }
        const editedAgain = pending.get(param) !== edit;
        if (!editedAgain) {
          pending.delete(param);
        }
      }
    };
    countSending(edits.keys(), 1);
    void route.patchQuery(patch, { replaceUrl: options.replaceUrl ?? true }).then(
      (result) => {
        if (destroyed) {
          return;
        }
        const declined = !result && stillPending();
        settle();
        if (declined) {
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

  const writeFields = (params: Iterable<keyof Q>) => {
    if (destroyed) {
      return;
    }
    const edits = editsToWrite(params);
    if (edits.size) {
      send(edits);
    }
  };

  const followUrl = () => {
    const incoming = read();
    if (!incoming) {
      return;
    }
    const next = { ...formValue };
    for (const param of fieldsOf(incoming)) {
      const urlChanged = !Object.is(lastUrl[param], incoming[param]);
      // A navigation from elsewhere, like Back, replaces an edit still waiting for its debounce, as
      // Signal Forms' debounce() does. While a write of the field runs, the change may be that
      // write, so the edit stays.
      const replacesWaitingEdit =
        urlChanged && timers.has(param) && (sending.get(param) ?? 0) === 0;
      if (replacesWaitingEdit) {
        clearTimeout(timers.get(param));
        timers.delete(param);
        pending.delete(param);
      }
      const editing = pending.has(param);
      if (urlChanged && !editing) {
        next[param] = incoming[param];
      }
    }
    lastUrl = incoming;
    const formChanges = fieldsOf(next).some((param) => !Object.is(next[param], formValue[param]));
    if (formChanges) {
      formValue = next;
      adapter.write(next);
    }
  };

  const stopFormChanges = adapter.changes((next) => {
    const immediate: (keyof Q)[] = [];
    for (const param of fieldsOf(next)) {
      const unchanged = Object.is(formValue[param], next[param]);
      if (unchanged) {
        continue;
      }
      pending.set(param, { value: next[param] });
      held.delete(param);
      const delay = options.debounce?.[param];
      if (delay === undefined) {
        immediate.push(param);
        continue;
      }
      clearTimeout(timers.get(param));
      timers.set(
        param,
        setTimeout(() => {
          timers.delete(param);
          writeFields([param]);
        }, delay),
      );
    }
    formValue = next;
    // Fields that changed together, and have no delay, go out in one navigation.
    writeFields(immediate);
  });

  const stopValidityChanges = adapter.validityChanges(() => {
    if (held.size) {
      writeFields([...held]);
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
      write: (query) => form.setValue(query as never, { emitEvent: false }),
      valid: (param) => form.controls[param].valid,
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
      write: (query) => form().value.set(query as never),
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
