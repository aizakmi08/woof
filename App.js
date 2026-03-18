import { useEffect, useState, useCallback, Component } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, Colors, Spacing } from "./theme";
import { AuthProvider, useAuth } from "./services/auth";

import OnboardingScreen, { ONBOARDING_KEY } from "./screens/OnboardingScreen";
import AuthScreen from "./screens/AuthScreen";
import HomeScreen from "./screens/HomeScreen";
import ScannerScreen from "./screens/ScannerScreen";
import ResultsScreen from "./screens/ResultsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import PaywallScreen from "./screens/PaywallScreen";
import WebViewScreen from "./screens/WebViewScreen";

class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.log("[APP] ErrorBoundary caught:", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.bg, padding: 40 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.textPrimary, marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 15, color: Colors.textSecondary, textAlign: "center", marginBottom: 32, lineHeight: 22 }}>
            The app ran into an unexpected error. Please restart to continue.
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false })}
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
            <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.bg }}>
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

function AppNavigator() {
  const theme = useTheme();
  const { user, loading } = useAuth();

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
          name="Paywall"
          component={PaywallScreen}
          options={{ presentation: "modal", gestureEnabled: true }}
        />
        <Stack.Screen name="WebView" component={WebViewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const theme = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      setShowOnboarding(value !== "true");
      setIsReady(true);
    });
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  // Blank screen while checking AsyncStorage (< 1 frame)
  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  if (showOnboarding) {
    return (
      <SafeAreaProvider>
        <StatusBar style={theme.statusBar} />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </SafeAreaProvider>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
