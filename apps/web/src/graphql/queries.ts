/**
 * GraphQL Queries
 */

import { gql } from '@apollo/client';

export const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      name
      tier
      privacyLevel
      createdAt
      updatedAt
    }
  }
`;

export const DEVICES_QUERY = gql`
  query Devices {
    devices {
      id
      name
      deviceType
      isActive
      lastSeenAt
      osVersion
      appVersion
      createdAt
    }
  }
`;

export const NETWORK_EVENTS_QUERY = gql`
  query NetworkEvents($limit: Int, $offset: Int, $deviceId: String) {
    networkEvents(limit: $limit, offset: $offset, deviceId: $deviceId) {
      id
      timestamp
      eventType
      domain
      ip
      protocol
      isBlocked
      blockedBy
      bytesIn
      bytesOut
    }
  }
`;

export const TRACKERS_QUERY = gql`
  query Trackers($limit: Int, $category: String) {
    trackers(limit: $limit, category: $category) {
      id
      domain
      category
      vendor
      threatLevel
      description
      blockedCount
    }
  }
`;

export const PRIVACY_SCORES_QUERY = gql`
  query PrivacyScores($limit: Int, $period: String) {
    privacyScores(limit: $limit, period: $period) {
      id
      timestamp
      overallScore
      networkScore
      dnsScore
      appScore
      aiScore
      totalRequests
      blockedRequests
      allowedRequests
      trackersBlocked
      period
    }
  }
`;

// ── AI Warrior Command Center ─────────────────────────────────────────────────

export const WARRIOR_STATUS_QUERY = gql`
  query WarriorStatus {
    warriorStatus {
      isRunning
      eventsIngested
      attackChainsDetected
      policiesGenerated
      honeypotTriggers
      quarantinedAgents
      scopeViolations
      lastReportAt
      uptimeMs
    }
  }
`;

export const ATTACK_CHAINS_QUERY = gql`
  query AttackChains($limit: Int, $minThreatScore: Float) {
    attackChains(limit: $limit, minThreatScore: $minThreatScore) {
      id
      detectedAt
      startTime
      endTime
      attackType
      threatScore
      narrative
      technicalSummary
      affectedAssets
      suggestedActions
      autoActionsApplied
      events {
        id
        timestamp
        source
        severity
        agentId
        agentName
        action
        resource
        byteCount
        isBlocked
        blockReason
      }
    }
  }
`;

export const QUARANTINED_AGENTS_QUERY = gql`
  query QuarantinedAgents($activeOnly: Boolean) {
    quarantinedAgents(activeOnly: $activeOnly) {
      agentId
      agentName
      quarantinedAt
      reason
      attackChainId
      isActive
    }
  }
`;

export const GENERATED_POLICIES_QUERY = gql`
  query GeneratedPolicies($limit: Int, $pendingApprovalOnly: Boolean) {
    generatedPolicies(limit: $limit, pendingApprovalOnly: $pendingApprovalOnly) {
      id
      name
      description
      triggeredBy
      confidence
      autoApplied
      requiresApproval
      createdAt
      rules {
        type
        value
        reason
      }
    }
  }
`;

export const HONEYPOT_ASSETS_QUERY = gql`
  query HoneypotAssets($triggeredOnly: Boolean) {
    honeypotAssets(triggeredOnly: $triggeredOnly) {
      id
      type
      path
      name
      createdAt
      triggered
      triggeredAt
      triggeredAgentId
    }
  }
`;

export const SCOPE_VIOLATIONS_QUERY = gql`
  query ScopeViolations($agentId: String, $limit: Int) {
    scopeViolations(agentId: $agentId, limit: $limit) {
      id
      timestamp
      agentId
      agentName
      parentApp
      violationType
      resource
      severity
      violationCount
      actionTaken
    }
  }
`;

export const WARRIOR_EVENTS_QUERY = gql`
  query WarriorEvents($limit: Int, $type: String) {
    warriorEvents(limit: $limit, type: $type) {
      type
      at
    }
  }
`;

// ── AI Warrior Mutations ──────────────────────────────────────────────────────

export const RELEASE_AGENT_MUTATION = gql`
  mutation ReleaseAgent($agentId: String!) {
    releaseAgent(agentId: $agentId)
  }
`;

export const APPLY_POLICY_MUTATION = gql`
  mutation ApplyPolicy($policyId: String!) {
    applyPolicy(policyId: $policyId)
  }
`;

export const DEPLOY_HONEYPOTS_MUTATION = gql`
  mutation DeployDefaultHoneypots {
    deployDefaultHoneypots
  }
`;

// ── xShield Intelligence Queries ──────────────────────────────────────────────

export const XSHIELD_STATUS_QUERY = gql`
  query XShieldStatus {
    xshieldStatus {
      status
      totalScans
      activeWatches
      totalApiKeys
      sources
      version
      timestamp
    }
  }
`;

export const API_KEY_INFO_QUERY = gql`
  query ApiKeyInfo {
    xshieldApiKeyInfo {
      id
      name
      email
      tier
      monthlyQuota
      usedThisMonth
      quotaResetAt
      isActive
      keyPrefix
      createdAt
    }
  }
`;

export const WATCHES_QUERY = gql`
  query Watches {
    xshieldWatches {
      id
      domain
      status
      alertThreshold
      lastRiskScore
      lastRiskLevel
      lastScannedAt
      createdAt
    }
  }
`;

export const IOC_FEED_QUERY = gql`
  query IocFeed($limit: Int, $minRiskScore: Int) {
    xshieldIocFeed(limit: $limit, minRiskScore: $minRiskScore)
  }
`;

export const XSHIELD_SCAN_QUERY = gql`
  query XShieldScan($domain: String!) {
    xshieldScan(domain: $domain) {
      domain
      riskScore
      riskLevel
      scannedAt
      findings {
        source
        signal
        severity
      }
    }
  }
`;

export const WATCH_ALERTS_QUERY = gql`
  query WatchAlerts($watchId: String!, $limit: Int) {
    xshieldWatchAlerts(watchId: $watchId, limit: $limit) {
      id
      domain
      riskScore
      riskLevel
      triggeredAt
      details
      notified
    }
  }
`;

export const SCAN_HISTORY_QUERY = gql`
  query ScanHistory($limit: Int, $domain: String) {
    xshieldScanHistory(limit: $limit, domain: $domain) {
      domain
      riskScore
      riskLevel
      scannedAt
      findingCount
    }
  }
`;

export const PLAYBOOK_QUERY = gql`
  query Playbook($domain: String!) {
    xshieldPlaybook(domain: $domain) {
      domain
      actions {
        type
        title
        description
        command
        yaml
      }
    }
  }
`;
