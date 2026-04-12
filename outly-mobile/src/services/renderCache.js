import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'outly_render_cache_v1_';
const MEMORY_LIMIT = 80;
const memoryCache = new Map();

const now = () => Date.now();

const pruneMemory = () => {
  if (memoryCache.size <= MEMORY_LIMIT) return;

  const entries = Array.from(memoryCache.entries()).sort(
    (a, b) => (a[1]?.updatedAt || 0) - (b[1]?.updatedAt || 0)
  );

  const excess = entries.length - MEMORY_LIMIT;
  for (let i = 0; i < excess; i += 1) {
    memoryCache.delete(entries[i][0]);
  }
};

const storageKey = (key) => `${CACHE_PREFIX}${key}`;

export const buildRenderCacheKey = (base, params = {}) => {
  const keys = Object.keys(params).sort();
  const suffix = keys.map((k) => `${k}:${String(params[k])}`).join('|');
  return suffix ? `${base}|${suffix}` : base;
};

export const readRenderCache = async (key, ttlMs) => {
  if (!key || !ttlMs || ttlMs <= 0) return null;

  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && now() - memoryEntry.updatedAt <= ttlMs) {
    return memoryEntry.data;
  }

  if (memoryEntry) {
    memoryCache.delete(key);
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);
    if (!updatedAt || now() - updatedAt > ttlMs) {
      await AsyncStorage.removeItem(storageKey(key));
      return null;
    }

    const entry = { updatedAt, data: parsed.data };
    memoryCache.set(key, entry);
    pruneMemory();

    return parsed.data;
  } catch (error) {
    return null;
  }
};

export const writeRenderCache = async (key, data) => {
  if (!key) return;

  const entry = {
    updatedAt: now(),
    data,
  };

  memoryCache.set(key, entry);
  pruneMemory();

  try {
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch (error) {
    // Best-effort cache.
  }
};

export const clearRenderCache = async (key) => {
  if (!key) return;

  memoryCache.delete(key);
  try {
    await AsyncStorage.removeItem(storageKey(key));
  } catch (error) {
    // Ignore cache cleanup failures.
  }
};
