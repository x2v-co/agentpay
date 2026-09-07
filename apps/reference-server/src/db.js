// The public reference server intentionally defaults to a process-local store.
// Private deployments can replace this boundary with a transactional adapter.
export const db = undefined;

export async function withDbTransaction(callback) {
  return callback(undefined);
}
