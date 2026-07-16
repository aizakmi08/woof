import { useEffect, useState, useCallback, Component } from "react";
import { View, Pressable } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import * as Sentry from "@sentry/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, Colors, Spacing } from "./theme";
import { AuthProvider, useAuth } from "./services/auth";
import { createLogger } from "./services/logger";
import { installGlobalErrorHandlers, trackAppError } from "./services/errorReporting";
import { SENTRY_DSN } from "./config/env";
import { AppText as Text } from "./components/AppText";

import OnboardingScreen, { ONBOARDING_KEY } from "./screens/OnboardingScreen";
import AuthScreen from "./screens/AuthScreen";
import HomeScreen from "./screens/HomeScreen";
import ProductSearchScreen from "./screens/ProductSearchScreen";
import ScannerScreen from "./screens/ScannerScreen";
import ResultsScreen from "./screens/ResultsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import PaywallScreen from "./screens/PaywallScreen";
import WebViewScreen from "./screens/WebViewScreen";

const logger = createLogger("APP");
const expoConfig = Constants.expoConfig || {};
const appVersion = expoConfig.version || Constants.nativeAppVersion || "unknown";
const nativeBuildVersion = Constants.nativeBuildVersion || "unknown";
const sentryEnabled = typeof SENTRY_DSN === "string" && /^https?:\/\//i.test(SENTRY_DSN);

function redactDiagnosticString(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/file:\/\/\S+/gi, "[file]")
    .replace(/\b(?:\/(?:private\/)?var|\/tmp|\/Users|\/data\/user|\/storage\/emulated|[A-Z]:\\)[^\s)]+/gi, "[file]")
    .replace(/(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/\b(?:sk-ant|sk-proj|sk|rk_live|rk_test|appl|goog)[-_][A-Za-z0-9_-]{16,}\b/g, "[secret]")
    .replace(/\b[A-Za-z0-9+/=]{80,}\b/g, "[redacted]");
}

