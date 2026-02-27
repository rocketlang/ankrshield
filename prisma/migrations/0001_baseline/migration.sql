-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "subscription_tier" AS ENUM ('FREE', 'FREEMIUM', 'PREMIUM', 'PRO', 'FAMILY', 'ENTERPRISE', 'SUPER');

-- CreateEnum
CREATE TYPE "device_type" AS ENUM ('WINDOWS', 'MACOS', 'LINUX', 'IOS', 'ANDROID', 'BROWSER', 'GATEWAY');

-- CreateEnum
CREATE TYPE "threat_level" AS ENUM ('SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ai_agent_type" AS ENUM ('CHATGPT', 'CLAUDE', 'COPILOT', 'GEMINI', 'MIDJOURNEY', 'ELEVENLABS', 'OTHER');

-- CreateEnum
CREATE TYPE "policy_action" AS ENUM ('ALLOW', 'BLOCK', 'NOTIFY', 'PROMPT');

-- CreateEnum
CREATE TYPE "TrackerCategory" AS ENUM ('ADVERTISING', 'ANALYTICS', 'SOCIAL_MEDIA', 'TELEMETRY', 'MALWARE', 'CDN', 'FINGERPRINTING', 'CRYPTOMINING', 'OTHER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('DNS_QUERY', 'DNS_BLOCKED', 'NETWORK_REQUEST', 'NETWORK_BLOCKED', 'AI_FILE_ACCESS', 'AI_CLIPBOARD', 'AI_NETWORK', 'AI_BLOCKED', 'POLICY_VIOLATION');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "warrior_attack_type" AS ENUM ('data_exfiltration', 'credential_theft', 'lateral_movement', 'ransomware', 'surveillance', 'supply_chain_compromise', 'privilege_escalation', 'honeypot_triggered', 'unknown');

-- CreateEnum
CREATE TYPE "warrior_event_type" AS ENUM ('attack_detected', 'policy_generated', 'honeypot_triggered', 'agent_quarantined', 'scope_violation', 'incident_report', 'spyware_detected');

-- CreateEnum
CREATE TYPE "api_key_tier" AS ENUM ('FREE', 'STARTER', 'PRO');

-- CreateEnum
CREATE TYPE "xshield_tier" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "risk_level" AS ENUM ('MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "watch_status" AS ENUM ('ACTIVE', 'PAUSED', 'DELETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "tier" "subscription_tier" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionExpiresAt" TIMESTAMP(3),
    "privacyLevel" SMALLINT NOT NULL DEFAULT 5,
    "enabledFeatures" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" "device_type" NOT NULL,
    "hostname" TEXT,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventType" "EventType" NOT NULL,
    "domain" TEXT NOT NULL,
    "ip" TEXT,
    "port" SMALLINT,
    "protocol" TEXT,
    "trackerId" UUID,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedBy" TEXT,
    "bytesIn" INTEGER NOT NULL DEFAULT 0,
    "bytesOut" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "processName" TEXT,
    "processPath" TEXT,
    "sni" TEXT,

    CONSTRAINT "network_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trackers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "domain" TEXT NOT NULL,
    "category" "TrackerCategory" NOT NULL,
    "vendor" TEXT,
    "threatLevel" "threat_level" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT,
    "sources" TEXT[],
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trackers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "action" "policy_action" NOT NULL,
    "notifyUser" BOOLEAN NOT NULL DEFAULT false,
    "logEvent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "agentType" "ai_agent_type" NOT NULL,
    "processNames" TEXT[],
    "domains" TEXT[],
    "executablePaths" TEXT[],
    "vendor" TEXT,
    "version" TEXT,
    "description" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "riskScore" SMALLINT NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_activities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "activityType" TEXT NOT NULL,
    "resource" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ai_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_scores" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallScore" SMALLINT NOT NULL,
    "networkScore" SMALLINT NOT NULL,
    "dnsScore" SMALLINT NOT NULL,
    "appScore" SMALLINT NOT NULL,
    "aiScore" SMALLINT NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "blockedRequests" INTEGER NOT NULL DEFAULT 0,
    "allowedRequests" INTEGER NOT NULL DEFAULT 0,
    "trackersBlocked" INTEGER NOT NULL DEFAULT 0,
    "previousScore" SMALLINT,
    "scoreChange" SMALLINT,
    "period" TEXT NOT NULL DEFAULT 'daily',

    CONSTRAINT "privacy_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "actionUrl" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warrior_attack_chains" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "detectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startTime" TIMESTAMPTZ NOT NULL,
    "endTime" TIMESTAMPTZ NOT NULL,
    "attackType" "warrior_attack_type" NOT NULL,
    "threatScore" REAL NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "narrative" TEXT NOT NULL,
    "technicalSummary" TEXT NOT NULL,
    "affectedAssets" TEXT[],
    "suggestedActions" TEXT[],
    "autoActionsApplied" TEXT[],

    CONSTRAINT "warrior_attack_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warrior_policies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "triggeredBy" UUID NOT NULL,
    "confidence" REAL NOT NULL,
    "autoApplied" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "appliedAt" TIMESTAMP(3),
    "rules" JSONB NOT NULL,

    CONSTRAINT "warrior_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warrior_incident_reports" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMPTZ NOT NULL,
    "periodEnd" TIMESTAMPTZ NOT NULL,
    "riskScore" REAL NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "technicalAnalysis" TEXT NOT NULL,
    "totalEventsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "totalAlertsGenerated" INTEGER NOT NULL DEFAULT 0,
    "topThreats" TEXT[],
    "recommendations" TEXT[],
    "rawReport" JSONB NOT NULL,

    CONSTRAINT "warrior_incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warrior_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" "warrior_event_type" NOT NULL,
    "agentId" TEXT,
    "agentName" TEXT,
    "chainId" UUID,
    "payload" JSONB NOT NULL,

    CONSTRAINT "warrior_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warrior_quarantine" (
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "quarantinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "attackChainId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "warrior_quarantine_pkey" PRIMARY KEY ("agentId")
);

-- CreateTable
CREATE TABLE "domain_watches" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID,
    "domain" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastRiskScore" SMALLINT,
    "lastRiskLevel" TEXT,
    "alertCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "watchId" UUID NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertType" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "webhookStatus" TEXT,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_integrations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" CHAR(8) NOT NULL,
    "hash" TEXT NOT NULL,
    "tier" "api_key_tier" NOT NULL DEFAULT 'STARTER',
    "monthlyRequestCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "blockedRequests" INTEGER NOT NULL DEFAULT 0,
    "dnsQueries" INTEGER NOT NULL DEFAULT 0,
    "dnsBlocked" INTEGER NOT NULL DEFAULT 0,
    "uniqueTrackers" INTEGER NOT NULL DEFAULT 0,
    "trackersBlocked" INTEGER NOT NULL DEFAULT 0,
    "topTracker" TEXT,
    "topCategory" TEXT,
    "activeDevices" INTEGER NOT NULL DEFAULT 0,
    "aiActivities" INTEGER NOT NULL DEFAULT 0,
    "aiBlocked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xshield_api_keys" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgName" TEXT,
    "email" TEXT NOT NULL,
    "tier" "xshield_tier" NOT NULL DEFAULT 'FREE',
    "monthlyQuota" INTEGER NOT NULL DEFAULT 10,
    "usedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "quotaResetAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xshield_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xshield_domain_watches" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "apiKeyId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "lastRiskScore" SMALLINT,
    "lastRiskLevel" "risk_level",
    "lastScannedAt" TIMESTAMP(3),
    "status" "watch_status" NOT NULL DEFAULT 'ACTIVE',
    "alertThreshold" SMALLINT NOT NULL DEFAULT 40,
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xshield_domain_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_alerts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "watchId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "riskScore" SMALLINT NOT NULL,
    "riskLevel" "risk_level" NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "watch_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xshield_risk_reports" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "apiKeyId" UUID,
    "domain" TEXT NOT NULL,
    "riskScore" SMALLINT NOT NULL,
    "riskLevel" "risk_level" NOT NULL,
    "findings" JSONB NOT NULL,
    "mitreMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xshield_risk_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tier_idx" ON "users"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "magic_tokens_tokenHash_key" ON "magic_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "magic_tokens_email_idx" ON "magic_tokens"("email");

-- CreateIndex
CREATE INDEX "magic_tokens_expiresAt_idx" ON "magic_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_tokenHash_key" ON "email_verifications"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verifications_userId_idx" ON "email_verifications"("userId");

-- CreateIndex
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

-- CreateIndex
CREATE INDEX "devices_deviceType_idx" ON "devices"("deviceType");

-- CreateIndex
CREATE INDEX "devices_isActive_idx" ON "devices"("isActive");

-- CreateIndex
CREATE INDEX "devices_lastSeenAt_idx" ON "devices"("lastSeenAt");

-- CreateIndex
CREATE INDEX "network_events_timestamp_idx" ON "network_events"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "network_events_deviceId_timestamp_idx" ON "network_events"("deviceId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "network_events_userId_timestamp_idx" ON "network_events"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "network_events_domain_idx" ON "network_events"("domain");

-- CreateIndex
CREATE INDEX "network_events_trackerId_idx" ON "network_events"("trackerId");

-- CreateIndex
CREATE INDEX "network_events_isBlocked_idx" ON "network_events"("isBlocked");

-- CreateIndex
CREATE INDEX "network_events_eventType_idx" ON "network_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "trackers_domain_key" ON "trackers"("domain");

-- CreateIndex
CREATE INDEX "trackers_domain_idx" ON "trackers"("domain");

-- CreateIndex
CREATE INDEX "trackers_category_idx" ON "trackers"("category");

-- CreateIndex
CREATE INDEX "trackers_vendor_idx" ON "trackers"("vendor");

-- CreateIndex
CREATE INDEX "trackers_threatLevel_idx" ON "trackers"("threatLevel");

-- CreateIndex
CREATE INDEX "policies_userId_idx" ON "policies"("userId");

-- CreateIndex
CREATE INDEX "policies_isEnabled_idx" ON "policies"("isEnabled");

-- CreateIndex
CREATE INDEX "policies_priority_idx" ON "policies"("priority");

-- CreateIndex
CREATE INDEX "ai_agents_agentType_idx" ON "ai_agents"("agentType");

-- CreateIndex
CREATE INDEX "ai_agents_isVerified_idx" ON "ai_agents"("isVerified");

-- CreateIndex
CREATE INDEX "ai_agents_isActive_idx" ON "ai_agents"("isActive");

-- CreateIndex
CREATE INDEX "ai_agents_riskScore_idx" ON "ai_agents"("riskScore");

-- CreateIndex
CREATE INDEX "ai_activities_timestamp_idx" ON "ai_activities"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "ai_activities_agentId_timestamp_idx" ON "ai_activities"("agentId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ai_activities_deviceId_timestamp_idx" ON "ai_activities"("deviceId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ai_activities_activityType_idx" ON "ai_activities"("activityType");

-- CreateIndex
CREATE INDEX "ai_activities_isBlocked_idx" ON "ai_activities"("isBlocked");

-- CreateIndex
CREATE INDEX "privacy_scores_userId_timestamp_idx" ON "privacy_scores"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "privacy_scores_period_idx" ON "privacy_scores"("period");

-- CreateIndex
CREATE INDEX "alerts_userId_timestamp_idx" ON "alerts"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "alerts_isRead_idx" ON "alerts"("isRead");

-- CreateIndex
CREATE INDEX "warrior_attack_chains_detectedAt_idx" ON "warrior_attack_chains"("detectedAt" DESC);

-- CreateIndex
CREATE INDEX "warrior_attack_chains_attackType_idx" ON "warrior_attack_chains"("attackType");

-- CreateIndex
CREATE INDEX "warrior_attack_chains_threatScore_idx" ON "warrior_attack_chains"("threatScore" DESC);

-- CreateIndex
CREATE INDEX "warrior_policies_createdAt_idx" ON "warrior_policies"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "warrior_policies_requiresApproval_idx" ON "warrior_policies"("requiresApproval");

-- CreateIndex
CREATE INDEX "warrior_policies_autoApplied_idx" ON "warrior_policies"("autoApplied");

-- CreateIndex
CREATE INDEX "warrior_incident_reports_generatedAt_idx" ON "warrior_incident_reports"("generatedAt" DESC);

-- CreateIndex
CREATE INDEX "warrior_incident_reports_riskScore_idx" ON "warrior_incident_reports"("riskScore" DESC);

-- CreateIndex
CREATE INDEX "warrior_events_occurredAt_idx" ON "warrior_events"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "warrior_events_eventType_idx" ON "warrior_events"("eventType");

-- CreateIndex
CREATE INDEX "warrior_events_agentId_idx" ON "warrior_events"("agentId");

-- CreateIndex
CREATE INDEX "warrior_events_chainId_idx" ON "warrior_events"("chainId");

-- CreateIndex
CREATE INDEX "warrior_quarantine_isActive_idx" ON "warrior_quarantine"("isActive");

-- CreateIndex
CREATE INDEX "warrior_quarantine_quarantinedAt_idx" ON "warrior_quarantine"("quarantinedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "domain_watches_domain_key" ON "domain_watches"("domain");

-- CreateIndex
CREATE INDEX "domain_watches_isActive_idx" ON "domain_watches"("isActive");

-- CreateIndex
CREATE INDEX "domain_watches_domain_idx" ON "domain_watches"("domain");

-- CreateIndex
CREATE INDEX "domain_watches_userId_idx" ON "domain_watches"("userId");

-- CreateIndex
CREATE INDEX "alert_history_watchId_idx" ON "alert_history"("watchId");

-- CreateIndex
CREATE INDEX "alert_history_triggeredAt_idx" ON "alert_history"("triggeredAt" DESC);

-- CreateIndex
CREATE INDEX "user_integrations_userId_idx" ON "user_integrations"("userId");

-- CreateIndex
CREATE INDEX "user_integrations_provider_idx" ON "user_integrations"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "user_integrations_userId_provider_key" ON "user_integrations"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hash_key" ON "api_keys"("hash");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_hash_idx" ON "api_keys"("hash");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE INDEX "daily_stats_userId_date_idx" ON "daily_stats"("userId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_userId_date_key" ON "daily_stats"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "xshield_api_keys_keyHash_key" ON "xshield_api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "xshield_api_keys_stripeCustomerId_key" ON "xshield_api_keys"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "xshield_api_keys_keyHash_idx" ON "xshield_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "xshield_api_keys_email_idx" ON "xshield_api_keys"("email");

-- CreateIndex
CREATE INDEX "xshield_api_keys_tier_idx" ON "xshield_api_keys"("tier");

-- CreateIndex
CREATE INDEX "xshield_api_keys_stripeCustomerId_idx" ON "xshield_api_keys"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "xshield_domain_watches_apiKeyId_idx" ON "xshield_domain_watches"("apiKeyId");

-- CreateIndex
CREATE INDEX "xshield_domain_watches_domain_idx" ON "xshield_domain_watches"("domain");

-- CreateIndex
CREATE INDEX "xshield_domain_watches_status_idx" ON "xshield_domain_watches"("status");

-- CreateIndex
CREATE INDEX "xshield_domain_watches_lastScannedAt_idx" ON "xshield_domain_watches"("lastScannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "xshield_domain_watches_apiKeyId_domain_key" ON "xshield_domain_watches"("apiKeyId", "domain");

-- CreateIndex
CREATE INDEX "watch_alerts_watchId_idx" ON "watch_alerts"("watchId");

-- CreateIndex
CREATE INDEX "watch_alerts_triggeredAt_idx" ON "watch_alerts"("triggeredAt" DESC);

-- CreateIndex
CREATE INDEX "xshield_risk_reports_domain_createdAt_idx" ON "xshield_risk_reports"("domain", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "xshield_risk_reports_apiKeyId_createdAt_idx" ON "xshield_risk_reports"("apiKeyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "xshield_risk_reports_riskLevel_idx" ON "xshield_risk_reports"("riskLevel");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_events" ADD CONSTRAINT "network_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_events" ADD CONSTRAINT "network_events_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "trackers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_activities" ADD CONSTRAINT "ai_activities_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_activities" ADD CONSTRAINT "ai_activities_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_scores" ADD CONSTRAINT "privacy_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warrior_policies" ADD CONSTRAINT "warrior_policies_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "warrior_attack_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warrior_events" ADD CONSTRAINT "warrior_events_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "warrior_attack_chains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "domain_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xshield_domain_watches" ADD CONSTRAINT "xshield_domain_watches_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "xshield_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_alerts" ADD CONSTRAINT "watch_alerts_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "xshield_domain_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xshield_risk_reports" ADD CONSTRAINT "xshield_risk_reports_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "xshield_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

