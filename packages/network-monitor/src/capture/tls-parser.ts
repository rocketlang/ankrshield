/**
 * TLS Parser
 * Extract SNI and other information from TLS handshakes
 */

import { TLSInfo } from '../types';

/**
 * TLS Content Types
 */
enum TLSContentType {
  CHANGE_CIPHER_SPEC = 0x14,
  ALERT = 0x15,
  HANDSHAKE = 0x16,
  APPLICATION_DATA = 0x17,
}

/**
 * TLS Handshake Types
 */
enum TLSHandshakeType {
  HELLO_REQUEST = 0x00,
  CLIENT_HELLO = 0x01,
  SERVER_HELLO = 0x02,
  CERTIFICATE = 0x0b,
  SERVER_KEY_EXCHANGE = 0x0c,
  CERTIFICATE_REQUEST = 0x0d,
  SERVER_HELLO_DONE = 0x0e,
  CERTIFICATE_VERIFY = 0x0f,
  CLIENT_KEY_EXCHANGE = 0x10,
  FINISHED = 0x14,
}

/**
 * TLS Extension Types
 */
enum TLSExtensionType {
  SERVER_NAME = 0x0000,
  MAX_FRAGMENT_LENGTH = 0x0001,
  STATUS_REQUEST = 0x0005,
  SUPPORTED_GROUPS = 0x000a,
  SIGNATURE_ALGORITHMS = 0x000d,
  ALPN = 0x0010,
  ENCRYPT_THEN_MAC = 0x0016,
  EXTENDED_MASTER_SECRET = 0x0017,
  SESSION_TICKET = 0x0023,
  SUPPORTED_VERSIONS = 0x002b,
  PSK_KEY_EXCHANGE_MODES = 0x002d,
  KEY_SHARE = 0x0033,
}

/**
 * Extract TLS information from packet payload
 */
export class TLSParser {
  /**
   * Check if payload contains TLS handshake
   */
  static isTLSHandshake(payload: Buffer): boolean {
    if (payload.length < 6) return false;

    // Check if first byte is 0x16 (Handshake)
    return payload[0] === TLSContentType.HANDSHAKE;
  }

  /**
   * Parse TLS ClientHello and extract information
   */
  static parseTLSInfo(payload: Buffer): TLSInfo | null {
    try {
      if (!this.isTLSHandshake(payload)) {
        return null;
      }

      // TLS Record Header:
      // Byte 0: Content Type (0x16 for Handshake)
      // Bytes 1-2: TLS Version (0x0301 = TLS 1.0, 0x0303 = TLS 1.2, etc.)
      // Bytes 3-4: Length
      // Byte 5+: Handshake data

      const tlsVersion = this.parseTLSVersion(payload[1], payload[2]);
      const handshakeType = payload[5];

      // Only process ClientHello
      if (handshakeType !== TLSHandshakeType.CLIENT_HELLO) {
        return null;
      }

      const info: TLSInfo = {
        tlsVersion,
      };

      // Parse extensions starting from offset
      // ClientHello structure:
      // - Handshake Type (1 byte)
      // - Length (3 bytes)
      // - Version (2 bytes)
      // - Random (32 bytes)
      // - Session ID Length (1 byte)
      // - Session ID (variable)
      // - Cipher Suites Length (2 bytes)
      // - Cipher Suites (variable)
      // - Compression Methods Length (1 byte)
      // - Compression Methods (variable)
      // - Extensions Length (2 bytes)
      // - Extensions (variable)

      let offset = 6; // Skip TLS record header + handshake type

      // Skip handshake length (3 bytes)
      offset += 3;

      // Skip version (2 bytes)
      offset += 2;

      // Skip random (32 bytes)
      offset += 32;

      if (offset >= payload.length) return info;

      // Session ID length
      const sessionIdLength = payload[offset];
      offset += 1 + sessionIdLength;

      if (offset + 2 >= payload.length) return info;

      // Cipher suites length
      const cipherSuitesLength = payload.readUInt16BE(offset);
      offset += 2 + cipherSuitesLength;

      if (offset + 1 >= payload.length) return info;

      // Compression methods length
      const compressionMethodsLength = payload[offset];
      offset += 1 + compressionMethodsLength;

      if (offset + 2 >= payload.length) return info;

      // Extensions length
      const extensionsLength = payload.readUInt16BE(offset);
      offset += 2;

      const extensionsEnd = offset + extensionsLength;

      // Parse extensions
      while (offset + 4 <= extensionsEnd && offset < payload.length) {
        const extensionType = payload.readUInt16BE(offset);
        const extensionLength = payload.readUInt16BE(offset + 2);
        offset += 4;

        if (offset + extensionLength > payload.length) break;

        // Server Name Indication (SNI)
        if (extensionType === TLSExtensionType.SERVER_NAME) {
          info.sni = this.parseServerName(payload.slice(offset, offset + extensionLength));
        }

        // ALPN (Application-Layer Protocol Negotiation)
        if (extensionType === TLSExtensionType.ALPN) {
          info.alpn = this.parseALPN(payload.slice(offset, offset + extensionLength));
        }

        offset += extensionLength;
      }

      return info;
    } catch (error) {
      // Silently fail on malformed packets
      return null;
    }
  }