function scrubDiagnosticValue(value, depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactDiagnosticString(value);
  if (Array.isArray(value)) {
    return depth > 4 ? "[redacted]" : value.map((item) => scrubDiagnosticValue(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth > 4) return "[redacted]";
    return Object.entries(value).reduce((acc, [key, item]) => {
      acc[key] = scrubDiagnosticValue(item, depth + 1);
      return acc;
    }, {});
  }
  return redactDiagnosticString(value);
}

function beforeSendSentryEvent(event) {
  const scrubbed = scrubDiagnosticValue(event);
  if (scrubbed?.user) {
    delete scrubbed.user.email;
    delete scrubbed.user.ip_address;
    delete scrubbed.user.username;
  }
  delete scrubbed?.request;
  return scrubbed;
}

Sentry.init({
  dsn: sentryEnabled ? SENTRY_DSN : undefined,
  enabled: sentryEnabled,
  environment: __DEV__ ? "development" : (Constants.executionEnvironment || "production"),
  release: `woof@${appVersion}`,
  dist: nativeBuildVersion,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: beforeSendSentryEvent,
});

const sentryScope = Sentry.getGlobalScope?.();
sentryScope?.setTag("app.version", appVersion);
sentryScope?.setTag("app.native_build_version", nativeBuildVersion);
sentryScope?.setTag("expo.execution_environment", Constants.executionEnvironment || "unknown");
sentryScope?.setTag("expo.update_id", Updates.updateId || "embedded");
sentryScope?.setTag("expo.is_embedded_update", Updates.isEmbeddedLaunch ? "true" : "false");

const updatesManifest = Updates.manifest || {};
const updatesMetadata = updatesManifest && "metadata" in updatesManifest ? updatesManifest.metadata : null;
const updateGroup = updatesMetadata && typeof updatesMetadata.updateGroup === "string"
  ? updatesMetadata.updateGroup
  : null;
if (updateGroup) {
  sentryScope?.setTag("expo.update_group_id", updateGroup);
}

class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logger.debug("[APP] ErrorBoundary caught:", error.message, info.componentStack);
    trackAppError(error, {
      source: "error_boundary",
      fatal: true,
      component_stack_available: Boolean(info?.componentStack),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 40 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.textPrimary, marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 15, color: Colors.textSecondary, textAlign: "center", marginBottom: 32, lineHeight: 22 }}>
            The app ran into an unexpected error. Please restart to continue.
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false })}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            accessibilityHint="Attempts to recover from the error"
            style={({ pressed }) => ({
              height: Spacing.buttonHeight,
              paddingHorizontal: 32,
              borderRadius: Spacing.buttonRadius,
              backgroundColor: Colors.textPrimary,
              justifyContent: "center",
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.background }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const Stack = createNativeStackNavigator();
const DEV_PAYWALL_PREVIEW_SOURCES = new Set([
  "results_gate",
  "scan_limit",
  "post_scan_prompt",
  "home_banner",
  "profile",
]);
const DEV_PAYWALL_PREVIEW_NAVIGATION = {
  addListener: () => () => {},
  goBack: () => {},
  navigate: () => {},
};

function getDevPaywallPreviewSource() {
  if (!__DEV__ || typeof window === "undefined") return null;
  const search = typeof window.location?.search === "string"
    ? window.location.search
    : "";
  if (!search) return null;

  const params = new URLSearchParams(search);
  const requested = params.get("woof_paywall_preview");
  if (!requested) return null;
  return DEV_PAYWALL_PREVIEW_SOURCES.has(requested) ? requested : "profile";
}

function AppNavigator({ initialRouteName = "Home", onInitialRouteConsumed, devPaywallPreviewSource = null }) {
  const theme = useTheme();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && initialRouteName !== "Home") {
      onInitialRouteConsumed?.();
    }
  }, [loading, user, initialRouteName, onInitialRouteConsumed]);

  if (devPaywallPreviewSource) {
    return (
      <>
        <StatusBar style={theme.statusBar} />
        <PaywallScreen
          route={{
            params: {
              source: devPaywallPreviewSource,
              productName: "Preview Chicken Kibble",
              score: 82,
            },
          }}
          navigation={DEV_PAYWALL_PREVIEW_NAVIGATION}
        />
      </>
    );
  }

  // Show blank screen while checking auth
  if (loading) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  // Not authenticated — show auth screen
  if (!user) {
    return (
      <>
        <StatusBar style={theme.statusBar} />
        <AuthScreen />
      </>
    );
  }

  // Authenticated — show main app
  return (
    <NavigationContainer>
      <StatusBar style={theme.statusBar} />
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="ProductSearch" component={ProductSearchScreen} />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ title: "Woof Scanner" }}
        />
        <Stack.Screen name="Results" component={ResultsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen
          name="Paywall"
          component={PaywallScreen}
          options={{
            presentation: "modal",
            gestureEnabled: true,
            contentStyle: { backgroundColor: "#FAFAFA" },
          }}
        />
        <Stack.Screen name="WebView" component={WebViewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function App() {
  const theme = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState("Home");
  const devPaywallPreviewSource = getDevPaywallPreviewSource();

  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => {
        setShowOnboarding(value !== "true");
        setIsReady(true);
      })
      .catch((error) => {
        trackAppError(error, {
          source: "app_boot_onboarding_state",
          fatal: false,
        });
        setShowOnboarding(true);
        setIsReady(true);
      });
  }, []);

  const handleOnboardingComplete = useCallback(({ nextRoute = "Home" } = {}) => {
    setInitialRouteName(nextRoute);
    setShowOnboarding(false);
  }, []);

  const handleInitialRouteConsumed = useCallback(() => {
    setInitialRouteName("Home");
  }, []);

  // Blank screen while checking AsyncStorage (< 1 frame)
  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider skipAutomaticGuestSession={Boolean(devPaywallPreviewSource)}>
          {showOnboarding && !devPaywallPreviewSource ? (
            <>
              <StatusBar style={theme.statusBar} />
              <OnboardingScreen onComplete={handleOnboardingComplete} />
            </>
          ) : (
            <AppNavigator
              initialRouteName={initialRouteName}
              onInitialRouteConsumed={handleInitialRouteConsumed}
              devPaywallPreviewSource={devPaywallPreviewSource}
            />
          )}
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);
