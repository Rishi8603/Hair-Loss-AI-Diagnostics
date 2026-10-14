import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StyleSheet, Text, View, Image, ActivityIndicator, Alert,
  StatusBar, TouchableOpacity, ScrollView, Dimensions, Platform,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Head3DViewer from './Head3DViewer';
import LifestyleForm from './LifestyleForm';
import FullAnalysisResult from './FullAnalysisResult';
import GuidedCapture, { CAPTURE_STEPS } from './GuidedCapture';
import ProgressTracker from './ProgressTracker';
import { API_URL_BASE, fetchWithTimeout, predictStage, measureZones } from './api';
import {
  loadLog, localDayKey, dayNumber, daysBetween, formatDayKey, currentStreak, ZONE_LABELS,
} from './progressStore';
import { Tap, FadeIn, GrowBar } from './ui';

const { width: SCREEN_W } = Dimensions.get('window');

const APP_STATE_KEYS = [
  '@lifestyleData', '@stageImage', '@stageResult', '@images3d', '@zones3d', '@result3d', '@fullAnalysis',
];

// ── The 5 capture slots for 3D analysis (front, right temple, left temple,
// crown, back) — see GuidedCapture.js for the live guided-camera flow. ────
const CAPTURE_SLOTS = CAPTURE_STEPS;

