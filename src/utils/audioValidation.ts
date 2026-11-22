/**
 * Pure audio container inspection, strict RIFF WAV decoding, PCM signal-level
 * verification, and peak normalization utilities shared between server and client.
 */

export type DetectedAudioFormatKind =
  | 'wav'
  | 'raw_pcm_s16le'
  | 'raw_pcm_s16be'
  | 'encoded_compressed'
  | 'empty'
  | 'unknown';

export interface DetectedAudioContainer {
  kind: DetectedAudioFormatKind;
  sampleRateHint: number;
  channelsHint: number;
  mimeNormalized: string;
  containerExtension: string;
}

/**
 * Inspects binary magic headers AND declared MIME type so encoded containers
 * (MP3, OGG/Opus, AAC/M4A, FLAC, WebM) are NEVER misinterpreted as raw PCM.
 */
export function detectAudioContainerFormat(
  bytes: Uint8Array,
  declaredMimeType = ''
): DetectedAudioContainer {
  const mime = declaredMimeType.trim().toLowerCase();
  const rateMatch = mime.match(/rate\s*=\s*(\d+)/i);
  const channelsMatch = mime.match(/channels\s*=\s*(\d+)/i);
  const sampleRateHint = rateMatch ? Math.max(8000, Number(rateMatch[1])) : 24000;
  const channelsHint = channelsMatch ? Math.max(1, Number(channelsMatch[1])) : 1;

  if (!bytes || bytes.byteLength === 0) {
    return {
      kind: 'empty',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime,
      containerExtension: 'bin',
    };
  }

  // 1. Check binary magic signatures first (ground truth over mislabeled headers)
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x41 && // 'A'
    bytes[10] === 0x56 && // 'V'
    bytes[11] === 0x45 // 'E'
  ) {
    return {
      kind: 'wav',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime || 'audio/wav',
      containerExtension: 'wav',
    };
  }

  // Ogg / Opus ("OggS")
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return {
      kind: 'encoded_compressed',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime || 'audio/ogg',
      containerExtension: 'ogg',
    };
  }

  // FLAC ("fLaC")
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return {
      kind: 'encoded_compressed',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime || 'audio/flac',
      containerExtension: 'flac',
    };
  }

  // ID3v2 MP3 ("ID3") or MPEG/ADTS sync word (0xFF followed by 0xE0..0xFF, excluding 0xFFFF PCM -1)
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return {
      kind: 'encoded_compressed',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime || 'audio/mpeg',
      containerExtension: 'mp3',
    };
  }

  // WebM / Matroska (0x1A 0x45 0xDF 0xA3)
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return {
      kind: 'encoded_compressed',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime || 'audio/webm',
      containerExtension: 'webm',
    };
  }

  // ISO BMFF / MP4 / M4A ("ftyp" at offset 4)
  if (
    bytes.byteLength >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return {
      kind: 'encoded_compressed',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime || 'audio/mp4',
      containerExtension: 'm4a',
    };
  }

  // 2. Check declared MIME types
  if (
    mime.includes('mpeg') ||
    mime.includes('mp3') ||
    mime.includes('ogg') ||
    mime.includes('opus') ||
    mime.includes('aac') ||
    mime.includes('mp4') ||
    mime.includes('m4a') ||
    mime.includes('webm') ||
    mime.includes('flac')
  ) {
    const ext = mime.includes('ogg') || mime.includes('opus')
      ? 'ogg'
      : mime.includes('aac')
        ? 'aac'
        : mime.includes('webm')
          ? 'webm'
          : mime.includes('flac')
            ? 'flac'
            : mime.includes('mp4') || mime.includes('m4a')
              ? 'm4a'
              : 'mp3';
    return {
      kind: 'encoded_compressed',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime,
      containerExtension: ext,
    };
  }

  if (mime.includes('audio/pcm') || mime.includes('audio/l16')) {
    const isBigEndian = mime.includes('endianness=big');
    return {
      kind: isBigEndian ? 'raw_pcm_s16be' : 'raw_pcm_s16le',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime,
      containerExtension: 'pcm',
    };
  }

  // Check MP3/AAC frame sync if MIME was omitted
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0 &&
    bytes[1] !== 0xff
  ) {
    return {
      kind: 'encoded_compressed',
      sampleRateHint,
      channelsHint,
      mimeNormalized: mime || 'audio/mpeg',
      containerExtension: 'mp3',
    };
  }

  return {
    kind: 'unknown',
    sampleRateHint,
    channelsHint,
    mimeNormalized: mime,
    containerExtension: 'bin',
  };
}

