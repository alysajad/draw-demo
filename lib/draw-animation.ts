export const ceremonyTiming = {
  spinStart: 2000,
  spinEnd: 12000,
  lidOpen: 14000,
  paperRise: 16000,
  reveal: 20000,
  firstPrizePause: 2000,
};

// All sound is generated locally and is only connected after the sound gesture.
export function boxSound(context: AudioContext, duration: number) {
  const bus = context.createGain();
  bus.gain.value = 0.65;
  bus.connect(context.destination);
  const noise = context.createBuffer(
    1,
    context.sampleRate * 2,
    context.sampleRate,
  );
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const sources: AudioScheduledSourceNode[] = [];
  const start = context.currentTime;
  for (let t = 2; t < 14; t += 0.17 + Math.random() * 0.2) {
    const paper = context.createBufferSource();
    paper.buffer = noise;
    paper.playbackRate.value = 0.65 + Math.random() * 0.7;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900 + Math.random() * 2500;
    filter.Q.value = 0.65;
    const gain = context.createGain();
    const level = 0.07 + Math.random() * 0.13;
    gain.gain.setValueAtTime(0, start + t);
    gain.gain.linearRampToValueAtTime(
      level * Math.min(1, (14 - t) / 2),
      start + t + 0.025,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, start + t + 0.18);
    paper.connect(filter).connect(gain).connect(bus);
    paper.start(start + t, Math.random());
    paper.stop(start + t + 0.22);
    sources.push(paper);
  }
  // Soft cradle resonance, followed by a restrained reveal chord.
  for (const [offset, frequency, length, level] of [
    [2, 78, 12, 0.025],
    [14, 180, 0.3, 0.06],
    [duration - 0.7, 440, 1.2, 0.045],
    [duration - 0.5, 554.37, 1.2, 0.035],
    [duration - 0.3, 659.25, 1.4, 0.03],
  ]) {
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(level, start + offset + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + length);
    tone.connect(gain).connect(bus);
    tone.start(start + offset);
    tone.stop(start + offset + length + 0.1);
    sources.push(tone);
  }
  return () => {
    bus.disconnect();
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    });
  };
}
