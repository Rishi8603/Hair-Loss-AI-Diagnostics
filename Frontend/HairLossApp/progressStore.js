import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File as FSFile, Directory, Paths } from 'expo-file-system';

const STORAGE_KEY = '@progressLog';

export const ZONE_ORDER = ['frontal', 'temporal_left', 'temporal_right', 'mid_scalp', 'vertex', 'occipital'];

export const ZONE_LABELS = {
  frontal: 'Front hairline',
  temporal_left: 'Left temple',
  temporal_right: 'Right temple',
  mid_scalp: 'Mid-scalp',
  vertex: 'Crown',
  occipital: 'Back of head',
};

// Changes smaller than this (in density points, 0–1 scale) are within normal
// photo-to-photo variation from lighting and angle, so they are reported as
// "stable" rather than growth or loss.
export const NOISE_THRESHOLD = 0.03;

// ── Dates ──────────────────────────────────────────────────────────
export function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayKeyToUTC(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((dayKeyToUTC(toKey) - dayKeyToUTC(fromKey)) / 86400000);
}

export function formatDayKey(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dayNumber(log, entry) {
  return log.length ? daysBetween(log[0].dayKey, entry.dayKey) + 1 : 1;
}

// Consecutive days with a check-in, ending today (or yesterday, so a streak
// isn't shown as broken before today's check-in is done).
export function currentStreak(log, today = localDayKey()) {
  if (!log.length) return 0;
  const days = [...new Set(log.map((e) => e.dayKey))].sort();
  let i = days.length - 1;
  if (daysBetween(days[i], today) > 1) return 0;
  let streak = 1;
  while (i > 0 && daysBetween(days[i - 1], days[i]) === 1) {
    streak += 1;
    i -= 1;
  }
  return streak;
}

// ── Storage ────────────────────────────────────────────────────────
export async function loadLog() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const log = raw ? JSON.parse(raw) : [];
  return Array.isArray(log) ? log.sort((a, b) => a.dayKey.localeCompare(b.dayKey)) : [];
}

async function saveLog(log) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

// Copy the day's photos out of the temporary cache so they survive app restarts.
async function persistPhotos(entryId, images) {
  if (Platform.OS === 'web') return {};
  const dir = new Directory(Paths.document, 'progress', entryId);
  dir.create({ intermediates: true, idempotent: true });
  const saved = {};
  for (const [key, uri] of Object.entries(images)) {
    const src = new FSFile(uri);
    if (!src.exists) continue;
    const dest = new FSFile(dir, `${key}.jpg`);
    await src.copy(dest, { overwrite: true });
    saved[key] = dest.uri;
  }
  return saved;
}

function deletePhotos(entryId) {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, 'progress', entryId);
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('Could not delete progress photos', e);
  }
}

// Save a /measure-zones/ result as today's check-in (replacing an earlier one from today).
export async function saveCheckIn(result, images) {
  const dayKey = localDayKey();
  const id = String(Date.now());
  let photos = {};
  try {
    photos = await persistPhotos(id, images);
  } catch (e) {
    console.warn('Could not keep progress photos', e);
  }

  const entry = {
    id,
    dayKey,
    createdAt: new Date().toISOString(),
    zones: result.zones || {},
    zoneSource: result.zone_source || {},
    measuredZones: result.measured_zones || [],
    warnings: collectWarnings(result.view_info),
    viewsUsed: result.views_used || [],
    photos,
  };

  const log = await loadLog();
  const replaced = log.filter((e) => e.dayKey === dayKey);
  replaced.forEach((e) => deletePhotos(e.id));
  const next = [...log.filter((e) => e.dayKey !== dayKey), entry].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  await saveLog(next);
  return next;
}

export async function deleteCheckIn(entryId) {
  const log = await loadLog();
  deletePhotos(entryId);
  const next = log.filter((e) => e.id !== entryId);
  await saveLog(next);
  return next;
}

export async function clearLog() {
  const log = await loadLog();
  log.forEach((e) => deletePhotos(e.id));
  await AsyncStorage.removeItem(STORAGE_KEY);
  return [];
}

function collectWarnings(viewInfo) {
  if (!viewInfo) return [];
  const out = [];
  for (const [view, info] of Object.entries(viewInfo)) {
    for (const w of info.warnings || []) out.push({ view, text: w });
  }
  return out;
}

// ── Analysis ───────────────────────────────────────────────────────
function isMeasured(entry, zone) {
  return entry.zoneSource[zone] === 'measured' && typeof entry.zones[zone] === 'number';
}

// Mean hair density over the zones actually measured in this check-in.
export function entryCoverage(entry) {
  const zones = ZONE_ORDER.filter((z) => isMeasured(entry, z));
  if (!zones.length) return null;
  return zones.reduce((s, z) => s + entry.zones[z], 0) / zones.length;
}

function statusFor(deltaDensity) {
  if (deltaDensity >= NOISE_THRESHOLD) return 'improved';
  if (deltaDensity <= -NOISE_THRESHOLD) return 'declined';
  return 'stable';
}

/**
 * Compare two check-ins zone by zone. Only zones measured from photos on BOTH
 * days are compared — zones filled in from the stage estimate are skipped.
 * Visible scalp = 1 − hair density (share of the zone where scalp shows).
 */
export function compareEntries(prev, curr) {
  const zones = ZONE_ORDER.filter((z) => isMeasured(prev, z) && isMeasured(curr, z)).map((z) => {
    const prevDensity = prev.zones[z];
    const currDensity = curr.zones[z];
    const deltaDensity = currDensity - prevDensity;
    return {
      key: z,
      label: ZONE_LABELS[z],
      prevDensity,
      currDensity,
      prevScalp: 1 - prevDensity,
      currScalp: 1 - currDensity,
      deltaDensity,
      deltaScalp: -deltaDensity,
      status: statusFor(deltaDensity),
    };
  });

  if (!zones.length) return { zones, overall: null };

  const prevMean = zones.reduce((s, z) => s + z.prevDensity, 0) / zones.length;
  const currMean = zones.reduce((s, z) => s + z.currDensity, 0) / zones.length;
  const delta = currMean - prevMean;
  return {
    zones,
    overall: {
      prevDensity: prevMean,
      currDensity: currMean,
      prevScalp: 1 - prevMean,
      currScalp: 1 - currMean,
      deltaDensity: delta,
      deltaScalp: -delta,
      status: statusFor(delta),
    },
  };
}
