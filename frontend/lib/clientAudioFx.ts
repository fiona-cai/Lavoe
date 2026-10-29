function writeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mixed = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mixed[i] += data[i] / channels;
  }
  return mixed;
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    const data = await blob.arrayBuffer();
    return await context.decodeAudioData(data.slice(0));
  } finally {
    await context.close();
  }
}

export async function changeSpeedBlob(
  blob: Blob,
  speedFactor: number
): Promise<Blob> {
  const buffer = await decodeBlob(blob);
  const mono = mixToMono(buffer);
  const outLength = Math.max(1, Math.floor(mono.length / speedFactor));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = i * speedFactor;
    const i0 = Math.floor(src);
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = mono[i0] * (1 - t) + mono[i1] * t;
  }
  return writeWav(out, buffer.sampleRate);
}

export type ClientChop = {
  filename: string;
  blob: Blob;
  duration_seconds: number;
  track_id: string;
};

export async function chopBlob(
  blob: Blob,
  filename: string,
  maxChops = 6,
  minDuration = 0.2
): Promise<ClientChop[]> {
  const buffer = await decodeBlob(blob);
  const samples = mixToMono(buffer);
  const sampleRate = buffer.sampleRate;
  const hop = 512;
  const energies: number[] = [];
  for (let i = 0; i < samples.length; i += hop) {
    let sum = 0;
    const end = Math.min(samples.length, i + hop);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    energies.push(Math.sqrt(sum / (end - i)));
  }
  const mean = energies.reduce((a, b) => a + b, 0) / Math.max(energies.length, 1);
  const threshold = mean * 1.35;
  const minHopGap = Math.floor((minDuration * sampleRate) / hop);
  const peaks: number[] = [0];
  for (let i = 1; i < energies.length - 1; i++) {
    if (
      energies[i] > threshold &&
      energies[i] >= energies[i - 1] &&
      energies[i] >= energies[i + 1] &&
      i - peaks[peaks.length - 1] >= minHopGap
    ) {
      peaks.push(i);
    }
  }

  let starts = peaks.map((p) => p * hop);
  if (starts.length < 2) {
    const slice = Math.floor(samples.length / maxChops);
    starts = Array.from({ length: maxChops }, (_, i) => i * slice);
  }
  starts = starts.slice(0, maxChops);

  const chops: ClientChop[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : samples.length;
    if (end - start < sampleRate * minDuration) continue;
    const slice = samples.subarray(start, end);
    const wav = writeWav(slice, sampleRate);
    chops.push({
      filename: `${filename.replace(/\.[^.]+$/, "")}-chop-${i + 1}.wav`,
      blob: wav,
      duration_seconds: slice.length / sampleRate,
      track_id: `chop_${Date.now()}_${i}`,
    });
  }
  return chops;
}
