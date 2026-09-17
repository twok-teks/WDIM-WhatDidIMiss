// randomUUID is restricted to secure contexts; collectors also run in HTTP and opaque frames.
export function createId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
