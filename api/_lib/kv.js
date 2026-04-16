// Upstash Redis wrapper (replacement for deprecated @vercel/kv).
// Vercel Marketplace → Redis integration injects env vars:
//   - UPSTASH_REDIS_REST_URL
//   - UPSTASH_REDIS_REST_TOKEN
// Legacy KV_REST_API_URL / KV_REST_API_TOKEN also supported for compatibility.

import { Redis } from "@upstash/redis";

let _client = null;

function getUrl() {
  return process.env.UPSTASH_REDIS_REST_URL
    || process.env.KV_REST_API_URL
    || "";
}
function getToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN
    || process.env.KV_REST_API_TOKEN
    || "";
}

export function isKvConfigured() {
  return !!(getUrl() && getToken());
}

export function assertKvConfigured() {
  if (!isKvConfigured()) {
    const err = new Error("KV_NOT_CONFIGURED");
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
}

export function getClient() {
  if (_client) return _client;
  assertKvConfigured();
  _client = new Redis({ url: getUrl(), token: getToken() });
  return _client;
}

// Generic helpers — mirror the API we used before.
export async function kvGet(key) {
  return await getClient().get(key);
}
export async function kvSet(key, value) {
  return await getClient().set(key, value);
}
export async function kvDel(key) {
  return await getClient().del(key);
}
export async function kvIncr(key) {
  return await getClient().incr(key);
}
