import {
  DestroyRef,
  EffectRef,
  ErrorHandler,
  WritableSignal,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { FieldTree, SchemaOrSchemaFn, form as signalForm } from '@angular/forms/signals';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';
import { Observable, Subject, Subscription } from 'rxjs';
import { isEqual, type UrlParamsRef } from 'ngx-urlik';

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
  const router = inject(Router);
  const ref = route.urlParams();
  let observed = ref.value().query;
  let desired = observed;
  let inFlight = false;
  let needsWrite = false;
  let capturingTarget: Q | undefined;
  let acceptedOwnTarget: Q | undefined;
  const ownNavigationTargets = new Map<number, Q>();
  let source = new Subject<QueryParamChange<Q>>();
  let outputSubscription: Subscription;

  adapter.reset(observed);

  const reportFailure = (failure: QueryWriteFailure) => {
    if (options.onWriteFailure) options.onWriteFailure(failure);
    else if (failure.kind === 'error') errorHandler.handleError(failure.error);
  };

  const write = () => {
    if (inFlight || !needsWrite) return;
    inFlight = true;
    needsWrite = false;
    const target = desired;
    capturingTarget = target;
    let navigation: Promise<boolean>;
    try {
      navigation = ref.updateQueryParams((query) => ({ ...query, ...target }), {
        replaceUrl: options.replaceUrl ?? true,
      });
    } finally {
      capturingTarget = undefined;
    }
    void navigation
      .then((result) => {
        if (!result) reportFailure({ kind: 'declined' });
      })
      .catch((error: unknown) => reportFailure({ kind: 'error', error }))
      .finally(() => {
        inFlight = false;
        write();
      });
  };

  const connectOutput = () => {
    const output = options.transformWrites?.(source.asObservable()) ?? source;
    outputSubscription = output.subscribe({
      next: (change) => {
        desired = { ...desired, [change.param]: change.value };
        needsWrite = true;
        write();
      },
      error: (error: unknown) => errorHandler.handleError(error),
    });
  };
  connectOutput();

  const resetToUrl = (incoming: Q) => {
    acceptedOwnTarget = undefined;
    outputSubscription.unsubscribe();
    source.complete();
    source = new Subject<QueryParamChange<Q>>();
    observed = incoming;
    desired = incoming;
    needsWrite = false;
    adapter.reset(incoming);
    connectOutput();
  };

  const stopFormChanges = adapter.changes((next, metadata) => {
    for (const param of Object.keys(next) as (keyof Q)[]) {
      if (isEqual(observed[param], next[param])) continue;
      observed = { ...observed, [param]: next[param] };
      source.next({
        param,
        value: next[param],
        query: next,
        ...metadata(param),
      } as QueryParamChange<Q>);
    }
  });

  const routerSubscription = router.events.subscribe((event) => {
    if (event instanceof NavigationStart && capturingTarget)
      ownNavigationTargets.set(event.id, capturingTarget);
    if (event instanceof NavigationEnd || event instanceof NavigationSkipped) {
      const ownTarget = ownNavigationTargets.get(event.id);
      ownNavigationTargets.delete(event.id);
      const incoming = ref.value().query;
      if (ownTarget && isEqual(incoming, ownTarget)) acceptedOwnTarget = incoming;
      else resetToUrl(incoming);
    } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
      ownNavigationTargets.delete(event.id);
    }
  });

  const urlEffect: EffectRef = effect(() => {
    const incoming = ref.value().query;
    if (isEqual(incoming, observed)) {
      if (acceptedOwnTarget && isEqual(incoming, acceptedOwnTarget)) acceptedOwnTarget = undefined;
      return;
    }
    if (acceptedOwnTarget && isEqual(incoming, acceptedOwnTarget)) {
      acceptedOwnTarget = undefined;
      return;
    }
    resetToUrl(incoming);
  });

  destroyRef.onDestroy(() => {
    stopFormChanges();
    routerSubscription.unsubscribe();
    outputSubscription.unsubscribe();
    source.complete();
    urlEffect.destroy();
    needsWrite = false;
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
