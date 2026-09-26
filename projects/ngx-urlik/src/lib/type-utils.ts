export type AnyRecord = Readonly<Record<string, unknown>>;

export type Simplify<T> = { [K in keyof T]: T[K] };
