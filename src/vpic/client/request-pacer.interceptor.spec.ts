import type { HttpRequest } from '@nestjs/http-client';
import { RequestPacerInterceptor } from './request-pacer.interceptor.js';

describe('RequestPacerInterceptor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('spaces concurrent requests evenly at the configured rate', async () => {
    const pacer = new RequestPacerInterceptor(4);
    const sentAt: number[] = [];
    const next = async () => {
      sentAt.push(Date.now());
      return new Response('ok');
    };
    const start = Date.now();

    const requests = [1, 2, 3].map(() =>
      pacer.intercept({} as HttpRequest, next),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(requests);

    expect(sentAt.map((t) => t - start)).toEqual([0, 250, 500]);
  });

  it('does not delay a request after an idle period', async () => {
    const pacer = new RequestPacerInterceptor(4);
    const next = vi.fn(async () => new Response('ok'));

    await pacer.intercept({} as HttpRequest, next);
    await vi.advanceTimersByTimeAsync(5000);
    const before = Date.now();
    await pacer.intercept({} as HttpRequest, next);

    expect(Date.now()).toBe(before);
  });
});
