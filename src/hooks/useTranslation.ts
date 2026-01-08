import { translations } from '../translations';
import { Lang } from '../types';

export function useTranslation(lang: Lang) {
    const t = (key: string) => {
        const dict = translations[lang] as any;
        return dict[key] || key;
    };
    return { t };
}
