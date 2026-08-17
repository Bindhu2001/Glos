// One-off generator for assets/sounds/nudge.wav — a 3-chirp descending sine
// chime, matching main/frontend/src/pages/workspace/chat/Chat.jsx's
// playNudgeSound() (Web Audio API) so mobile and web nudges sound the same.
// Run with: node scripts/gen-nudge-sound.js
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const times = [0, 0.18, 0.36]; // chirp start offsets, seconds
const chirpDuration = 0.15;
const totalDuration = times[times.length - 1] + chirpDuration;
const numSamples = Math.ceil(totalDuration * SAMPLE_RATE);
const samples = new Float32Array(numSamples);

for (const offset of times) {
  const startSample = Math.floor(offset * SAMPLE_RATE);
  const chirpSamples = Math.floor(chirpDuration * SAMPLE_RATE);
  for (let i = 0; i < chirpSamples; i++) {
    const t = i / SAMPLE_RATE; // time within this chirp
    // exponential frequency ramp 880Hz -> 440Hz over 0.12s, held after
    const rampT = Math.min(t, 0.12);
    const freq = 880 * Math.pow(440 / 880, rampT / 0.12);
    // amplitude: starts at 0.4, exponential decay to ~0.001 over 0.14s
    const amp = 0.4 * Math.pow(0.001 / 0.4, Math.min(t, 0.14) / 0.14);
    const phase = 2 * Math.PI * freq * t;
    const idx = startSample + i;
    if (idx < numSamples) samples[idx] += amp * Math.sin(phase);
  }
}

// Encode as 16-bit PCM mono WAV
const bytesPerSample = 2;
const dataSize = numSamples * bytesPerSample;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // PCM chunk size
buffer.writeUInt16LE(1, 20); // audio format = PCM
buffer.writeUInt16LE(1, 22); // channels = mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
buffer.writeUInt16LE(bytesPerSample, 32); // block align
buffer.writeUInt16LE(16, 34); // bits per sample
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

for (let i = 0; i < numSamples; i++) {
  const clamped = Math.max(-1, Math.min(1, samples[i]));
  buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
}

const outPath = path.join(__dirname, '..', 'assets', 'sounds', 'nudge.wav');
fs.writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.length} bytes, ${totalDuration.toFixed(2)}s)`);
