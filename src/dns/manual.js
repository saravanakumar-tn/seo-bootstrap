// For registrars without an API (or when you'd rather not give the tool DNS access).
// Prints the records; the run then waits for them to appear (see dns.waitSeconds).
// Re-running later is safe: every step is idempotent.

export function manual({ log }) {
  return {
    name: 'manual',
    async ensureRecord({ type, name, content }) {
      log(`  dns: ADD THIS RECORD AT YOUR DNS HOST ->  ${type}  ${name}  ${content}`);
      return { action: 'manual' };
    },
  };
}
