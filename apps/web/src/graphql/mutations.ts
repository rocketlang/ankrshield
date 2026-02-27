/**
 * GraphQL Mutations
 */

import { gql } from '@apollo/client';

export const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      token
      user {
        id
        email
        name
        tier
      }
    }
  }
`;

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
      user {
        id
        email
        name
        tier
      }
    }
  }
`;

export const ADD_WATCH_MUTATION = gql`
  mutation AddWatch($domain: String!, $alertThreshold: Int, $webhookUrl: String) {
    xshieldAddWatch(input: { domain: $domain, alertThreshold: $alertThreshold, webhookUrl: $webhookUrl }) {
      id
      domain
      status
      alertThreshold
      createdAt
    }
  }
`;

export const PAUSE_WATCH_MUTATION = gql`
  mutation PauseWatch($watchId: String!) {
    xshieldPauseWatch(watchId: $watchId) {
      id
      status
    }
  }
`;

export const RESUME_WATCH_MUTATION = gql`
  mutation ResumeWatch($watchId: String!) {
    xshieldResumeWatch(watchId: $watchId) {
      id
      status
    }
  }
`;

export const REMOVE_WATCH_MUTATION = gql`
  mutation RemoveWatch($watchId: String!) {
    xshieldRemoveWatch(watchId: $watchId)
  }
`;
