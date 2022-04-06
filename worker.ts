// Some hacky polyfills

// @ts-ignore
globalThis.global = globalThis;

// @ts-ignore
globalThis.process = { versions: { node: '0', v8: '0' }, env: {} };

import { ApplicationRef, Type } from '@angular/core';
import { BEFORE_APP_SERIALIZED, INITIAL_CONFIG } from '@angular/platform-server';
import { PlatformConfig, platformDynamicServer, PlatformState } from '@angular/platform-server';
import { serveSinglePageApp } from '@cloudflare/kv-asset-handler';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import { first, firstValueFrom } from 'rxjs';
import { AppWorkerModule } from 'src/main.worker';

function wait<T>(t = 100, val?: T): Promise<T> {
  return new Promise((resolve) => setTimeout(resolve, t, val));
}

/**
 * https://angular.io/guide/zone#disabling-zone
 * https://typescript.hotexamples.com/de/examples/%40angular.platform-server/PlatformState/renderToString/typescript-platformstate-rendertostring-method-examples.html
 * https://github.com/Urigo/angular-meteor/blob/master/examples/MeteorCLI/universal/server/main.ts
 * https://github.com/moczix/angular-universal-zoneless/blob/master/projects/angular-universal-zoneless/src/lib/zoneless-universal-engine.ts
 * https://github.com/manfredsteyer/universal/blob/master/modules/aspnetcore-engine/src/platform-server-utils.ts
 */

// import 'zone.js';

async function renderModuleWithoutZone<T>(mod: Type<T>, config: PlatformConfig) {
  const platform = platformDynamicServer([{ provide: INITIAL_CONFIG, useValue: config }]);

  const appModuleRef = await platform.bootstrapModule<T>(mod, { ngZone: 'noop' });

  const applicationRef = appModuleRef.injector.get(ApplicationRef);

  await firstValueFrom(applicationRef.isStable.pipe(first((stable) => stable)));

  await wait(1500);

  // https://github.com/Urigo/angular-meteor/blob/master/examples/MeteorCLI/universal/server/main.ts#L88
  applicationRef.tick();

  // Run any BEFORE_APP_SERIALIZED callbacks just before rendering to string.
  const callbacks = appModuleRef.injector.get(BEFORE_APP_SERIALIZED, null);
  if (callbacks) {
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (e) {
        // Ignore exceptions.
        console.warn('Ignoring BEFORE_APP_SERIALIZED Exception: ', e);
      }
    }
  }

  const platformState = platform.injector.get(PlatformState);

  const output = platformState.renderToString();

  platform.destroy();

  return output;
}

async function handleEvent(event: any) {
  const request = event.request as Request;
  const url = new URL(request.url);

  const assetUrl = new URL(serveSinglePageApp(request).url);

  let asset = null;

  try {
    asset = await getAssetFromKV(event, { mapRequestToAsset: serveSinglePageApp });
  } catch {
    console.log(`\nNo match for ${url.pathname} (${assetUrl.pathname})`);
    return new Response(assetUrl.pathname + ' not found', { status: 404 });
  }

  console.log(`\nHandling ${url.pathname} (${assetUrl.pathname})`);

  if (assetUrl.pathname == '/index.html') {
    const document = await asset.text();

    console.log(`Rendering index for ${url.pathname} (${assetUrl.pathname}, ${document.length} bytes)`);
    const html = await renderModuleWithoutZone(AppWorkerModule, {
      document,
      url: request.url
    });

    return new Response(html, {
      headers: { 'content-type': 'text/html;charset=UTF-8' }
    });
  }

  return asset;
}

addEventListener('fetch', (event: any) => {
  event.respondWith(
    handleEvent(event).catch((err) => new Response(err.stack, { status: 500 }))
  );
});
