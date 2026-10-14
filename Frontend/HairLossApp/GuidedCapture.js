import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, Image, TouchableOpacity, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DeviceMotion } from 'expo-sensors';
import * as ImagePicker from 'expo-image-picker';

const { width: SCREEN_W } = Dimensions.get('window');

// ── The 5 capture steps, in medically-recommended shooting order ───
// Back camera only — no selfie-style capture, so no mirror correction needed.
export const CAPTURE_STEPS = [
  {
    key: 'anterior',
    label: 'Front View',
    shortLabel: 'Front',
    guideImg: require('./assets/guide_anterior.png'),
    hint: 'Pull hair back off the forehead.',
    instruction: 'Face the camera directly. Keep both ears equally visible in frame and eyes level — that means no head tilt or turn.',
    guide: 'oval-center',
  },
  {
    key: 'lateral_right',
    label: 'Right Temple',
    shortLabel: 'Right',
    guideImg: require('./assets/guide_lateral.png'),
    hint: 'Full profile, camera at ear height.',
    instruction: "Turn so your RIGHT side faces the camera in full profile. Hold the camera level with your ear, not above or below.",
    guide: 'profile-right',
  },
  {
    key: 'lateral_left',
    label: 'Left Temple',
    shortLabel: 'Left',
    guideImg: require('./assets/guide_lateral.png'),
    hint: 'Full profile, camera at ear height.',
    instruction: "Turn so your LEFT side faces the camera in full profile. Hold the camera level with your ear, not above or below.",
    guide: 'profile-left',
  },
  {
    key: 'vertex',
    label: 'Top / Crown',
    shortLabel: 'Crown',
    guideImg: require('./assets/guide_vertex.png'),
    hint: 'Camera flat, directly overhead.',
    instruction: 'Hold the camera flat and directly above your head, pointing straight down at the crown. Use the level dot below to keep it flat.',
    guide: 'circle-top',
    requiresLevel: true,
  },
  {
    key: 'posterior',
    label: 'Back View',
    shortLabel: 'Back',
    guideImg: require('./assets/guide_posterior.png'),
    hint: 'Shot from directly behind, head height.',
    instruction: 'Stand directly behind, camera at head height — not above or below. Keep the head level and facing forward.',
    guide: 'oval-center',
  },
];

// ── Live tilt/level indicator (used on the Crown step) ──────────────
function LevelIndicator() {
  const [tilt, setTilt] = useState({ beta: 0, gamma: 0 });

  useEffect(() => {
    let sub;
    DeviceMotion.setUpdateInterval(120);
    DeviceMotion.isAvailableAsync().then((available) => {
      if (!available) return;
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (rotation) setTilt({ beta: rotation.beta || 0, gamma: rotation.gamma || 0 });
      });
    });
    return () => sub && sub.remove();
  }, []);

  const degBeta = (tilt.beta * 180) / Math.PI;
  const degGamma = (tilt.gamma * 180) / Math.PI;
  const offX = Math.max(-24, Math.min(24, degGamma));
  const offY = Math.max(-24, Math.min(24, degBeta));
  const level = Math.abs(degBeta) < 8 && Math.abs(degGamma) < 8;

  return (
    <View style={styles.levelRing}>
      <View
        style={[
          styles.levelDot,
          { transform: [{ translateX: offX }, { translateY: offY }] },
          level && styles.levelDotGood,
        ]}
      />
      <Text style={[styles.levelText, level && styles.levelTextGood]}>
        {level ? 'Level ✓' : 'Keep phone flat'}
      </Text>
    </View>
  );
}

// ── Static alignment overlay drawn on top of the live preview ──────
function AlignmentGuide({ type }) {
  if (type === 'circle-top') {
    return (
      <View style={styles.guideLayer} pointerEvents="none">
        <View style={styles.guideCircle} />
        <View style={styles.guideCrossV} />
        <View style={styles.guideCrossH} />
      </View>
    );
  }
  if (type === 'profile-right' || type === 'profile-left') {
    const sideStyle = type === 'profile-right' ? { right: '18%' } : { left: '18%' };
    return (
      <View style={styles.guideLayer} pointerEvents="none">
        <View style={styles.guideOvalTall} />
        <View style={[styles.guideEarTick, sideStyle]} />
      </View>
    );
  }
  // oval-center: anterior + posterior
  return (
    <View style={styles.guideLayer} pointerEvents="none">
      <View style={styles.guideOval} />
      <View style={styles.guideEyeLine} />
    </View>
  );
}

