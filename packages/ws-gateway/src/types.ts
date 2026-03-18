export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  CONNECTOR: DurableObjectNamespace;
  INTERNAL_SECRET: string;
}

/**
 * Cloudflare TLS client auth metadata from request.cf.tlsClientAuth.
 *
 * IMPORTANT: All fields are STRINGS, not booleans.
 * certPresented is '0' or '1' (not false/true).
 * certVerified is 'SUCCESS', 'FAILED:reason', or 'NONE'.
 * certRevoked is '0' or '1'.
 */
export interface TlsClientAuth {
  certPresented: '0' | '1';
  certVerified: string;
  certSerial: string;
  certFingerprintSHA1: string;
  certFingerprintSHA256: string;
  certSubjectDN: string;
  certSubjectDNLegacy: string;
  certSubjectDNRFC2253: string;
  certIssuerDN: string;
  certIssuerDNLegacy: string;
  certIssuerDNRFC2253: string;
  certIssuerSKI: string;
  certIssuerSerial: string;
  certNotBefore: string;
  certNotAfter: string;
  certSKI: string;
  certRevoked: '0' | '1';
}
