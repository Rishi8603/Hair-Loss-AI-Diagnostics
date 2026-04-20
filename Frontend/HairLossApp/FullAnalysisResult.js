import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// NOTE: Do NOT use SafeAreaView here — renders outside SafeAreaProvider, crashes on web.

// Design tokens — Light Theme
const COLORS = {
  bg: '#FAFBFD',
  card: '#FFFFFF',
  cardBorder: '#ECEEF5',
  accent: '#5B6AD0',
  accentDim: '#EEF0FF',
  teal: '#0D9B72',
  textPrimary: '#1A1D2E',
  textSecondary: '#6B7291',
  textMuted: '#9CA3BE',
  green: '#2E8B57',
  orange: '#E08A28',
  red: '#D94545',
  greenDim: '#E8FBF0',
  orangeDim: '#FFF5E8',
  redDim: '#FFF0F0',
  doctorBg: '#FFF0F0',
  doctorBorder: '#F5BFBF',
};

const RISK_CONFIG = {
  low: { color: COLORS.green, bg: COLORS.greenDim, label: '✅ Low Risk' },
  medium: { color: COLORS.orange, bg: COLORS.orangeDim, label: '⚠️ Medium Risk' },
  high: { color: COLORS.red, bg: COLORS.redDim, label: '🚨 High Risk' },
};

// Category icons
const CATEGORY_ICONS = {
  Diet: '🥗',
  Stress: '🧘',
  Sleep: '😴',
  Exercise: '🏃',
  Hair: '💇',
  Medical: '💊',
  Lifestyle: '🌿',
  Supplements: '💊',
  Hydration: '💧',
  default: '📋',
};

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
}

