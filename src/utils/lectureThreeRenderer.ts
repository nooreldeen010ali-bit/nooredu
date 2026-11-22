import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  AnatomicalSystemTemplate,
  DoctorCharacterProfile,
  MedicalSubjectDiscipline,
  SceneVisualMode,
} from '../types/medical';
import { canonicalizeMedicalTopic, type FineOrganDomain } from './topicCanonicalizer';

export interface ThreeStudioRenderParams {
  doctor: DoctorCharacterProfile;
  topic: string;
  systemTemplate: AnatomicalSystemTemplate;
  visualMode: SceneVisualMode;
  discipline: MedicalSubjectDiscipline;
  timeSec: number;
  sceneProgress: number;
  mouthOpen01: number;
  isSpeaking: boolean;
  pointerTargetRatioY?: number;
}

export interface ThreeStudioSnapshot {
  presenterCanvas: HTMLCanvasElement | null;
  organCanvas: HTMLCanvasElement | null;
  isWebGlActive: boolean;
  isSoftwareRenderer: boolean;
}

interface PresenterRig {
  root: THREE.Group;
  headGroup: THREE.Group;
  jawMesh: THREE.Mesh;
  leftEyelid: THREE.Mesh;
  rightEyelid: THREE.Mesh;
  rightShoulderPivot: THREE.Group;
  rightElbowPivot: THREE.Group;
  coatMat: THREE.MeshStandardMaterial;
  scrubMat: THREE.MeshStandardMaterial;
  tieMesh: THREE.Mesh;
  skinMat: THREE.MeshStandardMaterial;
  hairMaleGroup: THREE.Group;
  hairFemaleGroup: THREE.Group;
}

interface SharedThreeStudioContext {
  failed: boolean;
  softwareGl: boolean;
  presenterCanvas: HTMLCanvasElement;
  presenterRenderer: THREE.WebGLRenderer;
  presenterScene: THREE.Scene;
  presenterCamera: THREE.PerspectiveCamera;
  presenterRig: PresenterRig;
  organCanvas: HTMLCanvasElement;
  organRenderer: THREE.WebGLRenderer;
  organScene: THREE.Scene;
  organCamera: THREE.PerspectiveCamera;
  organRoot: THREE.Group;
  activeOrganKey: string;
}

let sharedCtx: SharedThreeStudioContext | null = null;

function isSoftwareGl(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    return /SwiftShader|Software|llvmpipe|Microsoft Basic Render/i.test(name);
  } catch {
    return false;
  }
}

