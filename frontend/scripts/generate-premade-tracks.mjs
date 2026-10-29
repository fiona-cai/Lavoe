import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "catalog");
fs.mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;
const BPM = 90;
const BARS = 4;
const BEATS_PER_BAR = 4;
const seconds = (BARS * BEATS_PER_BAR * 60) / BPM;
const totalSamples = Math.floor(seconds * SAMPLE_RATE);
const beatSamples = Math.floor(((60 / BPM) * SAMPLE_RATE));

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeWav(filename, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.round(clamp(samples[i]) * 32767);
    buffer.writeInt16LE(s, 44 + i * 2);
  }
  fs.writeFileSync(path.join(outDir, filename), buffer);
}

function env(t, attack, decay, sustain, release, duration) {
  if (t < 0 || t > duration) return 0;
  if (t < attack) return t / Math.max(attack, 1e-6);
  if (t < attack + decay) {
    const p = (t - attack) / Math.max(decay, 1e-6);
    return 1 - p * (1 - sustain);
  }
  if (t > duration - release) {
    const p = (duration - t) / Math.max(release, 1e-6);
    return sustain * p;
  }
  return sustain;
}

function noise() {
  return Math.random() * 2 - 1;
}

function addKick(samples, start) {
  const length = Math.floor(0.28 * SAMPLE_RATE);
  for (let i = 0; i < length && start + i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 70 * Math.exp(-t * 18) + 38;
    const amp = Math.exp(-t * 9);
    samples[start + i] += Math.sin(2 * Math.PI * freq * t) * amp * 0.95;
    if (i < SAMPLE_RATE * 0.008) samples[start + i] += noise() * 0.12;
  }
}

function addSnare(samples, start) {
  const length = Math.floor(0.22 * SAMPLE_RATE);
  for (let i = 0; i < length && start + i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const amp = Math.exp(-t * 14);
    samples[start + i] +=
      Math.sin(2 * Math.PI * 190 * t) * amp * 0.28 + noise() * amp * 0.42;
  }
}

function addHat(samples, start, open = false) {
  const length = Math.floor((open ? 0.18 : 0.05) * SAMPLE_RATE);
  const decay = open ? 10 : 38;
  for (let i = 0; i < length && start + i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    samples[start + i] += noise() * Math.exp(-t * decay) * (open ? 0.18 : 0.12);
  }
}

function addTone(samples, start, freq, duration, gain, harmonics = [1, 0.35, 0.12]) {
  const length = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < length && start + i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    let wave = 0;
    for (let h = 0; h < harmonics.length; h++) {
      wave += Math.sin(2 * Math.PI * freq * (h + 1) * t) * harmonics[h];
    }
    samples[start + i] +=
      wave * env(t, 0.01, 0.08, 0.65, 0.18, duration) * gain;
  }
}

function drums() {
  const samples = new Float64Array(totalSamples);
  for (let beat = 0; beat < BARS * BEATS_PER_BAR; beat++) {
    const start = beat * beatSamples;
    if (beat % 4 === 0 || beat % 4 === 2) addKick(samples, start);
    if (beat % 4 === 1 || beat % 4 === 3) addSnare(samples, start);
    addHat(samples, start);
    addHat(samples, start + Math.floor(beatSamples / 2));
    if (beat % 8 === 7) addHat(samples, start + Math.floor(beatSamples * 0.75), true);
  }
  return samples;
}

function bass() {
  const samples = new Float64Array(totalSamples);
  const notes = [55.0, 73.42, 55.0, 82.41];
  notes.forEach((freq, bar) => {
    const start = bar * beatSamples * BEATS_PER_BAR;
    for (let beat = 0; beat < 4; beat++) {
      if (beat === 1) continue;
      addTone(
        samples,
        start + beat * beatSamples,
        freq,
        0.42,
        0.55,
        [1, 0.45, 0.2, 0.08]
      );
    }
  });
  return samples;
}

function chords() {
  const samples = new Float64Array(totalSamples);
  const voicings = [
    [220.0, 261.63, 329.63],
    [293.66, 349.23, 440.0],
    [220.0, 261.63, 329.63],
    [329.63, 392.0, 493.88],
  ];
  voicings.forEach((chord, bar) => {
    const start = bar * beatSamples * BEATS_PER_BAR;
    chord.forEach((freq) => {
      addTone(samples, start, freq, 1.55, 0.16, [1, 0.22, 0.08]);
      addTone(
        samples,
        start + beatSamples * 2,
        freq,
        0.7,
        0.12,
        [1, 0.18, 0.06]
      );
    });
  });
  return samples;
}

function melody() {
  const samples = new Float64Array(totalSamples);
  const notes = [
    [0, 440.0, 0.4],
    [0.5, 523.25, 0.4],
    [1, 659.25, 0.7],
    [2, 587.33, 0.4],
    [2.5, 523.25, 0.4],
    [4, 440.0, 0.6],
    [5, 392.0, 0.4],
    [5.5, 329.63, 0.8],
    [8, 440.0, 0.4],
    [8.5, 493.88, 0.4],
    [9, 523.25, 0.8],
    [12, 659.25, 0.5],
    [13, 587.33, 0.5],
    [14, 523.25, 1.1],
  ];
  notes.forEach(([beat, freq, dur]) => {
    addTone(
      samples,
      Math.floor(beat * beatSamples),
      freq,
      dur,
      0.28,
      [1, 0.15, 0.05]
    );
  });
  return samples;
}

writeWav("lofi-drums.wav", drums());
writeWav("warm-bass.wav", bass());
writeWav("rhodes-chords.wav", chords());
writeWav("airy-melody.wav", melody());

for (const file of fs.readdirSync(outDir)) {
  const stat = fs.statSync(path.join(outDir, file));
  console.log(`${file}\t${stat.size}`);
}
