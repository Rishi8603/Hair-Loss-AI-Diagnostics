import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import GuidedCapture, { CAPTURE_STEPS } from './GuidedCapture';
import { measureZones } from './api';
import {
  loadLog, saveCheckIn, deleteCheckIn, clearLog, compareEntries, entryCoverage,
  localDayKey, formatDayKey, dayNumber, daysBetween, NOISE_THRESHOLD,
} from './progressStore';

const C = {
  bg: '#FAFBFD', card: '#FFFFFF', border: '#ECEEF5', ink: '#1A1D2E', sub: '#6B7291', faint: '#8B91A8',
  primary: '#5B6AD0', primarySoft: '#EEF0FF', green: '#0D9B72', greenSoft: '#E8FFF5',
  red: '#D84B4B', redSoft: '#FFEFEF', amber: '#B7791F', amberSoft: '#FFF8ED',
};

const STATUS = {
  improved: { label: 'Improving', color: C.green, bg: C.greenSoft },
  stable: { label: 'Stable', color: C.primary, bg: C.primarySoft },
  declined: { label: 'Declining', color: C.red, bg: C.redSoft },
};

const pct = (x) => `${Math.round(x * 100)}%`;
const pts = (d) => `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)} pts`;

function StatusChip({ status }) {
  const s = STATUS[status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.chipText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

// Visible scalp change, coloured by whether it is good news (less scalp showing).
function ScalpDelta({ delta }) {
  const color = Math.abs(delta) < NOISE_THRESHOLD ? C.faint : delta < 0 ? C.green : C.red;
  return <Text style={[styles.deltaText, { color }]}>{pts(delta)}</Text>;
}

function ComparisonCard({ title, subtitle, comparison }) {
  if (!comparison.overall) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{subtitle}</Text>
        <View style={[styles.notice, { backgroundColor: C.amberSoft }]}>
          <Text style={[styles.noticeText, { color: C.amber }]}>
            No scalp zone was measured on both days, so there is nothing to compare yet. Capture the same angles each day.
          </Text>
        </View>
      </View>
    );
  }
  const o = comparison.overall;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSub}>{subtitle}</Text>
        </View>
        <StatusChip status={o.status} />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Visible scalp</Text>
          <Text style={styles.metricValue}>{pct(o.prevScalp)} → {pct(o.currScalp)}</Text>
          <ScalpDelta delta={o.deltaScalp} />
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Hair density</Text>
          <Text style={styles.metricValue}>{pct(o.prevDensity)} → {pct(o.currDensity)}</Text>
          <Text style={[styles.deltaText, { color: C.faint }]}>{pts(o.deltaDensity)}</Text>
        </View>
      </View>

      <View style={styles.zoneTableHead}>
        <Text style={[styles.zoneHeadText, { flex: 1.4 }]}>Zone</Text>
        <Text style={[styles.zoneHeadText, { flex: 1.3, textAlign: 'center' }]}>Scalp visible</Text>
        <Text style={[styles.zoneHeadText, { flex: 1, textAlign: 'right' }]}>Change</Text>
      </View>
      {comparison.zones.map((z) => (
        <View key={z.key} style={styles.zoneRow}>
          <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.statusDot, { backgroundColor: STATUS[z.status].color }]} />
            <Text style={styles.zoneName}>{z.label}</Text>
          </View>
          <Text style={[styles.zoneVal, { flex: 1.3, textAlign: 'center' }]}>{pct(z.prevScalp)} → {pct(z.currScalp)}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <ScalpDelta delta={z.deltaScalp} />
          </View>
        </View>
      ))}
    </View>
  );
}

