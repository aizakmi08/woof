import { NativeModule, requireOptionalNativeModule } from 'expo';

import { WoofLabelOcrResult } from './WoofLabelOcr.types';

declare class WoofLabelOcrModule extends NativeModule {
  recognizeText(imageUri: string): Promise<WoofLabelOcrResult>;
}

export default requireOptionalNativeModule<WoofLabelOcrModule>('WoofLabelOcr');
