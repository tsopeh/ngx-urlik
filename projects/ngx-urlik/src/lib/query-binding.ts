type Query = Readonly<Record<string, unknown>>;
export interface QueryBinding<Q extends Query> {
  read(): Q | undefined;
  /** Whether two values of a field produce the same URL representation. */
  sameUrlValue(param: keyof Q, left: unknown, right: unknown): boolean;
  update(updater: (query: Q) => Q, options: { replaceUrl?: boolean }): Promise<boolean>;
}

const bindings = new WeakMap<object, QueryBinding<Query>>();
export function registerQueryBinding(ref: object, binding: QueryBinding<Query>): void {
  bindings.set(ref, binding);
}

/** @internal Connects the forms entry point to a generated route node. */
export function getQueryBinding<Q extends Query>(ref: object): QueryBinding<Q> {
  const binding = bindings.get(ref);
  if (!binding) throw new Error('Query forms require a generated ngx-urlik route node');
  return binding as QueryBinding<Q>;
}
