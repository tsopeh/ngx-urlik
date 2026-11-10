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
import { isEqual } from 'ngx-urlik';

type QueryState = Readonly<Record<string, unknown>>;
type QueryRoute<Q extends QueryState> = {
  readonly params: Signal<{ readonly query: Q }>;
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
   * Adjusts a write right before it navigates. Receives the fields about to be written and the
   * whole draft, and returns the fields to write, such as the same patch with `page: 1`.
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
  /** Whether a field's validators pass and none is pending. */
  valid(param: keyof Q): boolean;
  changes(emit: (query: Q) => void): () => void;
  validityChanges(notify: () => void): () => void;
};

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
  let observed = route.params().query;
  // The URL values the form last took in. A field follows the URL only when its URL value changes,
  // so a write from elsewhere leaves a field the user is typing in alone.
  let committed = observed;
  // Each edit identifies the draft that a write may acknowledge. Newer edits remain pending.
  type Edit = { value: Q[keyof Q] };
  const staged = new Map<keyof Q, Edit>();
  // Fields that writeWhen kept back; they write when the form's validity changes.
  const held = new Set<keyof Q>();
  const timers = new Map<keyof Q, ReturnType<typeof setTimeout>>();
  let destroyed = false;
  adapter.reset(observed);

  const reportFailure = (failure: QueryWriteFailure) => {
    if (options.onWriteFailure) options.onWriteFailure(failure);
    else if (failure.kind === 'error') errorHandler.handleError(failure.error);
  };

  const submit = (params: Iterable<keyof Q>) => {
    if (destroyed) return;
    const edits = new Map<keyof Q, Edit>();
    for (const param of params) {
      const edit = staged.get(param);
      if (!edit) continue;
      if (options.writeWhen === 'valid' && !adapter.valid(param)) held.add(param);
      else {
        held.delete(param);
        edits.set(param, edit);
      }
    }
    if (!edits.size) return;
    let patch = Object.fromEntries(
      [...edits].map(([param, edit]) => [param, edit.value]),
    ) as Partial<Q>;
    if (options.beforeWrite) {
      try {
        patch = options.beforeWrite(patch, observed);
      } catch (error) {
        // The edits stay staged, so the form keeps the draft and a later change can write it.
        errorHandler.handleError(error);
        return;
      }
    }
    // Once the write settles, the URL value counts as taken in, and the form keeps what the user
    // typed. With a trimming codec, 'elm ' stays in the input while the URL gets 'elm'. Fields that
    // beforeWrite adds aren't edits, so they come back from the URL.
    const settle = () => {
      const query = read();
      for (const [param, edit] of edits) {
        if (staged.get(param) !== edit) continue;
        staged.delete(param);
        if (query) committed = { ...committed, [param]: query[param] };
      }
    };
    void route.patchQuery(patch, { replaceUrl: options.replaceUrl ?? true }).then(
      (result) => {
        if (destroyed) return;
        settle();
        if (!result) reportFailure({ kind: 'declined' });
      },
      (error: unknown) => {
        if (destroyed) return;
        settle();
        reportFailure({ kind: 'error', error });
      },
    );
  };

  const synchronize = () => {
    const incoming = read();
    if (!incoming) return;
    const next = { ...observed };
    for (const param of Object.keys(incoming) as (keyof Q)[])
      if (!staged.has(param) && !isEqual(committed[param], incoming[param]))
        next[param] = incoming[param];
    committed = incoming;
    if (!isEqual(next, observed)) {
      observed = next;
      adapter.write(next);
    }
  };

  const stopFormChanges = adapter.changes((next) => {
    const immediate: (keyof Q)[] = [];
    for (const param of Object.keys(next) as (keyof Q)[]) {
      if (isEqual(observed[param], next[param])) continue;
      staged.set(param, { value: next[param] });
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
          submit([param]);
        }, delay),
      );
    }
    observed = next;
    // Immediate fields from one form notification share one navigation.
    submit(immediate);
  });

  const stopValidityChanges = adapter.validityChanges(() => {
    if (held.size) submit([...held]);
  });

  // Defaults can change through injection without a navigation, so observe them as well.
  const urlEffect = effect(() => synchronize());
  destroyRef.onDestroy(() => {
    destroyed = true;
    for (const timer of timers.values()) clearTimeout(timer);
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
          for (const param of Object.keys(form().value())) field(param).valid();
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
