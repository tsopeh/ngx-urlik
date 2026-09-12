import { DestroyRef, ErrorHandler, WritableSignal, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { FieldTree, SchemaOrSchemaFn, form as signalForm } from '@angular/forms/signals';
import { Observable, Subject, Subscription } from 'rxjs';
import { isEqual, ɵgetQueryBinding, type UrlParamsRef } from 'ngx-urlik';

type QueryState = Readonly<Record<string, unknown>>;
type QueryRoute<Q extends QueryState> = { urlParams(): UrlParamsRef<unknown, Q> };

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
  const ref = route.urlParams();
  const binding = ɵgetQueryBinding<Q>(ref);
  let observed = binding.read() ?? ref.value().query;
  const owner = {};
  const staged = new Map<keyof Q, { revision: number; value: Q[keyof Q] }>();
  let revision = 0;
  let destroyed = false;
  let source = new Subject<QueryParamChange<Q>>();
  let outputSubscription: Subscription;
  adapter.reset(observed);

  const reportFailure = (failure: QueryWriteFailure) => {
    if (options.onWriteFailure) options.onWriteFailure(failure);
    else if (failure.kind === 'error') errorHandler.handleError(failure.error);
  };

  const connectOutput = () => {
    const output = options.transformWrites?.(source.asObservable()) ?? source;
    outputSubscription = output.subscribe({
      next: (change) => {
        const pending = staged.get(change.param);
        const submittedRevision = pending?.revision;
        const clearSubmitted = () => {
          if (staged.get(change.param)?.revision === submittedRevision) staged.delete(change.param);
        };
        void binding
          .update(
            (query) => ({ ...query, [change.param]: change.value }),
            { replaceUrl: options.replaceUrl ?? true },
            owner,
            clearSubmitted,
          )
          .then((result) => {
            if (!result && !destroyed) {
              reportFailure({ kind: 'declined' });
            }
          })
          .catch((error: unknown) => {
            if (!destroyed) {
              reportFailure({ kind: 'error', error });
            }
          });
      },
      error: (error: unknown) => errorHandler.handleError(error),
    });
  };
  connectOutput();

  const synchronize = (reset: boolean) => {
    const incoming = binding.read();
    if (!incoming) return;
    const next = { ...incoming };
    for (const [param, pending] of staged) next[param] = pending.value;
    if (reset || !isEqual(next, observed)) {
      observed = next;
      if (reset) adapter.reset(next);
      else adapter.write(next);
    }
  };

  const subscription = binding.coordinator.changes.subscribe((kind) => {
    if (kind === 'external') {
      outputSubscription.unsubscribe();
      source.complete();
      source = new Subject<QueryParamChange<Q>>();
      staged.clear();
      synchronize(true);
      connectOutput();
    } else synchronize(false);
  });

  const stopFormChanges = adapter.changes((next, metadata) => {
    for (const param of Object.keys(next) as (keyof Q)[]) {
      if (isEqual(observed[param], next[param])) continue;
      observed = { ...observed, [param]: next[param] };
      staged.set(param, { revision: ++revision, value: next[param] });
      source.next({
        param,
        value: next[param],
        query: next,
        ...metadata(param),
      } as QueryParamChange<Q>);
    }
  });

  // Also observe injection-aware defaults that can change without navigation.
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
  const query = route.urlParams().value().query;
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
  const model = signal(route.urlParams().value().query) as WritableSignal<Q>;
  const result = options.schema ? signalForm(model, options.schema) : signalForm(model);
  bindQueryParamsToSignalForm(route, result, options);
  return { model, form: result };
}