// ── Generate styled HTML report for download ──────────────────
function generateReportHTML(analysis, predictedStage, confidence) {
  const riskKey = (analysis.risk_level || 'medium').toLowerCase();
  const riskLabels = { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk' };
  const riskColors = { low: '#2E8B57', medium: '#E08A28', high: '#D94545' };
  const riskLabel = riskLabels[riskKey] || 'Medium Risk';
  const riskColor = riskColors[riskKey] || '#E08A28';

  const causesHTML = (analysis.primary_causes || []).map(c => `<li>${c}</li>`).join('');
  const factorsHTML = (analysis.contributing_factors || []).map(f => `<li>${f}</li>`).join('');

  // Group recommendations
  const recsByCategory = {};
  (analysis.recommendations || []).forEach((rec) => {
    const cat = rec.category || 'General';
    if (!recsByCategory[cat]) recsByCategory[cat] = [];
    recsByCategory[cat].push(rec.action);
  });
  const recsHTML = Object.entries(recsByCategory).map(([cat, actions]) => `
    <div class="rec-category">
      <h4>${cat}</h4>
      <ul>${actions.map(a => `<li>${a}</li>`).join('')}</ul>
    </div>
  `).join('');

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hair Loss Analysis Report - TrichoVision</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f0f2f5;
      color: #1A1D2E;
      padding: 40px 20px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report {
      max-width: 700px;
      margin: 0 auto;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 8px 40px rgba(91,106,208,0.10);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #5B6AD0 0%, #7B8AE8 100%);
      padding: 40px 32px 28px;
      color: #fff;
      text-align: center;
    }
    .header .logo { font-size: 13px; letter-spacing: 3px; opacity: 0.85; margin-bottom: 8px; text-transform: uppercase; }
    .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 6px; }
    .header .date { font-size: 13px; opacity: 0.75; }
    .stage-banner {
      background: rgba(255,255,255,0.15);
      border-radius: 12px;
      padding: 14px 20px;
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .stage-banner .stage-name { font-size: 18px; font-weight: 700; }
    .stage-banner .confidence { font-size: 14px; opacity: 0.9; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; }
    .content { padding: 28px 32px 36px; }
    .risk-badge {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-radius: 12px;
      border: 2px solid ${riskColor};
      background: ${riskKey === 'low' ? '#E8FBF0' : riskKey === 'high' ? '#FFF0F0' : '#FFF5E8'};
      margin-bottom: 24px;
    }
    .risk-badge .label { font-size: 17px; font-weight: 800; color: ${riskColor}; }
    .risk-badge .reversible { font-size: 12px; font-weight: 600; color: ${riskColor}; opacity: 0.85; }
    .section { margin-bottom: 22px; }
    .section h3 {
      font-size: 15px; font-weight: 700; color: #5B6AD0;
      letter-spacing: 0.5px; text-transform: uppercase;
      border-bottom: 2px solid #EEF0FF; padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .section ul { list-style: none; padding-left: 0; }
    .section ul li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 8px;
      font-size: 14px;
      line-height: 1.6;
      font-weight: 500;
    }
    .section ul li::before {
      content: '⚡';
      position: absolute;
      left: 0;
      top: 0;
    }
    .factors ul li::before { content: '•'; color: #6B7291; }
    .rec-category {
      background: #F8F9FD;
      border: 1px solid #ECEEF5;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 10px;
    }
    .rec-category h4 {
      font-size: 14px;
      font-weight: 700;
      color: #0D9B72;
      margin-bottom: 8px;
    }
    .rec-category ul li::before { content: '→'; color: #0D9B72; }
    .prognosis {
      background: #EEF0FF;
      border: 1px solid #D0D5F6;
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 22px;
    }
    .prognosis .label { font-size: 12px; font-weight: 700; color: #5B6AD0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .prognosis p { font-size: 15px; line-height: 1.6; font-style: italic; font-weight: 500; }
    .doctor-banner {
      background: #FFF0F0;
      border: 1px solid #F5BFBF;
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 22px;
    }
    .doctor-banner h4 { color: #D94545; font-size: 15px; font-weight: 800; margin-bottom: 8px; }
    .doctor-banner p { font-size: 13px; line-height: 1.6; font-weight: 500; opacity: 0.9; }
    .footer {
      text-align: center;
      padding: 20px 32px 28px;
      border-top: 1px solid #ECEEF5;
      font-size: 11px;
      color: #9CA3BE;
    }
    .footer strong { color: #5B6AD0; }
    @media print {
      body { padding: 0; background: #fff; }
      .report { box-shadow: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <div class="logo">TrichoVision Hair Diagnostics</div>
      <h1>Hair Loss Analysis Report</h1>
      <div class="date">Generated on ${dateStr} at ${timeStr}</div>
      <div class="stage-banner">
        <span class="stage-name">${predictedStage}</span>
        <span class="confidence">Confidence: ${confidence}</span>
      </div>
    </div>
    <div class="content">
      <div class="risk-badge">
        <span class="label">${riskLabel}</span>
        ${analysis.is_reversible !== undefined ? `<span class="reversible">${analysis.is_reversible ? '🔄 Potentially Reversible' : '⏸️ May Not Be Fully Reversible'}</span>` : ''}
      </div>

      ${causesHTML ? `<div class="section"><h3>⚠️ Primary Causes</h3><ul>${causesHTML}</ul></div>` : ''}
      ${factorsHTML ? `<div class="section factors"><h3>ℹ️ Contributing Factors</h3><ul>${factorsHTML}</ul></div>` : ''}
      ${recsHTML ? `<div class="section"><h3>💡 Recommendations</h3>${recsHTML}</div>` : ''}
      ${analysis.prognosis ? `<div class="prognosis"><div class="label">📊 Prognosis</div><p>${analysis.prognosis}</p></div>` : ''}
      ${analysis.should_see_doctor ? `<div class="doctor-banner"><h4>🩺 Professional Consultation Recommended</h4>${analysis.doctor_reason ? `<p>${analysis.doctor_reason}</p>` : ''}</div>` : ''}
    </div>
    <div class="footer">
      Report generated by <strong>TrichoVision AI Diagnostics</strong> · For informational purposes only · Not a medical diagnosis
    </div>
  </div>
</body>
</html>`;
}

// ── Generate plain text report for mobile sharing ─────────────
function generateReportText(analysis, predictedStage, confidence) {
  const lines = [];
  lines.push('═══════════════════════════════');
  lines.push('  TRICHOVISION HAIR ANALYSIS REPORT');
  lines.push('═══════════════════════════════');
  lines.push('');
  lines.push(`Stage: ${predictedStage}`);
  lines.push(`Confidence: ${confidence}`);
  lines.push(`Risk Level: ${(analysis.risk_level || 'N/A').toUpperCase()}`);
  if (analysis.is_reversible !== undefined) {
    lines.push(`Reversible: ${analysis.is_reversible ? 'Yes' : 'May not be fully reversible'}`);
  }
  lines.push('');

  if (analysis.primary_causes?.length) {
    lines.push('── PRIMARY CAUSES ──');
    analysis.primary_causes.forEach(c => lines.push(`  ⚡ ${c}`));
    lines.push('');
  }
  if (analysis.contributing_factors?.length) {
    lines.push('── CONTRIBUTING FACTORS ──');
    analysis.contributing_factors.forEach(f => lines.push(`  • ${f}`));
    lines.push('');
  }
  if (analysis.recommendations?.length) {
    lines.push('── RECOMMENDATIONS ──');
    analysis.recommendations.forEach(r => lines.push(`  [${r.category}] → ${r.action}`));
    lines.push('');
  }
  if (analysis.prognosis) {
    lines.push('── PROGNOSIS ──');
    lines.push(`  ${analysis.prognosis}`);
    lines.push('');
  }
  if (analysis.should_see_doctor) {
    lines.push('🩺 PROFESSIONAL CONSULTATION RECOMMENDED');
    if (analysis.doctor_reason) lines.push(`  ${analysis.doctor_reason}`);
    lines.push('');
  }
  lines.push('───────────────────────────────');
  lines.push('Generated by TrichoVision AI Diagnostics');
  lines.push('For informational purposes only');
  return lines.join('\n');
}

// FullAnalysisResult Component
export default function FullAnalysisResult({
  analysis,
  predictedStage,
  confidence,
  onBack,
  onOpen3D,
}) {
  if (!analysis) return null;

  const riskKey = (analysis.risk_level || 'medium').toLowerCase();
  const riskCfg = RISK_CONFIG[riskKey] || RISK_CONFIG.medium;

  // Group recommendations by category
  const recsByCategory = {};
  (analysis.recommendations || []).forEach((rec) => {
    const cat = rec.category || 'General';
    if (!recsByCategory[cat]) recsByCategory[cat] = [];
    recsByCategory[cat].push(rec.action);
  });

  // ── Download / Share report handler ─────────────────────────
  const handleDownloadReport = async () => {
    try {
      const html = generateReportHTML(analysis, predictedStage, confidence);
      if (Platform.OS === 'web') {
        // On web, download as an HTML file
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Hair_Analysis_Report_${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // On native, generate a hidden PDF file and offer to share/save it
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } else {
          Alert.alert('Error', 'File sharing is not available on this device');
        }
      }
    } catch (err) {
      console.error('Download/share failed:', err);
      Alert.alert('Error', 'Failed to generate PDF report. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: Stage + Confidence ── */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Your Analysis</Text>
          <Text style={styles.stageName}>{predictedStage}</Text>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>Confidence: {confidence}</Text>
          </View>
        </View>

        {/* ── Risk Level Badge ── */}
        <View style={[styles.riskBadge, { backgroundColor: riskCfg.bg, borderColor: riskCfg.color }]}>
          <Text style={[styles.riskText, { color: riskCfg.color }]}>{riskCfg.label}</Text>
          {analysis.is_reversible !== undefined && (
            <Text style={[styles.reversibleText, { color: riskCfg.color }]}>
              {analysis.is_reversible ? '🔄 Potentially Reversible' : '⏸️ May Not Be Fully Reversible'}
            </Text>
          )}
        </View>

        {/* ── Primary Causes ── */}
        {analysis.primary_causes && analysis.primary_causes.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>⚠️</Text>
              <Text style={styles.sectionTitle}>Primary Causes</Text>
            </View>
            {analysis.primary_causes.map((cause, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.listBullet}>⚡</Text>
                <Text style={styles.listText}>{cause}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Contributing Factors ── */}
        {analysis.contributing_factors && analysis.contributing_factors.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>ℹ️</Text>
              <Text style={styles.sectionTitle}>Contributing Factors</Text>
            </View>
            {analysis.contributing_factors.map((factor, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listText}>{factor}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Recommendations (grouped by category) ── */}
        {Object.keys(recsByCategory).length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>💡</Text>
              <Text style={styles.sectionTitle}>Recommendations</Text>
            </View>
            {Object.entries(recsByCategory).map(([category, actions]) => (
              <View key={category} style={styles.recCategoryCard}>
                <View style={styles.recCategoryHeader}>
                  <Text style={styles.recCategoryIcon}>{getCategoryIcon(category)}</Text>
                  <Text style={styles.recCategoryTitle}>{category}</Text>
                </View>
                {actions.map((action, i) => (
                  <View key={i} style={styles.recActionItem}>
                    <Text style={styles.recActionBullet}>→</Text>
                    <Text style={styles.recActionText}>{action}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ── Prognosis ── */}
        {analysis.prognosis && (
          <View style={styles.prognosisCard}>
            <Text style={styles.prognosisLabel}>📊 Prognosis</Text>
            <Text style={styles.prognosisText}>{analysis.prognosis}</Text>
          </View>
        )}

        {/* ── See a Doctor Banner ── */}
        {analysis.should_see_doctor && (
          <View style={styles.doctorBanner}>
            <Text style={styles.doctorTitle}>🩺 Professional Consultation Recommended</Text>
            {analysis.doctor_reason ? (
              <Text style={styles.doctorReason}>{analysis.doctor_reason}</Text>
            ) : null}
          </View>
        )}

        {/* ── Download Report Button ── */}
        <TouchableOpacity style={styles.downloadButton} onPress={handleDownloadReport} activeOpacity={0.8}>
          <Text style={styles.downloadButtonText}>
            📥 Export as PDF
          </Text>
        </TouchableOpacity>

        {/* ── Analyse in 3D Button ── */}
        {onOpen3D && (
          <TouchableOpacity style={styles.threeDButton} onPress={onOpen3D} activeOpacity={0.8}>
            <Text style={styles.threeDButtonText}>🧠 Analyse in 3D</Text>
          </TouchableOpacity>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Styles — Light Theme
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },

  // Back Button
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#ECEEF5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  backButtonText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },

  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 16,
  },
  headerTitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  stageName: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  confidenceBadge: {
    backgroundColor: COLORS.accentDim,
    borderColor: '#D0D5F6',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  confidenceText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
  },

  // Risk Badge
  riskBadge: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  riskText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reversibleText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    opacity: 0.85,
  },

  // Section Cards
  sectionCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF5',
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // List Items
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingLeft: 4,
  },
  listBullet: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginRight: 10,
    marginTop: 1,
  },
  listText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    flex: 1,
  },

  // Recommendation Cards
  recCategoryCard: {
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECEEF5',
  },
  recCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  recCategoryIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  recCategoryTitle: {
    color: COLORS.teal,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  recActionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 8,
  },
  recActionBullet: {
    color: COLORS.teal,
    fontSize: 13,
    marginRight: 8,
    marginTop: 1,
  },
  recActionText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    flex: 1,
  },

  // Prognosis
  prognosisCard: {
    backgroundColor: COLORS.accentDim,
    borderColor: '#D0D5F6',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  prognosisLabel: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  prognosisText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // Doctor Banner
  doctorBanner: {
    backgroundColor: COLORS.doctorBg,
    borderColor: COLORS.doctorBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  doctorTitle: {
    color: COLORS.red,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  doctorReason: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    opacity: 0.9,
  },

  // Download Report Button
  downloadButton: {
    backgroundColor: '#0D9B72',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#0D9B72',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // 3D Button
  threeDButton: {
    backgroundColor: '#5B6AD0',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#5B6AD0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  threeDButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
