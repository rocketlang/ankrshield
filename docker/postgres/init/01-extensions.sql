-- ankrshield PostgreSQL Extension Setup
-- This script runs automatically when the database is first created

-- Enable TimescaleDB (already included in timescale/timescaledb-ha image)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable pgvector for vector similarity search (AI embeddings)
-- Installed via custom Dockerfile
-- TODO: Re-enable when custom Docker image is built
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Enable other useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram similarity for text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- GIN indexes for better performance
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- GIST indexes for better performance

-- Create custom types for ankrshield
DO $$
BEGIN
    -- Subscription tiers
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
        CREATE TYPE subscription_tier AS ENUM (
            'FREE',
            'FREEMIUM',
            'PREMIUM',
            'PRO',
            'FAMILY',
            'ENTERPRISE',
            'SUPER'
        );
    END IF;

    -- Device types
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_type') THEN
        CREATE TYPE device_type AS ENUM (
            'WINDOWS',
            'MACOS',
            'LINUX',
            'IOS',
            'ANDROID',
            'BROWSER',
            'GATEWAY'
        );
    END IF;

    -- Threat levels
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'threat_level') THEN
        CREATE TYPE threat_level AS ENUM (
            'SAFE',
            'LOW',
            'MEDIUM',
            'HIGH',
            'CRITICAL'
        );
    END IF;

    -- AI agent types
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_agent_type') THEN
        CREATE TYPE ai_agent_type AS ENUM (
            'CHATGPT',
            'CLAUDE',
            'COPILOT',
            'GEMINI',
            'MIDJOURNEY',
            'ELEVENLABS',
            'OTHER'
        );
    END IF;

    -- Policy actions
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_action') THEN
        CREATE TYPE policy_action AS ENUM (
            'ALLOW',
            'BLOCK',
            'NOTIFY',
            'PROMPT'
        );
    END IF;
END$$;

-- Create a function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'ankrshield database extensions initialized successfully';
    RAISE NOTICE 'TimescaleDB: %', (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb');
    RAISE NOTICE 'Custom types created: subscription_tier, device_type, threat_level, ai_agent_type, policy_action';
END$$;
