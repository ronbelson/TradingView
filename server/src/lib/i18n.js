/**
 * BTC CHEF UI locales.
 * Default: en. he/ar = RTL.
 * Engine emits Hebrew; display uses HE_BY_LOCALE dictionary only (no LLM).
 */

import { HE_BY_LOCALE, HE_EN } from './i18n-he-dict';

export const LOCALES = [
  { id: 'en', label: 'EN', name: 'English', dir: 'ltr' },
  { id: 'he', label: 'עב', name: 'עברית', dir: 'rtl' },
  { id: 'ar', label: 'ع', name: 'العربية', dir: 'rtl' },
  { id: 'de', label: 'DE', name: 'Deutsch', dir: 'ltr' },
  { id: 'nl', label: 'NL', name: 'Nederlands', dir: 'ltr' },
  { id: 'es', label: 'ES', name: 'Español', dir: 'ltr' },
];

export const DEFAULT_LOCALE = 'en';
export const STORAGE_KEY = 'btc_chef_lang';

const M = {
  en: {
    version: 'version',
    updated: 'Updated',
    noPrice: 'No price',
    loadError: 'Load error',
    waitingHook: 'Waiting for webhook data',
    recommendNow: 'Recommend now',
    wait: 'WAIT',
    long: 'LONG',
    short: 'SHORT',
    none: 'None',
    entry: 'Entry',
    target: 'Target',
    stop: 'Stop',
    rr: 'R:R 1 to',
    finalExit: 'Final exit',
    levelLadder: 'Level ladder',
    longEntry: 'Long entry',
    shortEntry: 'Short entry',
    tfChart: 'Timeframe chart',
    allTfs: 'All timeframes',
    brief: 'Brief',
    yourEntry: 'Your entry',
    yourPosition: 'Your position',
    longPos: 'Long position',
    shortPos: 'Short position',
    currentPrice: 'Current price',
    margin: 'Margin',
    leverage: 'Leverage',
    noPosition: 'No position marked. Set side and entry below to see P/L on the chart.',
    openPosition: 'Open position',
    now: 'now',
    size: 'Size',
    simTitle: 'Future simulation by recommended target',
    simLong: 'Future simulation · Long with exits',
    simShort: 'Future simulation · Short with exits',
    simHint: 'Left past · Blue line now · Right future. Scroll after zoom. Not a promise.',
    noSim: 'No recommended path to simulate yet',
    exitsOnPath: 'Exit points on path',
    vsYourEntry: 'P/L vs your entry',
    vsPathEntry: 'P/L vs path entry',
    forcedStop: 'Stop · Forced exit',
    otherShorts: 'Short points first, second…',
    otherLongs: 'Long points first, second…',
    pathDetail: 'Point detail from same path',
    lang: 'Language',
    justNow: 'just now',
    lessThanMin: 'less than a minute ago',
    minAgo: (n) => (n === 1 ? '1 minute ago' : `${n} minutes ago`),
    hourAgo: (n, m) => {
      if (n === 1 && !m) return '1 hour ago';
      if (n === 1) return `1 hour and ${m} min ago`;
      if (!m) return `${n} hours ago`;
      return `${n} hours and ${m} min ago`;
    },
    dayAgo: (n) => (n === 1 ? '1 day ago' : `${n} days ago`),
  },
  he: {
    version: 'גרסה',
    updated: 'עודכן',
    noPrice: 'אין מחיר',
    loadError: 'שגיאה בטעינה',
    waitingHook: 'מחכים לנתונים מההוק',
    recommendNow: 'ממליץ כרגע',
    wait: 'המתן',
    long: 'לונג',
    short: 'שורט',
    none: 'אין',
    entry: 'כניסה',
    target: 'יעד',
    stop: 'סטופ',
    rr: 'יחס 1 ל-',
    finalExit: 'יציאה סופית',
    levelLadder: 'סולם רמות',
    longEntry: 'כניסת לונג',
    shortEntry: 'כניסת שורט',
    tfChart: 'גרף טיימפרמים',
    allTfs: 'כל הטיימפרמים',
    brief: 'בקצרה',
    yourEntry: 'הכניסה שלך',
    yourPosition: 'הפוזיציה שלך',
    longPos: 'פוזיציית לונג',
    shortPos: 'פוזיציית שורט',
    currentPrice: 'מחיר נוכחי',
    margin: 'מרג׳ין',
    leverage: 'מינוף',
    noPosition: 'אין פוזיציה מסומנת. הגדר למטה צד וכניסה כדי לראות רווח והפסד על הגרף.',
    openPosition: 'פוזיציה פתוחה',
    now: 'עכשיו',
    size: 'גודל',
    simTitle: 'סימולציה לעתיד לפי היעד המומלץ',
    simLong: 'סימולציה לעתיד · לונג עם יציאות',
    simShort: 'סימולציה לעתיד · שורט עם יציאות',
    simHint: 'שמאל עבר · קו כחול עכשיו · ימין עתיד. גלול הצידה אחרי הגדלה. לא הבטחה.',
    noSim: 'אין עדיין מסלול מומלץ לסימולציה',
    exitsOnPath: 'נקודות יציאה במסלול',
    vsYourEntry: 'רווח מול הכניסה שלך',
    vsPathEntry: 'רווח מול כניסת המסלול',
    forcedStop: 'סטופ · יציאה כפויה',
    otherShorts: 'נקודות שורט ראשון שני וכו',
    otherLongs: 'נקודות לונג ראשון שני וכו',
    pathDetail: 'פירוט נקודות מאותו מסלול',
    lang: 'שפה',
    justNow: 'לפני רגע',
    lessThanMin: 'לפני פחות מדקה',
    minAgo: (n) => (n === 1 ? 'לפני דקה' : `לפני ${n} דקות`),
    hourAgo: (n, m) => {
      if (n === 1 && !m) return 'לפני שעה';
      if (n === 1) return `לפני שעה ו${m} דקות`;
      if (n === 2 && !m) return 'לפני שעתיים';
      if (!m) return `לפני ${n} שעות`;
      return `לפני ${n} שעות ו${m} דקות`;
    },
    dayAgo: (n) => (n === 1 ? 'לפני יום' : `לפני ${n} ימים`),
  },
  ar: {
    version: 'الإصدار',
    updated: 'تم التحديث',
    noPrice: 'لا يوجد سعر',
    loadError: 'خطأ في التحميل',
    waitingHook: 'بانتظار بيانات الويب هوك',
    recommendNow: 'التوصية الآن',
    wait: 'انتظر',
    long: 'شراء',
    short: 'بيع',
    none: 'لا',
    entry: 'دخول',
    target: 'هدف',
    stop: 'وقف',
    rr: 'نسبة 1 إلى',
    finalExit: 'خروج نهائي',
    levelLadder: 'سلم المستويات',
    longEntry: 'دخول شراء',
    shortEntry: 'دخول بيع',
    tfChart: 'رسم الأطر الزمنية',
    allTfs: 'كل الأطر الزمنية',
    brief: 'باختصار',
    yourEntry: 'دخولك',
    yourPosition: 'مركزك',
    longPos: 'مركز شراء',
    shortPos: 'مركز بيع',
    currentPrice: 'السعر الحالي',
    margin: 'الهامش',
    leverage: 'الرافعة',
    noPosition: 'لا مركز محدد. عيّن الاتجاه والدخول أدناه لرؤية الربح والخسارة.',
    openPosition: 'مركز مفتوح',
    now: 'الآن',
    size: 'الحجم',
    simTitle: 'محاكاة للمستقبل حسب الهدف الموصى به',
    simLong: 'محاكاة للمستقبل · شراء مع مخارج',
    simShort: 'محاكاة للمستقبل · بيع مع مخارج',
    simHint: 'يسار ماضٍ · خط أزرق الآن · يمين مستقبل. مرّر بعد التكبير. ليس وعداً.',
    noSim: 'لا يوجد مسار موصى به بعد',
    exitsOnPath: 'نقاط الخروج في المسار',
    vsYourEntry: 'ربح مقابل دخولك',
    vsPathEntry: 'ربح مقابل دخول المسار',
    forcedStop: 'وقف · خروج إجباري',
    otherShorts: 'نقاط البيع الأولى والثانية…',
    otherLongs: 'نقاط الشراء الأولى والثانية…',
    pathDetail: 'تفاصيل النقاط من نفس المسار',
    lang: 'اللغة',
    justNow: 'الآن',
    lessThanMin: 'قبل أقل من دقيقة',
    minAgo: (n) => (n === 1 ? 'قبل دقيقة' : `قبل ${n} دقائق`),
    hourAgo: (n, m) => {
      if (n === 1 && !m) return 'قبل ساعة';
      if (n === 1) return `قبل ساعة و${m} دقائق`;
      if (!m) return `قبل ${n} ساعات`;
      return `قبل ${n} ساعات و${m} دقائق`;
    },
    dayAgo: (n) => (n === 1 ? 'قبل يوم' : `قبل ${n} أيام`),
  },
  de: {
    version: 'Version',
    updated: 'Aktualisiert',
    noPrice: 'Kein Preis',
    loadError: 'Ladefehler',
    waitingHook: 'Warte auf Webhook-Daten',
    recommendNow: 'Empfehlung jetzt',
    wait: 'WARTEN',
    long: 'LONG',
    short: 'SHORT',
    none: 'Keine',
    entry: 'Einstieg',
    target: 'Ziel',
    stop: 'Stop',
    rr: 'R:R 1 zu',
    finalExit: 'Finaler Ausstieg',
    levelLadder: 'Level-Leiter',
    longEntry: 'Long-Einstieg',
    shortEntry: 'Short-Einstieg',
    tfChart: 'Timeframe-Chart',
    allTfs: 'Alle Timeframes',
    brief: 'Kurz',
    yourEntry: 'Dein Einstieg',
    yourPosition: 'Deine Position',
    longPos: 'Long-Position',
    shortPos: 'Short-Position',
    currentPrice: 'Aktueller Preis',
    margin: 'Margin',
    leverage: 'Hebel',
    noPosition: 'Keine Position markiert. Seite und Einstieg unten setzen für G/V.',
    openPosition: 'Offene Position',
    now: 'jetzt',
    size: 'Größe',
    simTitle: 'Zukunftssimulation nach empfohlenem Ziel',
    simLong: 'Zukunftssimulation · Long mit Ausstiegen',
    simShort: 'Zukunftssimulation · Short mit Ausstiegen',
    simHint: 'Links Vergangenheit · Blaue Linie jetzt · Rechts Zukunft. Nach Zoom scrollen. Kein Versprechen.',
    noSim: 'Noch kein empfohlener Pfad',
    exitsOnPath: 'Ausstiegspunkte auf dem Pfad',
    vsYourEntry: 'G/V vs dein Einstieg',
    vsPathEntry: 'G/V vs Pfad-Einstieg',
    forcedStop: 'Stop · Zwangsausstieg',
    otherShorts: 'Short-Punkte eins, zwei…',
    otherLongs: 'Long-Punkte eins, zwei…',
    pathDetail: 'Punktdetail desselben Pfads',
    lang: 'Sprache',
    justNow: 'gerade eben',
    lessThanMin: 'vor weniger als einer Minute',
    minAgo: (n) => (n === 1 ? 'vor 1 Minute' : `vor ${n} Minuten`),
    hourAgo: (n, m) => {
      if (n === 1 && !m) return 'vor 1 Stunde';
      if (n === 1) return `vor 1 Stunde und ${m} Min`;
      if (!m) return `vor ${n} Stunden`;
      return `vor ${n} Stunden und ${m} Min`;
    },
    dayAgo: (n) => (n === 1 ? 'vor 1 Tag' : `vor ${n} Tagen`),
  },
  nl: {
    version: 'versie',
    updated: 'Bijgewerkt',
    noPrice: 'Geen prijs',
    loadError: 'Laadfout',
    waitingHook: 'Wachten op webhook-data',
    recommendNow: 'Advies nu',
    wait: 'WACHT',
    long: 'LONG',
    short: 'SHORT',
    none: 'Geen',
    entry: 'Instap',
    target: 'Doel',
    stop: 'Stop',
    rr: 'R:R 1 op',
    finalExit: 'Einduitstap',
    levelLadder: 'Level-ladder',
    longEntry: 'Long-instap',
    shortEntry: 'Short-instap',
    tfChart: 'Timeframe-grafiek',
    allTfs: 'Alle timeframes',
    brief: 'Kort',
    yourEntry: 'Jouw instap',
    yourPosition: 'Jouw positie',
    longPos: 'Long-positie',
    shortPos: 'Short-positie',
    currentPrice: 'Huidige prijs',
    margin: 'Marge',
    leverage: 'Hefboom',
    noPosition: 'Geen positie gemarkeerd. Zet hieronder kant en instap voor W/V.',
    openPosition: 'Open positie',
    now: 'nu',
    size: 'Grootte',
    simTitle: 'Toekomstsimulatie op aanbevolen doel',
    simLong: 'Toekomstsimulatie · Long met exits',
    simShort: 'Toekomstsimulatie · Short met exits',
    simHint: 'Links verleden · Blauwe lijn nu · Rechts toekomst. Scroll na zoom. Geen belofte.',
    noSim: 'Nog geen aanbevolen pad',
    exitsOnPath: 'Exitpunten op het pad',
    vsYourEntry: 'W/V vs jouw instap',
    vsPathEntry: 'W/V vs pad-instap',
    forcedStop: 'Stop · Gedwongen exit',
    otherShorts: 'Short-punten één, twee…',
    otherLongs: 'Long-punten één, twee…',
    pathDetail: 'Puntdetail van hetzelfde pad',
    lang: 'Taal',
    justNow: 'zojuist',
    lessThanMin: 'minder dan een minuut geleden',
    minAgo: (n) => (n === 1 ? '1 minuut geleden' : `${n} minuten geleden`),
    hourAgo: (n, m) => {
      if (n === 1 && !m) return '1 uur geleden';
      if (n === 1) return `1 uur en ${m} min geleden`;
      if (!m) return `${n} uur geleden`;
      return `${n} uur en ${m} min geleden`;
    },
    dayAgo: (n) => (n === 1 ? '1 dag geleden' : `${n} dagen geleden`),
  },
  es: {
    version: 'versión',
    updated: 'Actualizado',
    noPrice: 'Sin precio',
    loadError: 'Error al cargar',
    waitingHook: 'Esperando datos del webhook',
    recommendNow: 'Recomendación ahora',
    wait: 'ESPERA',
    long: 'LONG',
    short: 'SHORT',
    none: 'Ninguna',
    entry: 'Entrada',
    target: 'Objetivo',
    stop: 'Stop',
    rr: 'R:R 1 a',
    finalExit: 'Salida final',
    levelLadder: 'Escalera de niveles',
    longEntry: 'Entrada long',
    shortEntry: 'Entrada short',
    tfChart: 'Gráfico de timeframes',
    allTfs: 'Todos los timeframes',
    brief: 'Resumen',
    yourEntry: 'Tu entrada',
    yourPosition: 'Tu posición',
    longPos: 'Posición long',
    shortPos: 'Posición short',
    currentPrice: 'Precio actual',
    margin: 'Margen',
    leverage: 'Apalancamiento',
    noPosition: 'Sin posición marcada. Define lado y entrada abajo para ver P/L.',
    openPosition: 'Posición abierta',
    now: 'ahora',
    size: 'Tamaño',
    simTitle: 'Simulación futura según objetivo recomendado',
    simLong: 'Simulación futura · Long con salidas',
    simShort: 'Simulación futura · Short con salidas',
    simHint: 'Izquierda pasado · Línea azul ahora · Derecha futuro. Desplaza tras zoom. No es promesa.',
    noSim: 'Aún no hay ruta recomendada',
    exitsOnPath: 'Puntos de salida en la ruta',
    vsYourEntry: 'P/L vs tu entrada',
    vsPathEntry: 'P/L vs entrada de ruta',
    forcedStop: 'Stop · Salida forzada',
    otherShorts: 'Puntos short primero, segundo…',
    otherLongs: 'Puntos long primero, segundo…',
    pathDetail: 'Detalle de puntos de la misma ruta',
    lang: 'Idioma',
    justNow: 'hace un momento',
    lessThanMin: 'hace menos de un minuto',
    minAgo: (n) => (n === 1 ? 'hace 1 minuto' : `hace ${n} minutos`),
    hourAgo: (n, m) => {
      if (n === 1 && !m) return 'hace 1 hora';
      if (n === 1) return `hace 1 hora y ${m} min`;
      if (!m) return `hace ${n} horas`;
      return `hace ${n} horas y ${m} min`;
    },
    dayAgo: (n) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
  },
};

