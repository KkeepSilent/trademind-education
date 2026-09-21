#!/usr/bin/env node

/**
 * TradeMind Education — Supabase Setup Helper
 *
 * Run this after setting up your Supabase project:
 *   node scripts/setup-supabase.mjs
 *
 * It will:
 *   1. Check if .env.local is configured
 *   2. Test the connection
 *   3. List existing tables
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.local
function loadEnv() {
  try {
    const envPath = resolve(root, ".env.local");
    const content = readFileSync(envPath, "utf-8");
    const env = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...values] = trimmed.split("=");
      env[key.trim()] = values.join("=").trim();
    }

    return env;
  } catch {
    return {};
  }
}

async function main() {
  console.log("🔍 TradeMind Education — Supabase Setup\n");

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("YOUR_PROJECT")) {
    console.log("❌ .env.local is not configured.\n");
    console.log("   1. Copy .env.example to .env.local");
    console.log("   2. Fill in your Supabase URL and anon key");
    console.log("   3. Run this script again\n");
    process.exit(1);
  }

  console.log(`✅ Found Supabase URL: ${url}`);
  console.log(`✅ Found anon key: ${key.slice(0, 10)}...`);

  const supabase = createClient(url, key);

  // Test connection by listing tables
  console.log("\n📡 Testing connection...\n");

  const tables = [
    "users",
    "user_progress",
    "simulation_sessions",
    "trades",
    "ai_feedback",
    "learning_modules",
    "lessons"
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.log(`   ⚠️  ${table}: ${error.message}`);
      } else {
        console.log(`   ✅ ${table}: ${count ?? 0} rows`);
      }
    } catch (err) {
      console.log(`   ❌ ${table}: connection failed`);
    }
  }

  console.log("\n✨ Done!\n");
}

main().catch(console.error);