export default function App() {
  // ── Screen routing ──────────────────────────────────────────
  const [screen, setScreen] = useState('home');

  // ── Loading ─────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);

  // ── Lifestyle Survey ────────────────────────────────────────
  const [lifestyleData, setLifestyleData] = useState(null);

  // ── Stage Prediction (CNN) ──────────────────────────────────
  const [stageImage, setStageImage] = useState(null);
  const [stageResult, setStageResult] = useState(null);

  // ── 3D Visualization (measured zones) ────────────────────────
  const [images3d, setImages3d] = useState({});
  const [zones3d, setZones3d] = useState(null);
  const [result3d, setResult3d] = useState(null);
  const [captureStepKey, setCaptureStepKey] = useState(null); // active GuidedCapture step, or null

  // ── Deep Analysis (Groq) ────────────────────────────────────
  const [fullAnalysis, setFullAnalysis] = useState(null);

  // ── 3D viewer target ({ zones, backTo }) and progress summary ──
  const [viewer, setViewer] = useState(null);
  const [progressLog, setProgressLog] = useState([]);

  useEffect(() => {
    if (screen !== 'home') return;
    loadLog().then(setProgressLog).catch((e) => console.error('Failed to load progress log', e));
  }, [screen]);

  // ── Persistence ─────────────────────────────────────────────
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadState = async () => {
      try {
        const d_lifestyle = await AsyncStorage.getItem('@lifestyleData');
        if (d_lifestyle) setLifestyleData(JSON.parse(d_lifestyle));

        const d_stageImg = await AsyncStorage.getItem('@stageImage');
        if (d_stageImg) setStageImage(d_stageImg);

        const d_stageRes = await AsyncStorage.getItem('@stageResult');
        if (d_stageRes) setStageResult(JSON.parse(d_stageRes));

        const d_img3d = await AsyncStorage.getItem('@images3d');
        if (d_img3d) setImages3d(JSON.parse(d_img3d));

        const d_zones3d = await AsyncStorage.getItem('@zones3d');
        if (d_zones3d) setZones3d(JSON.parse(d_zones3d));

        const d_res3d = await AsyncStorage.getItem('@result3d');
        if (d_res3d) setResult3d(JSON.parse(d_res3d));

        const d_full = await AsyncStorage.getItem('@fullAnalysis');
        if (d_full) setFullAnalysis(JSON.parse(d_full));
      } catch (e) {
        console.error('Failed to load state', e);
      } finally {
        setIsReady(true);
      }
    };
    loadState();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const saveState = async () => {
      try {
        await AsyncStorage.setItem('@lifestyleData', JSON.stringify(lifestyleData || null));
        await AsyncStorage.setItem('@stageImage', stageImage || '');
        await AsyncStorage.setItem('@stageResult', JSON.stringify(stageResult || null));
        await AsyncStorage.setItem('@images3d', JSON.stringify(images3d || {}));
        await AsyncStorage.setItem('@zones3d', JSON.stringify(zones3d || null));
        await AsyncStorage.setItem('@result3d', JSON.stringify(result3d || null));
        await AsyncStorage.setItem('@fullAnalysis', JSON.stringify(fullAnalysis || null));
      } catch (e) {
        console.error('Failed to save state', e);
      }
    };
    saveState();
  }, [lifestyleData, stageImage, stageResult, images3d, zones3d, result3d, fullAnalysis, isReady]);

  // ── Derived ─────────────────────────────────────────────────
  const filledCount3d = Object.keys(images3d).length;
  const deepAnalysisUnlocked = !!stageResult && !!lifestyleData;

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  // ── Pick single image for CNN stage prediction ──────────────
  const pickStageImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!res.canceled) {
      setStageImage(res.assets[0].uri);
      setStageResult(null);
    }
  };

  // ── Upload single image to /predict/ (CNN) ──────────────────
  const runStagePrediction = async () => {
    if (!stageImage) return;
    setLoading(true);
    try {
      setStageResult(await predictStage(stageImage));
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to predict.');
    } finally {
      setLoading(false);
    }
  };

  // ── Open the guided camera wizard for a specific slot ───────
  const openGuidedCapture = (slotKey) => setCaptureStepKey(slotKey);

  // ── Called by GuidedCapture the moment a photo is confirmed ─
  const handleGuidedCapture = (slotKey, uri) => {
    setImages3d((prev) => ({ ...prev, [slotKey]: uri }));
    setResult3d(null);
    setZones3d(null);
  };

  // ── Upload up to 5 images to /measure-zones/ (segmentation-measured) ─
  const run3DVisualization = async () => {
    if (filledCount3d === 0) {
      Alert.alert('No images', 'Please add at least one scalp angle.');
      return;
    }
    setLoading(true);
    try {
      // CNN stage fills zones no photo covers, instead of a flat 0.5
      const json = await measureZones(images3d, stageResult?.predicted_stage);
      setResult3d(json);
      setZones3d(json.zones || null);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  // ── Deep Analysis → Groq ───────────────────────────────────
  const requestDeepAnalysis = async () => {
    if (!stageResult || !lifestyleData) return;
    setLoading(true);
    try {
      const response = await fetchWithTimeout(`${API_URL_BASE}/analyse/full/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_index: stageResult.stage_index,
          predicted_stage: stageResult.predicted_stage,
          confidence: stageResult.confidence,
          // photo-measured zones (when available) override the stage-table estimate
          zones: { ...(stageResult.zones || {}), ...(zones3d || {}) },
          metadata: lifestyleData,
        }),
      }, 60000);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server did not return a valid response (HTTP ${response.status}). Please retry in a few seconds.`);
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Analysis failed');
      setFullAnalysis(data.analysis);
      setScreen('fullResult');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Deep analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── Lifestyle submit handler ────────────────────────────────
  const handleLifestyleSubmit = (metadata) => {
    setLifestyleData(metadata);
    setScreen('home');
  };

  // ── Clear App Data Handlers ─────────────────────────────────
  const handleClearAllData = async () => {
    setLifestyleData(null);
    setStageImage(null);
    setStageResult(null);
    setImages3d({});
    setZones3d(null);
    setResult3d(null);
    setFullAnalysis(null);
    // Progress history is deliberately kept; it has its own delete option.
    await AsyncStorage.multiRemove(APP_STATE_KEYS);
  };

  const confirmReset = () => {
    const message = 'This clears your survey, stage result, scan photos and report. Your daily progress history is kept.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) handleClearAllData();
      return;
    }
    Alert.alert('Start over?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: handleClearAllData },
    ]);
  };

  const openViewer = (zones, backTo) => {
    setViewer({ zones, backTo });
    setScreen('viewer');
  };

  // ═══════════════════════════════════════════════════════════════
  // SCREEN ROUTING
  // ═══════════════════════════════════════════════════════════════

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5B6AD0" />
      </View>
    );
  }

  // ── Guided camera wizard (takes over the full screen) ───────
  if (captureStepKey) {
    return (
      <SafeAreaProvider>
        <GuidedCapture
          images={images3d}
          startKey={captureStepKey}
          onCapture={handleGuidedCapture}
          onClose={() => setCaptureStepKey(null)}
        />
      </SafeAreaProvider>
    );
  }

  // ── 3D Head Viewer ──────────────────────────────────────────
  if (screen === 'viewer' && viewer) {
    return <Head3DViewer zones={viewer.zones} onBack={() => setScreen(viewer.backTo)} />;
  }

  // ── Progress Tracker ────────────────────────────────────────
  if (screen === 'progress') {
    return (
      <ProgressTracker
        cnnStage={stageResult?.predicted_stage}
        onBack={() => setScreen('home')}
        onOpen3D={(zones) => openViewer(zones, 'progress')}
      />
    );
  }

  // ── Full Analysis Report ────────────────────────────────────
  if (screen === 'fullResult' && fullAnalysis) {
    return (
      <FullAnalysisResult
        analysis={fullAnalysis}
        predictedStage={stageResult?.predicted_stage || ''}
        confidence={stageResult?.confidence || ''}
        onBack={() => setScreen('home')}
        onOpen3D={zones3d ? () => openViewer(zones3d, 'fullResult') : null}
      />
    );
  }

  // ── Lifestyle Form ──────────────────────────────────────────
  if (screen === 'lifestyle') {
    return (
      <LifestyleForm
        onSubmit={handleLifestyleSubmit}
        onBack={() => setScreen('home')}
      />
    );
  }

  // ── Stage Prediction Screen ─────────────────────────────────
  if (screen === 'stage') {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top']}>
          <StatusBar barStyle="dark-content" backgroundColor="#FAFBFD" />
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Back */}
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('home')} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.headerContainer}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>STAGE PREDICTION</Text>
              </View>
              <Text style={styles.title}>CNN Classifier</Text>
              <Text style={styles.subtitle}>Powered by your trained ResNet model</Text>
            </View>

            {/* Single image upload */}
            <TouchableOpacity
              style={[styles.singleImageSlot, stageImage && styles.singleImageSlotFilled]}
              onPress={pickStageImage}
              activeOpacity={0.75}
            >
              {stageImage ? (
                <>
                  <Image source={{ uri: stageImage }} style={styles.singleImage} />
                  <View style={styles.singleImageOverlay}>
                    <Text style={styles.singleImageOverlayText}>Tap to change</Text>
                  </View>
                </>
              ) : (
                <View style={styles.singleImageEmpty}>
                  <Image source={require('./assets/guide_vertex.png')} style={{ width: 64, height: 64, borderRadius: 12, opacity: 0.85, marginBottom: 4 }} />
                  <Text style={styles.singleImageLabel}>Upload a scalp photo</Text>
                  <Text style={styles.singleImageHint}>Top/front view works best</Text>
                  <View style={styles.slotAddBtn}>
                    <Text style={styles.slotAddBtnText}>+ Select Photo</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {/* Predict Button */}
            <TouchableOpacity
              style={[styles.analyzeButton, (!stageImage || loading) && styles.buttonDisabled]}
              onPress={runStagePrediction}
              disabled={!stageImage || loading}
              activeOpacity={0.85}
            >
              <Text style={styles.analyzeButtonText}>
                {loading ? 'Predicting...' : 'Predict Hair Loss Stage'}
              </Text>
            </TouchableOpacity>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#5B6AD0" />
                <Text style={styles.loadingText}>Running CNN classifier...</Text>
                <Text style={styles.loadingSubtext}>This takes just a second</Text>
              </View>
            )}

            {/* Result Card */}
            {stageResult && !loading && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>DIAGNOSIS</Text>
                  <View style={styles.cnnTag}>
                    <Text style={styles.cnnTagText}>✦ ResNet CNN</Text>
                  </View>
                </View>
                <Text style={styles.resultStage}>{stageResult.predicted_stage}</Text>

                {/* Position on the 7-stage Norwood scale */}
                {Number.isInteger(stageResult.stage_index) && (
                  <View style={styles.norwood}>
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                      const active = i === stageResult.stage_index;
                      return (
                        <View key={i} style={styles.norwoodCell}>
                          <View
                            style={[
                              styles.norwoodBar,
                              { backgroundColor: NORWOOD_COLORS[i], opacity: active ? 1 : 0.28 },
                              active && styles.norwoodBarActive,
                            ]}
                          />
                          <Text style={[styles.norwoodNum, active && styles.norwoodNumActive]}>{i + 1}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Confidence bar */}
                <View style={styles.confidenceRow}>
                  <Text style={styles.confidenceLabel}>Confidence</Text>
                  <Text style={styles.confidenceValue}>{stageResult.confidence}</Text>
                </View>
                <View style={styles.confidenceBarBg}>
                  <View
                    style={[
                      styles.confidenceBarFill,
                      { width: `${parseFloat(stageResult.confidence) || 0}%` },
                    ]}
                  />
                </View>

                {/* Zone summary if available */}
                {stageResult.zones && (
                  <View style={styles.zoneGrid}>
                    {Object.entries(stageResult.zones).map(([zone, score]) => (
                      <View key={zone} style={styles.zoneChip}>
                        <View style={[styles.zoneChipDot, { backgroundColor: scoreToColor(score) }]} />
                        <Text style={styles.zoneChipLabel}>{zone.replace('_', ' ')}</Text>
                        <Text style={styles.zoneChipScore}>{(score * 100).toFixed(0)}%</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Success message */}
                <View style={styles.successBanner}>
                  <Text style={styles.successBannerText}>
                    ✓ Saved. Next: map each zone with the scalp scan on the home screen.
                  </Text>
                </View>
              </View>
            )}

            <View style={{ height: 50 }} />
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ── 3D Visualization Screen ─────────────────────────────────
  if (screen === '3d') {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top']}>
          <StatusBar barStyle="dark-content" backgroundColor="#FAFBFD" />
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Back */}
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('home')} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.headerContainer}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>3D VISUALIZATION</Text>
              </View>
              <Text style={styles.title}>Scalp Heatmap</Text>
              <Text style={styles.subtitle}>Hair density measured zone by zone from your photos</Text>
            </View>

            {/* Caution: no stage prediction yet */}
            {!stageResult && (
              <TouchableOpacity
                style={styles.cautionBanner}
                onPress={() => setScreen('stage')}
                activeOpacity={0.8}
              >
                <Text style={styles.cautionText}>
                  ⚠ Complete Stage Prediction first. Zones you don't photograph are then estimated from your stage instead of a neutral default.
                </Text>
                <Text style={styles.cautionLink}>Go to Stage Prediction →</Text>
              </TouchableOpacity>
            )}

            {/* Instruction */}
            <View style={styles.instructionCard}>
              <Text style={styles.instructionTitle}>Capture 5 Angles</Text>
              <Text style={styles.instructionBody}>
                Each tile opens a guided camera that walks you through correct alignment for that angle. All 5 gives the most accurate heatmap — but even 1 works.
              </Text>
            </View>

            {/* 5-slot grid */}
            <View style={styles.slotGrid}>
              {CAPTURE_SLOTS.map(({ key, label, guideImg, hint }) => {
                const uri = images3d[key];
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.slot, uri && styles.slotFilled]}
                    onPress={() => openGuidedCapture(key)}
                    activeOpacity={0.75}
                  >
                    {uri ? (
                      <>
                        <Image source={{ uri }} style={styles.slotImage} />
                        <View style={styles.slotOverlay}>
                          <Text style={styles.slotLabelFilled}>{label}</Text>
                          <Text style={styles.slotCheck}>✓</Text>
                        </View>
                      </>
                    ) : (
                      <View style={styles.slotEmpty}>
                        <Image source={guideImg} style={styles.slotGuideImage} />
                        <Text style={styles.slotLabel}>{label}</Text>
                        <Text style={styles.slotHint}>{hint}</Text>
                        <View style={styles.slotAddBtn}>
                          <Text style={styles.slotAddBtnText}>+ Add Photo</Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Progress */}
            <View style={styles.progressRow}>
              {CAPTURE_SLOTS.map(({ key }) => (
                <View key={key} style={[styles.progressDot, images3d[key] && styles.progressDotFilled]} />
              ))}
              <Text style={styles.progressText}>{filledCount3d}/5 angles captured</Text>
            </View>

            {/* Render button */}
            <TouchableOpacity
              style={[styles.analyzeButton, (filledCount3d === 0 || loading) && styles.buttonDisabled]}
              onPress={run3DVisualization}
              disabled={filledCount3d === 0 || loading}
              activeOpacity={0.85}
            >
              <Text style={styles.analyzeButtonText}>
                {filledCount3d === 5 ? 'Render 3D Heatmap' : `Analyse (${filledCount3d} angle${filledCount3d !== 1 ? 's' : ''})`}
              </Text>
            </TouchableOpacity>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#5B6AD0" />
                <Text style={styles.loadingText}>Measuring hair density in each zone...</Text>
                <Text style={styles.loadingSubtext}>Up to a minute if the server is waking up</Text>
              </View>
            )}

            {/* 3D Result */}
            {result3d && !loading && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>ZONE DENSITY</Text>
                  <View style={styles.geminiTag}>
                    <Text style={styles.geminiTagText}>
                      ✦ {(result3d.measured_zones || []).length}/6 zones measured
                    </Text>
                  </View>
                </View>

                {zones3d && (
                  <View style={{ gap: 10, marginTop: 6 }}>
                    {Object.entries(zones3d).map(([zone, score], i) => {
                      const measured = result3d.zone_source?.[zone] === 'measured';
                      return (
                        <View key={zone} style={styles.zoneRow}>
                          <Text style={styles.zoneRowLabel} numberOfLines={1}>{zoneLabel(zone)}</Text>
                          <View style={{ flex: 1 }}>
                            <GrowBar value={score} color={scoreToColor(score)} delay={i * 70} />
                          </View>
                          <Text style={styles.zoneRowValue}>{Math.round(score * 100)}%</Text>
                          <Text style={styles.zoneRowEst}>{measured ? '' : 'est.'}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                <Text style={styles.zoneLegendNote}>
                  % = hair density. "est." zones weren't visible in your photos and are estimated from your stage.
                </Text>

                {(() => {
                  const warnings = [...new Set(Object.values(result3d.view_info || {}).flatMap((v) => v.warnings || []))];
                  return warnings.length > 0 ? (
                    <View style={styles.warningBox}>
                      {warnings.map((w) => (
                        <Text key={w} style={styles.warningText}>⚠ {w}</Text>
                      ))}
                    </View>
                  ) : null;
                })()}
              </View>
            )}

            {/* View 3D button */}
            {zones3d && !loading && (
              <TouchableOpacity
                style={styles.view3DButton}
                onPress={() => openViewer(zones3d, '3d')}
                activeOpacity={0.85}
              >
                <Text style={styles.view3DButtonText}>View 3D Heatmap</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 50 }} />
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // HOME DASHBOARD
  // ═══════════════════════════════════════════════════════════════
  const today = localDayKey();
  const latestCheckIn = progressLog[progressLog.length - 1];
  const doneToday = !!latestCheckIn && latestCheckIn.dayKey === today;
  const dayToday = progressLog.length ? daysBetween(progressLog[0].dayKey, today) + 1 : 1;
  const streak = currentStreak(progressLog, today);
  const checkInDays = new Set(progressLog.map((e) => e.dayKey));
  const lastSevenDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { key: localDayKey(d), letter: d.toLocaleDateString(undefined, { weekday: 'narrow' }) };
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const journey = [
    { label: 'Survey', done: !!lifestyleData },
    { label: 'Stage', done: !!stageResult },
    { label: 'Scan', done: !!zones3d },
    { label: 'Report', done: !!fullAnalysis },
  ];

  const nextStep = !lifestyleData
    ? {
      eyebrow: 'STEP 1 OF 4', title: 'Tell us about your routine',
      body: '24 quick questions on sleep, diet, stress and family history.',
      cta: 'Start survey', onPress: () => setScreen('lifestyle'),
    }
    : !stageResult
      ? {
        eyebrow: 'STEP 2 OF 4', title: 'Find your hair loss stage',
        body: 'One scalp photo, classified on the 7-stage Norwood scale.',
        cta: 'Upload a photo', onPress: () => setScreen('stage'),
      }
      : !zones3d
        ? {
          eyebrow: 'STEP 3 OF 4', title: 'Map your scalp zone by zone',
          body: 'A guided camera takes up to 5 angles and measures hair density in each zone.',
          cta: 'Start scan', onPress: () => setScreen('3d'),
        }
        : !fullAnalysis
          ? {
            eyebrow: 'STEP 4 OF 4', title: 'Get your personal report',
            body: 'Your stage, zone densities and lifestyle combined into one AI report.',
            cta: loading ? 'Generating report…' : 'Generate report', onPress: requestDeepAnalysis,
          }
          : !doneToday
            ? {
              eyebrow: 'DAILY CHECK-IN',
              title: progressLog.length ? `Day ${dayToday} check-in is due` : 'Start daily monitoring',
              body: progressLog.length
                ? 'A quick scan keeps your progress chart up to date.'
                : 'Scan once a day and see how much scalp is showing over time.',
              cta: 'Check in now', onPress: () => setScreen('progress'),
            }
            : {
              eyebrow: 'ALL DONE TODAY', title: 'You’re all caught up',
              body: progressLog.length === 1
                ? 'Baseline saved. Come back tomorrow for your first comparison.'
                : 'Today’s check-in is saved. See how your scalp is changing.',
              cta: 'View progress', onPress: () => setScreen('progress'),
            };

  const measuredZoneKeys = zones3d
    ? Object.keys(zones3d).filter((z) => result3d?.zone_source?.[z] === 'measured')
    : [];
  const avgDensity = measuredZoneKeys.length
    ? measuredZoneKeys.reduce((s, z) => s + zones3d[z], 0) / measuredZoneKeys.length
    : null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFBFD" />
        <ScrollView contentContainerStyle={styles.homeScroll} showsVerticalScrollIndicator={false}>
          {/* Top bar */}
          <FadeIn style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>S</Text>
              </View>
              <View>
                <Text style={styles.brandName}>SoftKebot</Text>
                <Text style={styles.brandTag}>Scalp health, measured</Text>
              </View>
            </View>
            <Tap onPress={confirmReset} style={styles.resetBtn} hitSlop={8}>
              <Text style={styles.resetBtnText}>↻ Reset</Text>
            </Tap>
          </FadeIn>

          {/* Hero: next step + journey */}
          <FadeIn delay={60}>
            <View style={styles.hero}>
              <View style={styles.heroBlobLarge} />
              <View style={styles.heroBlobSmall} />
              <Text style={styles.heroGreeting}>{greeting}</Text>
              <Text style={styles.heroEyebrow}>{nextStep.eyebrow}</Text>
              <Text style={styles.heroTitle}>{nextStep.title}</Text>
              <Text style={styles.heroBody}>{nextStep.body}</Text>
              <Tap
                style={[styles.heroCta, loading && styles.heroCtaDisabled]}
                onPress={nextStep.onPress}
                disabled={loading}
              >
                {loading && <ActivityIndicator size="small" color="#16203A" style={{ marginRight: 8 }} />}
                <Text style={styles.heroCtaText}>{nextStep.cta}</Text>
                {!loading && <Text style={styles.heroCtaArrow}>→</Text>}
              </Tap>

              <View style={styles.journey}>
                {journey.map((step, i) => (
                  <React.Fragment key={step.label}>
                    {i > 0 && <View style={[styles.journeyLine, journey[i - 1].done && styles.journeyLineDone]} />}
                    <View style={styles.journeyStep}>
                      <View style={[styles.journeyDot, step.done && styles.journeyDotDone]}>
                        <Text style={[styles.journeyDotText, step.done && styles.journeyDotTextDone]}>
                          {step.done ? '✓' : i + 1}
                        </Text>
                      </View>
                      <Text style={[styles.journeyLabel, step.done && styles.journeyLabelDone]}>{step.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>
          </FadeIn>

          {/* Latest scan summary */}
          {zones3d && (
            <FadeIn delay={120}>
              <Tap style={styles.scanCard} onPress={() => openViewer(zones3d, 'home')} scaleTo={0.98}>
                <View style={styles.scanCardHead}>
                  <View>
                    <Text style={styles.sectionEyebrow}>LATEST SCAN</Text>
                    <Text style={styles.scanCardTitle}>Hair density by zone</Text>
                  </View>
                  {avgDensity != null && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.scanAvg, { color: scoreToColor(avgDensity) }]}>
                        {Math.round(avgDensity * 100)}%
                      </Text>
                      <Text style={styles.scanAvgLabel}>average</Text>
                    </View>
                  )}
                </View>
                {Object.entries(zones3d).map(([zone, score], i) => {
                  const measured = result3d?.zone_source?.[zone] === 'measured';
                  return (
                    <View key={zone} style={styles.zoneRow}>
                      <Text style={styles.zoneRowLabel} numberOfLines={1}>{zoneLabel(zone)}</Text>
                      <View style={{ flex: 1 }}>
                        <GrowBar value={score} color={scoreToColor(score)} delay={200 + i * 60} />
                      </View>
                      <Text style={styles.zoneRowValue}>{Math.round(score * 100)}%</Text>
                      <Text style={styles.zoneRowEst}>{measured ? '' : 'est.'}</Text>
                    </View>
                  );
                })}
                <Text style={styles.scanCardLink}>Open 3D head →</Text>
              </Tap>
            </FadeIn>
          )}

          {/* Daily monitoring */}
          <FadeIn delay={180}>
            <Tap style={styles.progressCard} onPress={() => setScreen('progress')} scaleTo={0.98}>
              <View style={styles.progressCardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionEyebrow}>DAILY MONITORING</Text>
                  <Text style={styles.progressCardTitle}>
                    {!latestCheckIn
                      ? 'Track your scalp every day'
                      : doneToday
                        ? `Day ${dayNumber(progressLog, latestCheckIn)} done`
                        : `Day ${dayToday} is waiting`}
                  </Text>
                  <Text style={styles.progressCardSub}>
                    {!latestCheckIn
                      ? 'Your first scan becomes the baseline.'
                      : doneToday && progressLog.length === 1
                        ? 'Baseline saved. Come back tomorrow.'
                        : doneToday
                          ? 'Tap to see what changed.'
                          : `Last check-in ${formatDayKey(latestCheckIn.dayKey)}`}
                  </Text>
                </View>
                {streak > 0 && (
                  <View style={styles.streakChip}>
                    <Text style={styles.streakNum}>{streak}</Text>
                    <Text style={styles.streakLabel}>day{streak === 1 ? '' : 's'}{'\n'}streak</Text>
                  </View>
                )}
              </View>
              <View style={styles.weekRow}>
                {lastSevenDays.map((d) => {
                  const done = checkInDays.has(d.key);
                  const isToday = d.key === today;
                  return (
                    <View key={d.key} style={styles.weekDay}>
                      <View style={[styles.weekDot, done && styles.weekDotDone, isToday && !done && styles.weekDotToday]}>
                        {done && <Text style={styles.weekDotCheck}>✓</Text>}
                      </View>
                      <Text style={[styles.weekLetter, isToday && styles.weekLetterToday]}>{d.letter}</Text>
                    </View>
                  );
                })}
              </View>
            </Tap>
          </FadeIn>

          {/* Tools */}
          <FadeIn delay={240}>
            <Text style={styles.sectionTitle}>Tools</Text>
            <View style={styles.featureGrid}>
              <Tap style={styles.featureCard} onPress={() => setScreen('stage')}>
                <View style={[styles.featureIcon, { backgroundColor: '#EEF0FF' }]}>
                  <Text style={[styles.featureIconText, { color: '#5B6AD0' }]}>N</Text>
                </View>
                <Text style={styles.featureCardTitle}>Stage check</Text>
                <Text style={styles.featureCardDesc} numberOfLines={2}>
                  {stageResult ? stageResult.predicted_stage : 'Norwood stage from one photo'}
                </Text>
                <Text style={[styles.featureStatus, stageResult && styles.featureStatusDone]}>
                  {stageResult ? '✓ Done' : 'Start →'}
                </Text>
              </Tap>
              <Tap style={styles.featureCard} onPress={() => setScreen('3d')}>
                <View style={[styles.featureIcon, { backgroundColor: '#E8FBF5' }]}>
                  <Text style={[styles.featureIconText, { color: '#0D9B72' }]}>3D</Text>
                </View>
                <Text style={styles.featureCardTitle}>Scalp scan</Text>
                <Text style={styles.featureCardDesc} numberOfLines={2}>
                  {zones3d ? `${measuredZoneKeys.length} of 6 zones measured` : 'Guided camera, 5 angles'}
                </Text>
                <Text style={[styles.featureStatus, zones3d && styles.featureStatusDone]}>
                  {zones3d ? '✓ Done' : 'Start →'}
                </Text>
              </Tap>
            </View>
            <View style={styles.featureGrid}>
              <Tap style={styles.featureCard} onPress={() => setScreen('lifestyle')}>
                <View style={[styles.featureIcon, { backgroundColor: '#FFF4E5' }]}>
                  <Text style={[styles.featureIconText, { color: '#C77700' }]}>≡</Text>
                </View>
                <Text style={styles.featureCardTitle}>Lifestyle</Text>
                <Text style={styles.featureCardDesc} numberOfLines={2}>
                  {lifestyleData ? 'Answers saved. Tap to edit' : '24 quick questions'}
                </Text>
                <Text style={[styles.featureStatus, lifestyleData && styles.featureStatusDone]}>
                  {lifestyleData ? '✓ Done' : 'Start →'}
                </Text>
              </Tap>
              <Tap
                style={[styles.featureCard, !deepAnalysisUnlocked && styles.featureCardLocked]}
                onPress={fullAnalysis ? () => setScreen('fullResult') : requestDeepAnalysis}
                disabled={(!deepAnalysisUnlocked && !fullAnalysis) || loading}
              >
                <View style={[styles.featureIcon, { backgroundColor: deepAnalysisUnlocked ? '#F3EDFF' : '#F0F1F6' }]}>
                  <Text style={[styles.featureIconText, { color: deepAnalysisUnlocked ? '#7A4FD6' : '#A0A5BA' }]}>
                    {deepAnalysisUnlocked ? 'AI' : '⊘'}
                  </Text>
                </View>
                <Text style={styles.featureCardTitle}>AI report</Text>
                <Text style={styles.featureCardDesc} numberOfLines={2}>
                  {fullAnalysis
                    ? 'Tap to read your report'
                    : deepAnalysisUnlocked
                      ? 'Stage + lifestyle, explained'
                      : 'Needs survey and stage'}
                </Text>
                <Text style={[styles.featureStatus, fullAnalysis && styles.featureStatusDone]}>
                  {loading ? 'Working…' : fullAnalysis ? 'Open →' : deepAnalysisUnlocked ? 'Generate →' : 'Locked'}
                </Text>
              </Tap>
            </View>
          </FadeIn>

          {fullAnalysis && deepAnalysisUnlocked && (
            <FadeIn delay={300}>
              <Tap style={styles.regenBtn} onPress={requestDeepAnalysis} disabled={loading}>
                <Text style={styles.regenBtnText}>{loading ? 'Generating report…' : '↻ Regenerate report with latest data'}</Text>
              </Tap>
            </FadeIn>
          )}

          <Text style={styles.disclaimer}>
            For information only. SoftKebot is not a medical diagnosis.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function zoneLabel(zone) {
  return ZONE_LABELS[zone] || zone.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Norwood stages 1–7, healthy → advanced
const NORWOOD_COLORS = ['#1565C0', '#1E88E5', '#26C6DA', '#D4E157', '#FFB300', '#FF7043', '#E53935'];

// ── Utility: score → hex color ──────────────────────────────────
function scoreToColor(score) {
  if (score >= 0.8) return '#1565C0';
  if (score >= 0.6) return '#26C6DA';
  if (score >= 0.4) return '#D4E157';
  if (score >= 0.2) return '#FF7043';
  return '#E53935';
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const SLOT_SIZE = (SCREEN_W - 56) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFD',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },

  // ── Back Button ──
  backBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#D0D5F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  backBtnText: {
    color: '#5B6AD0',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Header ──
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  headerBadge: {
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#D0D5F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  headerBadgeText: {
    color: '#5B6AD0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A1D2E',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8B91A8',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // ── Home ──
  homeScroll: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#16203A',
    justifyContent: 'center', alignItems: 'center',
  },
  brandMarkText: { color: '#9FE3C8', fontSize: 20, fontWeight: '900' },
  brandName: { color: '#16203A', fontSize: 22, fontWeight: '900', letterSpacing: 0.2 },
  brandTag: { color: '#8B91A8', fontSize: 12, fontWeight: '600' },
  resetBtn: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECEEF5',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
  },
  resetBtnText: { color: '#6B7291', fontSize: 12, fontWeight: '700' },

  hero: {
    backgroundColor: '#16203A', borderRadius: 26, padding: 22, overflow: 'hidden',
    shadowColor: '#16203A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  heroBlobLarge: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#5B6AD0', opacity: 0.35, top: -90, right: -70,
  },
  heroBlobSmall: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#9FE3C8', opacity: 0.16, top: 70, right: -30,
  },
  heroGreeting: { color: '#C9CFE8', fontSize: 14, fontWeight: '600' },
  heroEyebrow: { color: '#9FE3C8', fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginTop: 14 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', lineHeight: 32, marginTop: 6, maxWidth: '92%' },
  heroBody: { color: '#C9CFE8', fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: '92%' },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, marginTop: 18,
  },
  heroCtaDisabled: { opacity: 0.7 },
  heroCtaText: { color: '#16203A', fontSize: 15, fontWeight: '800' },
  heroCtaArrow: { color: '#5B6AD0', fontSize: 16, fontWeight: '900', marginLeft: 8 },
  journey: {
    flexDirection: 'row', alignItems: 'flex-start', marginTop: 22,
    paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  journeyStep: { alignItems: 'center', width: 52 },
  journeyLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 13 },
  journeyLineDone: { backgroundColor: '#9FE3C8' },
  journeyDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  journeyDotDone: { backgroundColor: '#9FE3C8', borderColor: '#9FE3C8' },
  journeyDotText: { color: '#C9CFE8', fontSize: 12, fontWeight: '800' },
  journeyDotTextDone: { color: '#16203A' },
  journeyLabel: { color: '#8C94B8', fontSize: 11, fontWeight: '700', marginTop: 6 },
  journeyLabelDone: { color: '#FFFFFF' },

  sectionEyebrow: { color: '#5B6AD0', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  sectionTitle: { color: '#16203A', fontSize: 17, fontWeight: '800', marginBottom: 10, marginTop: 4 },

  scanCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#ECEEF5', padding: 18, gap: 10,
    shadowColor: '#5B6AD0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  scanCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  scanCardTitle: { color: '#16203A', fontSize: 17, fontWeight: '800', marginTop: 3 },
  scanAvg: { fontSize: 30, fontWeight: '900', lineHeight: 34 },
  scanAvgLabel: { color: '#8B91A8', fontSize: 11, fontWeight: '600' },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoneRowLabel: { width: 100, color: '#4A5068', fontSize: 12, fontWeight: '600' },
  zoneRowValue: { width: 38, textAlign: 'right', color: '#16203A', fontSize: 12, fontWeight: '800' },
  zoneRowEst: { width: 22, color: '#A0A5BA', fontSize: 10, fontWeight: '700' },
  scanCardLink: { color: '#5B6AD0', fontSize: 13, fontWeight: '800', marginTop: 4 },

  progressCard: {
    backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#ECEEF5', padding: 18,
    shadowColor: '#5B6AD0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  progressCardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressCardTitle: { color: '#16203A', fontSize: 17, fontWeight: '800', marginTop: 3 },
  progressCardSub: { color: '#6B7291', fontSize: 13, marginTop: 3, lineHeight: 18 },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF4E5', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
  },
  streakNum: { color: '#E07800', fontSize: 24, fontWeight: '900' },
  streakLabel: { color: '#C77700', fontSize: 10, fontWeight: '800', lineHeight: 12 },
  weekRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 16,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F0F1F6',
  },
  weekDay: { alignItems: 'center', gap: 6 },
  weekDot: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#F3F4FA',
    justifyContent: 'center', alignItems: 'center',
  },
  weekDotDone: { backgroundColor: '#0D9B72' },
  weekDotToday: { borderWidth: 2, borderColor: '#5B6AD0', borderStyle: 'dashed' },
  weekDotCheck: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  weekLetter: { color: '#A0A5BA', fontSize: 11, fontWeight: '700' },
  weekLetterToday: { color: '#5B6AD0' },

  featureGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  featureCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#ECEEF5', padding: 16,
    shadowColor: '#5B6AD0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  featureCardLocked: { backgroundColor: '#F8F9FC' },
  featureIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  featureIconText: { fontSize: 15, fontWeight: '900' },
  featureCardTitle: { color: '#16203A', fontSize: 15, fontWeight: '800' },
  featureCardDesc: { color: '#8B91A8', fontSize: 12, lineHeight: 16, marginTop: 3, minHeight: 32 },
  featureStatus: { color: '#5B6AD0', fontSize: 12, fontWeight: '800', marginTop: 10 },
  featureStatusDone: { color: '#0D9B72' },

  regenBtn: {
    borderWidth: 1, borderColor: '#D0D5F6', backgroundColor: '#EEF0FF',
    borderRadius: 16, paddingVertical: 13, alignItems: 'center',
  },
  regenBtnText: { color: '#5B6AD0', fontSize: 13, fontWeight: '800' },
  disclaimer: { color: '#A0A5BA', fontSize: 11, textAlign: 'center', marginTop: 8 },

  // ── Single Image Slot (Stage Prediction) ──
  singleImageSlot: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    backgroundColor: '#F3F4FA',
    borderWidth: 1.5,
    borderColor: '#DDE0EF',
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 16,
  },
  singleImageSlotFilled: {
    borderColor: '#5B6AD0',
    borderStyle: 'solid',
    borderWidth: 2,
  },
  singleImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  singleImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
    padding: 10,
    alignItems: 'center',
  },
  singleImageOverlayText: {
    color: '#5B6AD0',
    fontSize: 12,
    fontWeight: '600',
  },
  singleImageEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  singleImageLabel: {
    color: '#3A3F56',
    fontSize: 15,
    fontWeight: '700',
  },
  singleImageHint: {
    color: '#9CA3BE',
    fontSize: 12,
    marginBottom: 8,
  },

  // ── Caution Banner ──
  cautionBanner: {
    width: '100%',
    backgroundColor: '#FFF8ED',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFE0A3',
    padding: 14,
    marginBottom: 14,
  },
  cautionText: {
    color: '#8B6914',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  cautionLink: {
    color: '#5B6AD0',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },

  // ── Instruction ──
  instructionCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEEF5',
    padding: 16,
    marginBottom: 20,
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  instructionTitle: {
    color: '#1A1D2E',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  instructionBody: {
    color: '#6B7291',
    fontSize: 13,
    lineHeight: 19,
  },

  // ── Slot Grid ──
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 14,
    width: '100%',
  },
  slot: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: 18,
    backgroundColor: '#F3F4FA',
    borderWidth: 1.5,
    borderColor: '#DDE0EF',
    overflow: 'hidden',
    borderStyle: 'dashed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  slotFilled: {
    borderColor: '#5B6AD0',
    borderStyle: 'solid',
    borderWidth: 2,
    shadowColor: '#5B6AD0',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  slotImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  slotOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(91, 106, 208, 0.15)',
  },
  slotEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  slotGuideImage: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
    opacity: 0.9,
    marginBottom: 6,
    borderRadius: 8,
  },
  slotLabel: { color: '#3A3F56', fontSize: 13, fontWeight: '700', letterSpacing: 0.3, marginBottom: 2 },
  slotLabelFilled: { color: '#2A2F45', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  slotCheck: { color: '#5B6AD0', fontSize: 16, fontWeight: '800' },
  slotHint: { color: '#9CA3BE', fontSize: 10, textAlign: 'center', marginBottom: 10, lineHeight: 14 },
  slotAddBtn: {
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#D0D5F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  slotAddBtnText: { color: '#5B6AD0', fontSize: 11, fontWeight: '700' },

  // ── Progress ──
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DDE0EF' },
  progressDotFilled: { backgroundColor: '#5B6AD0' },
  progressText: { color: '#8B91A8', fontSize: 12, fontWeight: '600', marginLeft: 4 },

  // ── Analyze/Predict Button ──
  analyzeButton: {
    backgroundColor: '#5B6AD0',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  analyzeButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  buttonDisabled: { backgroundColor: '#C5CAE9', shadowOpacity: 0, elevation: 0 },

  // ── Loading ──
  loadingContainer: { alignItems: 'center', marginVertical: 16, gap: 8 },
  loadingText: { color: '#3A3F56', fontSize: 14, fontWeight: '600', marginTop: 8 },
  loadingSubtext: { color: '#8B91A8', fontSize: 12, fontStyle: 'italic' },

  // ── Result Card ──
  resultCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECEEF5',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  resultLabel: { color: '#8B91A8', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  cnnTag: {
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#D0D5F6',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cnnTagText: { color: '#5B6AD0', fontSize: 10, fontWeight: '700' },
  geminiTag: {
    backgroundColor: '#E8FBF5',
    borderWidth: 1,
    borderColor: '#A7EDD8',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  geminiTagText: { color: '#0D9B72', fontSize: 10, fontWeight: '700' },
  resultStage: { fontSize: 22, fontWeight: '800', color: '#1A1D2E', marginBottom: 8, letterSpacing: 0.2 },
  resultSummary: { color: '#6B7291', fontSize: 13, lineHeight: 19, marginBottom: 14, fontStyle: 'italic' },
  norwood: { flexDirection: 'row', gap: 5, marginBottom: 18, marginTop: 4 },
  norwoodCell: { flex: 1, alignItems: 'center', gap: 5 },
  norwoodBar: { width: '100%', height: 10, borderRadius: 5 },
  norwoodBarActive: { height: 16, borderRadius: 6, marginTop: -3 },
  norwoodNum: { color: '#A0A5BA', fontSize: 11, fontWeight: '700' },
  norwoodNumActive: { color: '#16203A', fontWeight: '900' },
  confidenceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  confidenceLabel: { color: '#6B7291', fontSize: 13, fontWeight: '600' },
  confidenceValue: { color: '#0D9B72', fontSize: 14, fontWeight: '800' },
  confidenceBarBg: { height: 6, backgroundColor: '#ECEEF5', borderRadius: 3, overflow: 'hidden', marginBottom: 16 },
  confidenceBarFill: { height: 6, backgroundColor: '#0D9B72', borderRadius: 3 },
  successBanner: {
    backgroundColor: '#E8FFF5',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  successBannerText: { color: '#0D9B72', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  // ── Zone Grid ──
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zoneChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F6FB', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, gap: 6,
    borderWidth: 1, borderColor: '#ECEEF5',
  },
  zoneChipDot: { width: 8, height: 8, borderRadius: 4 },
  zoneChipLabel: { color: '#5A5F78', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  zoneChipScore: { color: '#1A1D2E', fontSize: 11, fontWeight: '800' },
  zoneChipEstimated: { borderStyle: 'dashed', backgroundColor: '#FAFAFD' },
  zoneChipEst: { color: '#9CA3BE', fontSize: 9, fontWeight: '700' },
  zoneLegendNote: { color: '#8B91A8', fontSize: 11, marginTop: 12, lineHeight: 16, fontStyle: 'italic' },
  warningBox: { backgroundColor: '#FFF8ED', borderRadius: 10, padding: 10, marginTop: 12, gap: 4 },
  warningText: { color: '#8B6914', fontSize: 12, fontWeight: '600' },

  // ── 3D Button ──
  view3DButton: {
    width: '100%',
    backgroundColor: '#5B6AD0',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  view3DButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
});