const HE_PAIR_CACHE = {};

function hePairsFor(locale) {
  if (HE_PAIR_CACHE[locale]) return HE_PAIR_CACHE[locale];
  const bag = { ...HE_EN, ...(HE_BY_LOCALE[locale] || {}) };
  const pairs = Object.entries(bag).sort((a, b) => b[0].length - a[0].length);
  HE_PAIR_CACHE[locale] = pairs;
  return pairs;
}

/** Numbered / templated Hebrew fragments → locale (dictionary only). */
function applyHeTemplates(locale, text) {
  let out = String(text);
  if (locale === 'he') return out;
  const pack = {
    exitN: (n) => `Exit ${n}`,
    exitFinal: 'Final exit',
    shortN: (n) => `Short ${n}`,
    shortFinal: 'Final short',
    longN: (n) => `Long ${n}`,
    longFinal: 'Final long',
    stepN: (n) => `Step ${n}`,
  };
  out = out.replace(/יציאה סופית/g, pack.exitFinal);
  out = out.replace(/יציאה\s+(\d+)/g, (_, n) => pack.exitN(n));
  out = out.replace(/שורט סופי/g, pack.shortFinal);
  out = out.replace(/שורט\s+(\d+)/g, (_, n) => pack.shortN(n));
  out = out.replace(/לונג סופי/g, pack.longFinal);
  out = out.replace(/לונג\s+(\d+)/g, (_, n) => pack.longN(n));
  out = out.replace(/שלב\s+(\d+)/g, (_, n) => pack.stepN(n));
  return out;
}