export interface StrictDecodedWav {
  ok: boolean;
  needsExternalDecode: boolean;
  audioFormatCode: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcmSamples: Int16Array; // Downmixed mono 16-bit signed samples
  durationSec: number;
  error?: string;
}

/**
 * Strictly parses a RIFF WAVE buffer by walking subchunks (`fmt `, `data`, etc.)
 * rather than blindly slicing at byte 44. Supports 16/24/32-bit integer PCM (format 1)
 * and 32-bit IEEE float PCM (format 3), downmixing multi-channel audio cleanly.
 * Flags compressed WAV formats (e.g., ADPCM / MP3-in-WAV) with `needsExternalDecode: true`.
 */
export function parseStrictRiffWav(wavBytes: Uint8Array): StrictDecodedWav {
  if (!wavBytes || wavBytes.byteLength < 44) {
    return {
      ok: false,
      needsExternalDecode: false,
      audioFormatCode: 0,
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
      error: `WAV buffer too small (${wavBytes?.byteLength ?? 0} bytes).`,
    };
  }

  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const riffTag = String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3]);
  const waveTag = String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11]);

  if (riffTag !== 'RIFF' || waveTag !== 'WAVE') {
    return {
      ok: false,
      needsExternalDecode: true,
      audioFormatCode: 0,
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
      error: 'Buffer does not start with a valid RIFF/WAVE header.',
    };
  }

  let audioFormatCode = 1;
  let channels = 1;
  let sampleRate = 24000;
  let bitsPerSample = 16;
  let foundFmt = false;
  let dataOffset = -1;
  let dataByteLength = 0;

  let offset = 12;
  while (offset + 8 <= wavBytes.byteLength) {
    const chunkId = String.fromCharCode(
      wavBytes[offset],
      wavBytes[offset + 1],
      wavBytes[offset + 2],
      wavBytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadStart = offset + 8;

    if (chunkId === 'fmt ' && payloadStart + 16 <= wavBytes.byteLength) {
      foundFmt = true;
      audioFormatCode = view.getUint16(payloadStart, true);
      channels = Math.max(1, view.getUint16(payloadStart + 2, true));
      sampleRate = Math.max(1000, view.getUint32(payloadStart + 4, true));
      bitsPerSample = view.getUint16(payloadStart + 14, true) || 16;

      // WAVE_FORMAT_EXTENSIBLE (0xFFFE = 65534) stores subformat code at payloadStart + 24
      if (
        audioFormatCode === 0xfffe &&
        chunkSize >= 40 &&
        payloadStart + 26 <= wavBytes.byteLength
      ) {
        audioFormatCode = view.getUint16(payloadStart + 24, true);
      }
    } else if (chunkId === 'data') {
      dataOffset = payloadStart;
      // Some streaming WAV writers put 0xFFFFFFFF or 0 in chunkSize; clamp to actual remaining bytes
      const available = wavBytes.byteLength - payloadStart;
      dataByteLength =
        chunkSize === 0 || chunkSize > available ? available : chunkSize;
      break;
    }

    if (chunkSize === 0x7fffffff || chunkSize === 0xffffffff) {
      break;
    }
    offset = payloadStart + chunkSize + (chunkSize % 2);
  }

  if (!foundFmt || dataOffset < 0 || dataByteLength <= 0) {
    return {
      ok: false,
      needsExternalDecode: true,
      audioFormatCode,
      sampleRate,
      channels,
      bitsPerSample,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
      error: 'WAV missing fmt or data chunk.',
    };
  }

  // Only format 1 (Linear PCM) and format 3 (IEEE Float) can be decoded directly without codec tables
  if (audioFormatCode !== 1 && audioFormatCode !== 3) {
    return {
      ok: false,
      needsExternalDecode: true,
      audioFormatCode,
      sampleRate,
      channels,
      bitsPerSample,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
      error: `Compressed WAV format tag 0x${audioFormatCode.toString(16)} requires FFmpeg decoding.`,
    };
  }

  const bytesPerSample = Math.max(1, Math.floor(bitsPerSample / 8));
  const blockAlign = bytesPerSample * channels;
  const frameCount = Math.floor(dataByteLength / blockAlign);

  if (frameCount <= 0) {
    return {
      ok: false,
      needsExternalDecode: false,
      audioFormatCode,
      sampleRate,
      channels,
      bitsPerSample,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
      error: 'WAV data chunk contains zero audio frames.',
    };
  }

  const mono = new Int16Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    let acc = 0;
    const frameBase = dataOffset + f * blockAlign;
    for (let ch = 0; ch < channels; ch++) {
      const pos = frameBase + ch * bytesPerSample;
      let sampleFloat = 0;
      if (audioFormatCode === 3 && bitsPerSample === 32 && pos + 4 <= wavBytes.byteLength) {
        sampleFloat = view.getFloat32(pos, true);
      } else if (audioFormatCode === 1 && bitsPerSample === 16 && pos + 2 <= wavBytes.byteLength) {
        sampleFloat = view.getInt16(pos, true) / 32768;
      } else if (audioFormatCode === 1 && bitsPerSample === 24 && pos + 3 <= wavBytes.byteLength) {
        const b0 = wavBytes[pos];
        const b1 = wavBytes[pos + 1];
        const b2 = wavBytes[pos + 2];
        const int24 = ((b2 << 24) | (b1 << 16) | (b0 << 8)) >> 8;
        sampleFloat = int24 / 8388608;
      } else if (audioFormatCode === 1 && bitsPerSample === 32 && pos + 4 <= wavBytes.byteLength) {
        sampleFloat = view.getInt32(pos, true) / 2147483648;
      } else if (audioFormatCode === 1 && bitsPerSample === 8 && pos < wavBytes.byteLength) {
        sampleFloat = (wavBytes[pos] - 128) / 128;
      }
      if (!Number.isFinite(sampleFloat)) sampleFloat = 0;
      acc += sampleFloat;
    }
    const avg = Math.max(-1, Math.min(1, acc / channels));
    mono[f] = Math.round(avg * 32767);
  }

  return {
    ok: true,
    needsExternalDecode: false,
    audioFormatCode,
    sampleRate,
    channels,
    bitsPerSample,
    pcmSamples: mono,
    durationSec: frameCount / sampleRate,
  };
}

