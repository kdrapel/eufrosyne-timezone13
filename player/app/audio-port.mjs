/** Production sound uses the original translated MIDAS replay/mixer, off-thread buffered. */
export const metadata = {
  audio: 'original-code', audioChannels: 2,
  provenance: 'generated-sound/provenance.json; bounded original-Unicorn PCM and chunk comparisons in docs/STEP09_SOUND.md',
  sampleRate: 44100, switchSeconds: 227.7,
};

export {loadOriginalSoundResources as loadAudioResources} from './sound-resources.mjs';

export async function createAudioPort({ sampleRate, resources }) {
  throw new Error('Production playback is driven by the buffered original-code sound worker');
}
