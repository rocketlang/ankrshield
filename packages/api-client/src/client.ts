/**
 * GraphQL API client
 */

export class AnkrShieldClient {
  private apiUrl: string;
  private token?: string;

  constructor(apiUrl: string, token?: string) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  setToken(token: string) {
    this.token = token;
  }

  async query<T>(_query: string, _variables?: Record<string, unknown>): Promise<T> {
    // TODO: Implement GraphQL query using this.apiUrl and this.token
    if (!this.token) {
      throw new Error('Authentication token required');
    }
    throw new Error(`GraphQL client not implemented for ${this.apiUrl}`);
  }

  async mutate<T>(_mutation: string, _variables?: Record<string, unknown>): Promise<T> {
    // TODO: Implement GraphQL mutation using this.apiUrl and this.token
    if (!this.token) {
      throw new Error('Authentication token required');
    }
    throw new Error(`GraphQL client not implemented for ${this.apiUrl}`);
  }
}
