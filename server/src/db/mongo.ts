/**
 * MongoDB Atlas client singleton.
 *
 * Why a singleton?
 *   - In serverless / edge deployments (Vercel), the process may be reused
 *     across invocations. Creating a new `MongoClient` per request exhausts
 *     the Atlas connection pool quickly.
 *   - In Next.js dev with HMR, the module may reload; we cache on the
 *     Node.js `globalThis` so only ONE client exists across reloads.
 *
 * SRV resolution on restricted networks:
 *   Some ISPs/routers block UDP DNS SRV queries, which breaks the standard
 *   `mongodb+srv://` driver lookup with `querySrv ECONNREFUSED`. We detect
 *   this and automatically fall back to DNS-over-HTTPS (DoH) via
 *   `https://dns.google/resolve`, which works anywhere HTTPS works.
 *
 * All callers should use `getDb()` — never instantiate `MongoClient` directly.
 */

import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import { getServers, setServers } from "node:dns";
import { loadServerEnvFallback } from "../env/load-env";

declare global {
  // eslint-disable-next-line no-var
  var __khataMongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __khataMongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __khataMongoResolvedUri: string | undefined;
}

function getRawConnectionString(): string {
  loadServerEnvFallback();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy server/.env.example to client/.env.local and paste your Atlas connection string.",
    );
  }
  return uri;
}

function getDatabaseName(): string {
  loadServerEnvFallback();
  return process.env.MONGODB_DB || "khata";
}

function configureMongoSrvDns(uri: string): void {
  if (!uri.startsWith("mongodb+srv://")) return;
  const raw = process.env.MONGODB_DNS_SERVERS || "8.8.8.8,1.1.1.1";
  const servers = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length === 0) return;
  try {
    const current = getServers();
    const changed =
      current.length !== servers.length ||
      current.some((server, i) => server !== servers[i]);
    if (changed) {
      setServers(servers);
    }
  } catch {
    // Keep default config if runtime refuses setServers.
  }
}

// ---------------------------- DoH SRV fallback ------------------------------

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

const DOH_PROVIDERS: readonly string[] = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
  "https://dns.quad9.net:5053/dns-query",
  "https://doh.opendns.com/dns-query",
  "https://dns.nextdns.io",
];

// How long a single DoH request may take. Some ISPs throttle outbound HTTPS
// to non-browser User-Agents heavily; 5 s was too tight. 20 s is still well
// inside the Mongo driver's serverSelectionTimeoutMS and leaves room for
// per-provider retries.
const DOH_REQUEST_TIMEOUT_MS = 20_000;
const DOH_RETRIES_PER_PROVIDER = 1;

async function dohQueryOnce(
  base: string,
  name: string,
  type: "SRV" | "TXT",
): Promise<DohAnswer[]> {
  const url = `${base}?name=${encodeURIComponent(name)}&type=${type}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOH_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as DohResponse;
    return json.Answer ?? [];
  } finally {
    clearTimeout(timer);
  }
}

async function dohQuery(name: string, type: "SRV" | "TXT"): Promise<DohAnswer[]> {
  const errors: string[] = [];
  for (const provider of DOH_PROVIDERS) {
    for (let attempt = 0; attempt <= DOH_RETRIES_PER_PROVIDER; attempt++) {
      try {
        return await dohQueryOnce(provider, name, type);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${provider} (try ${attempt + 1}): ${msg}`);
        // Only retry transient-looking failures (aborts/resets); skip 4xx.
        if (!/abort|reset|timeout|ETIMEDOUT|ECONNRESET/i.test(msg)) break;
      }
    }
  }
  throw new Error(
    `All DoH providers failed for ${type} ${name}. Your network appears to ` +
      "block both UDP DNS and DNS-over-HTTPS. Try a different network/VPN, or " +
      "paste a non-SRV Atlas URI (mongodb://host1,host2,host3/?tls=true&authSource=admin) " +
      `into MONGODB_URI. Details: ${errors.join(" | ")}`,
  );
}

/**
 * Expand a `mongodb+srv://` URI into a standard `mongodb://` URI by
 * resolving the SRV + TXT records over HTTPS.
 *
 * Matches the driver's own behaviour: enables TLS, defaults authSource to
 * admin, merges replicaSet/auth options from the TXT record.
 */
