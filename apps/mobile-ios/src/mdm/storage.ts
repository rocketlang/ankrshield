/**
 * MDM storage — thin async key/value store backed by the MdmStorageModule
 * native bridge (Android SharedPreferences).
 *
 * Mirrors the AsyncStorage API surface so policy-engine.ts stays clean,
 * without requiring the @react-native-async-storage package.
 */
import { NativeModules } from 'react-native';

const { MdmStorageModule } = NativeModules;

// In-memory fallback (single session) if native module is not yet available
const _mem: Map<string, string> = new Map();

export const MdmStorage = {
  async getItem(key: string): Promise<string | null> {
    if (MdmStorageModule) {
      try {
        return await MdmStorageModule.getItem(key);
      } catch {
        return _mem.get(key) ?? null;
      }
    }
    return _mem.get(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    _mem.set(key, value);
    if (MdmStorageModule) {
      try {
        await MdmStorageModule.setItem(key, value);
      } catch {
        /* persisted in-memory above */
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    _mem.delete(key);
    if (MdmStorageModule) {
      try {
        await MdmStorageModule.removeItem(key);
      } catch {
        /* already removed from memory */
      }
    }
  },

  async multiRemove(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => MdmStorage.removeItem(k)));
  },
};
