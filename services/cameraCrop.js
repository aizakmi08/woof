const finitePositive = (value) => Number.isFinite(value) && value > 0;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Projects a rectangle from the visible, aspect-fill camera preview into the
 * processed photo returned by Expo Camera. The returned crop uses integer
 * pixel coordinates accepted by expo-image-manipulator.
 */
export function projectScanFrameToPhoto({
  photoWidth,
  photoHeight,
  previewWidth,
  previewHeight,
  frame,
  inset = 0,
}) {
  if (
    !finitePositive(photoWidth)
    || !finitePositive(photoHeight)
    || !finitePositive(previewWidth)
    || !finitePositive(previewHeight)
    || !frame
    || !Number.isFinite(frame.x)
    || !Number.isFinite(frame.y)
    || !finitePositive(frame.width)
    || !finitePositive(frame.height)
  ) {
    throw new Error("Scan frame crop requires valid photo and preview dimensions.");
  }

  const safeInset = clamp(
    Number.isFinite(inset) ? inset : 0,
    0,
    Math.max(0, Math.min(frame.width, frame.height) / 2 - 1)
  );
  const innerFrame = {
    x: frame.x + safeInset,
    y: frame.y + safeInset,
    width: frame.width - safeInset * 2,
    height: frame.height - safeInset * 2,
  };

  const clippedLeft = clamp(innerFrame.x, 0, previewWidth);
  const clippedTop = clamp(innerFrame.y, 0, previewHeight);
  const clippedRight = clamp(innerFrame.x + innerFrame.width, 0, previewWidth);
  const clippedBottom = clamp(innerFrame.y + innerFrame.height, 0, previewHeight);

  if (clippedRight - clippedLeft < 1 || clippedBottom - clippedTop < 1) {
    throw new Error("The highlighted scan frame is outside the camera preview.");
  }

  // CameraView fills its bounds. When the sensor and screen aspect ratios do
  // not match, the preview is center-cropped on the longer image dimension.
  const previewScale = Math.max(
    previewWidth / photoWidth,
    previewHeight / photoHeight
  );
  const displayedPhotoWidth = photoWidth * previewScale;
  const displayedPhotoHeight = photoHeight * previewScale;
  const hiddenPhotoX = Math.max(0, (displayedPhotoWidth - previewWidth) / 2);
  const hiddenPhotoY = Math.max(0, (displayedPhotoHeight - previewHeight) / 2);

  const rawLeft = (clippedLeft + hiddenPhotoX) / previewScale;
  const rawTop = (clippedTop + hiddenPhotoY) / previewScale;
  const rawRight = (clippedRight + hiddenPhotoX) / previewScale;
  const rawBottom = (clippedBottom + hiddenPhotoY) / previewScale;

  const originX = clamp(Math.floor(rawLeft), 0, Math.max(0, photoWidth - 1));
  const originY = clamp(Math.floor(rawTop), 0, Math.max(0, photoHeight - 1));
  const endX = clamp(Math.ceil(rawRight), originX + 1, photoWidth);
  const endY = clamp(Math.ceil(rawBottom), originY + 1, photoHeight);

  return {
    originX,
    originY,
    width: endX - originX,
    height: endY - originY,
  };
}
