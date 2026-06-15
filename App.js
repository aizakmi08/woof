import "./services/productionLogs";
import { useEffect, useState, useCallback, Component } from "react";
import { View, Text, Pressable, DeviceEventEmitter } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, ThemeProvider, Colors, Spacing } from "./theme";
import { AuthProvider, useAuth } from "./services/auth";
import { NetworkProvider, useNetwork } from "./services/network";
import { trackError } from "./services/analytics";

import OnboardingScreen, { ONBOARDING_KEY } from "./screens/OnboardingScreen";
import AuthScreen from "./screens/AuthScreen";
import HomeScreen from "./screens/HomeScreen";
import ScannerScreen from "./screens/ScannerScreen";
import ResultsScreen from "./screens/ResultsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import PaywallScreen from "./screens/PaywallScreen";
import WebViewScreen from "./screens/WebViewScreen";
import IngredientCaptureScreen from "./screens/IngredientCaptureScreen";

class ErrorBoundary extends Component {
  state = { hasError: false, errorMessage: null, retryCount: 0 };

  static getDerivedStateFromError(err) {
    return { hasError: true, errorMessage: err?.message || "Unknown error" };
  }

  componentDidCatch(error, info) {
    console.log("[APP] ErrorBoundary caught:", error.message, info.componentStack);
    trackError("root_error_boundary", error, {
      hasComponentStack: Boolean(info?.componentStack),
    });
  }

  handleRetry = () => {
    // After 2 failed retries, wipe non-critical preferences so the user can
    // recover from corrupted local state without losing completed onboarding.
    if (this.state.retryCount >= 1) {
      Promise.all([
        AsyncStorage.removeItem("@woof_theme_preference").catch(() => {}),
      ]).finally(() => {
        this.setState({ hasError: false, errorMessage: null, retryCount: 0 });
      });
    } else {
      this.setState((s) => ({ hasError: false, errorMessage: null, retryCount: s.retryCount + 1 }));
    }
  };

  render() {
    if (this.state.hasError) {
      const willResetState = this.state.retryCount >= 1;
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 40 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.textPrimary, marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 15, color: Colors.textSecondary, textAlign: "center", marginBottom: 8, lineHeight: 22 }}>
            The app ran into an unexpected error.
          </Text>
          {this.state.errorMessage ? (
            <Text style={{ fontSize: 12, color: Colors.textTertiary, textAlign: "center", marginBottom: 24, fontFamily: "monospace" }} numberOfLines={3}>
              {this.state.errorMessage}
            </Text>
          ) : null}
          <Pressable
            onPress={this.handleRetry}
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
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.buttonText }}>
              {willResetState ? "Reset App" : "Try Again"}
            </Text>
          </Pressable>
          {willResetState ? (
            <Text style={{ fontSize: 12, color: Colors.textTertiary, marginTop: 12 }}>
              Resets local preferences
            </Text>
          ) : null}
        </View>
      );
    }
    return this.props.children;
  }
}

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const theme = useTheme();
  const { loading } = useAuth();

  // Show blank screen while checking auth
  if (loading) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  // Always show main app — guest users can scan without signing in
  return (
    <NavigationContainer>
      <StatusBar style={theme.statusBar} />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ title: "Woof Scanner" }}
        />
        <Stack.Screen name="Results" component={ResultsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{
            presentation: "modal",
            gestureEnabled: true,
            contentStyle: { backgroundColor: theme.bg },
          }}
        />
        <Stack.Screen
          name="Paywall"
          component={PaywallScreen}
          options={{
            presentation: "modal",
            gestureEnabled: true,
            contentStyle: { backgroundColor: theme.bg },
          }}
        />
        <Stack.Screen name="WebView" component={WebViewScreen} />
        <Stack.Screen name="IngredientCapture" component={IngredientCaptureScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const theme = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Race AsyncStorage against a 2s timeout — if disk is wedged, default to
    // "skip onboarding" so the app launches anyway rather than freezing on splash.
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.log("[APP] AsyncStorage onboarding read timed out — proceeding without");
      setShowOnboarding(false);
      setIsReady(true);
    }, 2000);
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        setShowOnboarding(value !== "true");
        setIsReady(true);
      })
      .catch(() => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        setShowOnboarding(false);
        setIsReady(true);
      });
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  // Allow other screens (Profile → "Replay Onboarding") to re-show the flow
  // without needing to relaunch the app.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("@woof/replay-onboarding", () => {
      setShowOnboarding(true);
    });
    return () => sub.remove();
  }, []);

  // Blank screen while checking AsyncStorage (< 1 frame)
  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <ThemeProvider>
          <SafeAreaProvider>
            <StatusBar style={theme.statusBar} />
            <OnboardingScreen onComplete={handleOnboardingComplete} />
          </SafeAreaProvider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider>
          <NetworkProvider>
            <AuthProvider>
              <AppNavigator />
              <OfflineBanner />
            </AuthProvider>
          </NetworkProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// Tiny status pill that slides in from the bottom when the app loses network.
// Sits at the root so it's visible from any screen.
function OfflineBanner() {
  const { isOnline } = useNetwork();
  const theme = useTheme();
  if (isOnline) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 32,
        left: 16,
        right: 16,
        backgroundColor: "#1C1A17",
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF453A" }} />
      <Text style={{ color: "#F6F3ED", fontSize: 14, fontWeight: "600", flex: 1 }}>
        No internet connection
      </Text>
      <Text style={{ color: "rgba(246,243,237,0.6)", fontSize: 12, fontWeight: "500" }}>
        Reconnecting…
      </Text>
    </View>
  );
}
