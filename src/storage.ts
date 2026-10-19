import * as SecureStore from "expo-secure-store";
import {
  emptyKeys,
  isProviderId,
  PROVIDERS,
  type ProviderId,
} from "./vision";

const PROVIDER_KEY = "mathbuddy.provider";

function keyName(id: ProviderId): string {
  return `mathbuddy.key.${id}`;
}

export async function loadSettings(): Promise<{
  providerId: ProviderId;
  keys: Record<ProviderId, string>;
}> {
  const storedProvider = await SecureStore.getItemAsync(PROVIDER_KEY);
  const providerId = isProviderId(storedProvider) ? storedProvider : "openai";
  const keys = emptyKeys();
  await Promise.all(
    PROVIDERS.map(async (provider) => {
      keys[provider.id] = (await SecureStore.getItemAsync(keyName(provider.id))) ?? "";
    }),
  );
  return { providerId, keys };
}

export async function saveProvider(id: ProviderId): Promise<void> {
  await SecureStore.setItemAsync(PROVIDER_KEY, id);
}

export async function saveKey(id: ProviderId, key: string): Promise<void> {
  const trimmed = key.replace(/\s+/g, "");
  if (!trimmed) {
    await SecureStore.deleteItemAsync(keyName(id));
    return;
  }
  await SecureStore.setItemAsync(keyName(id), trimmed);
}
