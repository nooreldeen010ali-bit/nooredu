import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePcmSignal,
  detectAudioContainerFormat,
  normalizeAndTrimScenePcm,
  parseStrictRiffWav,
  prepareTextForMedicalTts,
} from './audioValidation';
import { createMono16WavBytes } from './lectureStudioEngine';

test('detectAudioContainerFormat distinguishes RIFF WAV, compressed audio, and raw PCM', () => {
  const samplePcm = new Int16Array(2400);
  const wavBytes = createMono16WavBytes(samplePcm, 24000);
  const wavDetected = detectAudioContainerFormat(wavBytes, 'audio/wav');
  assert.equal(wavDetected.kind, 'wav');

  // Ogg/Opus header must never be treated as raw PCM even if MIME is mislabeled
  const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
  const oggDetected = detectAudioContainerFormat(oggBytes, 'audio/pcm');
  assert.equal(oggDetected.kind, 'encoded_compressed');
  assert.equal(oggDetected.containerExtension, 'ogg');

  // ID3 MP3 header must be detected as encoded_compressed
  const mp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
  const mp3Detected = detectAudioContainerFormat(mp3Bytes, '');
  assert.equal(mp3Detected.kind, 'encoded_compressed');

  // Genuine Gemini TTS L16 PCM payload
  const rawPcmBytes = new Uint8Array([0x10, 0x02, 0xe0, 0xfd, 0x40, 0x08, 0xc0, 0xf7]);
  const pcmDetected = detectAudioContainerFormat(
    rawPcmBytes,
    'audio/L16;codec=pcm;rate=24000'
  );
  assert.equal(pcmDetected.kind, 'raw_pcm_s16le');
  assert.equal(pcmDetected.sampleRateHint, 24000);
});

test('parseStrictRiffWav decodes valid 24kHz mono WAV and rejects malformed buffers', () => {
  const sampleRate = 24000;
  const samples = new Int16Array(sampleRate);
  for (let i = 0; i < sampleRate; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 12000);
  }
  const wavBytes = createMono16WavBytes(samples, sampleRate);
  const parsed = parseStrictRiffWav(wavBytes);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sampleRate, 24000);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.pcmSamples.length, sampleRate);

  const malformed = parseStrictRiffWav(new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(malformed.ok, false);
});

test('analyzePcmSignal rejects -91 dB near-silence and accepts real speech amplitude', () => {
  const sampleRate = 24000;
  // Near-total silence (~1 LSB = -90.3 dBFS, reproducing the -91 dB bug)
  const nearSilent = new Int16Array(sampleRate);
  for (let i = 0; i < sampleRate; i++) {
    nearSilent[i] = i % 2 === 0 ? 1 : -1;
  }
  const silentCheck = analyzePcmSignal(nearSilent, sampleRate);
  assert.equal(silentCheck.isNonSilentSpeech, false);
  assert.ok(silentCheck.peakDb < -80);

  // Audible waveform
  const audible = new Int16Array(sampleRate);
  for (let i = 0; i < sampleRate; i++) {
    audible[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / sampleRate) * 11000);
  }
  const speechCheck = analyzePcmSignal(audible, sampleRate);
  assert.equal(speechCheck.isNonSilentSpeech, true);
  assert.ok(speechCheck.meanDb > -30);
  assert.ok(speechCheck.peakDb > -15);
});

test('normalizeAndTrimScenePcm trims dead air and normalizes peak near -3.0 dBFS', () => {
  const sampleRate = 24000;
  // 0.4s dead silence + 0.6s quiet speech (peak 4000) + 0.4s dead silence = 1.4s total
  const raw = new Int16Array(Math.round(sampleRate * 1.4));
  const speechStart = Math.round(sampleRate * 0.4);
  const speechEnd = Math.round(sampleRate * 1.0);
  for (let i = speechStart; i < speechEnd; i++) {
    raw[i] = Math.round(Math.sin((2 * Math.PI * 260 * i) / sampleRate) * 4000);
  }

  const normalized = normalizeAndTrimScenePcm(raw, sampleRate, -3.0);
  // Trimmed length should be ~0.7s (0.6s + 2 * 50ms margin), strictly shorter than 1.4s
  assert.ok(normalized.length < sampleRate * 0.85);
  assert.ok(normalized.length > sampleRate * 0.62);

  const postAnalysis = analyzePcmSignal(normalized, sampleRate);
  assert.equal(postAnalysis.isNonSilentSpeech, true);
  assert.ok(postAnalysis.peakDb >= -4.0 && postAnalysis.peakDb <= -2.0);
});

test('prepareTextForMedicalTts expands textbook shorthand cleanly for natural speech', () => {
  const cleaned = prepareTextForMedicalTts(
    'LVEF ≤ 40% → quadruple GDMT (pp. 1–2) & p. 4, 2× daily.'
  );
  assert.ok(cleaned.includes('less than or equal to'));
  assert.ok(cleaned.includes('leading to'));
  assert.ok(cleaned.includes('pages 1 to 2'));
  assert.ok(cleaned.includes('page 4'));
  assert.ok(cleaned.includes('times'));
});
