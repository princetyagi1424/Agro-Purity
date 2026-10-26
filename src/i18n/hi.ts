import dict from './hi.json';
import type { TranslationKey } from './types';

export const hi: Record<TranslationKey, string> = dict as Record<TranslationKey, string>;
