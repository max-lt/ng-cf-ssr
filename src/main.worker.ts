import { enableProdMode } from '@angular/core';

import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

export { AppWorkerModule } from './app/app.worker.module';
export { renderModule, renderModuleFactory } from '@angular/platform-server';