  /**
   * Parse TLS version bytes
   */
  private static parseTLSVersion(major: number, minor: number): string {
    const version = (major << 8) | minor;

    switch (version) {
      case 0x0301:
        return 'TLS 1.0';
      case 0x0302:
        return 'TLS 1.1';
      case 0x0303:
        return 'TLS 1.2';
      case 0x0304:
        return 'TLS 1.3';
      case 0x0300:
        return 'SSL 3.0';
      default:
        return `Unknown (0x${version.toString(16)})`;
    }
  }

  /**
   * Parse Server Name extension
   */
  private static parseServerName(extension: Buffer): string | undefined {
    try {
      // Server Name List Length (2 bytes)
      let offset = 2;

      // Server Name Type (1 byte) - should be 0x00 for hostname
      const nameType = extension[offset];
      offset += 1;

      if (nameType !== 0x00) return undefined;

      // Server Name Length (2 bytes)
      const nameLength = extension.readUInt16BE(offset);
      offset += 2;

      // Server Name (ASCII string)
      const serverName = extension.slice(offset, offset + nameLength).toString('ascii');

      return serverName;
    } catch {
      return undefined;
    }
  }

  /**
   * Parse ALPN extension
   */
  private static parseALPN(extension: Buffer): string[] | undefined {
    try {
      const protocols: string[] = [];

      // ALPN Extension Structure Length (2 bytes)
      let offset = 2;

      while (offset < extension.length) {
        // Protocol String Length (1 byte)
        const protocolLength = extension[offset];
        offset += 1;

        if (offset + protocolLength > extension.length) break;

        // Protocol String
        const protocol = extension.slice(offset, offset + protocolLength).toString('ascii');
        protocols.push(protocol);

        offset += protocolLength;
      }

      return protocols.length > 0 ? protocols : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Check if SNI is encrypted (ESNI/ECH)
   * Encrypted SNI is indicated by the encrypted_server_name extension
   */
  static hasEncryptedSNI(_payload: Buffer): boolean {
    // This is a simplified check
    // In practice, you'd need to check for extension type 0xffce (encrypted_server_name)
    // or 0xfe0d (encrypted_client_hello)
    return false; // TODO: Implement full ESNI/ECH detection
  }
}

/**
 * Extract domain from SNI or fallback to IP
 */
export function extractDomain(
  _destinationIp: string,
  destinationPort: number,
  payload?: Buffer
): string | undefined {
  // If payload is available and looks like TLS, try to extract SNI
  if (payload && destinationPort === 443) {
    const tlsInfo = TLSParser.parseTLSInfo(payload);
    if (tlsInfo?.sni) {
      return tlsInfo.sni;
    }
  }

  // Fallback to IP (caller can do reverse DNS lookup if needed)
  return undefined;
}