function buildPresenterRig(): PresenterRig {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe8b89a,
    roughness: 0.58,
    metalness: 0.02,
  });

  const coatMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.42,
    metalness: 0.04,
  });

  const lapelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.36,
    metalness: 0.05,
  });

  const scrubMat = new THREE.MeshStandardMaterial({
    color: 0x0f4c81,
    roughness: 0.5,
    metalness: 0.05,
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.25,
    metalness: 0.78,
  });

  const silverMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.2,
    metalness: 0.88,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.68,
    metalness: 0.05,
  });

  // Torso (inner medical shirt/scrubs + tailored white medical coat)
  const innerTorso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.33, 0.3, 1.08, 24),
    scrubMat
  );
  innerTorso.position.set(0, 0.74, 0);
  innerTorso.scale.set(1.16, 1, 0.72);
  root.add(innerTorso);

  // Tie (shown for Male Doctor)
  const tieMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.46, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
  );
  tieMesh.position.set(0, 0.88, 0.24);
  root.add(tieMesh);

  // Left & Right White Coat Panels + Back Coat Shell
  const coatShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.365, 0.39, 1.16, 26, 1, false, Math.PI * 0.18, Math.PI * 1.64),
    coatMat
  );
  coatShell.position.set(0, 0.71, -0.01);
  coatShell.scale.set(1.18, 1, 0.76);
  root.add(coatShell);

  const leftLapel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.045), lapelMat);
  leftLapel.position.set(-0.14, 0.94, 0.245);
  leftLapel.rotation.z = -0.18;
  root.add(leftLapel);

  const rightLapel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.045), lapelMat);
  rightLapel.position.set(0.14, 0.94, 0.245);
  rightLapel.rotation.z = 0.18;
  root.add(rightLapel);

  // Pocket ID Badge on White Coat
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.075, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 })
  );
  badge.position.set(0.22, 0.92, 0.265);
  root.add(badge);

  // 3D Stethoscope Draped Around Neck
  const stethLoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.018, 12, 32, Math.PI * 1.25),
    darkMetalMat
  );
  stethLoop.position.set(0, 1.21, 0.08);
  stethLoop.rotation.set(Math.PI * 0.44, 0, Math.PI * 0.88);
  root.add(stethLoop);

  const chestPiece = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.022, 20),
    silverMat
  );
  chestPiece.rotation.x = Math.PI / 2;
  chestPiece.position.set(-0.19, 0.88, 0.27);
  root.add(chestPiece);

  // Shoulders
  const leftShoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 16), coatMat);
  leftShoulderCap.position.set(-0.46, 1.16, 0);
  root.add(leftShoulderCap);

  // Left Arm (relaxed natural posture beside lectern)
  const leftUpperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.09, 0.52, 16),
    coatMat
  );
  leftUpperArm.position.set(-0.5, 0.9, 0.03);
  leftUpperArm.rotation.z = 0.12;
  root.add(leftUpperArm);

  const leftForearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.075, 0.44, 16),
    coatMat
  );
  leftForearm.position.set(-0.52, 0.49, 0.12);
  leftForearm.rotation.x = -0.35;
  root.add(leftForearm);

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 14), skinMat);
  leftHand.position.set(-0.51, 0.27, 0.22);
  root.add(leftHand);

  // Articulated Right Arm (gestures smoothly toward the electronic smartboard)
  const rightShoulderPivot = new THREE.Group();
  rightShoulderPivot.position.set(0.46, 1.16, 0.02);
  root.add(rightShoulderPivot);

  const rightShoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 16), coatMat);
  rightShoulderPivot.add(rightShoulderCap);

  const rightUpperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.09, 0.48, 16),
    coatMat
  );
  rightUpperArm.position.set(0.18, -0.16, 0.06);
  rightUpperArm.rotation.z = 0.88;
  rightShoulderPivot.add(rightUpperArm);

  const rightElbowPivot = new THREE.Group();
  rightElbowPivot.position.set(0.36, -0.31, 0.1);
  rightShoulderPivot.add(rightElbowPivot);

  const rightForearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.086, 0.072, 0.44, 16),
    coatMat
  );
  rightForearm.position.set(0.18, 0.1, 0.06);
  rightForearm.rotation.z = 1.12;
  rightElbowPivot.add(rightForearm);

  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 14), skinMat);
  rightHand.position.set(0.38, 0.2, 0.09);
  rightElbowPivot.add(rightHand);

  const stylus = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.007, 0.28, 10),
    silverMat
  );
  stylus.position.set(0.51, 0.28, 0.1);
  stylus.rotation.z = 1.05;
  rightElbowPivot.add(stylus);

  // Neck & Articulated Head Group
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.22, 18), skinMat);
  neck.position.set(0, 1.34, 0.01);
  root.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.62, 0.03);
  root.add(headGroup);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.245, 28, 24), skinMat);
  cranium.scale.set(0.92, 1.08, 0.96);
  headGroup.add(cranium);

  // Nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 12), skinMat);
  nose.position.set(0, -0.01, 0.245);
  nose.rotation.x = Math.PI * 0.42;
  headGroup.add(nose);

  // Eyes + Blinking Eyelids
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.15 });

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), scleraMat);
  leftEye.position.set(-0.082, 0.045, 0.208);
  headGroup.add(leftEye);

  const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), irisMat);
  leftPupil.position.set(-0.082, 0.045, 0.232);
  headGroup.add(leftPupil);

  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), scleraMat);
  rightEye.position.set(0.082, 0.045, 0.208);
  headGroup.add(rightEye);

  const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), irisMat);
  rightPupil.position.set(0.082, 0.045, 0.232);
  headGroup.add(rightPupil);

  const leftEyelid = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), skinMat);
  leftEyelid.position.set(-0.082, 0.055, 0.21);
  leftEyelid.scale.set(1.1, 0.12, 1);
  headGroup.add(leftEyelid);

  const rightEyelid = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), skinMat);
  rightEyelid.position.set(0.082, 0.055, 0.21);
  rightEyelid.scale.set(1.1, 0.12, 1);
  headGroup.add(rightEyelid);

  // Eyebrows
  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.014, 0.02), hairMat);
  leftBrow.position.set(-0.084, 0.095, 0.22);
  leftBrow.rotation.z = 0.06;
  headGroup.add(leftBrow);

  const rightBrow = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.014, 0.02), hairMat);
  rightBrow.position.set(0.084, 0.095, 0.22);
  rightBrow.rotation.z = -0.06;
  headGroup.add(rightBrow);

  // Articulated Mouth / Lip-Sync Aperture
  const jawMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.046, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.45 })
  );
  jawMesh.position.set(0, -0.105, 0.215);
  jawMesh.scale.set(1.15, 0.22, 0.45);
  headGroup.add(jawMesh);

  // Male Hair Style Group
  const hairMaleGroup = new THREE.Group();
  const maleCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.252, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat
  );
  maleCap.scale.set(0.94, 1.05, 0.99);
  maleCap.position.set(0, 0.03, -0.01);
  maleCap.rotation.x = -0.18;
  hairMaleGroup.add(maleCap);
  headGroup.add(hairMaleGroup);

  // Female Hair Style Group
  const hairFemaleGroup = new THREE.Group();
  const femaleCrown = new THREE.Mesh(
    new THREE.SphereGeometry(0.258, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairMat
  );
  femaleCrown.scale.set(0.98, 1.08, 1.02);
  femaleCrown.position.set(0, 0.03, -0.015);
  femaleCrown.rotation.x = -0.15;
  hairFemaleGroup.add(femaleCrown);

  const femaleBun = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 16), hairMat);
  femaleBun.position.set(0, 0.08, -0.25);
  hairFemaleGroup.add(femaleBun);

  const leftSideWave = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.04, 0.34, 12),
    hairMat
  );
  leftSideWave.position.set(-0.205, -0.06, 0.03);
  leftSideWave.rotation.z = 0.1;
  hairFemaleGroup.add(leftSideWave);

  const rightSideWave = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.04, 0.34, 12),
    hairMat
  );
  rightSideWave.position.set(0.205, -0.06, 0.03);
  rightSideWave.rotation.z = -0.1;
  hairFemaleGroup.add(rightSideWave);
  headGroup.add(hairFemaleGroup);

  // Standing lower coat hem & tailored clinical trousers so doctor stands cleanly on the left
  const lowerCoatHem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.385, 0.41, 0.44, 24),
    coatMat
  );
  lowerCoatHem.position.set(0, 0.02, -0.01);
  lowerCoatHem.scale.set(1.15, 1, 0.74);
  root.add(lowerCoatHem);

  const trouserMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.65,
    metalness: 0.04,
  });
  const leftLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.135, 0.115, 0.56, 16),
    trouserMat
  );
  leftLeg.position.set(-0.17, -0.34, 0);
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.135, 0.115, 0.56, 16),
    trouserMat
  );
  rightLeg.position.set(0.17, -0.34, 0);
  root.add(rightLeg);

  return {
    root,
    headGroup,
    jawMesh,
    leftEyelid,
    rightEyelid,
    rightShoulderPivot,
    rightElbowPivot,
    coatMat,
    scrubMat,
    tieMesh,
    skinMat,
    hairMaleGroup,
    hairFemaleGroup,
  };
}

