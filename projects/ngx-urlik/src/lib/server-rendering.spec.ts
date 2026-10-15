import { Component, computed, inject, InjectionToken } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { RouterOutlet } from '@angular/router';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec } from './params';

enum RouteNames {
  ITEM = 'ITEM',
  LIST = 'LIST',
}

// The page reads the router through a token so its class can be declared before the router.
const ItemLabel = new InjectionToken<() => string>('ItemLabel');

@Component({ selector: 'item-page', template: '<p>{{ label() }}</p>' })
class ItemPage {
  protected readonly label = inject(ItemLabel);
}

@Component({ selector: 'list-page', template: '<p>list</p>' })
class ListPage {}

@Component({ selector: 'not-found-page', template: '<p>not found</p>' })
class NotFoundPage {}

@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
class App {}

const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'items/:id',
      routeName: RouteNames.ITEM,
      pathParam: { codec: numberCodec() },
      queryParams: {
        tab: queryParam({ codec: stringCodec(), defaultValue: 'info' }),
        view: queryParam({
          codec: stringCodec(),
          defaultValue: 'grid',
          persist: { key: 'view', storage: 'local' },
        }),
      },
      component: ItemPage,
    },
    {
      path: 'lists/:listId',
      routeName: RouteNames.LIST,
      pathParam: { codec: stringCodec(), persist: { key: 'list', storage: 'local' } },
      component: ListPage,
    },
    { path: '**', component: NotFoundPage },
  ],
});

const render = (url: string) =>
  renderApplication(
    (context: BootstrapContext) =>
      bootstrapApplication(
        App,
        {
          providers: [
            provideServerRendering(),
            provideAppRouter(),
            {
              provide: ItemLabel,
              useFactory: () => {
                const item = inject(AppRouter).routes.ITEM;
                return computed(() => {
                  const { path, query } = item.params();
                  return `item ${path.id} on ${query.tab} as ${query.view}`;
                });
              },
            },
          ],
        },
        context,
      ),
    {
      document: '<app-root></app-root>',
      url,
      allowedHosts: ['localhost'],
    },
  );

describe('server rendering', () => {
  afterEach(() => localStorage.clear());

  it('renders route state from the requested URL', async () => {
    const html = await render('http://localhost/items/7?tab=cast&view=list');

    expect(html).toContain('<p>item 7 on cast as list</p>');
  });

  it('renders the default of a persisted field, because the server has no storage', async () => {
    localStorage.setItem('ngx-urlik:view', 'list');
    const html = await render('http://localhost/items/7');

    expect(html).toContain('<p>item 7 on info as grid</p>');
    expect(localStorage.getItem('ngx-urlik:view')).toBe('list');
  });

  it('does not restore a path value, even though Node or the test DOM has localStorage', async () => {
    localStorage.setItem('ngx-urlik:list', 'groceries');
    const html = await render('http://localhost/lists');

    expect(html).toContain('<p>not found</p>');
  });
});
