import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Survey Configuration ───────────────────────────────────────
const QUESTIONS = [
  // Section 1: Basics & Heritage
  { id: 'age', section: 'Basics & Heritage', text: 'What is your current age?', type: 'number', min: 18, max: 80, step: 1, default: 25 },
  { id: 'family_history', section: 'Basics & Heritage', text: 'Do any close male relatives have hair loss?', type: 'single', options: [{label: "Mother's side", value: 'mothers'}, {label: "Father's side", value: 'fathers'}, {label: 'Both', value: 'both'}, {label: 'Neither', value: 'neither'}] },
  { id: 'when_started', section: 'Basics & Heritage', text: 'How long ago did you notice thinning?', type: 'single', options: [{label: '< 6 months', value: '<6mo'}, {label: '6-12 months', value: '6-12mo'}, {label: '1-2 years', value: '1-2yrs'}, {label: '2+ years', value: '2yrs+'}] },
  { id: 'loss_speed', section: 'Basics & Heritage', text: 'Is the loss happening quickly or slowly?', type: 'single', options: [{label: 'Rapid', value: 'rapid'}, {label: 'Gradual', value: 'gradual'}, {label: 'Stable', value: 'stable'}] },

  // Section 2: Current Hair Status
  { id: 'main_area', section: 'Current Hair Status', text: 'Where is the thinning most visible?', type: 'single', options: [{label: 'Hairline', value: 'hairline'}, {label: 'Crown', value: 'crown'}, {label: 'All-over', value: 'all-over'}, {label: 'Patches', value: 'patches'}] },
  { id: 'daily_loss', section: 'Current Hair Status', text: 'How much hair do you lose daily?', type: 'single', options: [{label: '< 50 strands', value: '<50'}, {label: '50-100 strands', value: '50-100'}, {label: '100-200 strands', value: '100-200'}, {label: '200+ strands', value: '200+'}] },
  { id: 'scalp_feel', section: 'Current Hair Status', text: 'Do you experience any scalp irritation? (Select all that apply)', type: 'multi', options: [{label: 'Itchy', value: 'itchy'}, {label: 'Burning', value: 'burning'}, {label: 'Redness', value: 'red'}, {label: 'Dandruff', value: 'dandruff'}, {label: 'None', value: 'none'}] },
  { id: 'body_hair', section: 'Current Hair Status', text: 'Have you noticed changes in body hair?', type: 'single', options: [{label: 'More', value: 'more'}, {label: 'Less', value: 'less'}, {label: 'No change', value: 'no_change'}] },

  // Section 3: Health & Medical
  { id: 'conditions', section: 'Health & Medical', text: 'Have you been diagnosed with: (Select all that apply)', type: 'multi', options: [{label: 'Thyroid issue', value: 'thyroid'}, {label: 'Anemia', value: 'anemia'}, {label: 'Autoimmune', value: 'autoimmune'}, {label: 'Scalp infection', value: 'infection'}, {label: 'None', value: 'none'}] },
  { id: 'recent_illness', section: 'Health & Medical', text: 'Any severe illness or fever in the last 6 months?', type: 'single', options: [{label: 'Yes', value: true}, {label: 'No', value: false}] },
  { id: 'medications', section: 'Health & Medical', text: 'Are you taking long-term medications? (Select all that apply)', type: 'multi', options: [{label: 'Blood Thinners', value: 'blood_thinners'}, {label: 'Antidepressants', value: 'antidepressants'}, {label: 'Steroids', value: 'steroids'}, {label: 'None', value: 'none'}] },
  { id: 'sudden_weight_loss', section: 'Health & Medical', text: 'Have you had sudden weight loss (>5kg recently)?', type: 'single', options: [{label: 'Yes', value: true}, {label: 'No', value: false}] },

  // Section 4: Lifestyle Habits
  { id: 'stress_level', section: 'Lifestyle Habits', text: 'Rate your stress level over the last 6 months (1 is LOW, 10 is HIGH)', type: 'number', min: 1, max: 10, step: 1, default: 5 },
  { id: 'sleep', section: 'Lifestyle Habits', text: 'Average hours of sleep per night?', type: 'single', options: [{label: '< 5 hrs', value: '<5hrs'}, {label: '5-7 hrs', value: '5-7hrs'}, {label: '7-9 hrs', value: '7-9hrs'}] },
  { id: 'smoking', section: 'Lifestyle Habits', text: 'Do you smoke?', type: 'single', options: [{label: 'Never', value: 'never'}, {label: 'Occasional', value: 'occasional'}, {label: 'Regular', value: 'regular'}] },
  { id: 'alcohol', section: 'Lifestyle Habits', text: 'Do you drink alcohol?', type: 'single', options: [{label: 'Never', value: 'never'}, {label: 'Occasionally', value: 'occasionally'}, {label: 'Regularly', value: 'regularly'}] },
  { id: 'work_environment', section: 'Lifestyle Habits', text: 'What is your primary work environment?', type: 'single', options: [{label: 'High Pollution', value: 'pollution'}, {label: 'Chemicals', value: 'chemicals'}, {label: 'Outdoor / Sun', value: 'outdoor'}, {label: 'Indoor', value: 'indoor'}] },

  // Section 5: Diet & Nutrition
  { id: 'diet', section: 'Diet & Nutrition', text: 'What is your primary diet type?', type: 'single', options: [{label: 'Balanced / Omnivore', value: 'balanced'}, {label: 'Vegetarian / Vegan', value: 'vegetarian'}, {label: 'High Protein', value: 'high_protein'}, {label: 'Keto', value: 'keto'}, {label: 'Fasting', value: 'fasting'}] },
  { id: 'water_intake', section: 'Diet & Nutrition', text: 'Daily water intake?', type: 'single', options: [{label: '< 1 Litre', value: '<1L'}, {label: '1-2 Litres', value: '1-2L'}, {label: '2-3 Litres', value: '2-3L'}, {label: '3+ Litres', value: '3L+'}] },
  { id: 'supplements', section: 'Diet & Nutrition', text: 'Are you taking any supplements? (Select all that apply)', type: 'multi', options: [{label: 'Biotin', value: 'biotin'}, {label: 'Iron', value: 'iron'}, {label: 'Vitamin D', value: 'vitd'}, {label: 'Zinc', value: 'zinc'}, {label: 'Multivitamin', value: 'multi'}, {label: 'None', value: 'none'}] },

  // Section 6: Hair Care Routine
  { id: 'chemical_treatments', section: 'Hair Care Routine', text: 'How often do you bleach, dye, or perm your hair?', type: 'single', options: [{label: 'Multiple times a year', value: 'monthly'}, {label: 'Rarely', value: 'rarely'}, {label: 'Never', value: 'never'}] },
  { id: 'heat_styling', section: 'Hair Care Routine', text: 'How often do you use hot tools (dryer, iron)?', type: 'single', options: [{label: 'Daily', value: 'daily'}, {label: 'Weekly', value: 'weekly'}, {label: 'Never', value: 'never'}] },
  { id: 'tight_styles', section: 'Hair Care Routine', text: 'Do you frequently wear tight styles (hats, tight braids)?', type: 'single', options: [{label: 'Yes', value: true}, {label: 'No', value: false}] },
  { id: 'washing_frequency', section: 'Hair Care Routine', text: 'How often do you shampoo?', type: 'single', options: [{label: 'Daily', value: 'daily'}, {label: '2-3 times a week', value: '2-3x'}, {label: 'Once a week or less', value: 'once'}] },
];