export function isValidLocale(id) {
  return LOCALES.some((l) => l.id === id);
}

export function localeMeta(id) {
  return LOCALES.find((l) => l.id === id) || LOCALES.find((l) => l.id === DEFAULT_LOCALE);
}

export function messages(locale) {
  return M[locale] || M[DEFAULT_LOCALE];
}

export function t(locale, key) {
  const bag = messages(locale);
  const v = bag[key];
  if (typeof v === 'function') return v;
  if (v == null) return messages(DEFAULT_LOCALE)[key] || key;
  return v;
}

export function translateAdviceText(locale, text) {
  if (text == null || text === '') return text;
  if (locale === 'he') return text;
  let out = applyHeTemplates(locale, text);
  for (const [he, tr] of hePairsFor(locale)) {
    if (he && out.includes(he)) out = out.split(he).join(tr);
  }
  return out;
}

/** Chart / path point label from kind code (preferred over kindHe). */
export function pointLabel(locale, kind, { exitNo, side, final: isFinal } = {}) {
  if (locale === 'he') {
    if (kind === 'now') return 'עכשיו';
    if (kind === 'entry') return 'כניסה';
    if (kind === 'stop') return 'סטופ';
    if (kind === 'target' || (kind === 'exit' && isFinal)) return 'יציאה סופית';
    if (kind === 'exit') return `יציאה ${exitNo ?? ''}`.trim();
    if (kind === 'other_exit') {
      const shortSide = side === 'short';
      if (isFinal) return shortSide ? 'שורט סופי' : 'לונג סופי';
      return shortSide ? `שורט ${exitNo}` : `לונג ${exitNo}`;
    }
    if (kind === 'your_entry') return 'הכניסה שלך';
    return kind || '';
  }
  if (kind === 'now') return t(locale, 'now');
  if (kind === 'entry') return t(locale, 'entry');
  if (kind === 'stop') return t(locale, 'stop');
  if (kind === 'target' || (kind === 'exit' && isFinal)) return t(locale, 'finalExit');
  if (kind === 'exit') return `Exit ${exitNo ?? ''}`.trim();
  if (kind === 'other_exit') {
    const shortSide = side === 'short';
    if (isFinal) return shortSide ? 'Final short' : 'Final long';
    return shortSide ? `Short ${exitNo}` : `Long ${exitNo}`;
  }
  if (kind === 'your_entry') return t(locale, 'yourEntry');
  return translateAdviceText(locale, kind) || kind || '';
}

