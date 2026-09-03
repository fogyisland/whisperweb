// Whisper model catalog + language catalog + sample audio metadata.
// All derived from the actual Whisper Python source (model dimensions, _MODELS, LANGUAGES).

(function () {
  "use strict";

  // From whisper/__init__.py
  const MODELS = [
    { id: "tiny.en",     size_mb: 75,   params_m: 39,   vram_gb: 1,  speed_x: 10, en_only: true,  multilingual: false, desc: "最快的英语专用模型。适合实时或低资源场景。" },
    { id: "tiny",        size_mb: 75,   params_m: 39,   vram_gb: 1,  speed_x: 10, en_only: false, multilingual: true,  desc: "最快的多语言模型。质量有限但适合做原型。" },
    { id: "base.en",     size_mb: 142,  params_m: 74,   vram_gb: 1,  speed_x: 7,  en_only: true,  multilingual: false, desc: "比 tiny 略大。准确率高一些，速度仍快。" },
    { id: "base",        size_mb: 142,  params_m: 74,   vram_gb: 1,  speed_x: 7,  en_only: false, multilingual: true,  desc: "小型多语言模型。多数应用的基线选择。" },
    { id: "small.en",    size_mb: 466,  params_m: 244,  vram_gb: 2,  speed_x: 4,  en_only: true,  multilingual: false, desc: "英语专用中等规模模型。" },
    { id: "small",       size_mb: 466,  params_m: 244,  vram_gb: 2,  speed_x: 4,  en_only: false, multilingual: true,  desc: "多语言中等规模模型。速度与精度的平衡点。" },
    { id: "medium.en",   size_mb: 1500, params_m: 769,  vram_gb: 5,  speed_x: 2,  en_only: true,  multilingual: false, desc: "英语专用高精度模型。不适合实时。" },
    { id: "medium",      size_mb: 1500, params_m: 769,  vram_gb: 5,  speed_x: 2,  en_only: false, multilingual: true,  desc: "多语言高精度模型。翻译任务推荐起步档。" },
    { id: "large-v1",    size_mb: 2900, params_m: 1550, vram_gb: 10, speed_x: 1,  en_only: false, multilingual: true,  desc: "首个 large 版本。已被 v2/v3 取代。" },
    { id: "large-v2",    size_mb: 2900, params_m: 1550, vram_gb: 10, speed_x: 1,  en_only: false, multilingual: true,  desc: "第二个 large 版本。多语种精度提升。" },
    { id: "large-v3",    size_mb: 2900, params_m: 1550, vram_gb: 10, speed_x: 1,  en_only: false, multilingual: true,  desc: "当前最新 large 版本。综合质量最强。" },
    { id: "turbo",       size_mb: 1500, params_m: 809,  vram_gb: 6,  speed_x: 8,  en_only: false, multilingual: true,  desc: "large-v3 解码器剪枝版。速度约 8 倍。不支持翻译。" },
  ];

  // From whisper/tokenizer.py LANGUAGES dict — 99 entries.
  const LANGUAGES = [
    ["en", "english", "🇺🇸"], ["zh", "chinese", "🇨🇳"], ["de", "german", "🇩🇪"],
    ["es", "spanish", "🇪🇸"], ["ru", "russian", "🇷🇺"], ["ko", "korean", "🇰🇷"],
    ["fr", "french", "🇫🇷"], ["ja", "japanese", "🇯🇵"], ["pt", "portuguese", "🇵🇹"],
    ["tr", "turkish", "🇹🇷"], ["pl", "polish", "🇵🇱"], ["ca", "catalan", "🇪🇸"],
    ["nl", "dutch", "🇳🇱"], ["ar", "arabic", "🇸🇦"], ["sv", "swedish", "🇸🇪"],
    ["it", "italian", "🇮🇹"], ["id", "indonesian", "🇮🇩"], ["hi", "hindi", "🇮🇳"],
    ["fi", "finnish", "🇫🇮"], ["vi", "vietnamese", "🇻🇳"], ["he", "hebrew", "🇮🇱"],
    ["uk", "ukrainian", "🇺🇦"], ["el", "greek", "🇬🇷"], ["ms", "malay", "🇲🇾"],
    ["cs", "czech", "🇨🇿"], ["ro", "romanian", "🇷🇴"], ["da", "danish", "🇩🇰"],
    ["hu", "hungarian", "🇭🇺"], ["ta", "tamil", "🇮🇳"], ["no", "norwegian", "🇳🇴"],
    ["th", "thai", "🇹🇭"], ["ur", "urdu", "🇵🇰"], ["hr", "croatian", "🇭🇷"],
    ["bg", "bulgarian", "🇧🇬"], ["lt", "lithuanian", "🇱🇹"], ["la", "latin", ""],
    ["mi", "maori", "🇳🇿"], ["ml", "malayalam", "🇮🇳"], ["cy", "welsh", "🏴󠁧󠁢󠁷󠁬󠁳󠁿"],
    ["sk", "slovak", "🇸🇰"], ["te", "telugu", "🇮🇳"], ["fa", "persian", "🇮🇷"],
    ["lv", "latvian", "🇱🇻"], ["bn", "bengali", "🇧🇩"], ["sr", "serbian", "🇷🇸"],
    ["az", "azerbaijani", "🇦🇿"], ["sl", "slovenian", "🇸🇮"], ["kn", "kannada", "🇮🇳"],
    ["et", "estonian", "🇪🇪"], ["mk", "macedonian", "🇲🇰"], ["br", "breton", "🇫🇷"],
    ["eu", "basque", "🇪🇸"], ["is", "icelandic", "🇮🇸"], ["hy", "armenian", "🇦🇲"],
    ["ne", "nepali", "🇳🇵"], ["mn", "mongolian", "🇲🇳"], ["bs", "bosnian", "🇧🇦"],
    ["kk", "kazakh", "🇰🇿"], ["sq", "albanian", "🇦🇱"], ["sw", "swahili", "🇰🇪"],
    ["gl", "galician", "🇪🇸"], ["mr", "marathi", "🇮🇳"], ["pa", "punjabi", "🇮🇳"],
    ["si", "sinhala", "🇱🇰"], ["km", "khmer", "🇰🇭"], ["sn", "shona", "🇿🇼"],
    ["yo", "yoruba", "🇳🇬"], ["so", "somali", "🇸🇴"], ["af", "afrikaans", "🇿🇦"],
    ["oc", "occitan", "🇫🇷"], ["ka", "georgian", "🇬🇪"], ["be", "belarusian", "🇧🇾"],
    ["tg", "tajik", "🇹🇯"], ["sd", "sindhi", "🇵🇰"], ["gu", "gujarati", "🇮🇳"],
    ["am", "amharic", "🇪🇹"], ["yi", "yiddish", ""], ["lo", "lao", "🇱🇦"],
    ["uz", "uzbek", "🇺🇿"], ["fo", "faroese", "🇫🇴"], ["ht", "haitian creole", "🇭🇹"],
    ["ps", "pashto", "🇦🇫"], ["tk", "turkmen", "🇹🇲"], ["nn", "nynorsk", "🇳🇴"],
    ["mt", "maltese", "🇲🇹"], ["sa", "sanskrit", "🇮🇳"], ["lb", "luxembourgish", "🇱🇺"],
    ["my", "myanmar", "🇲🇲"], ["bo", "tibetan", "🇨🇳"], ["tl", "tagalog", "🇵🇭"],
    ["mg", "malagasy", "🇲🇬"], ["as", "assamese", "🇮🇳"], ["tt", "tatar", "🇷🇺"],
    ["haw", "hawaiian", "🇺🇸"], ["ln", "lingala", "🇨🇩"], ["ha", "hausa", "🇳🇪"],
    ["ba", "bashkir", "🇷🇺"], ["jw", "javanese", "🇮🇩"], ["su", "sundanese", "🇮🇩"],
    ["yue", "cantonese", "🇭🇰"],
  ];

  // Demo audio samples.
  // Each entry pairs an audio file with pre-generated, realistic-looking JSON.
  // The simulator picks the matching entry for the user's language setting.
  const SAMPLES = [
    {
      id: "jfk-en",
      name: "JFK —— \"不要问……\"（英语）",
      language: "en",
      duration_s: 11,
      icon: "🇺🇸",
      blurb: "那段著名的 11 秒 JFK 录音 —— 录音棚音质、单人发言、规范英语。",
      file: "assets/samples/jfk-en.flac",
      results: {
        en: {
          text: "And so, my fellow Americans, ask not what your country can do for you, ask what you can do for your country.",
          language: "en",
          segments: [
            { id: 0, start: 0.0, end: 2.5, text: " And so, my fellow Americans,",  temperature: 0.0, avg_logprob: -0.22, compression_ratio: 1.18, no_speech_prob: 0.012 },
            { id: 1, start: 2.5, end: 5.5, text: " ask not what your country can do for you,", temperature: 0.0, avg_logprob: -0.20, compression_ratio: 1.31, no_speech_prob: 0.008 },
            { id: 2, start: 5.5, end: 8.5, text: " ask what you can do for your country.", temperature: 0.0, avg_logprob: -0.19, compression_ratio: 1.25, no_speech_prob: 0.006 },
            { id: 3, start: 8.5, end: 9.2, text: "", temperature: 0.0, avg_logprob: -0.45, compression_ratio: 0.00, no_speech_prob: 0.004 },
          ],
          word_timestamps: {
            0: [[" And", 0.02, 0.30, 0.99], ["so", 0.30, 0.50, 0.99], ["my", 0.50, 0.72, 0.99], ["fellow", 0.72, 1.10, 0.98], ["Americans", 1.10, 1.80, 0.97], ["", 1.80, 2.50, 0.98]],
            1: [[" ask", 2.60, 2.92, 0.99], ["not", 2.92, 3.20, 0.99], ["what", 3.20, 3.52, 0.99], ["your", 3.52, 3.82, 0.99], ["country", 3.82, 4.30, 0.99], ["can", 4.30, 4.60, 0.99], ["do", 4.60, 4.85, 0.99], ["for", 4.85, 5.10, 0.99], ["you", 5.10, 5.45, 0.99], ["", 5.45, 5.50, 0.99]],
            2: [[" ask", 5.60, 5.92, 0.99], ["what", 5.92, 6.25, 0.99], ["you", 6.25, 6.52, 0.99], ["can", 6.52, 6.85, 0.99], ["do", 6.85, 7.10, 0.99], ["for", 7.10, 7.35, 0.99], ["your", 7.35, 7.70, 0.99], ["country", 7.70, 8.40, 0.99], [".", 8.40, 8.50, 0.99]],
          },
          language_probs: { en: 0.987, zh: 0.003, de: 0.001, es: 0.001, fr: 0.001 },
        },
      },
    },
    {
      id: "tone-silence",
      name: "底噪（无语音）",
      language: "en",
      duration_s: 6,
      icon: "🔇",
      blurb: "一段没有实际语音的短音频 —— 用于演示无语音检测与阈值行为。",
      file: "assets/samples/silence.wav",
      results: {
        en: {
          text: "",
          language: "en",
          segments: [],
          word_timestamps: {},
          language_probs: { en: 0.21, es: 0.14, de: 0.11, fr: 0.09, zh: 0.07 },
          no_speech_prob: 0.94,
        },
      },
    },
  ];

  window.WW_MODELS = MODELS;
  window.WW_LANGUAGES = LANGUAGES;
  window.WW_SAMPLES = SAMPLES;
})();
