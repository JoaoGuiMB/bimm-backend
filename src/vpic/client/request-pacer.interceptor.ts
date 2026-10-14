import type {
  HttpClientInterceptor,
  HttpHandler,
  HttpRequest,
} from '@nestjs/http-client';

export class RequestPacerInterceptor implements HttpClientInterceptor {
  private readonly intervalMs: number;
  private nextSlotAt = 0;

  constructor(requestsPerSecond: number) {
    this.intervalMs = 1000 / requestsPerSecond;
  }

  async intercept(request: HttpRequest, next: HttpHandler): Promise<Response> {
    const now = Date.now();
    const slotAt = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slotAt + this.intervalMs;

    if (slotAt > now) {
      await new Promise((resolve) => setTimeout(resolve, slotAt - now));
    }

    return next(request);
  }
}