export function decodeRawPcm16ToMono(
  bytes: Uint8Array,
  channels = 1,
  bigEndian = false
): Int16Array {
  const safeChannels = Math.max(1, channels);
  const blockAlign = 2 * safeChannels;
  const frameCount = Math.floor(bytes.byteLength / blockAlign);
  const out = new Int16Array(frameCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    for (let ch = 0; ch < safeChannels; ch++) {
      sum += view.getInt16(f * blockAlign + ch * 2, !bigEndian);
    }
    out[f] = Math.round(sum / safeChannels);
  }
  return out;
}

export interface PcmSignalAnalysis {
  sampleCount: number;
  sampleRate: number;
  durationSec: number;
  peakAbs: number;
  peakDb: number;
  rms: number;
  meanDb: number;
  nonSilentSampleRatio: number;
  isNonSilentSpeech: boolean;
  failureReason?: string;
}

/**
 * Measures real amplitude statistics on decoded 16-bit PCM samples and rejects
 * silent, near-zero (-91 dB), or truncated audio buffers.
 */
export function analyzePcmSignal(
  samples: Int16Array,
  sampleRate = 24000,
  minDurationSec = 0.35
): PcmSignalAnalysis {
  const safeRate = Math.max(1000, sampleRate);
  const sampleCount = samples?.length ?? 0;
  const durationSec = Math.round((sampleCount / safeRate) * 1000) / 1000;

  if (sampleCount === 0 || durationSec < minDurationSec) {
    return {
      sampleCount,
      sampleRate: safeRate,
      durationSec,
      peakAbs: 0,
      peakDb: -96,
      rms: 0,
      meanDb: -96,
      nonSilentSampleRatio: 0,
      isNonSilentSpeech: false,
      failureReason: `Decoded audio is too short (${durationSec.toFixed(2)}s < ${minDurationSec}s minimum).`,
    };
  }

  let peakAbs = 0;
  let sumSq = 0;
  let nonSilentCount = 0;
  // ~ -56.7 dBFS sample threshold
  const activityThreshold = 48;

  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    const abs = s < 0 ? -s : s;
    if (abs > peakAbs) peakAbs = abs;
    if (abs >= activityThreshold) nonSilentCount++;
    const norm = s / 32768;
    sumSq += norm * norm;
  }

  const rms = Math.sqrt(sumSq / sampleCount);
  const peakDb =
    peakAbs > 0
      ? Math.round(20 * Math.log10(peakAbs / 32768) * 10) / 10
      : -96;
  const meanDb =
    rms > 1e-5 ? Math.round(20 * Math.log10(rms) * 10) / 10 : -96;
  const nonSilentSampleRatio =
    Math.round((nonSilentCount / sampleCount) * 10000) / 10000;

  // Reject silent or near-total silence (e.g. -91 dB AAC floor or muted buffers)
  if (peakDb <= -42 || meanDb <= -52 || nonSilentSampleRatio < 0.015) {
    return {
      sampleCount,
      sampleRate: safeRate,
      durationSec,
      peakAbs,
      peakDb,
      rms,
      meanDb,
      nonSilentSampleRatio,
      isNonSilentSpeech: false,
      failureReason: `Audio track is silent or below audible speech threshold (mean ${meanDb.toFixed(
        1
      )} dBFS, peak ${peakDb.toFixed(1)} dBFS).`,
    };
  }

  return {
    sampleCount,
    sampleRate: safeRate,
    durationSec,
    peakAbs,
    peakDb,
    rms,
    meanDb,
    nonSilentSampleRatio,
    isNonSilentSpeech: true,
  };
}

