import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { ChevronLeft } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme, Spacing, Typography } from "../theme";

export default function WebViewScreen({ navigation, route }) {
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
        source={source}
        style={{ flex: 1, backgroundColor: theme.bg }}
        showsVerticalScrollIndicator={false}
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
});
