import type {
  DoctorCharacterProfile,
  LanguageMode,
  LectureExternalReference,
  LectureScene,
  MedicalSubjectDiscipline,
} from '../types/medical';
import { shortenBookTitle } from './multiBookEngine';
import {
  buildLectureRevisionPack,
  findSceneAtTime,
  getActiveSubtitleCue,
  getDisciplineVisualSpec,
  getDoctorProfile,
  getTotalLectureDuration,
  inferSceneDiscipline,
  MEDICAL_DISCIPLINE_META,
  splitNarrationIntoCues,
} from './lectureStudioEngine';
import {
  getLoadedAtlasImage,
  getPathologyHistologySplitUrl,
  getStudioHallBackdropUrl,
  resolveSceneAtlasAsset,
} from './medicalAtlasAssets';
import { renderThreeStudioSnapshot } from './lectureThreeRenderer';

export interface LectureRenderFrameOptions {
  scenes: LectureScene[];
  timeSec: number;
  presenterId: string;
  language: LanguageMode;
  lectureTitle: string;
  showSubtitles: boolean;
  mouthOpenness: number; // 0..1 driven by real audio RMS or boundary cadence
  isSpeaking: boolean;
  preferredDiscipline?: MedicalSubjectDiscipline | 'auto';
  externalReferences?: LectureExternalReference[];
}

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ScreenFocusTarget {
  x: number;
  y: number;
  label: string;
  visualProvenanceBadge: string;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, Math.max(0, w / 2), Math.max(0, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) {
        continue;
      }
    } else {
      current = test;
    }
  }
  if (current) {
    if (lines.length >= maxLines) {
      let last = lines[maxLines - 1] + ' ' + current;
      while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trim();
      }
      lines[maxLines - 1] = `${last}…`;
    } else {
      lines.push(current);
    }
  }
  return lines.slice(0, maxLines);
}

function drawArrowSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth = 2.4,
  headSize = 7.5
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const angle = Math.atan2(dy, dx);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headSize * Math.cos(angle - Math.PI / 6),
    y2 - headSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headSize * Math.cos(angle + Math.PI / 6),
    y2 - headSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawImageCoverOrContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  box: BoxRect,
  mode: 'cover' | 'contain' = 'contain',
  zoomScale = 1,
  focusXPct = 50,
  focusYPct = 50
) {
  const iw =
    'naturalWidth' in img ? img.naturalWidth || img.width || 800 : img.width || 800;
  const ih =
    'naturalHeight' in img ? img.naturalHeight || img.height || 600 : img.height || 600;
  if (iw <= 0 || ih <= 0) return;

  ctx.save();
  roundRectPath(ctx, box.x, box.y, box.w, box.h, 8);
  ctx.clip();

  const scaleBase =
    mode === 'cover'
      ? Math.max(box.w / iw, box.h / ih)
      : Math.min(box.w / iw, box.h / ih);
  const drawW = iw * scaleBase;
  const drawH = ih * scaleBase;
  const drawX = box.x + (box.w - drawW) / 2;
  const drawY = box.y + (box.h - drawH) / 2;

  if (zoomScale > 1.01) {
    const fx = box.x + (focusXPct / 100) * box.w;
    const fy = box.y + (focusYPct / 100) * box.h;
    ctx.translate(fx, fy);
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-fx, -fy);
  }

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function drawDoctorHeadUnit(
  ctx: CanvasRenderingContext2D,
  profile: DoctorCharacterProfile,
  timeSec: number,
  mouthOpenness: number,
  isSpeaking: boolean,
  lookRightBias = 1.4
) {
  const headNod = isSpeaking
    ? Math.sin(timeSec * 4.4) * 0.025
    : Math.sin(timeSec * 1.3) * 0.01;
  ctx.save();
  ctx.rotate(headNod);

  if (profile.hairStyle === 'shoulder_wave' || profile.gender === 'female') {
    ctx.fillStyle = profile.hairColor;
    roundRectPath(ctx, -45, -36, 90, 96, 32);
    ctx.fill();
  } else if (profile.hairStyle === 'bun') {
    ctx.fillStyle = profile.hairColor;
    ctx.beginPath();
    ctx.arc(0, -58, 19, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = profile.skinTone;
  ctx.beginPath();
  ctx.arc(-38, 2, 7, 0, Math.PI * 2);
  ctx.arc(38, 2, 7, 0, Math.PI * 2);
  ctx.fill();

  roundRectPath(ctx, -37, -45, 74, 88, 33);
  ctx.fillStyle = profile.skinTone;
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.stroke();

  ctx.fillStyle = profile.hairColor;
  ctx.beginPath();
  ctx.arc(0, -17, 39, Math.PI * 1.03, Math.PI * 1.97);
  ctx.quadraticCurveTo(20, -30, -35, -19);
  ctx.closePath();
  ctx.fill();

  if (profile.hairStyle === 'cropped_beard') {
    ctx.save();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.28)';
    ctx.beginPath();
    ctx.arc(0, 11, 34, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const blinkPhase = timeSec % 3.8;
  const isBlinking = blinkPhase > 3.62 && blinkPhase < 3.76;
  const browLift = isSpeaking ? -2 - mouthOpenness * 2.2 : 0;

  ctx.strokeStyle = profile.hairColor;
  ctx.lineWidth = 2.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, -13 + browLift);
  ctx.quadraticCurveTo(-15, -17 + browLift, -8, -13 + browLift);
  ctx.moveTo(8, -13 + browLift);
  ctx.quadraticCurveTo(15, -17 + browLift, 22, -13 + browLift);
  ctx.stroke();

  if (isBlinking) {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-21, -4);
    ctx.lineTo(-10, -4);
    ctx.moveTo(10, -4);
    ctx.lineTo(21, -4);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-15, -4, 6.5, 4.4, 0, 0, Math.PI * 2);
    ctx.ellipse(15, -4, 6.5, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(-15 + lookRightBias, -4, 2.9, 0, Math.PI * 2);
    ctx.arc(15 + lookRightBias, -4, 2.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-14 + lookRightBias, -5, 1.0, 0, Math.PI * 2);
    ctx.arc(16 + lookRightBias, -5, 1.0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (profile.hasGlasses) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.8;
    roundRectPath(ctx, -25, -11, 20, 14, 4);
    ctx.stroke();
    roundRectPath(ctx, 5, -11, 20, 14, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -4.5);
    ctx.lineTo(5, -4.5);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(2, 8);
  ctx.lineTo(-2, 10);
  ctx.stroke();

  const clampedMouth = Math.max(0, Math.min(1, mouthOpenness));
  if (clampedMouth <= 0.04) {
    ctx.strokeStyle = '#9F1239';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-10, 21);
    ctx.quadraticCurveTo(0, 24.5, 10, 21);
    ctx.stroke();
  } else {
    const mouthW = 9.2 + clampedMouth * 4.2;
    const mouthH = 2.0 + clampedMouth * 8.8;
    ctx.beginPath();
    ctx.ellipse(0, 22 + clampedMouth * 1.3, mouthW, mouthH, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7F1D1D';
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-mouthW, 22 - mouthH, mouthW * 2, 3.2);
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.arc(0, 24 + mouthH * 0.65, mouthW * 0.65, Math.PI, 0);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#881337';
    ctx.beginPath();
    ctx.ellipse(0, 22 + clampedMouth * 1.3, mouthW, mouthH, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Compact Doctor Avatar Portrait (used on compact mobile headers).
 * Uses real-time Three.js 3D presenter when WebGL is supported, with clean 2D fallback.
 */
export function drawDoctorAvatarPortrait(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  profile: DoctorCharacterProfile,
  timeSec: number,
  mouthOpenness: number,
  isSpeaking: boolean,
  pointerTargetRatioY = 0.45,
  threePresenterCanvas?: HTMLCanvasElement | null
) {
  ctx.save();
  roundRectPath(ctx, box.x, box.y, box.w, box.h, 12);
  ctx.clip();

  const grad = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
  grad.addColorStop(0, '#F1F5F9');
  grad.addColorStop(1, '#E2E8F0');
  ctx.fillStyle = grad;
  ctx.fillRect(box.x, box.y, box.w, box.h);

  if (threePresenterCanvas) {
    drawImageCoverOrContain(ctx, threePresenterCanvas, box, 'cover', 1.22, 50, 30);
    ctx.restore();
    return;
  }

  const scale = Math.min(box.w / 205, box.h / 200);
  const originX = box.x + box.w * 0.48;
  const originY = box.y + box.h * 0.66;

  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);

  const breathY = Math.sin(timeSec * 2.1) * 1.8;
  const torsoTopY = -12 + breathY;

  // Consistent white coat torso
  ctx.beginPath();
  ctx.moveTo(-82, 92);
  ctx.quadraticCurveTo(-76, torsoTopY + 8, -34, torsoTopY);
  ctx.lineTo(34, torsoTopY);
  ctx.quadraticCurveTo(76, torsoTopY + 8, 82, 92);
  ctx.closePath();
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-22, torsoTopY);
  ctx.lineTo(0, torsoTopY + 58);
  ctx.lineTo(22, torsoTopY);
  ctx.closePath();
  ctx.fillStyle = profile.scrubColor;
  ctx.fill();

  roundRectPath(ctx, -13, torsoTopY - 22, 26, 28, 7);
  ctx.fillStyle = profile.skinTone;
  ctx.fill();

  const shoulderX = 56;
  const shoulderY = torsoTopY + 24;
  const gestureWave = isSpeaking
    ? Math.sin(timeSec * 3.4) * 5
    : Math.sin(timeSec * 1.4) * 2;
  const targetHandX = 92;
  const targetHandY =
    torsoTopY + 6 + (pointerTargetRatioY - 0.5) * 44 + gestureWave;

  ctx.strokeStyle = '#F8FAFC';
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(shoulderX + 14, shoulderY + 32);
  ctx.lineTo(targetHandX - 8, targetHandY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(targetHandX - 5, targetHandY, 7.2, 0, Math.PI * 2);
  ctx.fillStyle = profile.skinTone;
  ctx.fill();

  ctx.save();
  ctx.translate(0, torsoTopY - 58);
  drawDoctorHeadUnit(ctx, profile, timeSec, mouthOpenness, isSpeaking, 1.3);
  ctx.restore();

  ctx.restore();
  ctx.restore();
}

/**
 * Draws the Consistent White-Coat Doctor Presenter standing on the LEFT side of the lecture room,
 * gesturing naturally toward the active concept on the RIGHT smartboard.
 * Preserves identical doctor identity, room lighting, and camera angle across all scenes.
 */
export function drawStandingProfessorStudio(
  ctx: CanvasRenderingContext2D,
  stageBox: BoxRect,
  profile: DoctorCharacterProfile,
  timeSec: number,
  mouthOpenness: number,
  isSpeaking: boolean,
  pointerTargetRatioY = 0.45,
  _activeTargetLabel?: string,
  threePresenterCanvas?: HTMLCanvasElement | null,
  isThreeActive = false
): { tipX: number; tipY: number } {
  ctx.save();
  roundRectPath(ctx, stageBox.x, stageBox.y, stageBox.w, stageBox.h, 12);
  ctx.clip();

  const nameplateH = 54;
  const nameplateY = stageBox.y + stageBox.h - nameplateH - 6;

  // Ground shadow beneath standing doctor
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
  ctx.beginPath();
  ctx.ellipse(
    stageBox.x + stageBox.w * 0.46,
    nameplateY + 4,
    stageBox.w * 0.34,
    10,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  const clampedRatioY = Math.max(0.15, Math.min(0.85, pointerTargetRatioY));
  let tipX = stageBox.x + stageBox.w - 6;
  let tipY = stageBox.y + stageBox.h * (0.24 + clampedRatioY * 0.44);

  if (threePresenterCanvas && isThreeActive) {
    const charBox: BoxRect = {
      x: stageBox.x + 2,
      y: stageBox.y + 8,
      w: stageBox.w - 4,
      h: stageBox.h - nameplateH - 10,
    };
    drawImageCoverOrContain(ctx, threePresenterCanvas, charBox, 'contain');
    tipX = stageBox.x + stageBox.w - 8;
    tipY = stageBox.y + stageBox.h * (0.26 + clampedRatioY * 0.38);
  } else {
    const scale = Math.min(stageBox.w / 252, stageBox.h / 490);
    const centerX = stageBox.x + stageBox.w * 0.43;
    const shoulderBaseY = stageBox.y + stageBox.h * 0.39;
    const breathY = Math.sin(timeSec * 1.9) * (1.8 * scale);

    const coatFill = '#FFFFFF';
    const coatStroke = '#CBD5E1';

    // Left arm relaxed naturally at side
    ctx.save();
    ctx.strokeStyle = coatFill;
    ctx.lineWidth = 22 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX - 58 * scale, shoulderBaseY + 14 * scale + breathY);
    ctx.lineTo(centerX - 70 * scale, shoulderBaseY + 90 * scale + breathY);
    ctx.lineTo(centerX - 46 * scale, shoulderBaseY + 136 * scale + breathY);
    ctx.stroke();

    ctx.strokeStyle = coatStroke;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = profile.skinTone;
    ctx.beginPath();
    ctx.arc(
      centerX - 43 * scale,
      shoulderBaseY + 140 * scale + breathY,
      8.5 * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    const torsoTopY = shoulderBaseY + breathY;
    const torsoBottomY = nameplateY + 4;

    // Tailored White Medical Coat Torso
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX - 70 * scale, torsoBottomY);
    ctx.lineTo(centerX - 64 * scale, torsoTopY + 18 * scale);
    ctx.quadraticCurveTo(
      centerX - 58 * scale,
      torsoTopY,
      centerX - 30 * scale,
      torsoTopY
    );
    ctx.lineTo(centerX + 32 * scale, torsoTopY);
    ctx.quadraticCurveTo(
      centerX + 58 * scale,
      torsoTopY,
      centerX + 64 * scale,
      torsoTopY + 18 * scale
    );
    ctx.lineTo(centerX + 70 * scale, torsoBottomY);
    ctx.closePath();
    ctx.fillStyle = coatFill;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = coatStroke;
    ctx.stroke();

    // Inner medical collar / scrub top
    ctx.beginPath();
    ctx.moveTo(centerX - 20 * scale, torsoTopY);
    ctx.lineTo(centerX, torsoTopY + 76 * scale);
    ctx.lineTo(centerX + 20 * scale, torsoTopY);
    ctx.closePath();
    ctx.fillStyle = profile.scrubColor;
    ctx.fill();

    // White coat lapels & pocket badge
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX - 22 * scale, torsoTopY);
    ctx.lineTo(centerX - 32 * scale, torsoTopY + 46 * scale);
    ctx.lineTo(centerX - 6 * scale, torsoTopY + 82 * scale);
    ctx.moveTo(centerX + 22 * scale, torsoTopY);
    ctx.lineTo(centerX + 32 * scale, torsoTopY + 46 * scale);
    ctx.lineTo(centerX + 6 * scale, torsoTopY + 82 * scale);
    ctx.moveTo(centerX, torsoTopY + 82 * scale);
    ctx.lineTo(centerX, torsoBottomY);
    ctx.stroke();

    roundRectPath(
      ctx,
      centerX - 48 * scale,
      torsoTopY + 52 * scale,
      24 * scale,
      17 * scale,
      3
    );
    ctx.fillStyle = '#E0F2FE';
    ctx.fill();
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (profile.hasStethoscope) {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3.8 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(centerX - 25 * scale, torsoTopY + 4 * scale);
      ctx.quadraticCurveTo(
        centerX - 38 * scale,
        torsoTopY + 52 * scale,
        centerX - 24 * scale,
        torsoTopY + 90 * scale
      );
      ctx.moveTo(centerX + 25 * scale, torsoTopY + 4 * scale);
      ctx.quadraticCurveTo(
        centerX + 38 * scale,
        torsoTopY + 50 * scale,
        centerX + 28 * scale,
        torsoTopY + 84 * scale
      );
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX + 28 * scale, torsoTopY + 88 * scale, 7 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#E2E8F0';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#334155';
      ctx.stroke();
    }

    // Neck & Head
    roundRectPath(
      ctx,
      centerX - 12 * scale,
      torsoTopY - 20 * scale,
      24 * scale,
      25 * scale,
      6
    );
    ctx.fillStyle = profile.skinTone;
    ctx.fill();

    ctx.save();
    ctx.translate(centerX, torsoTopY - 56 * scale);
    ctx.scale(scale, scale);
    drawDoctorHeadUnit(ctx, profile, timeSec, mouthOpenness, isSpeaking, 1.8);
    ctx.restore();

    // Right arm pointing naturally toward the smartboard on the right
    const shoulderX = centerX + 52 * scale;
    const shoulderY = torsoTopY + 20 * scale;
    const cadenceOffset = isSpeaking
      ? Math.sin(timeSec * 3.2) * (3.5 * scale)
      : Math.sin(timeSec * 1.2) * (1.5 * scale);

    const handX = stageBox.x + stageBox.w - 26 * scale;
    const handY =
      stageBox.y + stageBox.h * (0.22 + clampedRatioY * 0.44) + cadenceOffset;
    const elbowX = (shoulderX + handX) * 0.5 - 6 * scale;
    const elbowY = Math.max(
      shoulderY + 34 * scale,
      (shoulderY + handY) * 0.5 + 22 * scale
    );

    ctx.strokeStyle = coatFill;
    ctx.lineWidth = 20 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(handX - 6 * scale, handY);
    ctx.stroke();

    ctx.strokeStyle = coatStroke;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = profile.skinTone;
    ctx.beginPath();
    ctx.arc(handX - 2 * scale, handY, 8 * scale, 0, Math.PI * 2);
    ctx.fill();

    tipX = Math.min(stageBox.x + stageBox.w - 4, handX + 22 * scale);
    tipY = handY - (0.5 - clampedRatioY) * (20 * scale) - 3 * scale;

    // Clean metallic teaching pointer (no sci-fi laser beam)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(handX, handY - 1);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = '#0284C7';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Minimal Clean Academic Nameplate Card (No telemetry or status codes)
  roundRectPath(
    ctx,
    stageBox.x + 12,
    nameplateY,
    stageBox.w - 24,
    nameplateH,
    10
  );
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#0F4C81';
  ctx.fillRect(stageBox.x + 12, nameplateY + 10, 4, nameplateH - 20);

  ctx.textAlign = 'left';
  const textX = stageBox.x + 24;
  const maxTextW = stageBox.w - 40;

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  const nameLine = wrapCanvasText(ctx, profile.name, maxTextW, 1)[0] || profile.name;
  ctx.fillText(nameLine, textX, nameplateY + 23);

  ctx.fillStyle = '#475569';
  ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
  const roleLine =
    wrapCanvasText(ctx, profile.roleTitle, maxTextW, 1)[0] || profile.roleTitle;
  ctx.fillText(roleLine, textX, nameplateY + 40);

  ctx.restore();
  return { tipX, tipY };
}

/**
 * Draws the concise Left Bullet Column on the clean white Smartboard:
 * - Maximum 3 short, beginner-friendly bullet points (zero crowded boxes or long paragraphs)
 * - Progressively highlights the exact point currently being explained
 */
function drawSmartboardConceptRail(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  railBox: BoxRect,
  sceneProgress: number,
  allScenes: LectureScene[],
  lectureTitle: string
): { activeBulletY: number } {
  ctx.save();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    scene.visualMode === 'references' ? 'Key Lecture Takeaways' : 'Key Points',
    railBox.x + 10,
    railBox.y + 22
  );

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(railBox.x + 10, railBox.y + 32);
  ctx.lineTo(railBox.x + railBox.w - 10, railBox.y + 32);
  ctx.stroke();

  const rawItems =
    scene.visualMode === 'references'
      ? scene.keyBullets && scene.keyBullets.length > 0
        ? scene.keyBullets
        : buildLectureRevisionPack({ topic: lectureTitle, scenes: allScenes }).structuredSummary
      : scene.keyBullets && scene.keyBullets.length > 0
        ? scene.keyBullets
        : scene.onScreenLabels || [];

  const items = rawItems.slice(0, 3);
  const pearlReserveH = scene.clinicalPearl ? 84 : 12;
  let cursorY = railBox.y + 46;
  const maxY = railBox.y + railBox.h - pearlReserveH;
  let activeBulletY = railBox.y + railBox.h * 0.35;

  items.forEach((rawLabel, idx) => {
    if (cursorY > maxY - 52) return;
    const threshold = idx / Math.max(1, items.length);
    const revealed =
      scene.visualMode === 'references' || sceneProgress >= threshold * 0.78 || idx === 0;
    const isCurrentFocus =
      scene.visualMode !== 'references' &&
      idx === Math.min(items.length - 1, Math.floor(sceneProgress * items.length));

    ctx.save();
    ctx.globalAlpha = revealed ? 1 : 0.32;
    ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
    const cleanText = rawLabel.replace(/^\d+[.)]\s*/, '').trim();
    const lines = wrapCanvasText(ctx, cleanText, railBox.w - 46, 3);
    const blockH = Math.max(52, 22 + lines.length * 19);

    if (isCurrentFocus) {
      roundRectPath(ctx, railBox.x + 6, cursorY, railBox.w - 12, blockH, 8);
      ctx.fillStyle = '#F0F9FF';
      ctx.fill();
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(railBox.x + 6, cursorY + 8, 4, blockH - 16);
      activeBulletY = cursorY + blockH * 0.5;
    }

    // Crisp bullet dot
    ctx.beginPath();
    ctx.arc(railBox.x + 22, cursorY + 22, isCurrentFocus ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isCurrentFocus ? '#0284C7' : '#0F4C81';
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.font = isCurrentFocus
      ? '700 14px "Plus Jakarta Sans", system-ui, sans-serif'
      : '500 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
    lines.forEach((ln, lIdx) => {
      ctx.fillText(ln, railBox.x + 36, cursorY + 26 + lIdx * 19);
    });
    ctx.restore();

    cursorY += blockH + 14;
  });

  if (scene.clinicalPearl) {
    const pearlH = 72;
    const pearlY = railBox.y + railBox.h - pearlH - 6;
    roundRectPath(ctx, railBox.x + 8, pearlY, railBox.w - 16, pearlH, 8);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = '#BAE6FD';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#0284C7';
    ctx.font = '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('CLINICAL TAKEAWAY', railBox.x + 16, pearlY + 18);

    ctx.fillStyle = '#1E293B';
    ctx.font = '500 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const pearlLines = wrapCanvasText(ctx, scene.clinicalPearl, railBox.w - 32, 2);
    pearlLines.forEach((ln, idx) => {
      ctx.fillText(ln, railBox.x + 16, pearlY + 37 + idx * 16);
    });
  }

  ctx.restore();
  return { activeBulletY };
}

/**
 * 1) ANATOMY / 3D ORGAN MODEL + NON-OVERLAPPING CALLOUT LANES BOARD
 */
function drawAnatomyVisualBoard(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  visualBox: BoxRect,
  sceneProgress: number,
  discipline: MedicalSubjectDiscipline,
  lectureTitle: string,
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): ScreenFocusTarget {
  const plate = resolveSceneAtlasAsset(
    scene.systemTemplate,
    scene.visualMode,
    discipline,
    lectureTitle
  );
  const img = getLoadedAtlasImage(plate.imageUrl);

  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const provenanceBadge =
    threeOrganCanvas && isThreeActive
      ? '3D Procedural Organ Model'
      : '2D Medical Atlas Diagram';

  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  const headerTitle =
    wrapCanvasText(ctx, plate.plateTitle, visualBox.w - 210, 1)[0] || plate.plateTitle;
  ctx.fillText(headerTitle, visualBox.x + 16, visualBox.y + 24);

  ctx.fillStyle = threeOrganCanvas && isThreeActive ? '#0284C7' : '#64748B';
  ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(provenanceBadge, visualBox.x + visualBox.w - 16, visualBox.y + 23);

  // Split: Central Visual Model Viewport (top 72%) + Organized 2x2 Non-Overlapping Label Grid (bottom 28%)
  const viewportBox: BoxRect = {
    x: visualBox.x + 14,
    y: visualBox.y + 34,
    w: visualBox.w - 28,
    h: Math.round((visualBox.h - 48) * 0.68),
  };

  roundRectPath(ctx, viewportBox.x, viewportBox.y, viewportBox.w, viewportBox.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  if (threeOrganCanvas && isThreeActive) {
    drawImageCoverOrContain(ctx, threeOrganCanvas, viewportBox, 'contain');
  } else if (img) {
    const zoomAmount =
      scene.transitionType === 'zoom_focus'
        ? 1 + Math.sin(sceneProgress * Math.PI) * 0.12
        : 1.0;
    drawImageCoverOrContain(
      ctx,
      img,
      viewportBox,
      'contain',
      zoomAmount,
      plate.closeUpFocus.xPct,
      plate.closeUpFocus.yPct
    );
  }

  // Flow arrows inside viewport
  if (!threeOrganCanvas || !isThreeActive) {
    plate.flowArrows.forEach((arrow) => {
      const x1 = viewportBox.x + (arrow.fromXPct / 100) * viewportBox.w;
      const y1 = viewportBox.y + (arrow.fromYPct / 100) * viewportBox.h;
      const x2 = viewportBox.x + (arrow.toXPct / 100) * viewportBox.w;
      const y2 = viewportBox.y + (arrow.toYPct / 100) * viewportBox.h;
      const col = arrow.color.startsWith('#')
        ? arrow.color
        : arrow.color === 'crimson'
          ? '#DC2626'
          : '#0284C7';
      drawArrowSegment(ctx, x1, y1, x2, y2, col, 2.8, 8);
    });
  }

  const pins =
    scene.anatomicalPins && scene.anatomicalPins.length > 0
      ? scene.anatomicalPins
      : plate.pins;
  const visiblePins = pins.slice(0, 4);
  const activeIdx =
    visiblePins.length > 0
      ? Math.min(visiblePins.length - 1, Math.floor(sceneProgress * visiblePins.length))
      : 0;

  let focusTarget: ScreenFocusTarget = {
    x: viewportBox.x + viewportBox.w * 0.5,
    y: viewportBox.y + viewportBox.h * 0.5,
    label: scene.title,
    visualProvenanceBadge: provenanceBadge,
  };

  // Numbered non-overlapping markers on viewport + clean 2x2 large-typography label cards below
  const legendTopY = viewportBox.y + viewportBox.h + 8;
  const legendH = visualBox.y + visualBox.h - legendTopY - 10;
  const colW = (visualBox.w - 36) / 2;
  const rowH = Math.max(38, (legendH - 6) / 2);

  visiblePins.forEach((pin, idx) => {
    const tx = viewportBox.x + (pin.targetXPct / 100) * viewportBox.w;
    const ty = viewportBox.y + (pin.targetYPct / 100) * viewportBox.h;
    const isActive = idx === activeIdx;

    if (isActive) {
      focusTarget = {
        x: tx,
        y: ty,
        label: pin.label,
        visualProvenanceBadge: provenanceBadge,
      };
    }

    // Clean numbered pin marker on anatomy viewport (never overlaps text!)
    ctx.beginPath();
    ctx.arc(tx, ty, isActive ? 13 : 10, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#0284C7' : '#0F4C81';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(idx + 1), tx, ty + 4);

    // Organized 2x2 non-overlapping label card
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const lx = visualBox.x + 14 + col * (colW + 8);
    const ly = legendTopY + row * (rowH + 6);

    roundRectPath(ctx, lx, ly, colW, rowH, 7);
    ctx.fillStyle = isActive ? '#0F4C81' : '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = isActive ? '#0284C7' : '#CBD5E1';
    ctx.lineWidth = isActive ? 1.8 : 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = isActive ? '#7DD3FC' : '#0284C7';
    ctx.font = '700 12px "IBM Plex Mono", monospace';
    ctx.fillText(`0${idx + 1}`, lx + 10, ly + 23);

    ctx.fillStyle = isActive ? '#FFFFFF' : '#0F172A';
    ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
    const cleanLbl = wrapCanvasText(ctx, pin.label, colW - 44, 1)[0] || pin.label;
    ctx.fillText(cleanLbl, lx + 34, ly + 23);
  });

  return focusTarget;
}

/**
 * 2) PHYSIOLOGY DYNAMIC CURVE + HOMEOSTATIC FEEDBACK LOOP BOARD
 */
function drawPhysiologyVisualBoard(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  visualBox: BoxRect,
  sceneProgress: number,
  lectureTitle: string,
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): ScreenFocusTarget {
  const spec = getDisciplineVisualSpec(scene, lectureTitle, 'physiology').physiology;
  const plate = resolveSceneAtlasAsset(
    scene.systemTemplate,
    'physiology',
    'physiology',
    lectureTitle
  );
  const organImg = getLoadedAtlasImage(plate.imageUrl);

  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
  const cTitle = wrapCanvasText(ctx, spec.curveTitle, visualBox.w - 200, 1)[0] || spec.curveTitle;
  ctx.fillText(cTitle, visualBox.x + 14, visualBox.y + 23);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0284C7';
  ctx.font = '700 10.5px "IBM Plex Mono", monospace';
  ctx.fillText(
    spec.formulaLabel.slice(0, 32),
    visualBox.x + visualBox.w - 14,
    visualBox.y + 22
  );

  const topRowY = visualBox.y + 34;
  const topRowH = Math.round(visualBox.h * 0.56);
  const plotBox: BoxRect = {
    x: visualBox.x + 14,
    y: topRowY,
    w: Math.round((visualBox.w - 36) * 0.64),
    h: topRowH,
  };
  const organBox: BoxRect = {
    x: plotBox.x + plotBox.w + 8,
    y: topRowY,
    w: visualBox.x + visualBox.w - 14 - (plotBox.x + plotBox.w + 8),
    h: topRowH,
  };

  roundRectPath(ctx, plotBox.x, plotBox.y, plotBox.w, plotBox.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  const axes = {
    left: plotBox.x + 36,
    right: plotBox.x + plotBox.w - 16,
    top: plotBox.y + 30,
    bottom: plotBox.y + plotBox.h - 32,
  };
  const axesW = axes.right - axes.left;
  const axesH = axes.bottom - axes.top;

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  for (let g = 1; g <= 3; g++) {
    const gy = axes.top + (axesH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(axes.left, gy);
    ctx.lineTo(axes.right, gy);
    ctx.stroke();
  }

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(axes.left, axes.top);
  ctx.lineTo(axes.left, axes.bottom);
  ctx.lineTo(axes.right, axes.bottom);
  ctx.stroke();

  const toCanvasPt = (pt: { x: number; y: number }) => ({
    x: axes.left + (pt.x / 100) * axesW,
    y: axes.bottom - (pt.y / 100) * axesH,
  });

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#DC2626';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  spec.shiftedPoints.forEach((p, i) => {
    const c = toCanvasPt(p);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#0284C7';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  spec.normalPoints.forEach((p, i) => {
    const c = toCanvasPt(p);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.stroke();

  const ptIdx = Math.min(
    spec.normalPoints.length - 1,
    Math.floor(sceneProgress * spec.normalPoints.length)
  );
  const activeCurvePt = toCanvasPt(spec.normalPoints[ptIdx]);
  ctx.beginPath();
  ctx.arc(activeCurvePt.x, activeCurvePt.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#0F4C81';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = '#0284C7';
  ctx.fillText(`● ${spec.normalLegend.slice(0, 34)}`, plotBox.x + 12, plotBox.y + 18);
  ctx.fillStyle = '#DC2626';
  ctx.fillText(`--- ${spec.shiftedLegend.slice(0, 34)}`, plotBox.x + 12, axes.bottom + 24);

  roundRectPath(ctx, organBox.x, organBox.y, organBox.w, organBox.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  if (threeOrganCanvas && isThreeActive) {
    drawImageCoverOrContain(
      ctx,
      threeOrganCanvas,
      { x: organBox.x + 4, y: organBox.y + 22, w: organBox.w - 8, h: organBox.h - 28 },
      'contain'
    );
  } else if (organImg) {
    drawImageCoverOrContain(
      ctx,
      organImg,
      { x: organBox.x + 4, y: organBox.y + 22, w: organBox.w - 8, h: organBox.h - 28 },
      'contain'
    );
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 9.5px "IBM Plex Mono", monospace';
  ctx.fillText(
    threeOrganCanvas && isThreeActive ? '3D ORGAN MODEL' : '2D ORGAN SCHEMATIC',
    organBox.x + 8,
    organBox.y + 15
  );

  // Bottom Row: Clear 4-Step Feedback Loop (large readable labels, zero overlap)
  const fbY = topRowY + topRowH + 10;
  const fbH = visualBox.y + visualBox.h - fbY - 10;
  const steps = spec.feedbackSteps.slice(0, 4);
  const stepGap = 8;
  const stepW = (visualBox.w - 28 - stepGap * (steps.length - 1)) / steps.length;
  const activeStepIdx = Math.min(
    steps.length - 1,
    Math.floor(sceneProgress * steps.length)
  );

  const badge =
    threeOrganCanvas && isThreeActive
      ? '2D Curve + 3D Organ Model'
      : '2D Physiological Curve';

  let focusTarget: ScreenFocusTarget = {
    x: activeCurvePt.x,
    y: activeCurvePt.y,
    label: spec.curveTitle,
    visualProvenanceBadge: badge,
  };

  steps.forEach((st, idx) => {
    const sx = visualBox.x + 14 + idx * (stepW + stepGap);
    const isStepActive = idx === activeStepIdx && sceneProgress > 0.32;

    roundRectPath(ctx, sx, fbY, stepW, fbH, 8);
    ctx.fillStyle = isStepActive ? '#0F4C81' : '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = isStepActive ? '#0284C7' : '#CBD5E1';
    ctx.lineWidth = isStepActive ? 1.8 : 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = isStepActive ? '#7DD3FC' : '#0284C7';
    ctx.font = '700 10px "IBM Plex Mono", monospace';
    ctx.fillText(st.role.toUpperCase(), sx + 8, fbY + 18);

    ctx.fillStyle = isStepActive ? '#FFFFFF' : '#0F172A';
    ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
    const lines = wrapCanvasText(ctx, st.label, stepW - 16, 2);
    lines.forEach((ln, lIdx) => {
      ctx.fillText(ln, sx + 8, fbY + 38 + lIdx * 16);
    });

    if (idx < steps.length - 1) {
      drawArrowSegment(
        ctx,
        sx + stepW + 1,
        fbY + fbH * 0.5,
        sx + stepW + stepGap - 1,
        fbY + fbH * 0.5,
        '#0284C7',
        2.2,
        6
      );
    }

    if (isStepActive) {
      focusTarget = {
        x: sx + stepW * 0.5,
        y: fbY + fbH * 0.4,
        label: `${st.role}: ${st.label}`,
        visualProvenanceBadge: badge,
      };
    }
  });

  return focusTarget;
}

/**
 * 3) PATHOLOGY NORMAL VS. ABNORMAL + H&E HISTOPATHOLOGY + PROGRESSION BOARD
 */
function drawPathologyVisualBoard(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  visualBox: BoxRect,
  sceneProgress: number,
  lectureTitle: string,
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): ScreenFocusTarget {
  const spec = getDisciplineVisualSpec(scene, lectureTitle, 'pathology').pathology;
  const plate = resolveSceneAtlasAsset(
    scene.systemTemplate,
    'pathophysiology',
    'pathology',
    lectureTitle
  );
  const normalImg = getLoadedAtlasImage(plate.normalReferenceUrl || plate.imageUrl);
  const histoImg = getLoadedAtlasImage(
    plate.histologyComparisonUrl || getPathologyHistologySplitUrl()
  );

  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#B91C1C';
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    'Normal vs. Pathological Architecture & Histology',
    visualBox.x + 14,
    visualBox.y + 23
  );

  const badge =
    threeOrganCanvas && isThreeActive
      ? '3D Lesion Model + 2D H&E Schematic'
      : '2D Organ + 2D H&E Schematic';

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '700 10px "IBM Plex Mono", monospace';
  ctx.fillText(badge, visualBox.x + visualBox.w - 14, visualBox.y + 22);

  const splitY = visualBox.y + 34;
  const splitH = Math.round(visualBox.h * 0.56);
  const halfW = (visualBox.w - 36) / 2;

  const leftCard: BoxRect = { x: visualBox.x + 14, y: splitY, w: halfW, h: splitH };
  const rightCard: BoxRect = {
    x: leftCard.x + halfW + 8,
    y: splitY,
    w: halfW,
    h: splitH,
  };

  roundRectPath(ctx, leftCard.x, leftCard.y, leftCard.w, leftCard.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  if (threeOrganCanvas && isThreeActive) {
    drawImageCoverOrContain(
      ctx,
      threeOrganCanvas,
      { x: leftCard.x + 6, y: leftCard.y + 24, w: leftCard.w - 12, h: leftCard.h - 30 },
      'contain'
    );
  } else if (normalImg) {
    drawImageCoverOrContain(
      ctx,
      normalImg,
      { x: leftCard.x + 6, y: leftCard.y + 24, w: leftCard.w - 12, h: leftCard.h - 30 },
      'contain'
    );
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 10.5px "IBM Plex Mono", monospace';
  ctx.fillText(
    threeOrganCanvas && isThreeActive ? 'A. 3D PATHOLOGICAL MODEL' : 'A. 2D GROSS ORGAN VIEW',
    leftCard.x + 10,
    leftCard.y + 16
  );

  roundRectPath(ctx, rightCard.x, rightCard.y, rightCard.w, rightCard.h, 8);
  ctx.fillStyle = '#FEF2F2';
  ctx.fill();
  ctx.strokeStyle = '#FECACA';
  ctx.stroke();
  if (histoImg) {
    drawImageCoverOrContain(
      ctx,
      histoImg,
      {
        x: rightCard.x + 6,
        y: rightCard.y + 24,
        w: rightCard.w - 12,
        h: rightCard.h - 48,
      },
      'cover'
    );
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#B91C1C';
  ctx.font = '700 10.5px "IBM Plex Mono", monospace';
  ctx.fillText('B. 2D H&E SCHEMATIC SPLIT', rightCard.x + 10, rightCard.y + 16);

  ctx.fillStyle = '#0F766E';
  ctx.font = '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
  const normShort =
    wrapCanvasText(ctx, spec.histologyNormalLabel, rightCard.w * 0.46, 1)[0] ||
    'Normal Tissue';
  ctx.fillText(normShort, rightCard.x + 10, rightCard.y + rightCard.h - 10);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#B91C1C';
  const abnShort =
    wrapCanvasText(ctx, spec.histologyAbnormalLabel, rightCard.w * 0.46, 1)[0] ||
    'Pathologic Lesion';
  ctx.fillText(abnShort, rightCard.x + rightCard.w - 10, rightCard.y + rightCard.h - 10);

  // Bottom: 4-Stage Disease Progression Arrows
  const progY = splitY + splitH + 10;
  const progH = visualBox.y + visualBox.h - progY - 10;
  const stages = spec.progressionCascade;
  const gap = 8;
  const stageW = (visualBox.w - 28 - gap * (stages.length - 1)) / stages.length;
  const activeStage = Math.min(
    stages.length - 1,
    Math.floor(sceneProgress * stages.length)
  );

  let focusTarget: ScreenFocusTarget = {
    x: rightCard.x + rightCard.w * 0.72,
    y: rightCard.y + rightCard.h * 0.52,
    label: spec.abnormalTitle,
    visualProvenanceBadge: badge,
  };

  stages.forEach((st, idx) => {
    const sx = visualBox.x + 14 + idx * (stageW + gap);
    const active = idx === activeStage;
    roundRectPath(ctx, sx, progY, stageW, progH, 8);
    ctx.fillStyle = active ? '#991B1B' : '#FFF1F2';
    ctx.fill();
    ctx.strokeStyle = active ? '#DC2626' : '#FECDD3';
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = active ? '#FECACA' : '#991B1B';
    ctx.font = '700 10px "IBM Plex Mono", monospace';
    ctx.fillText(st.stage, sx + 8, progY + 17);

    ctx.fillStyle = active ? '#FFFFFF' : '#1E293B';
    ctx.font = '600 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const lines = wrapCanvasText(ctx, st.detail, stageW - 16, 2);
    lines.forEach((ln, lIdx) => {
      ctx.fillText(ln, sx + 8, progY + 35 + lIdx * 15);
    });

    if (idx < stages.length - 1) {
      drawArrowSegment(
        ctx,
        sx + stageW + 1,
        progY + progH * 0.5,
        sx + stageW + gap - 1,
        progY + progH * 0.5,
        '#DC2626',
        2.2,
        6
      );
    }

    if (active && sceneProgress > 0.4) {
      focusTarget = {
        x: sx + stageW * 0.5,
        y: progY + progH * 0.4,
        label: st.stage,
        visualProvenanceBadge: badge,
      };
    }
  });

  return focusTarget;
}

/**
 * 4) PHARMACOLOGY RECEPTOR MECHANISM & DRUG COMPARISON BOARD
 */
function drawPharmacologyVisualBoard(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  visualBox: BoxRect,
  sceneProgress: number,
  lectureTitle: string,
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): ScreenFocusTarget {
  const spec = getDisciplineVisualSpec(scene, lectureTitle, 'pharmacology').pharmacology;
  const plate = resolveSceneAtlasAsset(
    scene.systemTemplate,
    'treatment',
    'pharmacology',
    lectureTitle
  );
  const recImg = getLoadedAtlasImage(plate.imageUrl);

  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const badge =
    threeOrganCanvas && isThreeActive
      ? '3D Procedural Receptor + Drug Table'
      : '2D Receptor Schematic + Drug Table';

  ctx.textAlign = 'left';
  ctx.fillStyle = '#047857';
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  const pTitle =
    wrapCanvasText(ctx, spec.pathwayTitle, visualBox.w - 230, 1)[0] || spec.pathwayTitle;
  ctx.fillText(pTitle, visualBox.x + 14, visualBox.y + 23);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(badge, visualBox.x + visualBox.w - 14, visualBox.y + 22);

  const topY = visualBox.y + 32;
  const topH = Math.round(visualBox.h * 0.48);
  const imgW = Math.round((visualBox.w - 36) * 0.45);
  const recBox: BoxRect = { x: visualBox.x + 14, y: topY, w: imgW, h: topH };
  const mechBox: BoxRect = {
    x: recBox.x + imgW + 8,
    y: topY,
    w: visualBox.w - 28 - imgW - 8,
    h: topH,
  };

  roundRectPath(ctx, recBox.x, recBox.y, recBox.w, recBox.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  if (threeOrganCanvas && isThreeActive) {
    drawImageCoverOrContain(
      ctx,
      threeOrganCanvas,
      { x: recBox.x + 4, y: recBox.y + 22, w: recBox.w - 8, h: recBox.h - 26 },
      'contain'
    );
  } else if (recImg) {
    drawImageCoverOrContain(
      ctx,
      recImg,
      { x: recBox.x + 4, y: recBox.y + 22, w: recBox.w - 8, h: recBox.h - 26 },
      'cover'
    );
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#047857';
  ctx.font = '700 9.5px "IBM Plex Mono", monospace';
  ctx.fillText(
    threeOrganCanvas && isThreeActive
      ? '3D RECEPTOR & LIGAND BINDING'
      : '2D RECEPTOR & CHANNEL TARGET',
    recBox.x + 8,
    recBox.y + 15
  );

  const stepH = (mechBox.h - 12) / 3;
  spec.mechanismSteps.forEach((ms, idx) => {
    const sy = mechBox.y + idx * (stepH + 6);
    const active = idx === Math.min(2, Math.floor(sceneProgress * 3));
    roundRectPath(ctx, mechBox.x, sy, mechBox.w, stepH, 7);
    ctx.fillStyle = active ? '#ECFDF5' : '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = active ? '#059669' : '#E2E8F0';
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.stroke();

    ctx.fillStyle = '#047857';
    ctx.font = '700 10px "IBM Plex Mono", monospace';
    ctx.fillText(ms.step, mechBox.x + 8, sy + 16);

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const ln = wrapCanvasText(ctx, `${ms.target} → ${ms.effect}`, mechBox.w - 16, 2);
    ln.forEach((l, li) => ctx.fillText(l, mechBox.x + 8, sy + 32 + li * 14));
  });

  // Bottom Drug Class & Safety Comparison Table
  const tblY = topY + topH + 10;
  const tblH = visualBox.y + visualBox.h - tblY - 10;
  roundRectPath(ctx, visualBox.x + 14, tblY, visualBox.w - 28, tblH, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  const rowH = tblH / (spec.drugRows.length + 1);
  const tableX = visualBox.x + 14;
  const tableW = visualBox.w - 28;
  roundRectPath(ctx, tableX, tblY, tableW, rowH, 7);
  ctx.fillStyle = '#065F46';
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 10px "IBM Plex Mono", monospace';
  ctx.fillText('DRUG CLASS', tableX + 8, tblY + 17);
  ctx.fillText('TARGET MECHANISM', tableX + tableW * 0.31, tblY + 17);
  ctx.fillText('SAFETY / ADVERSE WATCH', tableX + tableW * 0.62, tblY + 17);

  const activeRow = Math.min(
    spec.drugRows.length - 1,
    Math.floor(sceneProgress * spec.drugRows.length)
  );

  spec.drugRows.forEach((dr, rIdx) => {
    const ry = tblY + rowH * (rIdx + 1);
    if (rIdx === activeRow) {
      ctx.fillStyle = '#ECFDF5';
      ctx.fillRect(tableX + 1, ry, tableW - 2, rowH - 1);
    }
    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(tableX, ry);
    ctx.lineTo(tableX + tableW, ry);
    ctx.stroke();

    ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#065F46';
    ctx.fillText(
      wrapCanvasText(ctx, dr.agentClass, tableW * 0.28, 1)[0] || dr.agentClass,
      tableX + 8,
      ry + 18
    );
    ctx.fillStyle = '#1E293B';
    ctx.fillText(
      wrapCanvasText(ctx, dr.targetReceptor, tableW * 0.29, 1)[0] || dr.targetReceptor,
      tableX + tableW * 0.31,
      ry + 18
    );
    ctx.fillStyle = '#B91C1C';
    ctx.fillText(
      wrapCanvasText(ctx, dr.adverseWatch, tableW * 0.36, 1)[0] || dr.adverseWatch,
      tableX + tableW * 0.62,
      ry + 18
    );
  });

  return sceneProgress < 0.45
    ? {
        x: recBox.x + recBox.w * 0.5,
        y: recBox.y + recBox.h * 0.52,
        label: spec.mechanismSteps[0]?.target || 'Receptor Target',
        visualProvenanceBadge: badge,
      }
    : {
        x: tableX + tableW * 0.45,
        y: tblY + rowH * (activeRow + 1.5),
        label: spec.drugRows[activeRow]?.agentClass || 'Therapeutic Class',
        visualProvenanceBadge: badge,
      };
}

/**
 * 5) IMMUNOLOGY APC–MHC SYNAPSE, CYTOKINES & COMPLEMENT BOARD
 */
function drawImmunologyVisualBoard(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  visualBox: BoxRect,
  sceneProgress: number,
  lectureTitle: string,
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): ScreenFocusTarget {
  const spec = getDisciplineVisualSpec(scene, lectureTitle, 'immunology').immunology;
  const plate = resolveSceneAtlasAsset(
    'immune',
    scene.visualMode,
    'immunology',
    lectureTitle
  );
  const immImg = getLoadedAtlasImage(plate.imageUrl);

  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const badge =
    threeOrganCanvas && isThreeActive
      ? '3D Procedural Immune Synapse'
      : '2D Cellular Immunology Diagram';

  ctx.textAlign = 'left';
  ctx.fillStyle = '#6D28D9';
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    'Antigen Presentation, Cytokines & Effector Cascade',
    visualBox.x + 14,
    visualBox.y + 23
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '700 10px "IBM Plex Mono", monospace';
  ctx.fillText(badge, visualBox.x + visualBox.w - 14, visualBox.y + 22);

  const topY = visualBox.y + 32;
  const topH = Math.round(visualBox.h * 0.52);
  const imgW = Math.round((visualBox.w - 36) * 0.5);
  const synBox: BoxRect = { x: visualBox.x + 14, y: topY, w: imgW, h: topH };
  const cytoBox: BoxRect = {
    x: synBox.x + imgW + 8,
    y: topY,
    w: visualBox.w - 28 - imgW - 8,
    h: topH,
  };

  roundRectPath(ctx, synBox.x, synBox.y, synBox.w, synBox.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#DDD6FE';
  ctx.stroke();

  if (threeOrganCanvas && isThreeActive) {
    drawImageCoverOrContain(
      ctx,
      threeOrganCanvas,
      { x: synBox.x + 4, y: synBox.y + 22, w: synBox.w - 8, h: synBox.h - 26 },
      'contain'
    );
  } else if (immImg) {
    drawImageCoverOrContain(
      ctx,
      immImg,
      { x: synBox.x + 4, y: synBox.y + 22, w: synBox.w - 8, h: synBox.h - 26 },
      'cover'
    );
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#6D28D9';
  ctx.font = '700 9.5px "IBM Plex Mono", monospace';
  ctx.fillText(
    threeOrganCanvas && isThreeActive
      ? '3D APC–MHC-II–TCR SYNAPSE'
      : '2D MHC-II SYNAPSE & IgG',
    synBox.x + 8,
    synBox.y + 15
  );

  roundRectPath(ctx, cytoBox.x, cytoBox.y, cytoBox.w, cytoBox.h, 8);
  ctx.fillStyle = '#FAF5FF';
  ctx.fill();
  ctx.strokeStyle = '#DDD6FE';
  ctx.stroke();

  ctx.fillStyle = '#5B21B6';
  ctx.font = '700 10px "IBM Plex Mono", monospace';
  ctx.fillText('KEY CYTOKINE SIGNALING', cytoBox.x + 10, cytoBox.y + 16);

  spec.cytokines.forEach((cy, idx) => {
    const cyY = cytoBox.y + 26 + idx * 54;
    roundRectPath(ctx, cytoBox.x + 8, cyY, cytoBox.w - 16, 48, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E9D5FF';
    ctx.stroke();

    ctx.fillStyle = '#6D28D9';
    ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`${cy.name} (${cy.source})`, cytoBox.x + 14, cyY + 16);

    ctx.fillStyle = '#1E293B';
    ctx.font = '600 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const lines = wrapCanvasText(ctx, cy.effect, cytoBox.w - 28, 2);
    lines.forEach((ln, li) => ctx.fillText(ln, cytoBox.x + 14, cyY + 31 + li * 13));
  });

  const casY = topY + topH + 10;
  const casH = visualBox.y + visualBox.h - casY - 10;
  const gap = 8;
  const nodeW =
    (visualBox.w - 28 - gap * (spec.nodes.length - 1)) / spec.nodes.length;
  const activeNode = Math.min(
    spec.nodes.length - 1,
    Math.floor(sceneProgress * spec.nodes.length)
  );

  spec.nodes.forEach((nd, idx) => {
    const nx = visualBox.x + 14 + idx * (nodeW + gap);
    const active = idx === activeNode;
    roundRectPath(ctx, nx, casY, nodeW, casH, 8);
    ctx.fillStyle = active ? '#5B21B6' : '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = active ? '#7C3AED' : '#CBD5E1';
    ctx.stroke();

    ctx.fillStyle = active ? '#DDD6FE' : '#6D28D9';
    ctx.font = '700 9.5px "IBM Plex Mono", monospace';
    ctx.fillText(nd.arm.toUpperCase(), nx + 8, casY + 16);

    ctx.fillStyle = active ? '#FFFFFF' : '#0F172A';
    ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const lines = wrapCanvasText(ctx, nd.title, nodeW - 16, 2);
    lines.forEach((ln, li) => ctx.fillText(ln, nx + 8, casY + 34 + li * 15));

    if (idx < spec.nodes.length - 1) {
      drawArrowSegment(
        ctx,
        nx + nodeW + 1,
        casY + casH * 0.5,
        nx + nodeW + gap - 1,
        casY + casH * 0.5,
        '#7C3AED',
        2.2,
        6
      );
    }
  });

  return {
    x: visualBox.x + 14 + activeNode * (nodeW + gap) + nodeW * 0.5,
    y: casY + casH * 0.4,
    label: spec.nodes[activeNode]?.title || 'Immunological Synapse',
    visualProvenanceBadge: badge,
  };
}

/**
 * 6) CLINICAL COMPARISON MATRIX BOARD
 */
function drawComparisonTableBoard(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  visualBox: BoxRect,
  sceneProgress: number,
  lectureTitle: string,
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): ScreenFocusTarget {
  const table = scene.comparisonTable;
  if (!table || table.rows.length === 0) {
    return drawAnatomyVisualBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      'pathology',
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  }

  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 14px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(table.caption, visualBox.x + 16, visualBox.y + 25);

  const tblX = visualBox.x + 14;
  const tblY = visualBox.y + 40;
  const tblW = visualBox.w - 28;
  const tblH = visualBox.h - 54;
  const colCount = table.columns.length;
  const colW = tblW / colCount;
  const headerH = 36;
  const rowH = (tblH - headerH) / Math.max(1, table.rows.length);

  roundRectPath(ctx, tblX, tblY, tblW, headerH, 8);
  ctx.fillStyle = '#0F4C81';
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
  table.columns.forEach((hdr, cIdx) => {
    const shortHdr = wrapCanvasText(ctx, hdr, colW - 16, 1)[0] || hdr;
    ctx.fillText(shortHdr, tblX + cIdx * colW + 10, tblY + 23);
  });

  const activeRowIdx = Math.min(
    table.rows.length - 1,
    Math.floor(sceneProgress * table.rows.length)
  );

  table.rows.forEach((row, rIdx) => {
    const ry = tblY + headerH + rIdx * rowH;
    const isRowActive = rIdx === activeRowIdx;

    ctx.fillStyle = isRowActive
      ? '#E0F2FE'
      : rIdx % 2 === 0
        ? '#FFFFFF'
        : '#F8FAFC';
    ctx.fillRect(tblX, ry, tblW, rowH);

    ctx.strokeStyle = isRowActive ? '#0284C7' : '#E2E8F0';
    ctx.lineWidth = isRowActive ? 1.8 : 1;
    ctx.strokeRect(tblX, ry, tblW, rowH);

    row.forEach((cell, cIdx) => {
      ctx.fillStyle = cIdx === 0 ? '#0F4C81' : '#1E293B';
      ctx.font =
        cIdx === 0
          ? '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif'
          : '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
      const cellLines = wrapCanvasText(ctx, cell, colW - 16, 3);
      cellLines.forEach((ln, lIdx) => {
        ctx.fillText(ln, tblX + cIdx * colW + 10, ry + 20 + lIdx * 15);
      });
    });
  });

  return {
    x: tblX + colW * 0.5,
    y: tblY + headerH + (activeRowIdx + 0.5) * rowH,
    label: table.rows[activeRowIdx]?.[0] || table.caption,
    visualProvenanceBadge: '2D Differential Matrix',
  };
}

/**
 * 7) FINAL SYNTHESIS BOARD: MIND MAP + FLOWCHART + VERIFIED SOURCES
 */
function drawFinalRevisionBoard(
  ctx: CanvasRenderingContext2D,
  allScenes: LectureScene[],
  visualBox: BoxRect,
  lectureTitle: string,
  externalReferences: LectureExternalReference[]
): ScreenFocusTarget {
  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const rev = buildLectureRevisionPack({ topic: lectureTitle, scenes: allScenes });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    'Integrated Concept Map & Clinical Summary Flowchart',
    visualBox.x + 14,
    visualBox.y + 23
  );

  const mapBox: BoxRect = {
    x: visualBox.x + 14,
    y: visualBox.y + 34,
    w: visualBox.w - 28,
    h: Math.round(visualBox.h * 0.48),
  };
  roundRectPath(ctx, mapBox.x, mapBox.y, mapBox.w, mapBox.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  const cx = mapBox.x + mapBox.w * 0.5;
  const cy = mapBox.y + mapBox.h * 0.5;
  const nodes = rev.mindMap.nodes.slice(0, 4);
  const offsets = [
    { dx: -mapBox.w * 0.31, dy: -mapBox.h * 0.27 },
    { dx: mapBox.w * 0.31, dy: -mapBox.h * 0.27 },
    { dx: -mapBox.w * 0.31, dy: mapBox.h * 0.27 },
    { dx: mapBox.w * 0.31, dy: mapBox.h * 0.27 },
  ];

  nodes.forEach((node, idx) => {
    const pos = offsets[idx % offsets.length];
    const nx = cx + pos.dx;
    const ny = cy + pos.dy;
    const disc = node.disciplineTag || 'physiology';
    const meta = MEDICAL_DISCIPLINE_META[disc];

    ctx.strokeStyle = meta.accentHex;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    const nw = 186;
    const nh = 46;
    roundRectPath(ctx, nx - nw / 2, ny - nh / 2, nw, nh, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = meta.accentHex;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = meta.accentHex;
    ctx.font = '700 9.5px "IBM Plex Mono", monospace';
    ctx.fillText(`[${meta.shortBadge}] ${node.relationLabel || ''}`, nx, ny - 5);

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
    const shortN = wrapCanvasText(ctx, node.label, nw - 14, 1)[0] || node.label;
    ctx.fillText(shortN, nx, ny + 12);
  });

  const hubW = 176;
  const hubH = 46;
  roundRectPath(ctx, cx - hubW / 2, cy - hubH / 2, hubW, hubH, 10);
  ctx.fillStyle = '#0F4C81';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  const shortTopic = wrapCanvasText(ctx, lectureTitle, hubW - 14, 2);
  shortTopic.forEach((ln, idx) => {
    ctx.fillText(ln, cx, cy - (shortTopic.length > 1 ? 3 : -4) + idx * 14);
  });

  const flowY = mapBox.y + mapBox.h + 10;
  const flowNodes = rev.flowchart.nodes.slice(0, 4);
  const fGap = 8;
  const fW =
    (visualBox.w - 28 - fGap * (flowNodes.length - 1)) /
    Math.max(1, flowNodes.length);
  const fH = 56;

  flowNodes.forEach((fn, idx) => {
    const fx = visualBox.x + 14 + idx * (fW + fGap);
    roundRectPath(ctx, fx, flowY, fW, fH, 7);
    ctx.fillStyle = '#F0F9FF';
    ctx.fill();
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F4C81';
    ctx.font = '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const lines = wrapCanvasText(ctx, fn.label, fW - 14, 2);
    lines.forEach((ln, li) => ctx.fillText(ln, fx + 7, flowY + 20 + li * 14));

    if (idx < flowNodes.length - 1) {
      drawArrowSegment(
        ctx,
        fx + fW + 1,
        flowY + fH / 2,
        fx + fW + fGap - 1,
        flowY + fH / 2,
        '#0284C7',
        2.0,
        5
      );
    }
  });

  const refY = flowY + fH + 10;
  const refH = Math.max(44, visualBox.y + visualBox.h - refY - 10);
  roundRectPath(ctx, visualBox.x + 14, refY, visualBox.w - 28, refH, 8);
  ctx.fillStyle = '#ECFDF5';
  ctx.fill();
  ctx.strokeStyle = '#A7F3D0';
  ctx.stroke();

  const bookMap = new Map<string, Set<number>>();
  for (const s of allScenes) {
    for (const c of s.bookCitations || []) {
      const set = bookMap.get(c.textbookTitle) || new Set<number>();
      c.pageNumbers.forEach((p) => set.add(p));
      bookMap.set(c.textbookTitle, set);
    }
  }
  const citLines = Array.from(bookMap.entries()).map(
    ([title, pgs]) =>
      `${shortenBookTitle(title, 36)} (pp. ${Array.from(pgs)
        .sort((a, b) => a - b)
        .join(', ')})`
  );

  ctx.textAlign = 'left';
  ctx.fillStyle = '#065F46';
  ctx.font = '700 10px "IBM Plex Mono", monospace';
  ctx.fillText('EVIDENCE PROVENANCE:', visualBox.x + 22, refY + 17);

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
  const summarySource =
    citLines.length > 0
      ? `Uploaded Textbook: ${citLines.join(' · ')}`
      : externalReferences.length > 0
        ? `External Evidence: ${externalReferences.map((r) => r.title).join(' · ')}`
        : 'General Medical Knowledge (0 fabricated textbook citations)';
  const wrappedSrc = wrapCanvasText(ctx, summarySource, visualBox.w - 48, 2);
  wrappedSrc.forEach((ln, idx) =>
    ctx.fillText(ln, visualBox.x + 22, refY + 34 + idx * 14)
  );

  return {
    x: cx,
    y: cy,
    label: 'Integrated Concept Mind Map',
    visualProvenanceBadge: '2D Vector Flowchart & Map',
  };
}

/**
 * 8) STEPWISE DIAGNOSTIC INVESTIGATIONS & BEDSIDE WORKUP BOARD
 */
function drawInvestigationsVisualBoard(
  ctx: CanvasRenderingContext2D,
  scene: LectureScene,
  visualBox: BoxRect,
  sceneProgress: number,
  lectureTitle: string,
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): ScreenFocusTarget {
  const plate = resolveSceneAtlasAsset(
    scene.systemTemplate,
    'investigations',
    'pathology',
    lectureTitle
  );
  const img = getLoadedAtlasImage(plate.imageUrl);

  roundRectPath(ctx, visualBox.x, visualBox.y, visualBox.w, visualBox.h, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const badge =
    threeOrganCanvas && isThreeActive
      ? '3D Procedural Organ + Workup Flow'
      : '2D Diagnostic Workup Flow';

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`Stepwise Diagnostic Pathway — ${lectureTitle}`, visualBox.x + 16, visualBox.y + 24);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(badge, visualBox.x + visualBox.w - 16, visualBox.y + 23);

  const topY = visualBox.y + 36;
  const topH = Math.round(visualBox.h * 0.5);
  const viewportBox: BoxRect = {
    x: visualBox.x + 14,
    y: topY,
    w: visualBox.w - 28,
    h: topH,
  };
  roundRectPath(ctx, viewportBox.x, viewportBox.y, viewportBox.w, viewportBox.h, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  if (threeOrganCanvas && isThreeActive) {
    drawImageCoverOrContain(ctx, threeOrganCanvas, viewportBox, 'contain');
  } else if (img) {
    drawImageCoverOrContain(ctx, img, viewportBox, 'contain');
  }

  const rawSteps =
    scene.onScreenLabels && scene.onScreenLabels.length >= 2
      ? scene.onScreenLabels.slice(0, 3)
      : ['Bedside Screening & Vitals', 'Confirmatory Test / Imaging', 'Severity & Mimic Rule-Out'];

  const stepTitles = ['STEP 1 · INITIAL', 'STEP 2 · CONFIRM', 'STEP 3 · GRADE'];
  const flowY = topY + topH + 14;
  const flowH = visualBox.y + visualBox.h - flowY - 12;
  const gap = 12;
  const stepW = (visualBox.w - 28 - gap * (rawSteps.length - 1)) / rawSteps.length;
  const activeStep = Math.min(
    rawSteps.length - 1,
    Math.floor(sceneProgress * rawSteps.length)
  );

  let focusTarget: ScreenFocusTarget = {
    x: viewportBox.x + viewportBox.w * 0.5,
    y: viewportBox.y + viewportBox.h * 0.5,
    label: rawSteps[activeStep] || scene.title,
    visualProvenanceBadge: badge,
  };

  rawSteps.forEach((stepLbl, idx) => {
    const sx = visualBox.x + 14 + idx * (stepW + gap);
    const isActive = idx === activeStep;

    roundRectPath(ctx, sx, flowY, stepW, flowH, 8);
    ctx.fillStyle = isActive ? '#0F4C81' : '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = isActive ? '#0284C7' : '#CBD5E1';
    ctx.lineWidth = isActive ? 1.8 : 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = isActive ? '#7DD3FC' : '#0284C7';
    ctx.font = '700 10px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(stepTitles[idx] || `STEP ${idx + 1}`, sx + 10, flowY + 20);

    ctx.fillStyle = isActive ? '#FFFFFF' : '#0F172A';
    ctx.font = '700 12.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const lines = wrapCanvasText(ctx, stepLbl, stepW - 20, 3);
    lines.forEach((ln, li) => {
      ctx.fillText(ln, sx + 10, flowY + 42 + li * 17);
    });

    if (idx < rawSteps.length - 1) {
      drawArrowSegment(
        ctx,
        sx + stepW + 2,
        flowY + flowH * 0.5,
        sx + stepW + gap - 2,
        flowY + flowH * 0.5,
        '#0284C7',
        2.2,
        6
      );
    }

    if (isActive) {
      focusTarget = {
        x: sx + stepW * 0.5,
        y: flowY + flowH * 0.45,
        label: stepLbl,
        visualProvenanceBadge: badge,
      };
    }
  });

  return focusTarget;
}

function renderSmartboardSlideSurface(
  ctx: CanvasRenderingContext2D,
  screenInner: BoxRect,
  scene: LectureScene,
  sceneProgress: number,
  allScenes: LectureScene[],
  lectureTitle: string,
  preferredDiscipline: MedicalSubjectDiscipline | 'auto' | undefined,
  externalReferences: LectureExternalReference[],
  threeOrganCanvas: HTMLCanvasElement | null,
  isThreeActive: boolean
): { focusTarget: ScreenFocusTarget; activeBulletY: number } {
  const activeDiscipline = inferSceneDiscipline(
    scene,
    lectureTitle,
    preferredDiscipline
  );
  const discMeta = MEDICAL_DISCIPLINE_META[activeDiscipline];

  // Clean White Slide Header — Single Active Concept Only
  ctx.save();
  roundRectPath(ctx, screenInner.x, screenInner.y, screenInner.w, 66, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(screenInner.x + 16, screenInner.y + 64);
  ctx.lineTo(screenInner.x + screenInner.w - 16, screenInner.y + 64);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0284C7';
  ctx.font = '700 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
  const kickerText = (scene.sectionKicker || discMeta.label).toUpperCase();
  ctx.fillText(kickerText, screenInner.x + 20, screenInner.y + 22);

  // Quiet unboxed source provenance on top-right of slide
  const hasVerifiedCite =
    scene.sourceBasis === 'textbook' &&
    scene.bookCitations &&
    scene.bookCitations.length > 0;
  const citeText = hasVerifiedCite
    ? `${shortenBookTitle(
        scene.bookCitations[0].textbookTitle,
        28
      )}, p. ${scene.bookCitations[0].pageNumbers.join(', ')}`
    : externalReferences.length > 0
      ? 'External Evidence + Medical Knowledge'
      : 'General Medical Knowledge';

  ctx.textAlign = 'right';
  ctx.fillStyle = hasVerifiedCite ? '#047857' : '#64748B';
  ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(citeText, screenInner.x + screenInner.w - 20, screenInner.y + 22);

  // Large, readable, single-concept Navy Heading
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C81';
  ctx.font = '700 22px "Lora", Georgia, serif';
  const screenTitle =
    wrapCanvasText(ctx, scene.title, screenInner.w - 40, 1)[0] || scene.title;
  ctx.fillText(screenTitle, screenInner.x + 20, screenInner.y + 50);
  ctx.restore();

  // Slide Body: Left Short Bullets (288px) | Right Synchronized Medical Illustration/Diagram
  const boardBodyY = screenInner.y + 74;
  const boardBodyH = screenInner.h - 84;
  const railBox: BoxRect = {
    x: screenInner.x + 12,
    y: boardBodyY,
    w: 288,
    h: boardBodyH,
  };
  const visualBox: BoxRect = {
    x: railBox.x + railBox.w + 12,
    y: boardBodyY,
    w: screenInner.w - railBox.w - 36,
    h: boardBodyH,
  };

  const { activeBulletY } = drawSmartboardConceptRail(
    ctx,
    scene,
    railBox,
    sceneProgress,
    allScenes,
    lectureTitle
  );

  let focusTarget: ScreenFocusTarget;
  if (scene.visualMode === 'references') {
    focusTarget = drawFinalRevisionBoard(
      ctx,
      allScenes,
      visualBox,
      lectureTitle,
      externalReferences
    );
  } else if (scene.visualMode === 'comparison') {
    focusTarget = drawComparisonTableBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  } else if (
    scene.visualMode === 'investigations' ||
    scene.pedagogicalStage === 'investigations'
  ) {
    focusTarget = drawInvestigationsVisualBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  } else if (activeDiscipline === 'physiology') {
    focusTarget = drawPhysiologyVisualBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  } else if (activeDiscipline === 'pathology') {
    focusTarget = drawPathologyVisualBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  } else if (activeDiscipline === 'pharmacology') {
    focusTarget = drawPharmacologyVisualBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  } else if (activeDiscipline === 'immunology') {
    focusTarget = drawImmunologyVisualBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  } else {
    focusTarget = drawAnatomyVisualBoard(
      ctx,
      scene,
      visualBox,
      sceneProgress,
      activeDiscipline,
      lectureTitle,
      threeOrganCanvas,
      isThreeActive
    );
  }

  return { focusTarget, activeBulletY };
}

/**
 * Master 16:9 Continuous Reference-Style Medical Lecture Renderer (1280×720 / 960×540).
 * - Calm, bright, consistent university medical teaching room
 * - Consistent White-Coat Doctor standing on the LEFT
 * - Large clean Electronic Smartboard on the RIGHT showing only the active concept
 * - Smooth cross-dissolve on the smartboard between sections while doctor, room, and camera stay locked
 */
export function renderLectureFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: LectureRenderFrameOptions
): void {
  const {
    scenes,
    timeSec,
    presenterId,
    language,
    lectureTitle,
    showSubtitles,
    mouthOpenness,
    isSpeaking,
    preferredDiscipline,
    externalReferences = [],
  } = options;

  const baseW = 1280;
  const baseH = 720;

  ctx.save();
  ctx.scale(width / baseW, height / baseH);

  // 1. Calm, Bright, Consistent Academic Medical Room (Fixed Camera & Lighting)
  const wallGrad = ctx.createLinearGradient(0, 0, 0, baseH);
  wallGrad.addColorStop(0, '#F1F5F9');
  wallGrad.addColorStop(0.78, '#E2E8F0');
  wallGrad.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, baseW, baseH);

  // Subtle architectural floor / baseboard line behind doctor and smartboard
  const floorY = 626;
  ctx.fillStyle = '#DCE4EE';
  ctx.fillRect(0, floorY, baseW, baseH - floorY);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(baseW, floorY);
  ctx.stroke();

  const lookup = findSceneAtTime(scenes, timeSec);
  const scene = lookup.current.scene;
  const sceneProgress = lookup.sceneProgress;
  const profile = getDoctorProfile(presenterId);
  const totalDur = getTotalLectureDuration(scenes);

  const activeDiscipline = inferSceneDiscipline(
    scene,
    lectureTitle,
    preferredDiscipline
  );

  // Layout coordinates: Doctor on LEFT (x: 14..310) | Large Electronic Smartboard on RIGHT (x: 320..1262)
  const contentTopY = 20;
  const contentH = showSubtitles ? 624 : 676;
  const stageBox: BoxRect = { x: 14, y: contentTopY, w: 296, h: contentH };
  const screenOuterBox: BoxRect = { x: 320, y: contentTopY, w: 944, h: contentH };

  // Estimate vertical pointing target ratio before rendering 3D presenter so arm aims accurately
  const bulletCount = Math.max(
    1,
    Math.min(
      3,
      (scene.keyBullets && scene.keyBullets.length > 0
        ? scene.keyBullets
        : scene.onScreenLabels || []
      ).length || 3
    )
  );
  const activeBulletIdx = Math.min(
    bulletCount - 1,
    Math.floor(sceneProgress * bulletCount)
  );
  const estimatedTargetRatioY = Math.max(
    0.2,
    Math.min(0.8, 0.28 + activeBulletIdx * 0.2 + sceneProgress * 0.08)
  );

  const threeSnapshot = renderThreeStudioSnapshot({
    doctor: profile,
    topic: lectureTitle,
    systemTemplate: scene.systemTemplate,
    visualMode: scene.visualMode,
    discipline: activeDiscipline,
    timeSec,
    sceneProgress,
    mouthOpen01: mouthOpenness,
    isSpeaking,
    pointerTargetRatioY: estimatedTargetRatioY,
  });

  // 2. Large Electronic Teaching Smartboard on the RIGHT
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  roundRectPath(
    ctx,
    screenOuterBox.x,
    screenOuterBox.y,
    screenOuterBox.w,
    screenOuterBox.h,
    14
  );
  ctx.fillStyle = '#334155';
  ctx.fill();
  ctx.restore();

  const screenInner: BoxRect = {
    x: screenOuterBox.x + 6,
    y: screenOuterBox.y + 6,
    w: screenOuterBox.w - 12,
    h: screenOuterBox.h - 12,
  };
  roundRectPath(
    ctx,
    screenInner.x,
    screenInner.y,
    screenInner.w,
    screenInner.h,
    10
  );
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Smooth smartboard-only cross-dissolve during section transitions (0.42s)
  const transitionWindowSec = 0.42;
  const isCrossDissolving =
    Boolean(lookup.previous) && lookup.localTimeSec < transitionWindowSec;

  ctx.save();
  roundRectPath(
    ctx,
    screenInner.x,
    screenInner.y,
    screenInner.w,
    screenInner.h,
    10
  );
  ctx.clip();

  if (isCrossDissolving && lookup.previous) {
    const t = Math.max(0, Math.min(1, lookup.localTimeSec / transitionWindowSec));
    const ease = t * t * (3 - 2 * t);

    ctx.save();
    ctx.globalAlpha = 1 - ease;
    renderSmartboardSlideSurface(
      ctx,
      screenInner,
      lookup.previous.scene,
      1,
      scenes,
      lectureTitle,
      preferredDiscipline,
      externalReferences,
      null,
      false
    );
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = ease;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(screenInner.x, screenInner.y, screenInner.w, screenInner.h);
    const currentSlide = renderSmartboardSlideSurface(
      ctx,
      screenInner,
      scene,
      sceneProgress,
      scenes,
      lectureTitle,
      preferredDiscipline,
      externalReferences,
      threeSnapshot.organCanvas,
      threeSnapshot.isWebGlActive
    );
    ctx.restore();

    // Subtle active focus ring on smartboard diagram
    ctx.save();
    ctx.globalAlpha = ease * 0.85;
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(currentSlide.focusTarget.x, currentSlide.focusTarget.y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else {
    const currentSlide = renderSmartboardSlideSurface(
      ctx,
      screenInner,
      scene,
      sceneProgress,
      scenes,
      lectureTitle,
      preferredDiscipline,
      externalReferences,
      threeSnapshot.organCanvas,
      threeSnapshot.isWebGlActive
    );

    ctx.save();
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.78)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(currentSlide.focusTarget.x, currentSlide.focusTarget.y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // 3. Consistent White-Coat Doctor Standing on the LEFT
  drawStandingProfessorStudio(
    ctx,
    stageBox,
    profile,
    timeSec,
    mouthOpenness,
    isSpeaking,
    estimatedTargetRatioY,
    scene.title,
    threeSnapshot.presenterCanvas,
    threeSnapshot.isWebGlActive
  );

  // 4. Clean Synchronized Subtitles Below Smartboard (Zero Slide Overlap)
  if (showSubtitles) {
    const cues = splitNarrationIntoCues(scenes, language);
    const activeCue = getActiveSubtitleCue(cues, timeSec);
    if (activeCue && activeCue.text) {
      const subW = 1080;
      const subH = 52;
      const subX = (baseW - subW) / 2;
      const subY = baseH - 64;

      roundRectPath(ctx, subX, subY, subW, subH, 10);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 15.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.direction = language === 'ar-eg' ? 'rtl' : 'ltr';
      const subLines = wrapCanvasText(ctx, activeCue.text, subW - 48, 2);
      if (subLines.length === 1) {
        ctx.fillText(subLines[0], baseW / 2, subY + 32);
      } else {
        ctx.fillText(subLines[0], baseW / 2, subY + 22);
        ctx.fillText(subLines[1], baseW / 2, subY + 42);
      }
      ctx.direction = 'ltr';
    }
  }

  // 5. Subtle Continuous Lecture Timeline Strip (4px)
  const globalRatio = Math.max(0, Math.min(1, timeSec / Math.max(1, totalDur)));
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, baseH - 4, baseW, 4);
  ctx.fillStyle = '#0F4C81';
  ctx.fillRect(0, baseH - 4, baseW * globalRatio, 4);

  ctx.restore();
}