/**
 * Resamples mono 16-bit PCM samples to `targetSampleRate` using linear interpolation
 * so pitch and duration are preserved accurately without aliasing steps.
 */
export function resampleMonoPcm16(
  samples: Int16Array,
  sourceRate: number,
  targetRate = 24000
): Int16Array {
  if (sourceRate === targetRate || samples.length === 0) {
    return samples;
  }
  const outLength = Math.max(1, Math.round((samples.length * targetRate) / sourceRate));
  const out = new Int16Array(outLength);
  const ratio = sourceRate / targetRate;

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx0 = Math.floor(srcPos);
    const idx1 = Math.min(samples.length - 1, idx0 + 1);
    const frac = srcPos - idx0;
    const interp = samples[idx0] * (1 - frac) + samples[idx1] * frac;
    out[i] = Math.max(-32767, Math.min(32767, Math.round(interp)));
  }
  return out;
}

/**
 * Trims excessive leading/trailing dead silence (>80ms below -55 dBFS, preserving a
 * natural 50ms breath cushion), peak-normalizes speech toward `targetPeakDb` (-3.0 dBFS),
 * and applies a smooth 12ms cosine fade-in/out to prevent clicks at scene transitions.
 */
export function normalizeAndTrimScenePcm(
  samples: Int16Array,
  sampleRate = 24000,
  targetPeakDb = -3.0
): Int16Array {
  if (samples.length === 0) return samples;

  const silenceThreshold = 58; // ~ -55 dBFS
  const marginSamples = Math.round(sampleRate * 0.05); // 50ms natural breath margin

  let firstActive = 0;
  while (
    firstActive < samples.length &&
    Math.abs(samples[firstActive]) < silenceThreshold
  ) {
    firstActive++;
  }

  let lastActive = samples.length - 1;
  while (lastActive > firstActive && Math.abs(samples[lastActive]) < silenceThreshold) {
    lastActive--;
  }

  // If the entire buffer was below threshold, return untouched so signal validation flags it honestly
  if (firstActive >= lastActive) {
    return samples;
  }

  const trimStart = Math.max(0, firstActive - marginSamples);
  const trimEnd = Math.min(samples.length, lastActive + 1 + marginSamples);
  const trimmedLen = trimEnd - trimStart;
  const out = new Int16Array(trimmedLen);

  let peakAbs = 1;
  for (let i = 0; i < trimmedLen; i++) {
    const v = Math.abs(samples[trimStart + i]);
    if (v > peakAbs) peakAbs = v;
  }

  const targetLinearPeak = Math.pow(10, targetPeakDb / 20) * 32767;
  // Clamp gain between 0.5x and 6.0x so speech reaches clear lecture loudness without amplifying noise floors excessively
  const gain = Math.max(0.5, Math.min(6.0, targetLinearPeak / peakAbs));
  const fadeSamples = Math.min(Math.floor(trimmedLen / 4), Math.round(sampleRate * 0.012));

  for (let i = 0; i < trimmedLen; i++) {
    let envelope = 1;
    if (fadeSamples > 1 && i < fadeSamples) {
      envelope = 0.5 * (1 - Math.cos((Math.PI * i) / fadeSamples));
    } else if (fadeSamples > 1 && i >= trimmedLen - fadeSamples) {
      const rem = trimmedLen - 1 - i;
      envelope = 0.5 * (1 - Math.cos((Math.PI * rem) / fadeSamples));
    }
    const scaled = Math.round(samples[trimStart + i] * gain * envelope);
    out[i] = Math.max(-32767, Math.min(32767, scaled));
  }

  return out;
}

/**
 * Normalizes written textbook symbols and page-range shorthand into smooth spoken text
 * for neural TTS without altering clinical meaning.
 */
export function prepareTextForMedicalTts(raw: string): string {
  return raw
    .replace(/…|\.\.\./g, ', ')
    .replace(/\bpp\.\s*(\d+)\s*[–—-]\s*(\d+)/gi, 'pages $1 to $2')
    .replace(/\bp\.\s*(\d+)/gi, 'page $1')
    .replace(/≥|>=/g, ' greater than or equal to ')
    .replace(/≤|<=/g, ' less than or equal to ')
    .replace(/→|->/g, ', leading to ')
    .replace(/×/g, ' times ')
    .replace(/\s+/g, ' ')
    .trim();
}
