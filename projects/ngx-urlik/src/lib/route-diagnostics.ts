import type { CompiledParam } from './compiled-route';

export type AppRouterDiagnosticCode =
  'PARAM_DESERIALIZE_FAILED' | 'PARAM_SERIALIZE_FAILED' | 'PATCH_REPLACED';

/** A problem with one parameter's value. */
export interface ParameterDiagnostic {
  readonly code: 'PARAM_DESERIALIZE_FAILED' | 'PARAM_SERIALIZE_FAILED';
  readonly message: string;
  readonly route: string;
  readonly parameter: string;
  readonly operation: 'serialize' | 'deserialize';
  readonly cause?: unknown;
}

/** A patch that cancelled a running patch, with the fields the cancelled one didn't get to write. */
export interface ReplacedPatchDiagnostic {
  readonly code: 'PATCH_REPLACED';
  readonly message: string;
  readonly route: string;
  readonly fields: readonly string[];
}

export type AppRouterDiagnostic = ParameterDiagnostic | ReplacedPatchDiagnostic;

export interface AppRouterDiagnostics {
  /** Gets every diagnostic. Without it, each message goes to `console.warn`. */
  warn?(diagnostic: AppRouterDiagnostic): void;
  /**
   * Reports `PATCH_REPLACED` when a patch cancels a running patch whose fields it doesn't set, so
   * those fields never reach the URL. Off unless `true`.
   */
  readonly replacedPatches?: boolean;
}

type DiagnosticDetails = Omit<ParameterDiagnostic, 'message' | 'route' | 'parameter'>;

export type ReportParameterFailure = (
  param: CompiledParam,
  details: DiagnosticDetails,
  detail: string,
) => void;

/** Reports the fields a cancelled patch didn't write. `route` is the label of the patched route. */
export type ReportReplacedPatch = (route: string, fields: readonly string[]) => void;

const warnWith = (diagnostics?: AppRouterDiagnostics) =>
  diagnostics?.warn ?? ((diagnostic: AppRouterDiagnostic) => console.warn(diagnostic.message));

/** `undefined` unless the app turned `replacedPatches` on, so patches skip the check. */
export function createReplacedPatchReporter(
  diagnostics?: AppRouterDiagnostics,
): ReportReplacedPatch | undefined {
  if (diagnostics?.replacedPatches !== true) {
    return undefined;
  }
  const warn = warnWith(diagnostics);
  return (route, fields) => {
    const names = fields.map((field) => `'${field}'`).join(', ');
    warn({
      code: 'PATCH_REPLACED',
      route,
      fields,
      message: `${route}: patchQuery() cancelled a patch that was still running, so ${names} never reached the URL. Put fields that change together in one patch.`,
    });
  };
}

export function createDiagnosticReporter(
  diagnostics?: AppRouterDiagnostics,
): ReportParameterFailure {
  const warn = warnWith(diagnostics);
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
