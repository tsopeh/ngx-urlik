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

const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'items/:id',
      routeName: RouteNames.ITEM,
      pathParam: { codec: numberCodec() },
      queryParams: { tab: queryParam({ codec: stringCodec(), defaultValue: 'info' }) },
      component: ItemPage,
    },
  ],
});

describe('server rendering', () => {
  it('renders route state from the requested URL', async () => {
    const html = await renderApplication(
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
                    return `item ${path.id} on ${query.tab}`;
                  });
                },
              },
            ],
          },
          context,
        ),
      {
        document: '<app-root></app-root>',
        url: 'http://localhost/items/7?tab=cast',
        allowedHosts: ['localhost'],
      },
    );

    expect(html).toContain('<p>item 7 on cast</p>');
  });
});
