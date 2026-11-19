import type { CompiledParam } from './compiled-route';

export type AppRouterDiagnosticCode = 'PARAM_DESERIALIZE_FAILED' | 'PARAM_SERIALIZE_FAILED';

/** A codec that failed to read or write one parameter's value. */
export interface AppRouterDiagnostic {
  readonly code: AppRouterDiagnosticCode;
  readonly message: string;
  readonly route: string;
  readonly parameter: string;
  readonly operation: 'serialize' | 'deserialize';
  readonly cause?: unknown;
}

export interface AppRouterDiagnostics {
  warn(diagnostic: AppRouterDiagnostic): void;
}

type DiagnosticDetails = Omit<AppRouterDiagnostic, 'message' | 'route' | 'parameter'>;

export type ReportParameterFailure = (
  param: CompiledParam,
  details: DiagnosticDetails,
  detail: string,
) => void;

export function createDiagnosticReporter(
  diagnostics?: AppRouterDiagnostics,
): ReportParameterFailure {
  const warn = diagnostics?.warn ?? ((diagnostic) => console.warn(diagnostic.message));
  return (param, details, detail) => {
    const action = details.operation === 'deserialize' ? 'read' : 'write';
    warn({
      ...details,
      route: param.owner.label,
      parameter: param.name,
      message: `${param.owner.label}: can't ${action} ${param.placement} parameter '${param.name}': ${detail}`,
    });
  };
}
