import { Platform } from 'react-native';
import { File as FSFile } from 'expo-file-system';

export const API_URL_BASE = 'https://rishi8603-hair-loss-api.hf.space';

// Field names /measure-zones/ accepts, in capture order.
export const MEASURE_FIELDS = ['anterior', 'lateral_right', 'lateral_left', 'vertex', 'posterior'];

export function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Request timed out. The server may be waking up — please try again in a few seconds.')),
      timeoutMs,
    );
  });
  return Promise.race([fetch(url, options), timeout]).finally(() => clearTimeout(timer));
}

// Expo's fetch rejects the legacy `{ uri, name, type }` part and can't fetch()
// local file:// URIs (404), so on native the photo goes in as an
// expo-file-system File (a Blob-compatible object read natively); on web the
// URI is a blob: URL that fetch can read.
export async function appendPhoto(formData, field, uri, fallbackName) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    formData.append(field, blob, fallbackName);
    return;
  }
  const file = new FSFile(uri);
  if (!file.exists) {
    throw new Error('Could not read a selected photo — it may have been removed from the device. Please capture it again.');
  }
  formData.append(field, file);
}

// POST a form and return parsed JSON, with errors that say what went wrong.
export async function postForm(path, formData, timeoutMs) {
  const response = await fetchWithTimeout(`${API_URL_BASE}${path}`, { method: 'POST', body: formData }, timeoutMs);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server did not return a valid response (HTTP ${response.status}). It may still be starting up — please retry in a few seconds.`);
  }
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${json.detail || 'Request failed'} (HTTP ${response.status} on ${path})`);
  }
  return json;
}

export async function predictStage(uri) {
  const formData = new FormData();
  await appendPhoto(formData, 'file', uri, 'scalp.jpg');
  return postForm('/predict/', formData, 60000);
}

// images: { anterior|lateral_right|lateral_left|vertex|posterior: uri }
export async function measureZones(images, cnnStage) {
  const formData = new FormData();
  if (cnnStage) formData.append('cnn_stage', cnnStage);
  formData.append('include_overlays', 'false');
  let count = 0;
  for (const key of MEASURE_FIELDS) {
    if (images[key]) {
      await appendPhoto(formData, key, images[key], `${key}.jpg`);
      count += 1;
    }
  }
  if (count === 0) throw new Error('Please capture at least one scalp angle.');
  return postForm('/measure-zones/', formData, 90000);
}
