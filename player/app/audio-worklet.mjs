import * as adapter from './audio-port.mjs';
import { registerOriginalAudioProcessor } from '../runtime/audio-processor.mjs';
registerOriginalAudioProcessor(adapter);
