import { Component, computed, inject, InjectionToken } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { RouterOutlet } from '@angular/router';
import { defineAppRouter } from './app-router';
import { numberCodec, queryParam, stringCodec } from './params';

enum RouteNames {
  ITEM = 'ITEM',
}

// The page reads the router through a token so its class can be declared before the router.
const ItemLabel = new InjectionToken<() => string>('ItemLabel');

@Component({ selector: 'item-page', template: '<p>{{ label() }}</p>' })
class ItemPage {
  protected readonly label = inject(ItemLabel);
}

@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
class App {}

const { AppRouter, provideAppRouter } = defineAppRouter(
  { ITEM: RouteNames.ITEM },
  {
    routes: [
      {
        path: 'items/:id',
        routeName: RouteNames.ITEM,
        pathParam: { id: numberCodec() },
        queryParams: {
          tab: queryParam({ codec: stringCodec(), defaultValue: 'info' }),
          view: queryParam({ codec: stringCodec(), defaultValue: 'grid' }),
        },
        component: ItemPage,
      },
    ],
  },
);

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
                const { routes, escapeHatch } = inject(AppRouter);
                return computed(() => {
                  const { path, query } = routes.ITEM.params();
                  const next = escapeHatch.serializeUrl(
                    routes.ITEM.createUrlTree({ path: { id: path.id + 1 } }),
                  );
                  return `item ${path.id} on ${query.tab} as ${query.view}, next ${next}`;
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
  it('renders route state from the requested URL', async () => {
    const html = await render('http://localhost/items/7?tab=cast&view=list');

    expect(html).toContain('<p>item 7 on cast as list, next /items/8</p>');
  });
});