async function expandSrvUriViaDoh(srvUri: string): Promise<string> {
  const parsed = new URL(srvUri.replace(/^mongodb\+srv:\/\//, "mongodb://"));
  const host = parsed.hostname;
  const srvName = `_mongodb._tcp.${host}`;

  const [srvAnswers, txtAnswers] = await Promise.all([
    dohQuery(srvName, "SRV"),
    dohQuery(host, "TXT").catch(() => [] as DohAnswer[]),
  ]);

  const hosts = srvAnswers
    .filter((a) => a.type === 33)
    .map((a) => {
      // SRV rdata format: "<priority> <weight> <port> <target>."
      const parts = a.data.split(/\s+/);
      if (parts.length < 4) return null;
      const port = Number(parts[2]);
      const target = (parts[3] || "").replace(/\.$/, "");
      if (!target || !Number.isFinite(port)) return null;
      return `${target}:${port}`;
    })
    .filter((h): h is string => h !== null);

  if (hosts.length === 0) {
    throw new Error(
      `DoH SRV lookup returned no hosts for ${srvName}. Check the cluster hostname in MONGODB_URI.`,
    );
  }

  const mergedParams = new URLSearchParams();
  for (const a of txtAnswers) {
    if (a.type !== 16) continue;
    // TXT rdata may be quoted and concatenated: "authSource=admin&replicaSet=..."
    const text = a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, "");
    const kvPairs = new URLSearchParams(text);
    kvPairs.forEach((v, k) => mergedParams.set(k, v));
  }
  if (!mergedParams.has("tls") && !mergedParams.has("ssl")) {
    mergedParams.set("tls", "true");
  }
  if (!mergedParams.has("authSource")) {
    mergedParams.set("authSource", "admin");
  }
  // Original URI params win over TXT defaults.
  new URLSearchParams(parsed.search).forEach((v, k) => mergedParams.set(k, v));

  const userInfo = parsed.username
    ? `${parsed.username}${parsed.password ? ":" + parsed.password : ""}@`
    : "";
  const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  return `mongodb://${userInfo}${hosts.join(",")}${path}?${mergedParams.toString()}`;
}

function isSrvDnsFailure(err: unknown): boolean {
  const e = err as { code?: string; syscall?: string; message?: string };
  if (!e) return false;
  if (e.syscall === "querySrv") return true;
  const msg = (e.message || "").toLowerCase();
  return (
    msg.includes("queryserver") ||
    msg.includes("querysrv") ||
    (msg.includes("_mongodb._tcp") && msg.includes("econnrefused"))
  );
}

function wrapMongoError(err: unknown): Error {
  if (isSrvDnsFailure(err)) {
    return new Error(
      "MongoDB SRV DNS lookup failed even with DoH fallback. " +
        "Check that your cluster hostname in MONGODB_URI is correct, or paste the non-SRV URI " +
        "(mongodb://...) from Atlas > Connect > Drivers into MONGODB_URI.",
    );
  }
  return err instanceof Error ? err : new Error("Failed to connect to MongoDB.");
}

async function createConnectedClient(uri: string): Promise<MongoClient> {
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });
  return client.connect();
}

async function connectWithDohFallback(): Promise<MongoClient> {
  const rawUri = getRawConnectionString();
  configureMongoSrvDns(rawUri);

  if (globalThis.__khataMongoResolvedUri) {
    return createConnectedClient(globalThis.__khataMongoResolvedUri);
  }

  try {
    const connected = await createConnectedClient(rawUri);
    globalThis.__khataMongoResolvedUri = rawUri;
    return connected;
  } catch (err) {
    if (!rawUri.startsWith("mongodb+srv://") || !isSrvDnsFailure(err)) {
      throw err;
    }
    // Network blocks UDP DNS; try DoH expansion.
    console.warn(
      "[mongo] SRV DNS blocked on this network — falling back to DNS-over-HTTPS.",
    );
    const expanded = await expandSrvUriViaDoh(rawUri);
    const connected = await createConnectedClient(expanded);
    globalThis.__khataMongoResolvedUri = expanded;
    return connected;
  }
}

export async function getMongoClient(): Promise<MongoClient> {
  if (globalThis.__khataMongoClient) {
    return globalThis.__khataMongoClient;
  }
  if (globalThis.__khataMongoClientPromise) {
    return globalThis.__khataMongoClientPromise;
  }
  globalThis.__khataMongoClientPromise = connectWithDohFallback()
    .then((connected) => {
      globalThis.__khataMongoClient = connected;
      return connected;
    })
    .catch((err: unknown) => {
      globalThis.__khataMongoClientPromise = undefined;
      throw wrapMongoError(err);
    });
  return globalThis.__khataMongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getDatabaseName());
}

export async function getCollection<T extends Document>(
  name: string,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}
