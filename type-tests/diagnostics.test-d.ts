import {
  type AppRouterDiagnostic,
  type AppRouterDiagnosticCode,
  type AppRouterDiagnostics,
  defineAppRouter,
} from 'ngx-urlik';
import { describe, expectTypeOf, it } from 'vitest';

describe('diagnostics', () => {
  it('names the code, the route, the parameter, and the operation', () => {
    expectTypeOf<AppRouterDiagnosticCode>().toEqualTypeOf<
      'PARAM_DESERIALIZE_FAILED' | 'PARAM_SERIALIZE_FAILED'
    >();
    expectTypeOf<AppRouterDiagnostic['route']>().toEqualTypeOf<string>();
    expectTypeOf<AppRouterDiagnostic['parameter']>().toEqualTypeOf<string>();
    expectTypeOf<AppRouterDiagnostic['operation']>().toEqualTypeOf<'serialize' | 'deserialize'>();
    expectTypeOf<AppRouterDiagnostic['cause']>().toEqualTypeOf<unknown>();
  });

  it('go to the warn function you pass to defineAppRouter()', () => {
    enum Names {}
    const diagnostics: AppRouterDiagnostics = {
      warn: (diagnostic) => expectTypeOf(diagnostic).toEqualTypeOf<AppRouterDiagnostic>(),
    };
    defineAppRouter(Names, { routes: [], diagnostics });
  });
});