function populateOrganModel(
  group: THREE.Group,
  organDomain: FineOrganDomain,
  discipline: MedicalSubjectDiscipline,
  visualMode: SceneVisualMode
): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
  }

  // Pharmacology 3D Receptor + Lipid Bilayer + Drug Ligand Model
  if (discipline === 'pharmacology' || visualMode === 'treatment') {
    const membraneMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
      metalness: 0.15,
    });
    const receptorMat = new THREE.MeshStandardMaterial({
      color: 0x0f4c81,
      roughness: 0.28,
      metalness: 0.25,
    });
    const ligandMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x047857,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    });

    // Phospholipid heads bilayer grid
    for (let ix = -3; ix <= 3; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        if (Math.abs(ix) <= 1 && iz === 0) continue;
        const topHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), membraneMat);
        topHead.position.set(ix * 0.32, 0.26, iz * 0.32);
        group.add(topHead);

        const botHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), membraneMat);
        botHead.position.set(ix * 0.32, -0.26, iz * 0.32);
        group.add(botHead);
      }
    }

    // 7-Transmembrane Helical Receptor Bundle
    for (let h = 0; h < 6; h++) {
      const angle = (h / 6) * Math.PI * 2;
      const helix = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.96, 16),
        receptorMat
      );
      helix.position.set(Math.cos(angle) * 0.22, 0, Math.sin(angle) * 0.22);
      group.add(helix);
    }

    // Active Binding Drug Molecule (animated vertically in render loop)
    const ligand = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 1), ligandMat);
    ligand.name = 'animated_focus';
    ligand.position.set(0, 0.72, 0);
    group.add(ligand);
    return;
  }

  // Immunology 3D APC–MHC–TCR Synapse + IgG Antibody Model
  if (
    discipline === 'immunology' ||
    organDomain === 'rheumatology_immunology' ||
    organDomain === 'hematology_oncology'
  ) {
    const apcMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.42 });
    const tcellMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.38 });
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.3,
      roughness: 0.25,
    });

    const apcCell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 2), apcMat);
    apcCell.position.set(-0.68, 0, 0);
    group.add(apcCell);

    const tCell = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 20), tcellMat);
    tCell.position.set(0.68, 0, 0);
    group.add(tCell);

    const mhcBridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.48, 16),
      bridgeMat
    );
    mhcBridge.rotation.z = Math.PI / 2;
    mhcBridge.name = 'animated_focus';
    group.add(mhcBridge);
    return;
  }

  // Gastroduodenal / Esophageal / Intestinal 3D Stomach + Duodenum Cutaway Model
  if (
    organDomain === 'gastroduodenal' ||
    organDomain === 'esophageal' ||
    organDomain === 'intestinal_colorectal'
  ) {
    const serosaMat = new THREE.MeshStandardMaterial({
      color: 0xd9777f,
      roughness: 0.45,
      metalness: 0.05,
    });
    const duodenumMat = new THREE.MeshStandardMaterial({
      color: 0xe08e79,
      roughness: 0.48,
    });
    const lesionMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x991b1b,
      emissiveIntensity: 0.45,
      roughness: 0.28,
    });

    // Esophagus + LES
    const esophagus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.14, 0.72, 18),
      serosaMat
    );
    esophagus.position.set(-0.22, 0.78, 0);
    esophagus.rotation.z = -0.12;
    group.add(esophagus);

    // J-Shaped Gastric Body & Antrum
    const stomachCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.26, 0.46, 0),
      new THREE.Vector3(-0.56, 0.22, 0.05),
      new THREE.Vector3(-0.44, -0.32, 0.04),
      new THREE.Vector3(0.08, -0.44, 0),
      new THREE.Vector3(0.42, -0.22, 0),
    ]);
    const stomachTube = new THREE.Mesh(
      new THREE.TubeGeometry(stomachCurve, 36, 0.29, 20, false),
      serosaMat
    );
    group.add(stomachTube);

    // Duodenal Bulb & C-Loop
    const duodenumCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.42, -0.22, 0),
      new THREE.Vector3(0.72, -0.06, 0),
      new THREE.Vector3(0.78, -0.48, -0.04),
      new THREE.Vector3(0.45, -0.78, -0.04),
    ]);
    const duodenumTube = new THREE.Mesh(
      new THREE.TubeGeometry(duodenumCurve, 28, 0.16, 18, false),
      duodenumMat
    );
    group.add(duodenumTube);

    // Highlighted Focal Mucosal / LES Target Site
    const focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 14, 28), lesionMat);
    focusRing.name = 'animated_focus';
    if (organDomain === 'esophageal') {
      focusRing.position.set(-0.24, 0.46, 0.04);
      focusRing.rotation.x = Math.PI / 2;
    } else {
      focusRing.position.set(0.56, -0.14, 0.12);
    }
    group.add(focusRing);
    return;
  }

  // Renal 3D Kidney + Renal Vessels + Ureter
  if (organDomain === 'renal_electrolytes') {
    const cortexMat = new THREE.MeshStandardMaterial({ color: 0xb45346, roughness: 0.44 });
    const arteryMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });
    const veinMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35 });
    const ureterMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.42 });

    const kidneyUpper = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 20), cortexMat);
    kidneyUpper.position.set(0.12, 0.28, 0);
    kidneyUpper.scale.set(0.88, 1.05, 0.68);
    group.add(kidneyUpper);

    const kidneyLower = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 20), cortexMat);
    kidneyLower.position.set(0.12, -0.28, 0);
    kidneyLower.scale.set(0.88, 1.05, 0.68);
    group.add(kidneyLower);

    const renalArtery = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.65, 14),
      arteryMat
    );
    renalArtery.rotation.z = Math.PI / 2;
    renalArtery.position.set(-0.38, 0.08, 0.05);
    renalArtery.name = 'animated_focus';
    group.add(renalArtery);

    const renalVein = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.65, 14),
      veinMat
    );
    renalVein.rotation.z = Math.PI / 2;
    renalVein.position.set(-0.38, -0.08, 0.09);
    group.add(renalVein);

    const ureter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.048, 0.78, 14),
      ureterMat
    );
    ureter.position.set(-0.18, -0.52, 0);
    ureter.rotation.z = 0.18;
    group.add(ureter);
    return;
  }

  // Respiratory 3D Tracheobronchial Tree & Alveolar Lobes
  if (organDomain === 'respiratory') {
    const airwayMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, roughness: 0.35 });
    const lungMat = new THREE.MeshStandardMaterial({
      color: 0xe17c88,
      roughness: 0.5,
      transparent: true,
      opacity: 0.88,
    });

    const trachea = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.72, 18),
      airwayMat
    );
    trachea.position.set(0, 0.56, 0);
    group.add(trachea);

    const leftLung = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 20), lungMat);
    leftLung.position.set(-0.5, -0.08, 0);
    leftLung.scale.set(0.76, 1.32, 0.72);
    leftLung.name = 'animated_focus';
    group.add(leftLung);

    const rightLung = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 20), lungMat);
    rightLung.position.set(0.5, -0.06, 0);
    rightLung.scale.set(0.82, 1.34, 0.74);
    group.add(rightLung);
    return;
  }

  // Neurology 3D Cerebral Hemispheres + Brainstem
  if (organDomain === 'neurology') {
    const cortexMat = new THREE.MeshStandardMaterial({ color: 0xe7b5ac, roughness: 0.52 });
    const vesselMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x991b1b,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });

    const leftHemisphere = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 20), cortexMat);
    leftHemisphere.position.set(-0.24, 0.14, 0);
    leftHemisphere.scale.set(0.78, 0.92, 1.18);
    group.add(leftHemisphere);

    const rightHemisphere = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 20), cortexMat);
    rightHemisphere.position.set(0.24, 0.14, 0);
    rightHemisphere.scale.set(0.78, 0.92, 1.18);
    group.add(rightHemisphere);

    const brainstem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.1, 0.56, 16),
      cortexMat
    );
    brainstem.position.set(0, -0.46, -0.05);
    brainstem.rotation.x = 0.2;
    group.add(brainstem);

    const circleWillis = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.035, 12, 24),
      vesselMat
    );
    circleWillis.rotation.x = Math.PI / 2;
    circleWillis.position.set(0, -0.18, 0.12);
    circleWillis.name = 'animated_focus';
    group.add(circleWillis);
    return;
  }

  // Hepatobiliary / Pancreatic / Endocrine 3D Organ Complex
  if (
    organDomain === 'hepatobiliary' ||
    organDomain === 'pancreatic' ||
    organDomain === 'endocrine_metabolic'
  ) {
    const liverMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.45 });
    const pancreasMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.42 });
    const biliaryMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x047857,
      emissiveIntensity: 0.25,
      roughness: 0.32,
    });

    const rightLobe = new THREE.Mesh(new THREE.SphereGeometry(0.54, 24, 20), liverMat);
    rightLobe.position.set(-0.28, 0.22, 0);
    rightLobe.scale.set(1.15, 0.78, 0.72);
    group.add(rightLobe);

    const leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.38, 22, 18), liverMat);
    leftLobe.position.set(0.34, 0.3, 0.04);
    leftLobe.scale.set(1.05, 0.65, 0.62);
    group.add(leftLobe);

    const gallbladder = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 14), biliaryMat);
    gallbladder.position.set(-0.12, -0.12, 0.26);
    gallbladder.scale.set(0.8, 1.3, 0.8);
    group.add(gallbladder);

    const pancreas = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.08, 0.92, 18),
      pancreasMat
    );
    pancreas.rotation.z = Math.PI * 0.46;
    pancreas.position.set(0.18, -0.34, 0.12);
    pancreas.name = 'animated_focus';
    group.add(pancreas);
    return;
  }

  // Default / Cardiopulmonary: 4-Chamber Beating 3D Heart + Great Vessels
  const myocardiumMat = new THREE.MeshStandardMaterial({
    color: 0xbe123c,
    roughness: 0.38,
    metalness: 0.08,
  });
  const aortaMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.32,
  });
  const pulmMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.34,
  });

  const ventricles = new THREE.Mesh(new THREE.SphereGeometry(0.56, 28, 24), myocardiumMat);
  ventricles.position.set(0.05, -0.14, 0);
  ventricles.scale.set(0.92, 1.18, 0.84);
  ventricles.rotation.z = -0.32;
  ventricles.name = 'animated_focus';
  group.add(ventricles);

  const rightAtrium = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 18), pulmMat);
  rightAtrium.position.set(-0.32, 0.34, 0.08);
  group.add(rightAtrium);

  const aorticArchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 0.28, 0),
    new THREE.Vector3(0.06, 0.72, 0),
    new THREE.Vector3(0.32, 0.76, -0.06),
    new THREE.Vector3(0.38, 0.32, -0.12),
  ]);
  const aorta = new THREE.Mesh(
    new THREE.TubeGeometry(aorticArchCurve, 24, 0.12, 16, false),
    aortaMat
  );
  group.add(aorta);

  const pulmonaryTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.105, 0.52, 16),
    pulmMat
  );
  pulmonaryTrunk.position.set(-0.14, 0.5, 0.16);
  pulmonaryTrunk.rotation.z = 0.28;
  group.add(pulmonaryTrunk);
}

