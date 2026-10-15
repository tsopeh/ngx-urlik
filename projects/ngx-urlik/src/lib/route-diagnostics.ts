import type { RuntimeParam } from './compiled-route';

export type AppRouterDiagnosticCode =
  | 'PARAM_DESERIALIZE_FAILED'
  | 'PARAM_SERIALIZE_FAILED'
  | 'STORED_VALUE_DESERIALIZE_FAILED'
  | 'UNKNOWN_PERSIST_KEY';

/** A diagnostic about one parameter's value. */
export interface AppRouterParameterDiagnostic {
  readonly code: Exclude<AppRouterDiagnosticCode, 'UNKNOWN_PERSIST_KEY'>;
  readonly message: string;
  readonly route: string;
  readonly parameter: string;
  readonly operation: 'serialize' | 'deserialize';
  readonly index?: number;
  readonly cause?: unknown;
  /** The storage key of a stored value. */
  readonly key?: string;
}

/** `clearPersisted()` received a key that no route declares. */
export interface AppRouterUnknownKeyDiagnostic {
  readonly code: 'UNKNOWN_PERSIST_KEY';
  readonly message: string;
  readonly key: string;
}

export type AppRouterDiagnostic = AppRouterParameterDiagnostic | AppRouterUnknownKeyDiagnostic;

export interface AppRouterDiagnostics {
  warn(diagnostic: AppRouterDiagnostic): void;
}

export type WarnDiagnostic = AppRouterDiagnostics['warn'];

type DiagnosticDetails = Omit<AppRouterParameterDiagnostic, 'message' | 'route' | 'parameter'>;

export type ReportParameterFailure = (
  param: RuntimeParam,
  details: DiagnosticDetails,
  detail: string,
) => void;

export function createDiagnosticWarn(diagnostics?: AppRouterDiagnostics): WarnDiagnostic {
  return diagnostics?.warn ?? ((diagnostic) => console.warn(diagnostic.message));
}

export function createDiagnosticReporter(warn: WarnDiagnostic): ReportParameterFailure {
  return (param, details, detail) => {
    const index = details.index === undefined ? '' : ` at index ${details.index}`;
    warn({
      ...details,
      route: param.owner.fullIdentity,
      parameter: param.name,
      message: `${param.owner.fullIdentity}: ${details.operation} ${param.placement} parameter '${param.name}'${index} ${detail}`,
    });
  };
}
