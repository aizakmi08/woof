import { useRef } from "react";
import { ActivityIndicator, View, Pressable, StyleSheet } from "react-native";
import { AppText as Text } from "../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { AlertCircle, ChevronLeft, RefreshCw } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme, Spacing, Typography } from "../theme";

export default function WebViewScreen({ navigation, route }) {
  const webViewRef = useRef(null);
  const theme = useTheme();
  const { title, html, url } = route.params || {};

  const source = url ? { uri: url } : { html, baseUrl: "" };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            navigation.goBack();
          }}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <ChevronLeft size={28} color={theme.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: theme.textPrimary }]}
          numberOfLines={1}
        >
          {title || ""}
        </Text>
        <View style={{ width: 28 }} />
      </View>
      <WebView
        ref={webViewRef}
        source={source}
        style={{ flex: 1, backgroundColor: theme.bg }}
        showsVerticalScrollIndicator={false}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.stateContainer, { backgroundColor: theme.bg }]}>
            <ActivityIndicator size="small" color={theme.textPrimary} />
            <Text style={[styles.stateBody, { color: theme.textSecondary }]}>
              Loading {title || "page"}...
            </Text>
          </View>
        )}
        renderError={() => (
          <View style={[styles.stateContainer, { backgroundColor: theme.bg }]}>
            <AlertCircle size={30} color={theme.textTertiary} strokeWidth={1.8} />
            <Text style={[styles.stateTitle, { color: theme.textPrimary }]}>Page unavailable</Text>
            <Text style={[styles.stateBody, { color: theme.textSecondary }]}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => webViewRef.current?.reload()}
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: theme.textPrimary, opacity: pressed ? 0.75 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Try loading this page again"
            >
              <RefreshCw size={17} color={theme.bg} strokeWidth={2.2} />
              <Text style={[styles.retryText, { color: theme.bg }]}>Try Again</Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 12,
  },
  headerTitle: {
    ...Typography.cardTitle,
    flex: 1,
    textAlign: "center",
  },
  stateContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.screenPadding * 2,
    gap: Spacing.md,
  },
  stateTitle: {
    ...Typography.cardTitle,
    textAlign: "center",
  },
  stateBody: {
    ...Typography.bodySecondary,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 46,
    paddingHorizontal: Spacing.xl,
    borderRadius: Spacing.radiusSm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  retryText: {
    ...Typography.button,
    fontSize: 15,
  },
});
