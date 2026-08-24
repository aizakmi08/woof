import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { AppText as Text } from "../components/AppText";
import { useTheme, Spacing } from "../theme";
import { ONBOARDING_KEY } from "./OnboardingScreen";
import {
  DEV_QA_HUMAN_RESULTS,
  DEV_QA_PARTIAL_RESULT,
  DEV_QA_PET_AVOID_PROFILE,
  DEV_QA_PET_RESULT,
} from "../services/devQaFixtures";
import { getPerformanceTimingSnapshot } from "../services/performanceTimings";

const LABEL_LOADING_STAGES = [
  "Reading product label...",
  "Matching exact product...",
  "Checking brand and recipe...",
  "Finishing verification...",
  "Checking exact package details...",
  "Trying the recognized product name...",
  "Still matching — you can search by name instead.",
];

const RESULT_LOADING_STAGES = [
  "Reading exact ingredients...",
  "Checking ingredient roles...",
  "Calculating the quality score...",
  "Checking your pet profile...",
  "Preparing the verified breakdown...",
];
let devBoundaryErrorArmed = false;

function QaButton({ label, onPress, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.card,
          borderColor: theme.separator,
          opacity: pressed ? 0.65 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.buttonText, { color: theme.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function QaSection({ title, children, theme }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      <View style={styles.buttonGrid}>{children}</View>
    </View>
  );
}

export default function DevQAScreen({ navigation }) {
  const theme = useTheme();
  const [triggerError, setTriggerError] = useState(false);
  const [timings, setTimings] = useState(() => getPerformanceTimingSnapshot());
  if (!__DEV__) return null;
  if (triggerError && devBoundaryErrorArmed) {
    devBoundaryErrorArmed = false;
    throw new Error("Development QA ErrorBoundary fixture");
  }

  const openPetResult = (params = {}) => navigation.push("Results", {
    mode: "catalog",
    devFixtureResult: DEV_QA_PET_RESULT,
    devReturnToQa: true,
    ...params,
  });

  const openHumanResult = (state) => navigation.push("Results", {
    mode: "human_food",
    petType: "dog",
    petName: "Rex",
    devFixtureResult: DEV_QA_HUMAN_RESULTS[state],
    devReturnToQa: true,
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { borderBottomColor: theme.separator }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Development QA</Text>
          <Text style={[styles.subtitle, { color: theme.textTertiary }]}>Fixtures never ship as catalog evidence</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <QaSection title="Measured performance" theme={theme}>
          <Text style={[styles.metricText, { color: theme.textSecondary }]}>JS boot → interactive: {timings.coldStartInteractiveMs ?? "not captured"} ms</Text>
          <Text style={[styles.metricText, { color: theme.textSecondary }]}>Tap → camera: {timings.tapToCameraMs ?? "not captured"} ms</Text>
          <Text style={[styles.metricText, { color: theme.textSecondary }]}>Capture → result: {timings.captureToResultMs ?? "not captured"} ms</Text>
          <QaButton label="Refresh measured timings" theme={theme} onPress={() => setTimings(getPerformanceTimingSnapshot())} />
        </QaSection>
        <QaSection title="Onboarding & home" theme={theme}>
          <QaButton label="Reset onboarding for next launch" theme={theme} onPress={async () => {
            await AsyncStorage.removeItem(ONBOARDING_KEY);
            Alert.alert("Onboarding reset", "Stop and relaunch the app to test cold onboarding.");
          }} />
          <QaButton label="Home — empty" theme={theme} onPress={() => navigation.navigate("Home", { devHistoryFixture: "empty" })} />
          <QaButton label="Home — populated" theme={theme} onPress={() => navigation.navigate("Home", { devHistoryFixture: "populated" })} />
        </QaSection>

        <QaSection title="Scanner modes" theme={theme}>
          <QaButton label="Front label scanner" theme={theme} onPress={() => navigation.navigate("Scanner", { mode: "label_lookup" })} />
          <QaButton label="Ingredient scanner" theme={theme} onPress={() => navigation.navigate("Scanner", { mode: "ingredient_capture" })} />
          <QaButton label="Human-food scanner" theme={theme} onPress={() => navigation.navigate("Scanner", { mode: "human_food", petType: "dog", petName: "Rex" })} />
          <QaButton label="Barcode fallback scanner" theme={theme} onPress={() => navigation.navigate("Scanner", { fallbackToPhoto: true, failedBarcode: "000000000000", fallbackMessage: "Barcode not in the verified catalog — capture the front label instead" })} />
        </QaSection>

        <QaSection title="Label & typed search" theme={theme}>
          <QaButton label="Exact match auto-open" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "exact_auto_open" })} />
          <QaButton label="Multiple package candidates" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "multi_candidate" })} />
          <QaButton label="Label not readable" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "not_readable" })} />
          <QaButton label="Label timeout" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "label_timeout" })} />
          {LABEL_LOADING_STAGES.map((message, index) => (
            <QaButton
              key={message}
              label={`Label loading ${index + 1}`}
              theme={theme}
              onPress={() => navigation.navigate("ProductSearch", {
                devFixture: "label_loading",
                devLoadingMessage: message,
              })}
            />
          ))}
          <QaButton label="Typed results" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "typed_results" })} />
          <QaButton label="Typed typo correction" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "typed_typo" })} />
          <QaButton label="Typed empty" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "typed_empty" })} />
          <QaButton label="Typed timeout + Retry" theme={theme} onPress={() => navigation.navigate("ProductSearch", { devFixture: "typed_timeout" })} />
        </QaSection>

        <QaSection title="Results" theme={theme}>
          <QaButton label="Pet result — free" theme={theme} onPress={() => openPetResult()} />
          <QaButton label="Pet result — AVOID for Rex" theme={theme} onPress={() => openPetResult({ devPetProfile: DEV_QA_PET_AVOID_PROFILE })} />
          <QaButton label="Pet result — Pro" theme={theme} onPress={() => openPetResult({ devFixtureIsPro: true })} />
          <QaButton label="Pet result — streaming" theme={theme} onPress={() => navigation.push("Results", {
            mode: "catalog",
            devFixtureResult: DEV_QA_PARTIAL_RESULT,
            devFixtureHoldStreaming: true,
            devReturnToQa: true,
          })} />
          {RESULT_LOADING_STAGES.map((message, index) => (
            <QaButton
              key={message}
              label={`Results loading ${index + 1}`}
              theme={theme}
              onPress={() => navigation.push("Results", {
                mode: "catalog",
                devFixtureLoadingStatus: message,
              })}
            />
          ))}
          <QaButton label="Human food — safe" theme={theme} onPress={() => openHumanResult("safe")} />
          <QaButton label="Human food — caution" theme={theme} onPress={() => openHumanResult("caution")} />
          <QaButton label="Human food — dangerous" theme={theme} onPress={() => openHumanResult("dangerous")} />
          <QaButton label="Human food — unidentified" theme={theme} onPress={() => openHumanResult("unidentified")} />
          <QaButton label="Analysis error" theme={theme} onPress={() => navigation.push("Results", { mode: "photo", devFixtureError: "The analysis service could not finish. Check your connection and try again.", devReturnToQa: true })} />
          <QaButton label="Unrestorable history" theme={theme} onPress={() => navigation.push("Results", { mode: "history", cacheKey: "dev-missing-history", historyProductName: "QA Missing Saved Product", devReturnToQa: true })} />
        </QaSection>

        <QaSection title="Prompts" theme={theme}>
          <QaButton label="First-scan toast" theme={theme} onPress={() => openPetResult({ devPrompt: "first_scan" })} />
          <QaButton label="Guest-save card" theme={theme} onPress={() => openPetResult({ devPrompt: "guest_save" })} />
          <QaButton label="Review card" theme={theme} onPress={() => openPetResult({ devPrompt: "review" })} />
          <QaButton label="Post-scan card" theme={theme} onPress={() => openPetResult({ devPrompt: "post_scan" })} />
        </QaSection>

        <QaSection title="Paywall, profile & recovery" theme={theme}>
          <QaButton label="Paywall — results gate" theme={theme} onPress={() => navigation.navigate("Paywall", { source: "results_gate", productName: DEV_QA_PET_RESULT.productName, score: 82 })} />
          <QaButton label="Paywall — offerings failure" theme={theme} onPress={() => navigation.navigate("Paywall", { source: "profile", devForceOfferingsError: true })} />
          <QaButton label="Profile" theme={theme} onPress={() => navigation.navigate("Profile")} />
          <QaButton label="Trigger ErrorBoundary" theme={theme} onPress={() => {
            devBoundaryErrorArmed = true;
            setTriggerError(true);
          }} />
        </QaSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Spacing.screenPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  content: { padding: Spacing.screenPadding, paddingBottom: 48, gap: 28 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0 },
  metricText: { fontSize: 13, lineHeight: 18 },
  buttonGrid: { gap: 8 },
  button: {
    minHeight: 46,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: { fontSize: 14, fontWeight: "600" },
});
