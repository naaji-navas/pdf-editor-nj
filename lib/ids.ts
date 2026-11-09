let counter = 0;

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
}
