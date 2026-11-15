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
      'PARAM_DESERIALIZE_FAILED' | 'PARAM_SERIALIZE_FAILED' | 'PATCH_REPLACED'
    >();
    expectTypeOf<AppRouterDiagnostic['route']>().toEqualTypeOf<string>();
    type Parameter = Exclude<AppRouterDiagnostic, { code: 'PATCH_REPLACED' }>;
    expectTypeOf<Parameter['parameter']>().toEqualTypeOf<string>();
    expectTypeOf<Parameter['operation']>().toEqualTypeOf<'serialize' | 'deserialize'>();
    expectTypeOf<Parameter['cause']>().toEqualTypeOf<unknown>();
  });

  it('names the fields a replaced patch never wrote', () => {
    type Replaced = Extract<AppRouterDiagnostic, { code: 'PATCH_REPLACED' }>;
    expectTypeOf<Replaced['fields']>().toEqualTypeOf<readonly string[]>();
  });

  it('go to the warn function you pass to defineAppRouter()', () => {
    enum Names {}
    const diagnostics: AppRouterDiagnostics = {
      warn: (diagnostic) => expectTypeOf(diagnostic).toEqualTypeOf<AppRouterDiagnostic>(),
    };
    defineAppRouter(Names, { routes: [], diagnostics });
    defineAppRouter(Names, { routes: [], diagnostics: { replacedPatches: true } });
  });
});
