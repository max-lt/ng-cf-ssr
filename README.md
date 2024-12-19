# Angular SSR with Cloudflare workers

UPDATE : Using Angular with Cloudflare workers is [now much easier than it used to be](https://www.lechat.dev/blog/2024/angular-ssr-with-cloudflare-pages-and-bun), this example project will be archived.  

## Limitations

- You will have a lot of timeout error when running `wrangler dev`, just keep trying
```
Script startup timed out.
 [API code: 10021]
```

-  For some reasons I didn't manage to make the worker rendering work with zone.js, I had to write a custom renderer ([see worker.ts](worker.ts)); this renderer itself has some severe limitations:
    - It doesn't works well with observables (I put a manual timer (`await wait(1500)`) to force the app to display observable)

## Steps to reproduce from scratch
### Step 1 - generate app
```
ng new app --minimal --skip-tests --strict --style=scss --directory ng-cf-ssr
```

### Step 2
```bash
npm i -S  @angular/platform-server @angular-builders/custom-webpack @cloudflare/kv-asset-handler

# webpack polyfills for @angular/platform-server
npm i -D stream-http url os-browserify https-browserify util
```

##### In [package.json](package.json)
```jsonc
// add the entrypoint for Cloudflare Workers
  "main": "dist/app/worker/main.js",
```

##### In [angular.json](angular.json)
```jsonc
//...
"architect": {
  "build": {
    "builder": "@angular-devkit/build-angular:browser",
    "options": {
      // "outputPath": "dist/app" <- change this line
      "outputPath": "dist/app/browser",
//...
// add the following configuration
"worker": {
  "builder": "@angular-builders/custom-webpack:server",
  "options": {
    "customWebpackConfig": {
       "path": "./webpack.worker.js"
    },
    "outputPath": "dist/app/worker",
    "main": "worker.ts",
    "tsConfig": "tsconfig.worker.json",
    "inlineStyleLanguage": "scss"
  },
  "configurations": {
    "production": {
      "optimization": true,
      "outputHashing": "media",
      "fileReplacements": [
        {
          "replace": "src/environments/environment.ts",
          "with": "src/environments/environment.prod.ts"
        }
      ]
    },
    "development": {
      "optimization": false,
      "sourceMap": true,
      "extractLicenses": false
    }
  },
  "defaultConfiguration": "production"
}
```

##### Create [src/app/app.worker.module.ts](src/app/app.worker.module.ts)
```ts
import { NgModule } from '@angular/core';
import { ServerModule } from '@angular/platform-server';

import { AppModule } from './app.module';
import { AppComponent } from './app.component';

@NgModule({
  imports: [
    AppModule,
    ServerModule
  ],
  bootstrap: [AppComponent]
})
export class AppWorkerModule {}
```

##### Create [src/main.worker.ts](src/main.worker.ts)
```ts
import { enableProdMode } from '@angular/core';

import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

export { AppWorkerModule } from './app/app.worker.module';
export { renderModule, renderModuleFactory } from '@angular/platform-server';
```

##### Create [src/main.worker.ts](src/main.worker.ts)
```ts
console.warn('\nUsing custom webpack config (webpack.extra.config.js)\n');

// https://developers.cloudflare.com/workers/cli-wrangler/webpack/#bring-your-own-configuration
// https://github.com/cloudflare/modules-webpack-commonjs/blob/master/webpack.config.js
module.exports = {
  target: 'webworker',
  output: {
    libraryTarget: 'umd' // Fix: "Uncaught ReferenceError: exports is not defined".
  },
  resolve: {
    // https://webpack.js.org/configuration/resolve/#resolvefallback
    fallback: {
      https: require.resolve('https-browserify'),
      http: require.resolve('stream-http'),
      os: require.resolve('os-browserify/browser'),
      url: require.resolve('url'),
      util: require.resolve('util')
    }
  }
};
```

##### Create [wrangler.toml](wrangler.toml)
```toml
name = "ng-cf-ssr"
type = "javascript"
route = ''
zone_id = ''
usage_model = ''
compatibility_flags = []
workers_dev = true
compatibility_date = "2022-04-04"

account_id = ""

# https://developers.cloudflare.com/workers/cli-wrangler/configuration/#site
[site]
bucket = "./dist/app/browser"
entry-point = "."

[build]
# command = "ng run app:worker"
command = "ng run app:worker:production"
# command = "echo skip build"

[build.upload]
format = "service-worker"
```

##### Create [worker.ts](worker.ts)
```ts
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

```








### Step 3
#### Build browser 
```
ng run app:build:production
```
#### Build worker 
```
ng run app:worker:production
```
#### Preview app
```
wrangler dev
```
#### Publish app
```
wrangler publish
```

> Note: as `wrangler dev`, `wrangler publish` may give you a lot of timeout error before finally working

You can see this app running [here](https://ng-cf-ssr.pumpin.workers.dev/) ([disable javascript](https://developer.chrome.com/docs/devtools/javascript/disable) to see only the SSR version)
