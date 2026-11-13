import type { CreateTagInput, UpdateTagInput } from './db';
import type { ValidationResult } from './todo-validation';

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export function validateTag(body: unknown): ValidationResult<CreateTagInput>;
export function validateTag(body: unknown, update: true): ValidationResult<UpdateTagInput>;
export function validateTag(
  body: unknown,
  update = false,
): ValidationResult<UpdateTagInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((key) => key !== 'name' && key !== 'color')) {
    return { error: 'Only name and color are allowed' };
  }
  if (update && Object.keys(fields).length === 0) {
    return { error: 'At least one field is required' };
  }
  const result: UpdateTagInput = {};
  if (!update || fields.name !== undefined) {
    if (typeof fields.name !== 'string' || !fields.name.trim()) {
      return { error: 'Tag name is required' };
    }
    result.name = fields.name.trim();
  }
  if (fields.color !== undefined) {
    if (typeof fields.color !== 'string' || !hexColorPattern.test(fields.color)) {
      return { error: 'Color must be a valid hex code' };
    }
    result.color = fields.color;
  } else if (!update) {
    result.color = '#3B82F6';
  }
  return { value: result };
}

export function validateTagIds(value: unknown): ValidationResult<number[]> {
  if (!Array.isArray(value) || value.some(
    (id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0,
  )) {
    return { error: 'tag_ids must be an array of positive integer IDs' };
  }
  return { value: [...new Set<number>(value)] };
}

// Keep the chosen hue, darkening bright colors until white text meets WCAG AA.
export function tagBackground(color: string): string {
  if (!hexColorPattern.test(color)) throw new Error('Invalid tag color');
  let channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  while (true) {
    const linear = channels.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    if (1.05 / (luminance + 0.05) >= 4.5) {
      return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    }
    channels = channels.map((value) => Math.floor(value * 0.95));
  }
}
