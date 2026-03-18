import { StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme, Typography, Spacing, Shadows, Colors } from "../../theme";

export function createStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },

    // --- Header bar ---
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
      backgroundColor: theme.bg,
    },
    headerBorder: {
      borderBottomWidth: 0.5,
      borderBottomColor: Colors.divider,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    shareButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    headerCenter: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      paddingLeft: Spacing.sm,
    },
    miniScoreBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    miniScoreText: {
      color: "#FAFAFA",
      fontSize: 13,
      fontWeight: "700",
    },
    headerProductName: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: "600",
      flexShrink: 1,
    },

    // --- Scroll content ---
    scrollContent: {
      paddingHorizontal: Spacing.screenPadding,
      paddingBottom: 60,
      paddingTop: Spacing.sm,
    },

    // --- Loading / Streaming ---
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 80,
      padding: 32,
    },
    thumbnail: {
      width: 160,
      height: 160,
      borderRadius: Spacing.xl,
      marginBottom: 28,
    },
    barcodePlaceholder: {
      width: 160,
      height: 160,
      borderRadius: Spacing.xl,
      backgroundColor: theme.fill,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 28,
    },
    barcodeNumber: {
      color: theme.textSecondary,
      fontSize: Spacing.md,
      marginTop: Spacing.sm,
      fontFamily: "monospace",
    },
    loadingTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: "600",
    },
    streamingIndicator: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: Spacing.lg,
      gap: 10,
    },
    dotsRow: {
      flexDirection: "row",
      gap: 5,
    },
    streamDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: Colors.textPrimary,
    },

    // Product name preview (barcode loading)
    productNamePreview: {
      alignItems: "center",
      marginBottom: Spacing.lg,
    },
    previewName: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: Spacing.sm,
    },

    // Streaming footer
    streamingFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.sm,
      paddingVertical: Spacing.xl,
    },
    streamingFooterText: {
      color: theme.textTertiary,
      ...Typography.scoreLabel,
      fontWeight: "500",
    },

    // --- Error ---
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    errorCircle: {
      marginBottom: 20,
    },
    errorTitle: {
      color: theme.textPrimary,
      ...Typography.sectionHeader,
      marginBottom: Spacing.sm,
      textAlign: "center",
    },
    errorText: {
      color: theme.textSecondary,
      ...Typography.body,
      textAlign: "center",
      marginBottom: 28,
      lineHeight: 22,
      paddingHorizontal: 12,
    },
    retryButton: {
      backgroundColor: theme.buttonPrimary,
      paddingHorizontal: 36,
      paddingVertical: 14,
      borderRadius: Spacing.buttonRadius,
      minWidth: 180,
      alignItems: "center",
    },
    retryButtonText: {
      color: theme.buttonText,
      ...Typography.button,
    },

    // --- Data Source Badge ---
    badgeRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: Spacing.sm,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
      flexWrap: "wrap",
    },
    dataSourceBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: Spacing.radiusSm,
      gap: 6,
    },
    dataSourceDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    dataSourceText: {
      ...Typography.smallLabel,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    // --- Nutriscore / NOVA badges ---
    nutriscoreBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Spacing.radiusSm,
      gap: Spacing.xs,
    },
    nutriscoreLabel: {
      color: "#FAFAFA",
      ...Typography.smallLabel,
      fontWeight: "600",
    },
    nutriscoreLetter: {
      color: "#FAFAFA",
      ...Typography.scoreLabel,
      fontWeight: "800",
    },
    novaBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Spacing.radiusSm,
      borderWidth: 1.5,
      gap: Spacing.xs,
    },
    novaLabel: {
      color: theme.textSecondary,
      ...Typography.smallLabel,
      fontWeight: "600",
    },
    novaGroup: {
      ...Typography.scoreLabel,
      fontWeight: "800",
    },

    // --- Hero section ---
    heroSection: {
      alignItems: "center",
      marginTop: 28,
      marginBottom: 28,
    },
    heroRingContainer: {
      justifyContent: "center",
      alignItems: "center",
    },
    ringGlow: {
      position: "absolute",
      top: -40,
      left: -40,
      right: -40,
      bottom: -40,
      borderRadius: 999,
    },
    ringLabelContainer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
      paddingBottom: 4,
    },
    heroScoreNumber: {
      ...Typography.scoreLarge,
    },
    heroGradeLabel: {
      ...Typography.scoreLabel,
      marginTop: 4,
    },

    // --- Product name ---
    productName: {
      color: theme.textPrimary,
      fontSize: 22,
      fontWeight: "600",
      letterSpacing: -0.3,
      textAlign: "center",
      paddingHorizontal: 20,
      marginTop: 16,
    },

    // --- Quick Stats 2x2 Grid ---
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    statCell: {
      backgroundColor: Colors.surface,
      borderRadius: Spacing.cardRadius,
      paddingVertical: 14,
      paddingHorizontal: 14,
      alignItems: "center",
      flexBasis: "47%",
      flexGrow: 1,
    },
    statCellIcon: {
      marginBottom: 6,
    },
    statCellLabel: {
      ...Typography.statLabel,
      marginBottom: 4,
    },
    statCellValue: {
      ...Typography.statValue,
      fontSize: 15,
      textAlign: "center",
    },

    // --- Verdict card (colored left border) ---
    verdictCard: {
      backgroundColor: Colors.verdictBackground,
      borderRadius: Spacing.cardRadius,
      padding: Spacing.cardPadding,
      marginTop: Spacing.subsectionGap,
      borderLeftWidth: 3,
      overflow: "hidden",
    },
    verdictText: {
      color: theme.textPrimary,
      ...Typography.body,
      lineHeight: 24,
    },
    verdictMoreLink: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: "600",
      marginTop: 4,
    },

    // --- Section Card ---
    sectionCard: {
      backgroundColor: theme.card,
      borderRadius: Spacing.radius,
      padding: Spacing.cardPad,
      marginBottom: Spacing.section,
      ...Shadows.card,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
    },
    sectionAccent: {
      width: 2,
      height: 18,
      borderRadius: 1,
      marginRight: 10,
    },
    sectionTitle: {
      color: theme.textPrimary,
      ...Typography.cardTitle,
      fontWeight: "700",
      flex: 1,
    },

    // --- Collapsible Section ---
    collapsibleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    collapsibleHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },

    // --- Customer Reviews (card with accent border) ---
    reviewCard: {
      backgroundColor: theme.card,
      borderRadius: Spacing.cardRadius,
      padding: Spacing.cardPadding,
      marginTop: Spacing.sectionGap,
      borderLeftWidth: 3,
      ...Shadows.card,
    },
    reviewHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    reviewTitle: {
      ...Typography.cardTitle,
      color: theme.textPrimary,
    },
    reviewRatingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    reviewBigScore: {
      fontSize: 28,
      fontWeight: "800",
      color: theme.textPrimary,
    },
    reviewCountText: {
      ...Typography.caption,
      color: theme.textTertiary,
      marginTop: 4,
    },
    reviewSummary: {
      fontSize: 15,
      fontWeight: "400",
      color: theme.textSecondary,
      lineHeight: 22,
      marginTop: Spacing.elementGap,
    },
    reviewTagSection: {
      marginTop: Spacing.cardPadding,
    },
    reviewTagLabel: {
      fontSize: 13,
      fontWeight: "600",
      marginBottom: Spacing.sm,
    },
    reviewTagsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.sm,
    },
    reviewPill: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    reviewPillText: {
      fontSize: 13,
      fontWeight: "500",
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingLeft: 2,
      marginBottom: 7,
    },
    bulletIcon: {
      marginRight: Spacing.sm,
      marginTop: 3,
    },
    bulletText: {
      color: theme.textSecondary,
      ...Typography.scoreLabel,
      fontWeight: "400",
      lineHeight: 22,
      flex: 1,
    },

    // --- Quality Breakdown (flat, no card) ---
    qualitySection: {
      marginTop: Spacing.sectionGap,
    },
    qualityTitle: {
      ...Typography.sectionHeader,
      color: theme.textPrimary,
    },
    qualityHeaderDivider: {
      height: 0.5,
      backgroundColor: Colors.divider,
      marginTop: Spacing.elementGap,
      marginBottom: Spacing.cardPadding,
    },

    // --- Category Bar ---
    categoryItem: {
      // 20px gap between divider and next row is handled by paddingTop
    },
    categoryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    categoryName: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    categoryScore: {
      fontSize: 17,
      fontWeight: "600",
    },
    barTrack: {
      height: 6,
      backgroundColor: Colors.divider,
      borderRadius: 3,
      overflow: "hidden",
    },
    barFill: {
      height: 6,
      borderRadius: 3,
    },
    categoryDetailRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 8,
      gap: 4,
    },
    categoryDetail: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: "400",
      lineHeight: 18,
      flex: 1,
    },
    categoryMoreLink: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
    },
    categoryDivider: {
      height: 0.5,
      backgroundColor: Colors.divider,
      marginTop: 20,
      marginBottom: 20,
      marginLeft: Spacing.dividerIndent,
    },

    // --- Nutrition Facts (2-col, 3-row grid) ---
    nutritionSection: {
      marginTop: Spacing.sectionGap,
    },
    nutritionTitle: {
      ...Typography.sectionHeader,
      color: theme.textPrimary,
      marginBottom: Spacing.elementGap,
    },
    nutRow: {
      flexDirection: "row",
      alignItems: "center",
      height: 44,
    },
    nutCell: {
      flex: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      height: 44,
      gap: 8,
    },
    nutCellLeft: {
      paddingRight: 12,
    },
    nutCellRight: {
      paddingLeft: 12,
    },
    nutLabel: {
      fontSize: 15,
      fontWeight: "400",
      color: theme.textSecondary,
      flexShrink: 0,
    },
    nutValueArea: {
      alignItems: "flex-end",
      flexShrink: 1,
    },
    nutValue: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    nutQualifierRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      marginTop: 1,
    },
    nutQualifierDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    nutQualifierText: {
      fontSize: 12,
      fontWeight: "400",
      color: theme.textTertiary,
    },
    nutVertDivider: {
      width: 0.5,
      height: 20,
      backgroundColor: Colors.divider,
    },
    nutHorizDivider: {
      height: 0.5,
      backgroundColor: Colors.divider,
      marginHorizontal: Spacing.dividerIndent,
    },
    // Legacy NutritionRow (kept for compat)
    nutritionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.separator,
    },
    nutritionLabel: {
      color: theme.textSecondary,
      ...Typography.caption,
    },
    nutritionValue: {
      color: theme.textPrimary,
      ...Typography.captionBold,
      textAlign: "right",
      flexShrink: 1,
    },

    // --- Recall Card ---
    recallCardWarning: {
      backgroundColor: Colors.recallBackground,
      borderRadius: Spacing.cardRadius,
      padding: Spacing.cardPadding,
      marginTop: Spacing.sectionGap,
      borderLeftWidth: 3,
      borderLeftColor: Colors.recallBorder,
    },
    recallCardClean: {
      backgroundColor: Colors.lovedPillBg,
      borderRadius: Spacing.cardRadius,
      padding: Spacing.cardPadding,
      marginTop: Spacing.sectionGap,
      borderLeftWidth: 3,
      borderLeftColor: "rgba(52, 199, 89, 0.25)",
    },
    recallHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    recallLabelWarning: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      color: "#EF4444",
    },
    recallLabelClean: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      color: "#16A34A",
    },
    recallTextWarning: {
      fontSize: 14,
      fontWeight: "400",
      color: "#991B1B",
      lineHeight: 20,
    },
    recallTextClean: {
      fontSize: 14,
      fontWeight: "400",
      color: "#166534",
      lineHeight: 20,
    },
    recallSeeDetails: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.textPrimary,
      marginTop: Spacing.xs,
    },

    // --- Ingredients Section (flat, no card) ---
    ingredientsSection: {
      marginTop: Spacing.sectionGap,
    },
    ingredientsTitle: {
      ...Typography.sectionHeader,
      color: theme.textPrimary,
      marginBottom: Spacing.lg,
    },

    // Summary bar (10px height, 5px radius, no gaps)
    ingSummaryBar: {
      flexDirection: "row",
      height: 10,
      borderRadius: 5,
      overflow: "hidden",
      marginBottom: 10,
    },
    ingSummarySegment: {
      height: 10,
    },
    ingSummaryLabels: {
      flexDirection: "row",
      gap: Spacing.lg,
      marginBottom: Spacing.sm,
    },
    ingSummaryLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    ingSummaryDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    ingSummaryLabelText: {
      color: theme.textSecondary,
      ...Typography.label,
    },

    // Ingredient rows
    ingRow: {
      paddingVertical: Spacing.md,
      minHeight: 56,
      justifyContent: "center",
    },
    ingRowWarning: {
      backgroundColor: "rgba(239, 68, 68, 0.04)",
      marginHorizontal: -Spacing.sm,
      paddingHorizontal: Spacing.sm,
      borderRadius: 10,
    },
    ingRowMain: {
      flexDirection: "row",
      alignItems: "center",
    },
    ingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: Spacing.lg,
    },
    ingNameArea: {
      flex: 1,
      marginRight: 10,
    },
    ingName: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: "500",
    },
    ingFirstBadge: {
      backgroundColor: theme.fill,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Spacing.xs,
      marginRight: Spacing.sm,
    },
    ingFirstBadgeText: {
      color: theme.textTertiary,
      ...Typography.smallLabel,
    },
    ingCatPill: {
      backgroundColor: Colors.divider,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: 6,
    },
    ingCatText: {
      fontSize: 10,
      fontWeight: "600",
      color: Colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    ingChevron: {
      marginLeft: Spacing.sm,
    },
    ingDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: Colors.divider,
      marginTop: Spacing.md,
      marginLeft: 24,
    },
    ingExpandButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Colors.divider,
    },
    ingExpandText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: "500",
    },

    // --- Scan Another (outline button) ---
    scanAnotherButton: {
      height: Spacing.buttonHeight,
      borderRadius: Spacing.buttonRadius,
      borderWidth: 1.5,
      borderColor: theme.textPrimary,
      justifyContent: "center",
      alignItems: "center",
      marginTop: Spacing.subsectionGap,
      overflow: "hidden",
    },
    scanAnotherText: {
      ...Typography.button,
      color: theme.textPrimary,
    },

    // --- Ingredient Bottom Sheet ---
    sheetHandleArea: {
      alignItems: "center",
      paddingTop: 12,
      paddingBottom: 8,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: Colors.divider,
    },
    sheetContent: {
      paddingHorizontal: Spacing.screenPadding,
      paddingBottom: 40,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: Spacing.md,
    },
    sheetDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: Spacing.md,
    },
    sheetIngName: {
      fontSize: 20,
      fontWeight: "600",
      color: theme.textPrimary,
      flex: 1,
    },
    sheetQualityLabel: {
      fontSize: 13,
      fontWeight: "500",
      marginTop: 4,
      marginLeft: 24,
    },
    sheetDivider: {
      height: 0.5,
      backgroundColor: Colors.divider,
      marginVertical: Spacing.cardPadding,
    },
    sheetSection: {
      marginBottom: Spacing.subsectionGap,
    },
    sheetSectionLabel: {
      ...Typography.label,
      color: theme.textTertiary,
      marginBottom: Spacing.sm,
    },
    sheetSectionBody: {
      ...Typography.body,
      color: theme.textSecondary,
      lineHeight: 22,
    },
    sheetAltsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.sm,
    },
    sheetAltPill: {
      backgroundColor: Colors.surface,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    sheetAltText: {
      fontSize: 12,
      fontWeight: "500",
      color: Colors.textSecondary,
    },
  });
}

export function useStyles() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return { styles, theme };
}
