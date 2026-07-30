/**
 * Tiny durable key/value store for domain records. It deliberately supports
 * only addressed reads and writes: callers keep their own index records and
 * can never scan a Redis keyspace.
 */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}

export interface PersistentBindings {
  DB?: D1Like;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

let redisPromise: Promise<RedisClient | undefined> | undefined;

async function redis(): Promise<RedisClient | undefined> {
  const url = typeof process === "undefined" ? undefined : process.env.REDIS_URL;
  if (!url) return undefined;
  redisPromise ??= (async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    // ioredis is loaded only in the Node runtime. Workers use D1 below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imported: any = require("ioredis");
    const Redis = imported.default ?? imported.Redis ?? imported;
    return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as RedisClient;
  })();
  return redisPromise;
}

export class PersistentStore {
  constructor(private readonly bindings?: PersistentBindings) {}

  async read<T>(key: string): Promise<T | undefined> {
    if (this.bindings?.DB) {
      await this.ensureD1();
      const row = await this.bindings.DB
        .prepare("SELECT value FROM bot_records WHERE key = ?")
        .bind(key)
        .first<{ value: string }>();
      if (!row) return undefined;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return undefined;
      }
    }
    const client = await redis();
    if (!client) return undefined;
    const value = await client.get(key);
    if (value === null) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  async write<T>(key: string, value: T): Promise<boolean> {
    const serialized = JSON.stringify(value);
    if (this.bindings?.DB) {
      await this.ensureD1();
      await this.bindings.DB
        .prepare(
          "INSERT INTO bot_records (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key, serialized)
        .run();
      return true;
    }
    const client = await redis();
    if (!client) return false;
    await client.set(key, serialized);
    return true;
  }

  private async ensureD1(): Promise<void> {
    await this.bindings?.DB
      ?.prepare("CREATE TABLE IF NOT EXISTS bot_records (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
      .bind()
      .run();
  }
}