export function leanLabel(locale, lean, leanHe) {
  if (lean === 'long') return t(locale, 'long');
  if (lean === 'short') return t(locale, 'short');
  if (lean === 'wait') return t(locale, 'wait');
  return translateAdviceText(locale, leanHe) || t(locale, 'wait');
}

export function formatAgo(locale, raw, nowMs = Date.now()) {
  if (raw == null || raw === '') return '';
  let ts = null;
  if (typeof raw === 'number') ts = raw < 1e12 ? raw * 1000 : raw;
  else {
    const parsed = Date.parse(String(raw));
    ts = Number.isFinite(parsed) ? parsed : null;
  }
  if (ts == null || !Number.isFinite(ts)) return '';
  const sec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  const bag = messages(locale);
  if (sec < 20) return bag.justNow;
  if (sec < 60) return bag.lessThanMin;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return bag.minAgo(mins);
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return bag.hourAgo(hours, rem);
  return bag.dayAgo(Math.floor(hours / 24));
}

export function readLocaleFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q && isValidLocale(q)) return q;
  } catch {
    // ignore
  }
  return null;
}

export function readLocaleFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s && isValidLocale(s)) return s;
  } catch {
    // ignore
  }
  return null;
}

export function writeLocale(locale) {
  if (!isValidLocale(locale)) return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', locale);
    window.history.replaceState({}, '', url.toString());
  } catch {
    // ignore
  }
  try {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeMeta(locale).dir;
  } catch {
    // ignore
  }
}

export function resolveInitialLocale() {
  return readLocaleFromUrl() || readLocaleFromStorage() || DEFAULT_LOCALE;
}
