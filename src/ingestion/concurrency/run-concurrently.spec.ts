import { runConcurrently } from './run-concurrently.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

const neverAborted = () => new AbortController().signal;

describe('runConcurrently', () => {
  it('never runs more tasks at once than the limit', async () => {
    const limit = 3;
    const items = [1, 2, 3, 4, 5, 6, 7];
    let inFlight = 0;
    let maxInFlight = 0;

    await runConcurrently(items, limit, neverAborted(), async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      inFlight--;
    });

    expect(maxInFlight).toBe(limit);
  });

  it('processes every item once', async () => {
    const items = [1, 2, 3, 4];
    const seen: number[] = [];

    await runConcurrently(items, 2, neverAborted(), async (item) => {
      await tick();
      seen.push(item);
    });

    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it('stops picking up items after the signal aborts', async () => {
    const abort = new AbortController();
    const items = [1, 2, 3, 4];
    const lastItem = 2;
    const seen: number[] = [];

    await runConcurrently(items, 1, abort.signal, async (item) => {
      seen.push(item);
      if (item === lastItem) abort.abort();
    });

    expect(seen).toEqual(items.slice(0, items.indexOf(lastItem) + 1));
  });

  it('does nothing for an empty list', async () => {
    const task = vi.fn();

    await runConcurrently([], 5, neverAborted(), task);

    expect(task).not.toHaveBeenCalled();
  });
});
