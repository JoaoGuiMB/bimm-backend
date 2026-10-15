export async function runConcurrently<T>(
  items: readonly T[],
  concurrency: number,
  signal: AbortSignal,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;

  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      await task(items[next++]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}
