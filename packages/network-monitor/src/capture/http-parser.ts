/**
 * HTTP Parser
 * Extracts HTTP request and response information from packet payloads
 */

import { HTTPInfo } from '../types';

/**
 * HTTP Parser
 * Parses HTTP/1.x requests and responses
 */
export class HTTPParser {
  /**
   * Check if payload contains HTTP request
   */
  static isHTTPRequest(payload: Buffer): boolean {
    if (payload.length < 16) return false;

    const payloadStr = payload.toString('ascii', 0, Math.min(100, payload.length));

    // Check for HTTP methods
    const methods = ['GET ', 'POST ', 'PUT ', 'DELETE ', 'HEAD ', 'OPTIONS ', 'PATCH ', 'TRACE ', 'CONNECT '];
    return methods.some((method) => payloadStr.startsWith(method));
  }

  /**
   * Check if payload contains HTTP response
   */
  static isHTTPResponse(payload: Buffer): boolean {
    if (payload.length < 12) return false;

    const payloadStr = payload.toString('ascii', 0, 12);
    return payloadStr.startsWith('HTTP/');
  }

  /**
   * Parse HTTP request information
   */
  static parseHTTPRequest(payload: Buffer): HTTPInfo | null {
    try {
      if (!this.isHTTPRequest(payload)) {
        return null;
      }

      // Convert to string (up to first 4KB for headers)
      const payloadStr = payload.toString('utf8', 0, Math.min(4096, payload.length));

      // Split into lines
      const lines = payloadStr.split('\r\n');
      if (lines.length < 1) return null;

      // Parse request line: METHOD /path HTTP/1.1
      const requestLine = lines[0];
      const requestMatch = requestLine.match(/^(\w+)\s+([^\s]+)\s+HTTP\/[\d.]+$/);
      if (!requestMatch) return null;

      const method = requestMatch[1];
      const fullPath = requestMatch[2];

      // Parse path and query string
      const [path, queryString] = fullPath.split('?', 2);

      // Parse headers
      const headers: Record<string, string> = {};
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') break; // End of headers

        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const headerName = line.substring(0, colonIndex).trim().toLowerCase();
          const headerValue = line.substring(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
      }

      // Extract common headers
      const host = headers['host'];
      const userAgent = headers['user-agent'];
      const referer = headers['referer'] || headers['referrer'];
      const contentType = headers['content-type'];

      return {
        method,
        host,
        path,
        queryString: queryString || undefined,
        userAgent,
        referer,
        contentType,
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse HTTP response information
   */
  static parseHTTPResponse(payload: Buffer): HTTPInfo | null {
    try {
      if (!this.isHTTPResponse(payload)) {
        return null;
      }

      // Convert to string (up to first 4KB for headers)
      const payloadStr = payload.toString('utf8', 0, Math.min(4096, payload.length));

      // Split into lines
      const lines = payloadStr.split('\r\n');
      if (lines.length < 1) return null;

      // Parse status line: HTTP/1.1 200 OK
      const statusLine = lines[0];
      const statusMatch = statusLine.match(/^HTTP\/[\d.]+\s+(\d+)/);
      if (!statusMatch) return null;

      const statusCode = parseInt(statusMatch[1]);

      // Parse headers
      const headers: Record<string, string> = {};
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') break; // End of headers

        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const headerName = line.substring(0, colonIndex).trim().toLowerCase();
          const headerValue = line.substring(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
      }

      const contentType = headers['content-type'];

      return {
        statusCode,
        contentType,
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse HTTP information from packet payload (auto-detect request/response)
   */
  static parseHTTP(payload: Buffer): HTTPInfo | null {
    if (this.isHTTPRequest(payload)) {
      return this.parseHTTPRequest(payload);
    } else if (this.isHTTPResponse(payload)) {
      return this.parseHTTPResponse(payload);
    }
    return null;
  }

  /**
   * Extract domain from HTTP Host header
   */
  static extractHostFromHTTP(payload: Buffer): string | undefined {
    const httpInfo = this.parseHTTPRequest(payload);
    return httpInfo?.host;
  }

  /**
   * Get user agent from HTTP request
   */
  static getUserAgent(payload: Buffer): string | undefined {
    const httpInfo = this.parseHTTPRequest(payload);
    return httpInfo?.userAgent;
  }

  /**
   * Check if request is for tracking/analytics
   * Based on common tracking URL patterns
   */
  static isTrackingRequest(httpInfo: HTTPInfo): boolean {
    if (!httpInfo.path) return false;

    const trackingPatterns = [
      /\/analytics/i,
      /\/track/i,
      /\/pixel/i,
      /\/beacon/i,
      /\/collect/i,
      /\/event/i,
      /\/impression/i,
      /\/conversion/i,
      /ga\.js/i,
      /gtag/i,
      /fbevents/i,
      /doubleclick/i,
    ];

    return trackingPatterns.some((pattern) => pattern.test(httpInfo.path!));
  }

  /**
   * Parse cookies from HTTP headers
   */
  static parseCookies(headers: string): Map<string, string> {
    const cookies = new Map<string, string>();

    const cookieLines = headers.split('\r\n').filter((line) => line.toLowerCase().startsWith('cookie:'));

    for (const line of cookieLines) {
      const cookieStr = line.substring(7).trim(); // Remove "Cookie:"
      const pairs = cookieStr.split(';');

      for (const pair of pairs) {
        const [key, value] = pair.trim().split('=', 2);
        if (key && value) {
          cookies.set(key, value);
        }
      }
    }

    return cookies;
  }
}
