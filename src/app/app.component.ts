import { Inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { Component } from '@angular/core';
import { map, Observable, timer } from 'rxjs';

type platform = 'server' | 'browser';
type Async<T> = Observable<T> | Promise<T>;


@Component({
  selector: 'app-root',
  template: `
    <!--The content below is only a placeholder and can be replaced.-->
    <div style="text-align:center" class="content">
      <h1>
        Welcome to {{title}}!
      </h1>
      <span style="display: block">{{ title }} app is running!</span>
      <img width="300" alt="Angular Logo" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTAgMjUwIj4KICAgIDxwYXRoIGZpbGw9IiNERDAwMzEiIGQ9Ik0xMjUgMzBMMzEuOSA2My4ybDE0LjIgMTIzLjFMMTI1IDIzMGw3OC45LTQzLjcgMTQuMi0xMjMuMXoiIC8+CiAgICA8cGF0aCBmaWxsPSIjQzMwMDJGIiBkPSJNMTI1IDMwdjIyLjItLjFWMjMwbDc4LjktNDMuNyAxNC4yLTEyMy4xTDEyNSAzMHoiIC8+CiAgICA8cGF0aCAgZmlsbD0iI0ZGRkZGRiIgZD0iTTEyNSA1Mi4xTDY2LjggMTgyLjZoMjEuN2wxMS43LTI5LjJoNDkuNGwxMS43IDI5LjJIMTgzTDEyNSA1Mi4xem0xNyA4My4zaC0zNGwxNy00MC45IDE3IDQwLjl6IiAvPgogIDwvc3ZnPg==">
    </div>
    <ul>
      <li>
        Page rendered from {{ platform }} at {{ time | date: "hh:mm:ss" }} !
      </li>
      <li>
        Observable test: Current time is {{ time$ | async | date: "hh:mm:ss" }}
      </li>
      <li>
        Network test: You ip is {{ ip$ | async }}
      </li>
    </ul>
    <router-outlet></router-outlet>
  `,
  styles: []
})
export class AppComponent {
  title = 'app';

  time = new Date();

  time$: Async<Date>;
  ip$: Async<string>;

  constructor(@Inject(PLATFORM_ID) public platform: platform) {
    this.time$ = timer(0, 1000).pipe(map(() => new Date()));

    this.ip$ = this.getIp();
  }

  getIp() {
    return fetch('https://api64.ipify.org').then(r => r.text())
  }
}