/**
 * Full-screen guided capture wizard. Back camera only.
 *
 * Props:
 *  - images: { [stepKey]: uri }  already-captured photos (for resuming/retake)
 *  - startKey: step key to open on (defaults to first incomplete step)
 *  - onCapture(key, uri): called the moment a photo is confirmed
 *  - onClose(): called when the user exits the wizard (done or cancelled)
 */
export default function GuidedCapture({ images = {}, startKey, onCapture, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const startIndex = Math.max(0, CAPTURE_STEPS.findIndex((s) => s.key === startKey));
  const firstIncomplete = CAPTURE_STEPS.findIndex((s) => !images[s.key]);
  const [stepIndex, setStepIndex] = useState(
    startKey ? startIndex : (firstIncomplete === -1 ? 0 : firstIncomplete),
  );
  const [previewUri, setPreviewUri] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [slowStart, setSlowStart] = useState(false);
  const cameraRef = useRef(null);

  const step = CAPTURE_STEPS[stepIndex];

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  // If the live preview hasn't come up after a few seconds, offer the phone's camera app.
  useEffect(() => {
    if (cameraReady || !permission?.granted) return;
    const t = setTimeout(() => setSlowStart(true), 5000);
    return () => clearTimeout(t);
  }, [cameraReady, permission?.granted]);

  const takePhoto = async () => {
    if (!cameraRef.current || capturing || !cameraReady) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setPreviewUri(photo.uri);
    } catch (e) {
      console.error('Capture failed', e);
      Alert.alert('Capture failed', e?.message || 'Could not take the photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!res.canceled) setPreviewUri(res.assets[0].uri);
  };

  const useSystemCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      cameraType: ImagePicker.CameraType.back,
    });
    if (!res.canceled) setPreviewUri(res.assets[0].uri);
  };

  const confirmPhoto = () => {
    onCapture(step.key, previewUri);
    setPreviewUri(null);
    if (stepIndex < CAPTURE_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onClose();
    }
  };

  const retake = () => setPreviewUri(null);

  const goToStep = (idx) => {
    setPreviewUri(null);
    setStepIndex(idx);
  };

  if (!permission || !permission.granted) {
    return (
      <SafeAreaView style={styles.permScreen}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          We use the back camera to guide you through capturing the 5 scalp angles needed for analysis.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.permBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permCancelBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.permCancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{step.label}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Step progress dots */}
      <View style={styles.dotsRow}>
        {CAPTURE_STEPS.map((s, i) => (
          <TouchableOpacity key={s.key} onPress={() => goToStep(i)} activeOpacity={0.7}>
            <View
              style={[
                styles.dot,
                images[s.key] && styles.dotDone,
                i === stepIndex && styles.dotActive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Camera / preview area */}
      <View style={styles.cameraArea}>
        {/* Kept mounted for the whole wizard: on Android every CameraView unmount
            calls unbindAll() on the shared camera, which can unbind a freshly
            mounted preview and leave it black. */}
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onCameraReady={() => { setCameraReady(true); setCameraError(null); }}
          onMountError={(e) => setCameraError(e?.message || 'Camera failed to start.')}
        />
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <>
            <AlignmentGuide type={step.guide} />
            {step.requiresLevel && (
              <View style={styles.levelWrap}>
                <LevelIndicator />
              </View>
            )}
            {(cameraError || (slowStart && !cameraReady)) && (
              <View style={styles.cameraErrorOverlay}>
                <Text style={styles.cameraErrorText}>
                  {cameraError ? `⚠ ${cameraError}` : 'Camera preview is taking too long to start.'}
                </Text>
                <TouchableOpacity style={styles.cameraErrorBtn} onPress={useSystemCamera} activeOpacity={0.85}>
                  <Text style={styles.cameraErrorBtnText}>Use phone camera instead</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      {/* Instruction */}
      <View style={styles.instructionBar}>
        <Text style={styles.instructionText}>{step.instruction}</Text>
      </View>

      {/* Controls */}
      {previewUri ? (
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.retakeBtn} onPress={retake} activeOpacity={0.8}>
            <Text style={styles.retakeBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.useBtn} onPress={confirmPhoto} activeOpacity={0.85}>
            <Text style={styles.useBtnText}>Use Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.galleryLink} onPress={pickFromGallery} activeOpacity={0.7}>
            <Text style={styles.galleryLinkText}>Choose from gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shutterBtn, (capturing || !cameraReady) && styles.shutterBtnDisabled]}
            onPress={takePhoto}
            disabled={capturing || !cameraReady}
            activeOpacity={0.8}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryLink} onPress={useSystemCamera} activeOpacity={0.7}>
            <Text style={[styles.galleryLinkText, { textAlign: 'right' }]}>Phone camera</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0C10' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  topBarTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotDone: { backgroundColor: '#0D9B72' },
  dotActive: { width: 20, backgroundColor: '#5B6AD0' },

  cameraArea: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },

  guideLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  guideOval: {
    width: SCREEN_W * 0.56, height: SCREEN_W * 0.72, borderRadius: SCREEN_W,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.75)', borderStyle: 'dashed',
  },
  guideOvalTall: {
    width: SCREEN_W * 0.5, height: SCREEN_W * 0.82, borderRadius: SCREEN_W,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.75)', borderStyle: 'dashed',
  },
  guideEyeLine: {
    position: 'absolute', top: '36%', width: SCREEN_W * 0.56, height: 2,
    backgroundColor: 'rgba(91,106,208,0.85)',
  },
  guideEarTick: {
    position: 'absolute', top: '42%', width: 3, height: 36,
    backgroundColor: 'rgba(91,106,208,0.9)', borderRadius: 2,
  },
  guideCircle: {
    width: SCREEN_W * 0.62, height: SCREEN_W * 0.62, borderRadius: SCREEN_W,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.75)', borderStyle: 'dashed',
  },
  guideCrossV: {
    position: 'absolute', width: 2, height: SCREEN_W * 0.62,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  guideCrossH: {
    position: 'absolute', height: 2, width: SCREEN_W * 0.62,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  cameraErrorOverlay: {
    position: 'absolute', top: '40%', left: 20, right: 20,
    backgroundColor: 'rgba(216,75,75,0.92)', borderRadius: 12, padding: 14,
  },
  cameraErrorText: { color: '#FFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cameraErrorBtn: {
    marginTop: 10, alignSelf: 'center', backgroundColor: '#FFF',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
  },
  cameraErrorBtnText: { color: '#D84B4B', fontWeight: '800', fontSize: 13 },

  levelWrap: { position: 'absolute', bottom: 16, alignSelf: 'center' },
  levelRing: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  levelDot: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#D84B4B',
  },
  levelDotGood: { backgroundColor: '#0D9B72' },
  levelText: { position: 'absolute', bottom: -22, color: '#FFF', fontSize: 11, fontWeight: '700', width: 100, textAlign: 'center' },
  levelTextGood: { color: '#0D9B72' },

  instructionBar: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#14151B' },
  instructionText: { color: '#E7E9F5', fontSize: 14, lineHeight: 20, textAlign: 'center' },

  controlsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18, backgroundColor: '#0B0C10',
  },
  shutterBtn: {
    width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 3, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center',
  },
  shutterBtnDisabled: { opacity: 0.5 },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' },
  galleryLink: { width: 90 },
  galleryLinkText: { color: '#9AA0C0', fontSize: 12, fontWeight: '600' },

  retakeBtn: {
    flex: 1, marginRight: 10, paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center',
  },
  retakeBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  useBtn: {
    flex: 1, marginLeft: 10, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#5B6AD0', alignItems: 'center',
  },
  useBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },

  permScreen: { flex: 1, backgroundColor: '#0B0C10', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  permTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  permBody: { color: '#B9BEDC', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  permBtn: { backgroundColor: '#5B6AD0', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  permCancelBtn: { marginTop: 14 },
  permCancelText: { color: '#9AA0C0', fontSize: 14, fontWeight: '600' },
});
