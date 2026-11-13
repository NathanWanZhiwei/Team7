import {
  isFilterPreset,
  MAX_PRESET_NAME_LENGTH,
  type FilterPreset,
} from './filters';

const PRESET_KEY_PREFIX = 'todo-app:filter-presets';
const MAX_PRESETS = 50;
const MAX_PRESET_DATA_LENGTH = 100_000;

export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(storage?: PresetStorage): PresetStorage {
  if (storage) return storage;
  if (typeof window === 'undefined') throw new Error('Browser storage is unavailable.');
  return window.localStorage;
}

export function presetStorageKey(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('A valid user ID is required for filter presets.');
  }
  return `${PRESET_KEY_PREFIX}:${userId}`;
}

export function loadPresets(userId: number, storage?: PresetStorage): FilterPreset[] {
  const raw = getStorage(storage).getItem(presetStorageKey(userId));
  if (!raw) return [];
  if (raw.length > MAX_PRESET_DATA_LENGTH) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const presets: FilterPreset[] = [];
  const ids = new Set<string>();
  for (const candidate of parsed) {
    if (presets.length === MAX_PRESETS) break;
    if (!isFilterPreset(candidate) || ids.has(candidate.id)) continue;
    ids.add(candidate.id);
    presets.push(candidate);
  }
  return presets;
}

export function savePreset(
  userId: number,
  preset: FilterPreset,
  storage?: PresetStorage,
): FilterPreset[] {
  const trimmedName = preset.name.trim();
  const normalized: FilterPreset = { ...preset, name: trimmedName };
  if (trimmedName.length > MAX_PRESET_NAME_LENGTH || !isFilterPreset(normalized)) {
    throw new Error('Filter preset is invalid.');
  }
  const target = getStorage(storage);
  const presets = loadPresets(userId, target);
  if (presets.length >= MAX_PRESETS) {
    throw new Error(`You can save up to ${MAX_PRESETS} filter presets.`);
  }
  const updated = [...presets, normalized];
  const serialized = JSON.stringify(updated);
  if (serialized.length > MAX_PRESET_DATA_LENGTH) {
    throw new Error('Filter presets exceed the available storage limit.');
  }
  target.setItem(presetStorageKey(userId), serialized);
  return updated;
}

export function deletePreset(
  userId: number,
  id: string,
  storage?: PresetStorage,
): FilterPreset[] {
  const target = getStorage(storage);
  const updated = loadPresets(userId, target).filter((preset) => preset.id !== id);
  target.setItem(presetStorageKey(userId), JSON.stringify(updated));
  return updated;
}
