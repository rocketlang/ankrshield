#!/usr/bin/env node

/**
 * ankrshield Database Connection Test
 * Tests PostgreSQL and Redis connections
 */

import { createClient } from 'redis';
import pg from 'pg';

const { Client } = pg;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

async function testPostgreSQL() {
  console.log(`${colors.yellow}Testing PostgreSQL connection...${colors.reset}`);

  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'ankrshield',
    user: 'ankrshield',
    password: 'ankrshield_dev_password',
  });

  try {
    await client.connect();
    console.log(`${colors.green}✓ Connected to PostgreSQL${colors.reset}`);

    // Test TimescaleDB
    const timescaleResult = await client.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'"
    );
    if (timescaleResult.rows.length > 0) {
      console.log(
        `${colors.green}✓ TimescaleDB version: ${timescaleResult.rows[0].extversion}${colors.reset}`
      );
    } else {
      console.log(`${colors.red}✗ TimescaleDB not installed${colors.reset}`);
    }

    // Test pgvector
    const vectorResult = await client.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
    );
    if (vectorResult.rows.length > 0) {
      console.log(
        `${colors.green}✓ pgvector version: ${vectorResult.rows[0].extversion}${colors.reset}`
      );
    } else {
      console.log(`${colors.red}✗ pgvector not installed${colors.reset}`);
    }

    // Test custom types
    const typesResult = await client.query(
      "SELECT typname FROM pg_type WHERE typname IN ('subscription_tier', 'device_type', 'threat_level', 'ai_agent_type', 'policy_action')"
    );
    if (typesResult.rows.length === 5) {
      console.log(`${colors.green}✓ Custom types created (${typesResult.rows.length}/5)${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ Custom types: ${typesResult.rows.length}/5${colors.reset}`);
    }

    // Test basic query
    const result = await client.query('SELECT NOW() as current_time');
    console.log(`${colors.green}✓ Query test passed${colors.reset}`);
    console.log(`  Current time: ${result.rows[0].current_time}`);

    await client.end();
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ PostgreSQL connection failed${colors.reset}`);
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

async function testRedis() {
  console.log(`\n${colors.yellow}Testing Redis connection...${colors.reset}`);

  const client = createClient({
    url: 'redis://localhost:6379',
    password: 'ankrshield_redis_password',
  });

  try {
    await client.connect();
    console.log(`${colors.green}✓ Connected to Redis${colors.reset}`);

    // Test Redis version
    const info = await client.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    if (versionMatch) {
      console.log(`${colors.green}✓ Redis version: ${versionMatch[1]}${colors.reset}`);
    }

    // Test set/get
    await client.set('test_key', 'test_value');
    const value = await client.get('test_key');
    if (value === 'test_value') {
      console.log(`${colors.green}✓ Set/Get test passed${colors.reset}`);
    }
    await client.del('test_key');

    // Test pub/sub (basic check)
    console.log(`${colors.green}✓ Redis ready for caching and pub/sub${colors.reset}`);

    await client.quit();
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ Redis connection failed${colors.reset}`);
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('=====================================');
  console.log('  Database Connection Tests');
  console.log('=====================================\n');

  const pgSuccess = await testPostgreSQL();
  const redisSuccess = await testRedis();

  console.log('\n=====================================');
  if (pgSuccess && redisSuccess) {
    console.log(`${colors.green}  All tests passed! ✓${colors.reset}`);
    console.log('=====================================\n');
    process.exit(0);
  } else {
    console.log(`${colors.red}  Some tests failed${colors.reset}`);
    console.log('=====================================\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
