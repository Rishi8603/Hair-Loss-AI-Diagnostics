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

const { width: SCREEN_W } = Dimensions.get('window');
const API_URL_BASE = 'https://rishi8603-hair-loss-api.hf.space';

// ── Clean Icon Badge Component ──────────────────────────────────
function IconBadge({ char, bg, color, size = 40 }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg || '#EEF0FF',
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{
        color: color || '#5B6AD0', fontSize: size * 0.42,
        fontWeight: '800', letterSpacing: -0.5,
      }}>{char}</Text>
    </View>
  );
}

function CheckDot({ done }) {
  return (
    <View style={{
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: done ? '#0D9B72' : '#E0E4F0',
      justifyContent: 'center', alignItems: 'center',
    }}>
      {done && <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>✓</Text>}
    </View>
  );
}

// ── The 4 capture slots for 3D analysis ─────────────────────────
const CAPTURE_SLOTS = [
  { key: 'anterior', label: 'Front View', guideImg: require('./assets/guide_anterior.png'), hint: 'Look straight. Ensure hairline and forehead are clearly visible. Pull hair back if needed.' },
  { key: 'lateral', label: 'Side Profile', guideImg: require('./assets/guide_lateral.png'), hint: 'Turn head 90°. Show the temple line clearly. Keep camera at eye level.' },
  { key: 'vertex', label: 'Top / Crown', guideImg: require('./assets/guide_vertex.png'), hint: 'Point camera straight down at the top of your head to show the crown area.' },
  { key: 'posterior', label: 'Back View', guideImg: require('./assets/guide_posterior.png'), hint: 'Show the back of your head. Have someone help or use a mirror.' },
];