function TrendChart({ log }) {
  const points = log.slice(-14).map((e) => ({ e, cov: entryCoverage(e) }));
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Hair coverage trend</Text>
      <Text style={styles.cardSub}>Average density of the measured zones, per check-in</Text>
      <View style={styles.chart}>
        {points.map(({ e, cov }) => (
          <View key={e.id} style={styles.barCol}>
            <Text style={styles.barValue}>{cov == null ? '–' : Math.round(cov * 100)}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { height: `${Math.max(4, (cov || 0) * 100)}%` }]} />
            </View>
            <Text style={styles.barLabel}>D{dayNumber(log, e)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ProgressTracker({ cnnStage, onBack, onOpen3D }) {
  const [log, setLog] = useState(null);
  const [mode, setMode] = useState('overview'); // overview | capture | review
  const [images, setImages] = useState({});
  const [captureKey, setCaptureKey] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const today = localDayKey();

  useEffect(() => {
    loadLog()
      .then(setLog)
      .catch((e) => {
        console.error('Failed to load progress log', e);
        setLog([]);
      });
  }, []);

  const startCheckIn = () => {
    setImages({});
    setCaptureKey(null);
    setJustSaved(false);
    setMode('capture');
  };

  const runCheckIn = async () => {
    setAnalysing(true);
    try {
      const result = await measureZones(images, cnnStage);
      if (!result.measured_zones || result.measured_zones.length === 0) {
        const warnings = Object.values(result.view_info || {}).flatMap((v) => v.warnings || []);
        const unique = [...new Set(warnings)];
        Alert.alert(
          'Could not measure your scalp',
          `No zone could be measured from these photos, so nothing was saved.${unique.length ? `\n\n• ${unique.join('\n• ')}` : ''}\n\nRetake them in even light with the scalp clearly in frame.`,
        );
        return;
      }
      const next = await saveCheckIn(result, images);
      setLog(next);
      setImages({});
      setJustSaved(true);
      setMode('overview');
    } catch (e) {
      console.error(e);
      Alert.alert('Check-in failed', e.message || 'Something went wrong. Please try again.');
    } finally {
      setAnalysing(false);
    }
  };

  const removeEntry = async (id) => {
    try {
      setLog(await deleteCheckIn(id));
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not delete this check-in.');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const removeAll = async () => {
    try {
      setLog(await clearLog());
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not clear history.');
    } finally {
      setConfirmClear(false);
    }
  };

  // ── Guided camera ──
  if (mode === 'capture') {
    return (
      <SafeAreaProvider>
        <GuidedCapture
          images={images}
          startKey={captureKey}
          onCapture={(key, uri) => setImages((prev) => ({ ...prev, [key]: uri }))}
          onClose={() => setMode('review')}
        />
      </SafeAreaProvider>
    );
  }

  const latest = log && log.length ? log[log.length - 1] : null;
  const doneToday = latest && latest.dayKey === today;
  const capturedCount = Object.keys(images).length;

  // ── Review captured photos before analysing ──
  if (mode === 'review') {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top']}>
          <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
          <ScrollView contentContainerStyle={styles.scroll}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setMode('overview')} disabled={analysing}>
              <Text style={styles.backBtnText}>← Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Today's photos</Text>
            <Text style={styles.subtitle}>Tap an angle to retake it</Text>

            <View style={styles.thumbGrid}>
              {CAPTURE_STEPS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.thumb, images[s.key] && styles.thumbFilled]}
                  onPress={() => { setCaptureKey(s.key); setMode('capture'); }}
                  disabled={analysing}
                  activeOpacity={0.8}
                >
                  {images[s.key] ? (
                    <Image source={{ uri: images[s.key] }} style={styles.thumbImg} />
                  ) : (
                    <Image source={s.guideImg} style={styles.thumbGuide} />
                  )}
                  <View style={styles.thumbLabelBar}>
                    <Text style={styles.thumbLabel}>{s.shortLabel}</Text>
                    <Text style={[styles.thumbState, { color: images[s.key] ? C.green : C.faint }]}>
                      {images[s.key] ? '✓' : '+'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.notice, { backgroundColor: C.primarySoft }]}>
              <Text style={[styles.noticeText, { color: C.primary }]}>
                Use the same angles every day. Only zones photographed on both days can be compared.
                {doneToday ? '\n\nThis will replace the check-in you already saved today.' : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (capturedCount === 0 || analysing) && styles.btnDisabled]}
              onPress={runCheckIn}
              disabled={capturedCount === 0 || analysing}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {analysing ? 'Measuring…' : `Analyse & save (${capturedCount} angle${capturedCount === 1 ? '' : 's'})`}
              </Text>
            </TouchableOpacity>
            {analysing && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={styles.loadingText}>Measuring hair density in each zone…</Text>
                <Text style={styles.loadingSub}>This can take up to a minute if the server is waking up</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ── Overview ──
  const prev = log && log.length >= 2 ? log[log.length - 2] : null;
  const baseline = log && log.length ? log[0] : null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.badge}><Text style={styles.badgeText}>DAILY MONITORING</Text></View>
          <Text style={styles.title}>Progress Tracker</Text>
          <Text style={styles.subtitle}>Track how much scalp is visible, day by day</Text>

          {log === null ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={C.primary} />
          ) : log.length === 0 ? (
            // ── First visit ──
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>How it works</Text>
                {[
                  'Each day, take the guided scalp photos (front, temples, crown, back).',
                  'Day 1 records your baseline.',
                  'From Day 2, we compare each zone with your previous check-in and your baseline, showing whether visible scalp area grew or shrank.',
                ].map((t, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                    <Text style={styles.stepText}>{t}</Text>
                  </View>
                ))}
              </View>
              <TipsCard />
              <TouchableOpacity style={styles.primaryBtn} onPress={startCheckIn} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Start Day 1 check-in</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {justSaved && (
                <View style={[styles.notice, { backgroundColor: C.greenSoft }]}>
                  <Text style={[styles.noticeText, { color: C.green }]}>
                    ✓ Day {dayNumber(log, latest)} check-in saved.
                  </Text>
                </View>
              )}

              {/* Today's status */}
              <View style={[styles.card, styles.todayCard]}>
                {doneToday ? (
                  <>
                    <Text style={styles.cardTitle}>Today's check-in is done</Text>
                    <Text style={styles.cardSub}>
                      Day {dayNumber(log, latest)} · come back tomorrow for your next check-in.
                    </Text>
                    <TouchableOpacity onPress={startCheckIn} style={styles.linkBtn}>
                      <Text style={styles.linkBtnText}>Redo today's photos</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardTitle}>Time for today's check-in</Text>
                    <Text style={styles.cardSub}>
                      Day {daysBetween(baseline.dayKey, today) + 1} · last check-in {formatDayKey(latest.dayKey)}
                    </Text>
                    <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14, marginBottom: 0 }]} onPress={startCheckIn} activeOpacity={0.85}>
                      <Text style={styles.primaryBtnText}>Start check-in</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {log.length === 1 ? (
                // ── Day 1: baseline only, no analysis yet ──
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Baseline recorded</Text>
                  <Text style={styles.cardSub}>
                    {formatDayKey(baseline.dayKey)} · {baseline.measuredZones.length} zone{baseline.measuredZones.length === 1 ? '' : 's'} measured
                  </Text>
                  <View style={[styles.notice, { backgroundColor: C.primarySoft, marginTop: 12 }]}>
                    <Text style={[styles.noticeText, { color: C.primary }]}>
                      Your progress report unlocks after your second check-in. Come back tomorrow and take the same photos to see how your scalp has changed.
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <ComparisonCard
                    title={`Day ${dayNumber(log, latest)} vs Day ${dayNumber(log, prev)}`}
                    subtitle={`Since your previous check-in (${daysBetween(prev.dayKey, latest.dayKey)} day${daysBetween(prev.dayKey, latest.dayKey) === 1 ? '' : 's'} ago)`}
                    comparison={compareEntries(prev, latest)}
                  />
                  {log.length >= 3 && (
                    <ComparisonCard
                      title={`Day ${dayNumber(log, latest)} vs Day 1`}
                      subtitle={`Overall change since your baseline on ${formatDayKey(baseline.dayKey)}`}
                      comparison={compareEntries(baseline, latest)}
                    />
                  )}
                  <TrendChart log={log} />
                  <View style={styles.footnote}>
                    <Text style={styles.footnoteText}>
                      Changes under {Math.round(NOISE_THRESHOLD * 100)} points are within normal photo-to-photo variation (lighting, angle) and are shown as stable. Real regrowth shows over weeks, so watch the trend rather than single days.
                    </Text>
                  </View>
                </>
              )}

              {latest.warnings && latest.warnings.length > 0 && (
                <View style={[styles.card, { backgroundColor: C.amberSoft, borderColor: '#FFE0A3' }]}>
                  <Text style={[styles.cardTitle, { color: C.amber }]}>Photo quality notes (latest)</Text>
                  {[...new Set(latest.warnings.map((w) => w.text))].map((t) => (
                    <Text key={t} style={[styles.stepText, { color: C.amber, marginTop: 6 }]}>• {t}</Text>
                  ))}
                </View>
              )}

              {/* History */}
              <Text style={styles.sectionTitle}>History</Text>
              {[...log].reverse().map((e) => {
                const cov = entryCoverage(e);
                const thumb = e.photos && (e.photos.anterior || Object.values(e.photos)[0]);
                return (
                  <View key={e.id} style={styles.historyRow}>
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.historyThumb} />
                    ) : (
                      <View style={[styles.historyThumb, styles.historyThumbEmpty]}>
                        <Text style={styles.historyThumbText}>D{dayNumber(log, e)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>Day {dayNumber(log, e)} · {formatDayKey(e.dayKey)}</Text>
                      <Text style={styles.historySub}>
                        {cov == null ? 'No zones measured' : `${pct(cov)} hair density · ${pct(1 - cov)} scalp visible`}
                      </Text>
                      {pendingDeleteId === e.id ? (
                        <View style={styles.inlineConfirm}>
                          <Text style={styles.historySub}>Delete this check-in?</Text>
                          <TouchableOpacity onPress={() => removeEntry(e.id)}>
                            <Text style={[styles.inlineAction, { color: C.red }]}>Delete</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setPendingDeleteId(null)}>
                            <Text style={styles.inlineAction}>Keep</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.inlineConfirm}>
                          {onOpen3D && (
                            <TouchableOpacity onPress={() => onOpen3D(e.zones)}>
                              <Text style={[styles.inlineAction, { color: C.primary }]}>View 3D</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => setPendingDeleteId(e.id)}>
                            <Text style={[styles.inlineAction, { color: C.faint }]}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {confirmClear ? (
                <View style={[styles.card, { borderColor: '#FFD5D5' }]}>
                  <Text style={styles.cardTitle}>Delete all progress history?</Text>
                  <Text style={styles.cardSub}>All check-ins and their photos will be removed from this phone.</Text>
                  <View style={[styles.rowBetween, { marginTop: 12 }]}>
                    <TouchableOpacity style={[styles.smallBtn, { backgroundColor: C.red }]} onPress={removeAll}>
                      <Text style={styles.smallBtnText}>Delete all</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.smallBtn, { backgroundColor: C.primarySoft }]} onPress={() => setConfirmClear(false)}>
                      <Text style={[styles.smallBtnText, { color: C.primary }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setConfirmClear(true)} style={styles.clearLink}>
                  <Text style={styles.clearLinkText}>Delete all history</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TipsCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>For accurate comparisons</Text>
      {[
        'Same room, same lighting, same time of day',
        'Hair dry and styled the same way, no products',
        'Same angles each day; avoid direct flash',
      ].map((t) => (
        <Text key={t} style={[styles.stepText, { marginTop: 8 }]}>• {t}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, maxWidth: 520, width: '100%', alignSelf: 'center' },

  backBtn: {
    alignSelf: 'flex-start', backgroundColor: C.primarySoft, borderWidth: 1, borderColor: '#D0D5F6',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 16,
  },
  backBtnText: { color: C.primary, fontSize: 14, fontWeight: '700' },
  badge: {
    alignSelf: 'flex-start', backgroundColor: C.primarySoft, borderWidth: 1, borderColor: '#D0D5F6',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3, marginBottom: 8,
  },
  badgeText: { color: C.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { fontSize: 28, fontWeight: '800', color: C.ink, marginBottom: 2 },
  subtitle: { fontSize: 14, color: C.faint, fontWeight: '500', marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 8, marginBottom: 10 },

  card: {
    backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  todayCard: { borderColor: '#D0D5F6' },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: '800' },
  cardSub: { color: C.sub, fontSize: 12, marginTop: 3, lineHeight: 17 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },

  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText: { fontSize: 11, fontWeight: '800' },

  metricsRow: {
    flexDirection: 'row', marginTop: 14, backgroundColor: '#F7F8FC', borderRadius: 14, paddingVertical: 12,
  },
  metric: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, backgroundColor: C.border },
  metricLabel: { color: C.faint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue: { color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 4 },
  deltaText: { fontSize: 12, fontWeight: '800', marginTop: 2 },

  zoneTableHead: { flexDirection: 'row', marginTop: 14, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  zoneHeadText: { color: C.faint, fontSize: 11, fontWeight: '700' },
  zoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F3F4F8' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  zoneName: { color: C.ink, fontSize: 13, fontWeight: '600' },
  zoneVal: { color: C.sub, fontSize: 12, fontWeight: '600' },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, marginTop: 12, gap: 6 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue: { color: C.sub, fontSize: 9, fontWeight: '700', marginBottom: 3 },
  barTrack: { width: '70%', maxWidth: 22, flex: 1, backgroundColor: '#F1F2F8', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: C.primary, borderRadius: 6 },
  barLabel: { color: C.faint, fontSize: 9, fontWeight: '700', marginTop: 4 },

  notice: { borderRadius: 12, padding: 12, marginBottom: 14 },
  noticeText: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  footnote: { paddingHorizontal: 4, marginBottom: 14 },
  footnoteText: { color: C.faint, fontSize: 11, lineHeight: 16, fontStyle: 'italic' },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: C.primary, fontSize: 12, fontWeight: '800' },
  stepText: { flex: 1, color: C.sub, fontSize: 13, lineHeight: 19 },

  primaryBtn: {
    backgroundColor: C.primary, paddingVertical: 15, borderRadius: 16, alignItems: 'center', marginBottom: 14,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { backgroundColor: '#C5CAE9', shadowOpacity: 0, elevation: 0 },
  linkBtn: { marginTop: 10, alignSelf: 'flex-start' },
  linkBtnText: { color: C.primary, fontSize: 13, fontWeight: '700' },
  smallBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  smallBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  loadingBox: { alignItems: 'center', marginTop: 6, gap: 6 },
  loadingText: { color: '#3A3F56', fontSize: 14, fontWeight: '600', marginTop: 6 },
  loadingSub: { color: C.faint, fontSize: 12, fontStyle: 'italic' },

  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  thumb: {
    width: '31%', aspectRatio: 0.8, borderRadius: 14, backgroundColor: '#F3F4FA',
    borderWidth: 1.5, borderColor: '#DDE0EF', borderStyle: 'dashed', overflow: 'hidden',
  },
  thumbFilled: { borderStyle: 'solid', borderColor: C.primary },
  thumbImg: { width: '100%', height: '100%' },
  thumbGuide: { width: '70%', height: '60%', alignSelf: 'center', marginTop: '12%', resizeMode: 'contain', opacity: 0.8 },
  thumbLabelBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 8, paddingVertical: 5,
  },
  thumbLabel: { color: C.ink, fontSize: 11, fontWeight: '700' },
  thumbState: { fontSize: 12, fontWeight: '800' },

  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8,
  },
  historyThumb: { width: 54, height: 54, borderRadius: 10 },
  historyThumbEmpty: { backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  historyThumbText: { color: C.primary, fontWeight: '800' },
  historyTitle: { color: C.ink, fontSize: 14, fontWeight: '700' },
  historySub: { color: C.sub, fontSize: 12, marginTop: 2 },
  inlineConfirm: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  inlineAction: { color: C.sub, fontSize: 12, fontWeight: '800' },

  clearLink: { alignSelf: 'center', marginTop: 10, padding: 8 },
  clearLinkText: { color: C.red, fontSize: 12, fontWeight: '700' },
});
