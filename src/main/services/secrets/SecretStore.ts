import fs from 'fs';
import path from 'path';
import type { StoredTokenPayload } from '@shared/types/gitlab';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface EncryptedVaultFile {
  version: 1;
  entries: Record<string, string>; // accountId -> base64 encrypted payload
}

/**
 * Stores OAuth/PAT tokens encrypted via Electron's OS keychain-backed safeStorage.
 * Never persists plaintext tokens to disk.
 */
export class SecretStore {
  private readonly filePath: string;
  private readonly crypto: SafeStorageLike;

  constructor(userDataDir: string, cryptoProvider: SafeStorageLike) {
    this.filePath = path.join(userDataDir, 'secrets.vault.json');
    this.crypto = cryptoProvider;
  }

  private assertAvailable(): void {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new Error(
        'OS keychain encryption (safeStorage) is unavailable. Refusing to store tokens in plaintext.'
      );
    }
  }

  private readVault(): EncryptedVaultFile {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, entries: {} };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<EncryptedVaultFile>;
      return {
        version: 1,
        entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {}
      };
    } catch {
      return { version: 1, entries: {} };
    }
  }

  private writeVault(vault: EncryptedVaultFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(vault, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  public setToken(accountId: string, payload: StoredTokenPayload): void {
    this.assertAvailable();
    const vault = this.readVault();
    const encrypted = this.crypto.encryptString(JSON.stringify(payload));
    vault.entries[accountId] = encrypted.toString('base64');
    this.writeVault(vault);
  }

  public getToken(accountId: string): StoredTokenPayload | null {
    const vault = this.readVault();
    const encoded = vault.entries[accountId];
    if (!encoded) return null;
    this.assertAvailable();
    try {
      const decrypted = this.crypto.decryptString(Buffer.from(encoded, 'base64'));
      return JSON.parse(decrypted) as StoredTokenPayload;
    } catch {
      return null;
    }
  }

  public deleteToken(accountId: string): void {
    const vault = this.readVault();
    if (accountId in vault.entries) {
      delete vault.entries[accountId];
      this.writeVault(vault);
    }
  }
}
