export function padBus(busNumber) {
  return String(busNumber).padStart(2, "0");
}

export function dbToX32Fader(db) {
  if (!Number.isFinite(db) || db < -60 || db > 10) {
    throw new RangeError("Fader level must be between -60 and +10 dB.");
  }

  if (db <= -60) return 0.0625 * ((db + 90) / 30);
  if (db <= -30) return 0.0625 + ((db + 60) / 30) * 0.1875;
  if (db <= -10) return 0.25 + ((db + 30) / 20) * 0.25;
  return 0.5 + ((db + 10) / 20) * 0.5;
}

export function x32FaderToDb(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const fader = Math.min(1, Math.max(0, value));

  if (fader <= 0.0625) return -90 + (fader / 0.0625) * 30;
  if (fader <= 0.25) return -60 + ((fader - 0.0625) / 0.1875) * 30;
  if (fader <= 0.5) return -30 + ((fader - 0.25) / 0.25) * 20;
  return -10 + ((fader - 0.5) / 0.5) * 20;
}

export function readOscNumber(args) {
  const first = Array.isArray(args) ? args[0] : undefined;
  const value = first && typeof first === "object" && "value" in first
    ? first.value
    : first;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function x32ValueToDb(value, minDb, maxDb) {
  if (!Number.isFinite(value)) return null;
  return minDb + Math.min(1, Math.max(0, value)) * (maxDb - minDb);
}

export function dbToX32Value(db, minDb, maxDb) {
  if (!Number.isFinite(db) || db < minDb || db > maxDb) {
    throw new RangeError(`Value must be between ${minDb} and ${maxDb} dB.`);
  }
  return (db - minDb) / (maxDb - minDb);
}

export const X32_COMPRESSOR_RATIOS = [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 20, 100];
