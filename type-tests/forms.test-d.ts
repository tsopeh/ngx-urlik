import type { WritableSignal } from '@angular/core';
import type { FormControl, FormGroup } from '@angular/forms';
import type { FieldTree } from '@angular/forms/signals';
import type { QueryParamsOf } from 'ngx-urlik';
import {
  bindQueryParamsToFormGroup,
  bindQueryParamsToSignalForm,
  createQueryParamsFormGroup,
  createQueryParamsSignalForm,
  type QueryParamsBinding,
  type QueryParamsFormControls,
  type QueryWriteFailure,
  type SignalFormQueryParamsBinding,
} from 'ngx-urlik/forms';
import { describe, expectTypeOf, it } from 'vitest';
import { appRouter } from './fixtures';

const { MEMBER } = appRouter.routes;
type MemberQuery = QueryParamsOf<typeof MEMBER>;

describe('createQueryParamsFormGroup()', () => {
  it("gives one control per query field, typed like the field's value", () => {
    const { form, write } = createQueryParamsFormGroup(MEMBER);
    expectTypeOf(form).toEqualTypeOf<FormGroup<QueryParamsFormControls<MemberQuery>>>();
    expectTypeOf(write).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(form.controls.page).toEqualTypeOf<FormControl<number | null>>();
    expectTypeOf(form.controls.locale).toEqualTypeOf<FormControl<string>>();
    expectTypeOf(form.controls.tags).toEqualTypeOf<FormControl<readonly string[]>>();
  });

  it('debounces only fields the route has', () => {
    createQueryParamsFormGroup(MEMBER, { debounce: { locale: 300 } });
    // @ts-expect-error `sort` isn't a field of this route
    createQueryParamsFormGroup(MEMBER, { debounce: { sort: 300 } });
  });

  it('binds an existing group whose controls match the fields', () => {
    const group = {} as FormGroup<QueryParamsFormControls<MemberQuery>>;
    expectTypeOf(bindQueryParamsToFormGroup(MEMBER, group)).toEqualTypeOf<QueryParamsBinding>();
  });
});

describe('createQueryParamsSignalForm()', () => {
  it('gives a writable model of the query, its field tree, write, and submitAction', () => {
    const { model, form, write, submitAction } = createQueryParamsSignalForm(MEMBER);
    expectTypeOf(model).toEqualTypeOf<WritableSignal<MemberQuery>>();
    expectTypeOf(form).toEqualTypeOf<FieldTree<MemberQuery>>();
    expectTypeOf(write).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(submitAction).toEqualTypeOf<() => Promise<void>>();
  });

  it('binds an existing form, and returns submitAction for its submit action', () => {
    const form = {} as FieldTree<MemberQuery>;
    const binding = bindQueryParamsToSignalForm(MEMBER, form);
    expectTypeOf(binding).toEqualTypeOf<SignalFormQueryParamsBinding>();
  });
});

describe('binding options', () => {
  it('beforeWrite gets the patch and the whole draft, and returns a patch', () => {
    createQueryParamsFormGroup(MEMBER, {
      beforeWrite: (patch, draft) => {
        expectTypeOf(patch).toEqualTypeOf<Partial<MemberQuery>>();
        expectTypeOf(draft).toEqualTypeOf<MemberQuery>();
        return 'locale' in patch ? { page: 1, ...patch } : patch;
      },
    });
  });

  it('writeOn is change or submit', () => {
    createQueryParamsSignalForm(MEMBER, { writeOn: 'change' });
    createQueryParamsFormGroup(MEMBER, { writeOn: 'submit' });
    // @ts-expect-error only 'change' and 'submit'
    createQueryParamsSignalForm(MEMBER, { writeOn: 'blur' });
  });

  it('onWriteFailure tells a decline from an error', () => {
    createQueryParamsFormGroup(MEMBER, {
      onWriteFailure: (failure) => {
        expectTypeOf(failure).toEqualTypeOf<QueryWriteFailure>();
        if (failure.kind === 'error') {
          expectTypeOf(failure.error).toEqualTypeOf<unknown>();
        }
      },
    });
  });

  it('debounce is a Reactive Forms option; Signal Forms use the schema', () => {
    // @ts-expect-error Signal Forms delay fields with the debounce() schema rule
    createQueryParamsSignalForm(MEMBER, { debounce: { locale: 300 } });
  });
});