function getOrCreateThreeContext(): SharedThreeStudioContext | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (sharedCtx) {
    return sharedCtx.failed ? null : sharedCtx;
  }

  try {
    // 1. Presenter 3D WebGL Canvas
    const presenterCanvas = document.createElement('canvas');
    presenterCanvas.width = 420;
    presenterCanvas.height = 540;

    const presenterRenderer = new THREE.WebGLRenderer({
      canvas: presenterCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    const softwareGl = isSoftwareGl(presenterRenderer);
    presenterRenderer.setPixelRatio(1);
    presenterRenderer.setSize(420, 540, false);
    presenterRenderer.outputColorSpace = THREE.SRGBColorSpace;
    presenterRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    presenterRenderer.toneMappingExposure = 1.08;

    const presenterScene = new THREE.Scene();
    if (!softwareGl) {
      const pmrem = new THREE.PMREMGenerator(presenterRenderer);
      presenterScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }

    // Fixed consistent studio camera framing the standing doctor on the left
    const presenterCamera = new THREE.PerspectiveCamera(34, 420 / 540, 0.1, 20);
    presenterCamera.position.set(0.08, 1.06, 2.86);
    presenterCamera.lookAt(0.08, 0.94, 0);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.15);
    keyLight.position.set(2.0, 2.8, 2.6);
    presenterScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.95);
    rimLight.position.set(-2.0, 1.9, -1.4);
    presenterScene.add(rimLight);

    const fillHemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.05);
    presenterScene.add(fillHemi);

    const presenterRig = buildPresenterRig();
    presenterScene.add(presenterRig.root);

    // 2. Organ / Mechanism 3D WebGL Canvas
    const organCanvas = document.createElement('canvas');
    organCanvas.width = 440;
    organCanvas.height = 340;

    const organRenderer = new THREE.WebGLRenderer({
      canvas: organCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    organRenderer.setPixelRatio(1);
    organRenderer.setSize(440, 340, false);
    organRenderer.outputColorSpace = THREE.SRGBColorSpace;
    organRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    organRenderer.toneMappingExposure = 1.08;

    const organScene = new THREE.Scene();
    if (!softwareGl) {
      const pmremOrg = new THREE.PMREMGenerator(organRenderer);
      organScene.environment = pmremOrg.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremOrg.dispose();
    }

    const organCamera = new THREE.PerspectiveCamera(36, 440 / 340, 0.1, 20);
    organCamera.position.set(0, 0.15, 2.95);
    organCamera.lookAt(0, 0, 0);

    const orgKey = new THREE.DirectionalLight(0xffffff, 2.2);
    orgKey.position.set(2.2, 2.5, 2.6);
    organScene.add(orgKey);

    const orgRim = new THREE.DirectionalLight(0x0ea5e9, 1.0);
    orgRim.position.set(-2.2, -1.2, -1.8);
    organScene.add(orgRim);

    organScene.add(new THREE.HemisphereLight(0xf0f9ff, 0x334155, 0.95));

    const organRoot = new THREE.Group();
    organScene.add(organRoot);

    sharedCtx = {
      failed: false,
      softwareGl,
      presenterCanvas,
      presenterRenderer,
      presenterScene,
      presenterCamera,
      presenterRig,
      organCanvas,
      organRenderer,
      organScene,
      organCamera,
      organRoot,
      activeOrganKey: '',
    };
    return sharedCtx;
  } catch {
    sharedCtx = {
      failed: true,
    } as SharedThreeStudioContext;
    return null;
  }
}

