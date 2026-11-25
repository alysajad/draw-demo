// Source-audio seconds: the jackpot buildup gives way to applause at this cue.
export const drawAudio = { playbackRate: 0.75, revealAt: 5.05, leadIn: 1.2 };

export const ceremonyTiming = {
  spinStart: 0,
  fastSpinEnd: 3000,
  spinEnd: 8300,
  lidOpen: 8350,
  paperRise: 8900,
  reveal: 10000,
};

// Constant initial speed, then a continuous slowdown to an upright stop.
export function drumAngle(milliseconds: number) {
  const { fastSpinEnd, spinEnd } = ceremonyTiming;
  const t = Math.max(0, Math.min(spinEnd, milliseconds));
  const slowing = spinEnd - fastSpinEnd;
  const speed = 20 * Math.PI / (fastSpinEnd + slowing / 2);
  const decelerationTime = Math.max(0, t - fastSpinEnd);
  return speed * (t - decelerationTime ** 2 / (2 * slowing));
}