export default function LifestyleForm({ onSubmit, onBack }) {
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState({});

  const question = QUESTIONS[activeStep];
  const isLastStep = activeStep === QUESTIONS.length - 1;

  // Initialize default states for numbers or arrays
  useEffect(() => {
    if (question.type === 'number' && answers[question.id] === undefined) {
      setAnswers((prev) => ({ ...prev, [question.id]: question.default }));
    } else if (question.type === 'multi' && answers[question.id] === undefined) {
      setAnswers((prev) => ({ ...prev, [question.id]: [] }));
    }
  }, [activeStep]);

  // ── Handlers ────────────────────────────────────────────────
  const handleNext = () => {
    if (isLastStep) {
      onSubmit(answers);
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    // Treat as "Not Provided" (null)
    setAnswers((prev) => ({ ...prev, [question.id]: null }));
    handleNext();
  };

  const setAnswer = (val) => {
    setAnswers((prev) => ({ ...prev, [question.id]: val }));
  };

  // ── Multi-select Logic ──────────────────────────────────────
  const toggleMultiSelect = (val) => {
    let current = answers[question.id] || [];
    if (val === 'none') {
      current = ['none'];
    } else {
      if (current.includes('none')) {
        current = current.filter((x) => x !== 'none');
      }
      if (current.includes(val)) {
        current = current.filter((x) => x !== val);
      } else {
        current.push(val);
      }
    }
    setAnswer(current);
  };

  // ── Rendering Answers ───────────────────────────────────────
  const renderOptions = () => {
    if (question.type === 'single') {
      return (
        <View style={styles.optionsContainer}>
          {question.options.map((opt, i) => {
            const isSelected = answers[question.id] === opt.value;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.optionBox, isSelected && styles.optionBoxSelected]}
                onPress={() => setAnswer(opt.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (question.type === 'multi') {
      return (
        <View style={styles.optionsContainer}>
          {question.options.map((opt, i) => {
            const current = answers[question.id] || [];
            const isSelected = current.includes(opt.value);
            return (
              <TouchableOpacity
                key={i}
                style={[styles.optionBox, isSelected && styles.optionBoxSelected]}
                onPress={() => toggleMultiSelect(opt.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                </View>
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (question.type === 'number') {
      const val = answers[question.id] || question.default;
      return (
        <View style={styles.numberContainer}>
          <TouchableOpacity
            style={styles.numberBtn}
            onPress={() => setAnswer(Math.max(question.min, val - question.step))}
          >
            <Text style={styles.numberBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.numberValue}>{val}</Text>
          <TouchableOpacity
            style={styles.numberBtn}
            onPress={() => setAnswer(Math.min(question.max, val + question.step))}
          >
            <Text style={styles.numberBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  // Check if answer is provided to enable "Next"
  const isAnswered = () => {
    const val = answers[question.id];
    if (question.type === 'multi') return val && val.length > 0;
    return val !== undefined && val !== null;
  };

  // Dots logic (24 dots is too much UI space, let's show an active section bar or text)
  // Instead, the user reference image has 4 dots. For 24 questions, a progress bar is much cleaner.
  const progress = ((activeStep + 1) / QUESTIONS.length) * 100;

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.5)" />

      <View style={styles.modalWrapper}>
        <View style={styles.card}>
          
          {/* Top Header inside card */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={onBack}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.progressText}>
              {activeStep + 1} of {QUESTIONS.length}
            </Text>
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Progress Line */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>

          {/* Scrollable Content (fixed height card) */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} bounces={false}>
            <Text style={styles.sectionText}>{question.section}</Text>
            <Text style={styles.questionText}>{question.text}</Text>
            {renderOptions()}
          </ScrollView>

          {/* Bottom Area (Button and Dots) */}
          <View style={styles.bottomBar}>

            <TouchableOpacity
              style={[styles.nextBtn, !isAnswered() && styles.nextBtnDisabled]}
              onPress={handleNext}
              disabled={!isAnswered()}
              activeOpacity={0.8}
            >
              <Text style={styles.nextBtnText}>
                {isLastStep ? 'Submit' : 'Next'}
              </Text>
            </TouchableOpacity>

            {/* Minimal Dots */}
            <View style={styles.dotsContainer}>
              {[...Array(6)].map((_, idx) => {
                const sectionIndex = Math.floor(activeStep / 4);
                return (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      sectionIndex === idx ? styles.dotActive : null,
                    ]}
                  />
                );
              })}
            </View>
          </View>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)', // Dim the background
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 450, // Keep card compact on large screens/web
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden', // clips the progress bar to border radius
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    width: '100%',
    height: 520,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  closeBtnText: {
    color: '#8B91A8',
    fontSize: 15,
    fontWeight: '600',
  },
  progressText: {
    color: '#1A1D2E',
    fontSize: 14,
    fontWeight: '700',
  },
  skipBtnText: {
    color: '#2196F3',
    fontSize: 15,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#E0E4F0',
    width: '100%',
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#2196F3', // Reference image has a vivid blue
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 10,
  },
  sectionText: {
    color: '#8B91A8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  questionText: {
    color: '#1A1D2E',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 20,
  },
  optionsContainer: {
    gap: 10,
  },
  optionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDE0EF',
    backgroundColor: '#FFFFFF',
  },
  optionBoxSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#F0F8FF', // subtle blue tint
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DDE0EF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioCircleSelected: {
    borderColor: '#2196F3',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2196F3',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#DDE0EF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#2196F3',
  },
  checkIcon: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  optionText: {
    color: '#3A3F56',
    fontSize: 15,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#2196F3',
    fontWeight: '700',
  },

  // Number input
  numberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  numberBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EEF0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBtnText: {
    color: '#2196F3',
    fontSize: 24,
    lineHeight: 28,
  },
  numberValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1A1D2E',
    marginHorizontal: 24,
  },

  // Bottom action area
  bottomBar: {
    paddingVertical: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F4F5F7',
  },
  nextBtn: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: 120,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  nextBtnDisabled: {
    backgroundColor: '#E0E4F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Decorative dots
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DDE0EF',
  },
  dotActive: {
    backgroundColor: '#2196F3',
  },
});
