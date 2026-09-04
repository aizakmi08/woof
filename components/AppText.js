import { forwardRef } from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
} from "react-native";

export const MAX_FONT_SIZE_MULTIPLIER = 1.4;

export const AppText = forwardRef(function AppText(
  { maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER, ...props },
  ref
) {
  return (
    <NativeText
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
    />
  );
});

export const AppTextInput = forwardRef(function AppTextInput(
  { maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER, ...props },
  ref
) {
  return (
    <NativeTextInput
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
    />
  );
});
