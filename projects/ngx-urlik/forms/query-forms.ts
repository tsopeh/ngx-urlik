import {
  DestroyRef,
  effect,
  ErrorHandler,
  inject,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { FieldTree, form as signalForm, SchemaOrSchemaFn } from '@angular/forms/signals';
import { isEqual, ɵgetQueryBinding } from 'ngx-urlik';
import { Observable, Subject, Subscription } from 'rxjs';

type QueryState = Readonly<Record<string, unknown>>;
type QueryRoute<Q extends QueryState> = { readonly params: Signal<{ readonly query: Q }> };

export type QueryParamsFormControls<Q extends QueryState> = {
  [K in keyof Q]: FormControl<Q[K]>;
};

export type QueryParamChange<Q extends QueryState> = {
  [K in keyof Q]: Readonly<{
    param: K;
    value: Q[K];
    query: Q;
    valid: boolean;
    pending: boolean;
    formValid: boolean;
    formPending: boolean;
  }>;
}[keyof Q];

export type QueryWriteFailure =
  Readonly<{ kind: 'declined' }> | Readonly<{ kind: 'error'; error: unknown }>;

export interface QueryParamsBindingOptions<Q extends QueryState> {
  readonly replaceUrl?: boolean;
  readonly transformWrites?: (
    changes: Observable<QueryParamChange<Q>>,
  ) => Observable<QueryParamChange<Q>>;
  readonly onWriteFailure?: (failure: QueryWriteFailure) => void;
}

type BindingAdapter<Q extends QueryState> = {
  reset(query: Q): void;
  write(query: Q): void;
  changes(emit: (query: Q, metadata: (param: keyof Q) => QueryChangeMetadata) => void): () => void;
};

type QueryChangeMetadata = Readonly<{
  valid: boolean;
  pending: boolean;
  formValid: boolean;
  formPending: boolean;
}>;

type QueryFieldState = () => Readonly<{
  valid(): boolean;
  pending(): boolean;
}>;

const bindQueryParams = <Q extends QueryState>(
  route: QueryRoute<Q>,
  adapter: BindingAdapter<Q>,
  options: QueryParamsBindingOptions<Q>,
): void => {
  const destroyRef = inject(DestroyRef);
  const errorHandler = inject(ErrorHandler);
  const binding = ɵgetQueryBinding<Q>(route);
  let observed = binding.read() ?? route.params().query;
  const owner = {};
  // Each edit identifies the draft that a write may acknowledge. Newer edits remain pending.
  type Edit = { value: Q[keyof Q] };
  const staged = new Map<keyof Q, Edit>();
  let destroyed = false;
  let source = new Subject<QueryParamChange<Q>>();
  let outputSubscription: Subscription;
  type SubmittedValue = { value: Q[keyof Q]; edit: Edit | undefined };
  let collecting: Map<keyof Q, SubmittedValue> | undefined;
  adapter.reset(observed);

  const reportFailure = (failure: QueryWriteFailure) => {
    if (options.onWriteFailure) options.onWriteFailure(failure);
    else if (failure.kind === 'error') errorHandler.handleError(failure.error);
  };

  const submit = (changes: Map<keyof Q, SubmittedValue>) => {
    if (!changes.size || destroyed) return;
    const patch = Object.fromEntries([...changes].map(([param, change]) => [param, change.value]));
    const clearSubmitted = () => {
      for (const [param, change] of changes) {
        if (staged.get(param) === change.edit) staged.delete(param);
      }
    };
    void binding
      .update(
        (query) => ({ ...query, ...patch }),
        { replaceUrl: options.replaceUrl ?? true },
        owner,
        clearSubmitted,
      )
      .then((result) => {
        if (!result && !destroyed) reportFailure({ kind: 'declined' });
      })
      .catch((error: unknown) => {
        if (!destroyed) reportFailure({ kind: 'error', error });
      });
  };

  const connectOutput = () => {
    const output = options.transformWrites?.(source.asObservable()) ?? source;
    outputSubscription = output.subscribe({
      next: (change) => {
        const submitted = {
          value: change.value,
          edit: staged.get(change.param),
        };
        if (collecting) collecting.set(change.param, submitted);
        else submit(new Map([[change.param, submitted]]));
      },
      error: (error: unknown) => errorHandler.handleError(error),
    });
  };
  connectOutput();

  const synchronize = (reset: boolean) => {
    const incoming = binding.read();
    if (!incoming) return;
    const next = { ...incoming };
    for (const param of Object.keys(next) as (keyof Q)[]) {
      const pending = staged.get(param);
      if (pending) next[param] = pending.value;
      // A draft that encodes to the committed value is already in the URL, such as 'elm ' with a
      // trimming codec. Keep what the user typed instead of replacing it mid-edit.
      else if (!reset && binding.sameUrlValue(param, observed[param], incoming[param]))
        next[param] = observed[param];
    }
    if (reset || !isEqual(next, observed)) {
      observed = next;
      if (reset) adapter.reset(next);
      else adapter.write(next);
    }
  };

  const subscription = binding.coordinator.changes.subscribe((kind) => {
    if (kind === 'external') {
      collecting?.clear();
      outputSubscription.unsubscribe();
      source.complete();
      source = new Subject<QueryParamChange<Q>>();
      staged.clear();
      synchronize(true);
      connectOutput();
    } else synchronize(false);
  });

  const stopFormChanges = adapter.changes((next, metadata) => {
    const changes: QueryParamChange<Q>[] = [];
    for (const param of Object.keys(next) as (keyof Q)[]) {
      if (isEqual(observed[param], next[param])) continue;
      staged.set(param, { value: next[param] });
      changes.push({
        param,
        value: next[param],
        query: next,
        ...metadata(param),
      } as QueryParamChange<Q>);
    }
    observed = next;
    // Synchronous outputs from this form notification share one navigation.
    // Delayed or filtered fields wait for their own notification.
    const batch = new Map<keyof Q, SubmittedValue>();
    const previous = collecting;
    const input = source;
    collecting = batch;
    try {
      for (const change of changes) input.next(change);
    } finally {
      collecting = previous;
      submit(batch);
    }
  });

  // Defaults can change through injection without a navigation, so observe them as well.
  const urlEffect = effect(() => synchronize(false));
  destroyRef.onDestroy(() => {
    destroyed = true;
    binding.coordinator.cancelOwner(owner);
    stopFormChanges();
    subscription.unsubscribe();
    outputSubscription.unsubscribe();
    source.complete();
    urlEffect.destroy();
  });
};

export function bindQueryParamsToFormGroup<Q extends QueryState>(
  route: QueryRoute<Q>,
  form: FormGroup<QueryParamsFormControls<Q>>,
  options: QueryParamsBindingOptions<Q> = {},
): void {
  bindQueryParams(
    route,
    {
      reset: (query) => form.reset(query as never, { emitEvent: false }),
      write: (query) => form.setValue(query as never, { emitEvent: false }),
      changes: (emit) => {
        const subscription = form.valueChanges.subscribe(() =>
          emit(form.getRawValue() as Q, (param) => ({
            valid: form.controls[param].valid,
            pending: form.controls[param].pending,
            formValid: form.valid,
            formPending: form.pending,
          })),
        );
        return () => subscription.unsubscribe();
      },
    },
    options,
  );
}

export function createQueryParamsFormGroup<Q extends QueryState>(
  route: QueryRoute<Q>,
  options: QueryParamsBindingOptions<Q> = {},
): FormGroup<QueryParamsFormControls<Q>> {
  const query = ɵgetQueryBinding<Q>(route).read() ?? route.params().query;
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

export function bindQueryParamsToSignalForm<Q extends QueryState>(
  route: QueryRoute<Q>,
  form: FieldTree<Q>,
  options: QueryParamsBindingOptions<Q> = {},
): void {
  bindQueryParams(
    route,
    {
      reset: (query) => form().reset(query as never),
      write: (query) => form().value.set(query as never),
      changes: (emit) => {
        const watcher = effect(() => {
          const query = form().value();
          emit(query, (param) => ({
            valid: (form as unknown as Record<PropertyKey, QueryFieldState>)[param]().valid(),
            pending: (form as unknown as Record<PropertyKey, QueryFieldState>)[param]().pending(),
            formValid: form().valid(),
            formPending: form().pending(),
          }));
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
  readonly schema?: SchemaOrSchemaFn<Q>;
}

export function createQueryParamsSignalForm<Q extends QueryState>(
  route: QueryRoute<Q>,
  options: CreateQueryParamsSignalFormOptions<Q> = {},
): Readonly<{ model: WritableSignal<Q>; form: FieldTree<Q> }> {
  const model = signal(
    ɵgetQueryBinding<Q>(route).read() ?? route.params().query,
  ) as WritableSignal<Q>;
  const result = options.schema ? signalForm(model, options.schema) : signalForm(model);
  bindQueryParamsToSignalForm(route, result, options);
  return { model, form: result };
}
