import { NativeModule, requireOptionalNativeModule } from 'expo';

import { WoofLabelCropResult, WoofLabelOcrResult } from './WoofLabelOcr.types';

declare class WoofLabelOcrModule extends NativeModule {
  cropToNormalizedRegion(
    imageUri: string,
    normalizedX: number,
    normalizedY: number,
    normalizedWidth: number,
    normalizedHeight: number
  ): Promise<WoofLabelCropResult>;
  recognizeText(imageUri: string): Promise<WoofLabelOcrResult>;
}

export default requireOptionalNativeModule<WoofLabelOcrModule>('WoofLabelOcr');
