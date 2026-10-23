const buckets = new Map();
export function rateAllowed(key, limit, windowMs = 60000) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.until <= now) {
    if (buckets.size >= 10000) {
      for (const [id, value] of buckets) if (value.until <= now) buckets.delete(id);
      if (buckets.size >= 10000) return false;
    }
    bucket = {count: 0, until: now + windowMs};
    buckets.set(key, bucket);
  }
  return ++bucket.count <= limit;
}
const connections = new Map();
let total = 0;
export function acquireStream(address) {
  const count = connections.get(address) || 0;
  if (count >= 5 || total >= 100) return null;
  connections.set(address, count + 1); total++;
  let released = false;
  return () => {
    if (released) return;
    released = true; total--;
    const remaining = (connections.get(address) || 1) - 1;
    if (remaining) connections.set(address, remaining); else connections.delete(address);
  };
}