export function getLectureRenderingEngineDisclosure(): {
  presenterMode: 'stylized_3d_webgl' | '2d_canvas_fallback';
  summary: string;
  limitations: string[];
} {
  const ctx = getOrCreateThreeContext();
  const isWebGl = Boolean(ctx && !ctx.failed);
  return {
    presenterMode: isWebGl ? 'stylized_3d_webgl' : '2d_canvas_fallback',
    summary: isWebGl
      ? 'Stylized procedural Three.js WebGL 3D White-Coat Doctor presenter on the LEFT and electronic smartboard on the RIGHT with procedural 3D organ models & 2D vector medical slides.'
      : '2D vector White-Coat Doctor presenter on the LEFT and electronic medical smartboard slides on the RIGHT (procedural Three.js WebGL unavailable in current browser/headless environment).',
    limitations: [
      'Uses stylized procedural Three.js 3D geometric meshes and 2D vector/atlas diagrams — NOT photorealistic neural or diffusion human video generation.',
      'Lip-sync and pointing gestures are driven deterministically by real-time 24 kHz WAV RMS audio amplitude and active smartboard target position rather than full viseme facial motion capture.',
      'Physiological curves, comparison tables, flowcharts, and histology plates are rendered as crisp 2D vector/schematic slides for maximum clinical readability.',
    ],
  };
}

