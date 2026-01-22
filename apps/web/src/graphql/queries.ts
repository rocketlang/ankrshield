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
