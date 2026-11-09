/** Limits how many pdf.js renders run at once so scrolling a long document stays responsive. */
export function createRenderQueue(concurrency: number) {
  let active = 0;
  const pending: (() => void)[] = [];
  const next = () => {
    if (active >= concurrency || !pending.length) return;
    active++;
    pending.shift()!();
  };
  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      pending.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}