/**
 * Renders real-time stylized Three.js WebGL 3D snapshots for both the White-Coat Doctor Presenter
 * (standing on the LEFT) and the synchronized 3D Anatomical/Mechanism Model for live playback and MP4 export.
 */
export function renderThreeStudioSnapshot(
  params: ThreeStudioRenderParams
): ThreeStudioSnapshot {
  const ctx = getOrCreateThreeContext();
  if (!ctx) {
    return {
      presenterCanvas: null,
      organCanvas: null,
      isWebGlActive: false,
      isSoftwareRenderer: false,
    };
  }

  const {
    doctor,
    topic,
    visualMode,
    discipline,
    timeSec,
    sceneProgress,
    mouthOpen01,
    isSpeaking,
    pointerTargetRatioY = 0.45,
  } = params;

  // 1. Update Presenter Appearance & White-Coat Consistency
  const rig = ctx.presenterRig;
  const isFemale = doctor.gender === 'female';
  rig.hairFemaleGroup.visible = isFemale;
  rig.hairMaleGroup.visible = !isFemale;
  rig.tieMesh.visible = !isFemale;

  rig.skinMat.color.set(doctor.skinTone || '#E8B89A');
  rig.scrubMat.color.set(isFemale ? '#0F4C81' : '#1E3A8A');
  rig.coatMat.color.set('#FFFFFF');

  // Calm, stationary standing posture turned gently toward the right-side smartboard
  const breath = Math.sin(timeSec * 1.8) * 0.009;
  rig.root.position.y = -0.18 + breath;
  rig.root.rotation.y = 0.25 + Math.sin(timeSec * 0.55) * 0.025;

  const clampedTargetY = Math.max(0.15, Math.min(0.85, pointerTargetRatioY));
  const headNod = isSpeaking ? Math.sin(timeSec * 4.2) * 0.024 : Math.sin(timeSec * 1.1) * 0.008;
  rig.headGroup.rotation.x = headNod + (clampedTargetY - 0.48) * 0.08;
  rig.headGroup.rotation.y = 0.14 + Math.sin(timeSec * 0.75) * 0.035;

  // Natural blink every ~4.1 seconds
  const blinkPhase = timeSec % 4.1;
  const blinkAmount = blinkPhase > 3.94 ? Math.sin(((blinkPhase - 3.94) / 0.16) * Math.PI) : 0;
  const lidScaleY = 0.12 + blinkAmount * 0.95;
  rig.leftEyelid.scale.y = lidScaleY;
  rig.rightEyelid.scale.y = lidScaleY;

  // Audio-RMS synchronized mouth articulation
  const openAmt = Math.max(0.06, Math.min(1, mouthOpen01));
  rig.jawMesh.scale.set(1.06 + openAmt * 0.18, 0.15 + openAmt * 0.62, 0.45);
  rig.jawMesh.position.y = -0.105 - openAmt * 0.018;

  // Synchronized right-arm pointing toward the exact vertical concept position on the smartboard
  const elevationAngle = (0.5 - clampedTargetY) * 0.52;
  const subtleCadence = isSpeaking ? Math.sin(timeSec * 3.1) * 0.035 : Math.sin(timeSec * 1.1) * 0.012;
  rig.rightShoulderPivot.rotation.z = -0.14 + elevationAngle * 0.55 + subtleCadence;
  rig.rightShoulderPivot.rotation.y = -0.18 + Math.cos(timeSec * 0.65) * 0.03;
  rig.rightElbowPivot.rotation.z = 0.18 + elevationAngle * 0.45 + subtleCadence * 0.7;

  ctx.presenterRenderer.render(ctx.presenterScene, ctx.presenterCamera);

  // 2. Update & Animate Topic-Matched 3D Organ / Mechanism Model
  const canonical = canonicalizeMedicalTopic(topic);
  const organKey = `${canonical.organDomain}::${discipline}::${visualMode}`;
  if (ctx.activeOrganKey !== organKey) {
    populateOrganModel(ctx.organRoot, canonical.organDomain, discipline, visualMode);
    ctx.activeOrganKey = organKey;
  }

  ctx.organRoot.rotation.y = Math.sin(timeSec * 0.45) * 0.34 + sceneProgress * 0.28;
  ctx.organRoot.rotation.x = Math.cos(timeSec * 0.35) * 0.06;

  const focusNode = ctx.organRoot.getObjectByName('animated_focus');
  if (focusNode) {
    const pulse = 1 + Math.sin(timeSec * 3.2) * 0.055;
    if (discipline === 'pharmacology' || visualMode === 'treatment') {
      focusNode.position.y = 0.56 + Math.sin(timeSec * 2.2) * 0.14;
      focusNode.rotation.y = timeSec * 1.2;
    } else {
      focusNode.scale.setScalar(pulse);
    }
  }

  ctx.organRenderer.render(ctx.organScene, ctx.organCamera);

  return {
    presenterCanvas: ctx.presenterCanvas,
    organCanvas: ctx.organCanvas,
    isWebGlActive: true,
    isSoftwareRenderer: ctx.softwareGl,
  };
}
