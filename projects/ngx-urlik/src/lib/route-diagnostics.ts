import type { RuntimeParam } from './compiled-route';

export type AppRouterDiagnosticCode = 'PARAM_DESERIALIZE_FAILED' | 'PARAM_SERIALIZE_FAILED';

export interface AppRouterDiagnostic {
  readonly code: AppRouterDiagnosticCode;
  readonly message: string;
  readonly route: string;
  readonly parameter: string;
  readonly operation: 'serialize' | 'deserialize';
  readonly index?: number;
  readonly cause?: unknown;
}

export interface AppRouterDiagnostics {
  warn(diagnostic: AppRouterDiagnostic): void;
}

type DiagnosticDetails = Omit<AppRouterDiagnostic, 'message' | 'route' | 'parameter'>;

export type ReportParameterFailure = (
  param: RuntimeParam,
  details: DiagnosticDetails,
  detail: string,
) => void;

export function createDiagnosticReporter(
  diagnostics?: AppRouterDiagnostics,
): ReportParameterFailure {
  const warn =
    diagnostics?.warn ?? ((diagnostic: AppRouterDiagnostic) => console.warn(diagnostic.message));
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