// ── Fetch with timeout to prevent infinite mobile hangs ─────────
function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Check your network connection.')), timeoutMs),
    ),
  ]);
}

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

  // ── 3D Visualization (Gemini) ───────────────────────────────
  const [images3d, setImages3d] = useState({});
  const [zones3d, setZones3d] = useState(null);
  const [result3d, setResult3d] = useState(null);

  // ── Deep Analysis (Groq) ────────────────────────────────────
  const [fullAnalysis, setFullAnalysis] = useState(null);

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
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const resp = await fetch(stageImage);
        const blob = await resp.blob();
        formData.append('file', new File([blob], 'scalp.jpg', { type: blob.type || 'image/jpeg' }));
      } else {
        const filename = stageImage.split('/').pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('file', { uri: stageImage, name: filename, type });
      }

      const fetchOptions = { method: 'POST', body: formData };
      // Do NOT manually set Content-Type for multipart/form-data —
      // React Native's fetch auto-generates it with the correct boundary.

      const response = await fetchWithTimeout(`${API_URL_BASE}/predict/`, fetchOptions, 30000);
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail || 'Prediction failed');
      setStageResult(json);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to predict.');
    } finally {
      setLoading(false);
    }
  };

  // ── Pick 3D image for a specific slot ───────────────────────
  const pick3DImage = async (slotKey) => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!res.canceled) {
      setImages3d((prev) => ({ ...prev, [slotKey]: res.assets[0].uri }));
      setResult3d(null);
      setZones3d(null);
    }
  };

  // ── Upload 4 images to /predict-3d/ (Gemini) ───────────────
  const run3DVisualization = async () => {
    if (filledCount3d === 0) {
      Alert.alert('No images', 'Please add at least one scalp angle.');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();

      // Inject CNN ground truth if available to prevent AI hallucination
      if (stageResult && stageResult.predicted_stage) {
        formData.append('cnn_stage', stageResult.predicted_stage);
      }

      for (const { key } of CAPTURE_SLOTS) {
        if (images3d[key]) {
          const uri = images3d[key];
          if (Platform.OS === 'web') {
            const resp = await fetch(uri);
            const blob = await resp.blob();
            formData.append(key, new File([blob], `${key}.jpg`, { type: blob.type || 'image/jpeg' }));
          } else {
            const filename = uri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';
            formData.append(key, { uri, name: filename, type });
          }
        }
      }

      const fetchOptions = { method: 'POST', body: formData };
      // Do NOT manually set Content-Type for multipart/form-data —
      // React Native's fetch auto-generates it with the correct boundary.

      const response = await fetchWithTimeout(`${API_URL_BASE}/predict-3d/`, fetchOptions, 60000);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('The /predict-3d/ endpoint is not available.');
      }
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail || 'Analysis failed');
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
          zones: stageResult.zones || {},
          metadata: lifestyleData,
        }),
      }, 45000);
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
    await AsyncStorage.clear();
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

  // ── 3D Head Viewer ──────────────────────────────────────────
  if (screen === 'viewer' && zones3d) {
    return <Head3DViewer zones={zones3d} onBack={() => setScreen('3d')} />;
  }

  // ── Full Analysis Report ────────────────────────────────────
  if (screen === 'fullResult' && fullAnalysis) {
    return (
      <FullAnalysisResult
        analysis={fullAnalysis}
        predictedStage={stageResult?.predicted_stage || ''}
        confidence={stageResult?.confidence || ''}
        onBack={() => setScreen('home')}
        onOpen3D={zones3d ? () => setScreen('viewer') : null}
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
                    ✅ Stage prediction complete! Go back to dashboard to use Deep Analysis.
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
              <Text style={styles.subtitle}>Multi-angle zone mapping via AI Vision</Text>
            </View>

            {/* Caution: no stage prediction yet */}
            {!stageResult && (
              <TouchableOpacity
                style={styles.cautionBanner}
                onPress={() => setScreen('stage')}
                activeOpacity={0.8}
              >
                <Text style={styles.cautionText}>
                  ⚠ For best accuracy, complete Stage Prediction first so AI Vision can use your CNN result as ground truth.
                </Text>
                <Text style={styles.cautionLink}>Go to Stage Prediction →</Text>
              </TouchableOpacity>
            )}

            {/* Instruction */}
            <View style={styles.instructionCard}>
              <Text style={styles.instructionTitle}>Capture 4 Angles</Text>
              <Text style={styles.instructionBody}>
                Select one photo per angle for the most accurate 3D heatmap. All 4 gives the best result — but even 1 works.
              </Text>
            </View>

            {/* 4-slot grid */}
            <View style={styles.slotGrid}>
              {CAPTURE_SLOTS.map(({ key, label, guideImg, hint }) => {
                const uri = images3d[key];
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.slot, uri && styles.slotFilled]}
                    onPress={() => pick3DImage(key)}
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
              <Text style={styles.progressText}>{filledCount3d}/4 angles captured</Text>
            </View>

            {/* Render button */}
            <TouchableOpacity
              style={[styles.analyzeButton, (filledCount3d === 0 || loading) && styles.buttonDisabled]}
              onPress={run3DVisualization}
              disabled={filledCount3d === 0 || loading}
              activeOpacity={0.85}
            >
              <Text style={styles.analyzeButtonText}>
                {filledCount3d === 4 ? 'Render 3D Heatmap' : `Analyse (${filledCount3d} angle${filledCount3d !== 1 ? 's' : ''})`}
              </Text>
            </TouchableOpacity>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#5B6AD0" />
                <Text style={styles.loadingText}>AI Vision is analysing your scalp...</Text>
                <Text style={styles.loadingSubtext}>This may take 10–20 seconds</Text>
              </View>
            )}

            {/* 3D Result */}
            {result3d && !loading && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>ZONE MAPPING</Text>
                  <View style={styles.geminiTag}>
                    <Text style={styles.geminiTagText}>✦ AI Vision</Text>
                  </View>
                </View>
                {/* Result stage removed so CNN remains the source of truth */}

                {result3d.summary ? (
                  <Text style={styles.resultSummary}>{result3d.summary}</Text>
                ) : null}

                {/* Zone chips */}
                {zones3d && (
                  <View style={styles.zoneGrid}>
                    {Object.entries(zones3d).map(([zone, score]) => (
                      <View key={zone} style={styles.zoneChip}>
                        <View style={[styles.zoneChipDot, { backgroundColor: scoreToColor(score) }]} />
                        <Text style={styles.zoneChipLabel}>{zone.replace('_', ' ')}</Text>
                        <Text style={styles.zoneChipScore}>{(score * 100).toFixed(0)}%</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* View 3D button */}
            {zones3d && !loading && (
              <TouchableOpacity
                style={styles.view3DButton}
                onPress={() => setScreen('viewer')}
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
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFBFD" />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.headerContainer}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>AI DIAGNOSTICS</Text>
              </View>
              <TouchableOpacity onPress={handleClearAllData} activeOpacity={0.7} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>↻ Reset</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.title}>TrichoVision</Text>
            <Text style={styles.subtitle}>Intelligent Hair Loss Analysis</Text>
          </View>

          {/* ── Lifestyle Survey Card ── */}
          <TouchableOpacity
            style={[styles.improveCard, lifestyleData && styles.improveCardDone]}
            onPress={() => setScreen('lifestyle')}
            activeOpacity={0.8}
          >
            <View style={styles.improveCardLeft}>
              <IconBadge char={lifestyleData ? '✓' : '≡'} bg={lifestyleData ? '#E8FFF5' : '#EEF0FF'} color={lifestyleData ? '#0D9B72' : '#5B6AD0'} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.improveCardTitle}>
                  {lifestyleData ? 'Lifestyle Data Collected' : 'Lifestyle Survey'}
                </Text>
                <Text style={styles.improveCardSubtitle}>
                  {lifestyleData
                    ? 'Tap to update your answers'
                    : 'Required for Deep Analysis — answer 24 quick questions'}
                </Text>
              </View>
            </View>
            <Text style={styles.improveCardArrow}>›</Text>
          </TouchableOpacity>

          {/* ── Feature Cards Grid ── */}
          <View style={styles.featureGrid}>
            {/* Card 1: Stage Prediction */}
            <TouchableOpacity
              style={[styles.featureCard, stageResult && styles.featureCardDone]}
              onPress={() => setScreen('stage')}
              activeOpacity={0.8}
            >
              <IconBadge char="S" bg="#EEF0FF" color="#5B6AD0" size={44} />
              <Text style={styles.featureCardTitle}>Stage{'\n'}Prediction</Text>
              <Text style={styles.featureCardDesc}>
                {stageResult ? stageResult.predicted_stage.replace(' - ', '\n') : 'Upload 1 photo\nCNN classifier'}
              </Text>
              {stageResult ? (
                <View style={styles.featureCardCompleteBadge}>
                  <Text style={styles.featureCardCompleteText}>✓ Done</Text>
                </View>
              ) : (
                <View style={styles.featureCardActionBadge}>
                  <Text style={styles.featureCardActionText}>Start →</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Card 2: 3D Visualization */}
            <TouchableOpacity
              style={[styles.featureCard, zones3d && styles.featureCardDone]}
              onPress={() => setScreen('3d')}
              activeOpacity={0.8}
            >
              <IconBadge char="3D" bg="#E8FBF5" color="#0D9B72" size={44} />
              <Text style={styles.featureCardTitle}>3D Scalp{'\n'}Visualizer</Text>
              <Text style={styles.featureCardDesc}>
                {zones3d ? 'Heatmap ready!' : 'Upload 4 angles\nAI Vision'}
              </Text>
              {zones3d ? (
                <View style={styles.featureCardCompleteBadge}>
                  <Text style={styles.featureCardCompleteText}>✓ Done</Text>
                </View>
              ) : (
                <View style={styles.featureCardActionBadge}>
                  <Text style={styles.featureCardActionText}>Start →</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Deep Analysis Card ── */}
          <TouchableOpacity
            style={[
              styles.deepAnalysisCard,
              deepAnalysisUnlocked && styles.deepAnalysisCardUnlocked,
              !deepAnalysisUnlocked && styles.deepAnalysisCardLocked,
            ]}
            onPress={deepAnalysisUnlocked ? requestDeepAnalysis : null}
            disabled={!deepAnalysisUnlocked || loading}
            activeOpacity={deepAnalysisUnlocked ? 0.85 : 1}
          >
            <View style={styles.deepAnalysisTop}>
              <IconBadge
                char={deepAnalysisUnlocked ? 'DA' : '⊘'}
                bg={deepAnalysisUnlocked ? '#E8FBF5' : '#F5F6FB'}
                color={deepAnalysisUnlocked ? '#0D9B72' : '#8B91A8'}
                size={36}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.deepAnalysisTitle}>
                  {loading ? 'Generating Report...' : 'Deep Lifestyle Analysis'}
                </Text>
                <Text style={styles.deepAnalysisSubtitle}>
                  {deepAnalysisUnlocked
                    ? 'CNN Stage + Lifestyle → Groq AI comprehensive report'
                    : 'Complete Survey & Stage Prediction to unlock'}
                </Text>
              </View>
            </View>

            {/* Progress checklist */}
            <View style={styles.deepAnalysisChecklist}>
              <View style={styles.checkItem}>
                <CheckDot done={!!lifestyleData} />
                <Text style={[styles.checkText, lifestyleData && styles.checkTextDone]}>
                  Lifestyle Survey
                </Text>
              </View>
              <View style={styles.checkItem}>
                <CheckDot done={!!stageResult} />
                <Text style={[styles.checkText, stageResult && styles.checkTextDone]}>
                  Stage Prediction
                </Text>
              </View>
            </View>

            {loading && (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#5B6AD0" />
              </View>
            )}
          </TouchableOpacity>

          {/* View existing report */}
          {fullAnalysis && (
            <TouchableOpacity
              style={styles.viewReportBtn}
              onPress={() => setScreen('fullResult')}
              activeOpacity={0.85}
            >
              <Text style={styles.viewReportBtnText}>View Full Report</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 50 }} />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

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
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  resetBtn: {
    backgroundColor: '#FFEFEF',
    borderWidth: 1,
    borderColor: '#FFD5D5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  resetBtnText: {
    color: '#D84B4B',
    fontSize: 11,
    fontWeight: '700',
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

  // ── Improve Accuracy / Lifestyle Card ──
  improveCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0EDFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D0D5F6',
    padding: 14,
    marginBottom: 20,
  },
  improveCardDone: {
    backgroundColor: '#E8FFF5',
    borderColor: '#A0E8CC',
  },
  improveCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  improveCardIcon: { fontSize: 24 },
  improveCardTitle: { color: '#1A1D2E', fontSize: 14, fontWeight: '700' },
  improveCardSubtitle: { color: '#6B7291', fontSize: 12, marginTop: 2 },
  improveCardArrow: { color: '#5B6AD0', fontSize: 28, fontWeight: '300', marginLeft: 8 },

  // ── Feature Cards Grid ──
  featureGrid: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  featureCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECEEF5',
    padding: 18,
    alignItems: 'center',
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  featureCardDone: {
    borderColor: '#A0E8CC',
    backgroundColor: '#F8FFFC',
  },
  featureCardIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  featureCardTitle: {
    color: '#1A1D2E',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  featureCardDesc: {
    color: '#8B91A8',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 10,
  },
  featureCardActionBadge: {
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#D0D5F6',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  featureCardActionText: {
    color: '#5B6AD0',
    fontSize: 12,
    fontWeight: '700',
  },
  featureCardCompleteBadge: {
    backgroundColor: '#E8FFF5',
    borderWidth: 1,
    borderColor: '#A0E8CC',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  featureCardCompleteText: {
    color: '#0D9B72',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Deep Analysis Card ──
  deepAnalysisCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12,
  },
  deepAnalysisCardUnlocked: {
    backgroundColor: '#E8FBF5',
    borderColor: '#A7EDD8',
  },
  deepAnalysisCardLocked: {
    backgroundColor: '#F5F6FB',
    borderColor: '#ECEEF5',
  },
  deepAnalysisTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deepAnalysisIcon: { fontSize: 28 },
  deepAnalysisTitle: { color: '#1A1D2E', fontSize: 15, fontWeight: '800' },
  deepAnalysisSubtitle: { color: '#6B7291', fontSize: 12, marginTop: 2 },
  deepAnalysisChecklist: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkIcon: { fontSize: 16 },
  checkText: { color: '#8B91A8', fontSize: 12, fontWeight: '600' },
  checkTextDone: { color: '#0D9B72' },

  // ── View Report Button ──
  viewReportBtn: {
    width: '100%',
    backgroundColor: '#5B6AD0',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  viewReportBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

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