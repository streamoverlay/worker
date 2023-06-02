export function getUntilEpoch(ms: number) {
  const now = Date.now();
  return (now + ms) / 1000;
}

export function getUntilSecsEpoch(secs: number) {
  return getUntilEpoch(secs * 1000);
}

export function getUntilMinsEpoch(mins: number) {
  return getUntilSecsEpoch(mins * 60);
}

export function getUntilHoursEpoch(hours: number) {
  return getUntilMinsEpoch(hours * 60);
}
