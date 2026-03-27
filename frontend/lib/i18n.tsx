import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type Language = 'en' | 'zh'

interface Translations {
  [key: string]: string | Translations
}

const enTranslations: Translations = {
  common: {
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    settings: 'Settings',
    language: 'Language',
  },
  navigation: {
    home: 'Home',
    playground: 'Playground',
    editor: 'Editor',
    projects: 'Projects',
    back: 'Back',
  },
  playground: {
    title: 'Playground',
    promptPlaceholder: 'Describe your video...',
    generateVideo: 'Generate Video',
    generateImage: 'Generate Image',
    generating: 'Generating...',
    cancelGeneration: 'Cancel',
    uploadImage: 'Upload Image',
    uploadAudio: 'Upload Audio (Optional)',
    dropImageHere: 'Drop image here',
    dropAudioHere: 'Drop audio here',
    clickToUpload: 'Click to upload',
    dragDropHere: 'or drag and drop',
    supportedFormats: 'Supported formats',
    promptHelper: 'Longer, detailed prompts lead to better, more accurate results.',
    retake: 'Retake',
  },
  settings: {
    title: 'Settings',
    model: 'Model',
    duration: 'Duration',
    resolution: 'Resolution',
    fps: 'FPS',
    audio: 'Audio',
    cameraMotion: 'Camera Motion',
    aspectRatio: 'Aspect Ratio',
    imageResolution: 'Image Resolution',
    imageSteps: 'Quality Steps',
    advanced: 'Advanced',
    negativePrompt: 'Negative Prompt',
    negativePromptPlaceholder: 'blurry, low quality, distorted...',
    guidanceScale: 'Guidance Scale',
    fast: 'Fast (8)',
    balanced: 'Balanced (15)',
    high: 'High (20)',
    best: 'Best (30)',
    free: '1.0 (Free)',
    balancedGuidance: '2.0 (Balanced)',
    strict: '3.0 (Strict)',
  },
  cameraMotion: {
    none: 'None',
    static: 'Static',
    focus_shift: 'Focus Shift',
    dolly_in: 'Dolly In',
    dolly_out: 'Dolly Out',
    dolly_left: 'Dolly Left',
    dolly_right: 'Dolly Right',
    jib_up: 'Jib Up',
    jib_down: 'Jib Down',
  },
  mode: {
    textToVideo: 'Text to Video',
    imageToVideo: 'Image to Video',
    textToImage: 'Text to Image',
    icLora: 'IC-LoRA',
  },
  model: {
    fast: 'LTX 2.3 Fast',
    pro: 'LTX 2.3 Pro',
  },
  errors: {
    generationFailed: 'Generation failed',
    checkBackend: 'Please check if the backend is running',
    invalidPrompt: 'Please enter a valid prompt',
  },
  status: {
    loadingModel: 'Loading model...',
    encodingText: 'Encoding prompt...',
    generating: 'Generating...',
    finalizing: 'Finalizing...',
    complete: 'Complete!',
  },
}

const zhTranslations: Translations = {
  common: {
    cancel: '取消',
    confirm: '确认',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    close: '关闭',
    loading: '加载中...',
    error: '错误',
    success: '成功',
    settings: '设置',
    language: '语言',
  },
  navigation: {
    home: '首页',
    playground: '创作空间',
    editor: '编辑器',
    projects: '项目',
    back: '返回',
  },
  playground: {
    title: '创作空间',
    promptPlaceholder: '描述你想要生成的视频...',
    generateVideo: '生成视频',
    generateImage: '生成图片',
    generating: '生成中...',
    cancelGeneration: '取消生成',
    uploadImage: '上传图片',
    uploadAudio: '上传音频（可选）',
    dropImageHere: '拖拽图片到此处',
    dropAudioHere: '拖拽音频到此处',
    clickToUpload: '点击上传',
    dragDropHere: '或拖拽到此处',
    supportedFormats: '支持的格式',
    promptHelper: '更详细、更长的提示词会带来更好、更准确的结果。',
    retake: '重拍',
  },
  settings: {
    title: '设置',
    model: '模型',
    duration: '时长',
    resolution: '分辨率',
    fps: '帧率',
    audio: '音频',
    cameraMotion: '镜头运动',
    aspectRatio: '宽高比',
    imageResolution: '图片分辨率',
    imageSteps: '质量步数',
    advanced: '高级设置',
    negativePrompt: '负向提示词',
    negativePromptPlaceholder: '模糊、低质量、变形...',
    guidanceScale: '引导比例',
    fast: '快速 (8)',
    balanced: '平衡 (15)',
    high: '高质量 (20)',
    best: '最佳 (30)',
    free: '1.0 (自由)',
    balancedGuidance: '2.0 (平衡)',
    strict: '3.0 (严格)',
  },
  cameraMotion: {
    none: '无',
    static: '静止',
    focus_shift: '焦点转移',
    dolly_in: '推近',
    dolly_out: '拉远',
    dolly_left: '左移',
    dolly_right: '右移',
    jib_up: '上升',
    jib_down: '下降',
  },
  mode: {
    textToVideo: '文生视频',
    imageToVideo: '图生视频',
    textToImage: '文生图',
    icLora: 'IC-LoRA',
  },
  model: {
    fast: 'LTX 2.3 快速版',
    pro: 'LTX 2.3 专业版',
  },
  errors: {
    generationFailed: '生成失败',
    checkBackend: '请检查后端服务是否运行',
    invalidPrompt: '请输入有效的提示词',
  },
  status: {
    loadingModel: '加载模型中...',
    encodingText: '编码提示词...',
    generating: '生成中...',
    finalizing: '完成中...',
    complete: '完成！',
  },
}

const translations: Record<Language, Translations> = {
  en: enTranslations,
  zh: zhTranslations,
}

function getNestedValue(obj: Translations, path: string): string {
  const keys = path.split('.')
  let value: unknown = obj
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Translations)[key]
    } else {
      return path
    }
  }
  
  return typeof value === 'string' ? value : path
}

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

const STORAGE_KEY = 'ltx-language'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as Language
      if (saved && (saved === 'en' || saved === 'zh')) {
        return saved
      }
    }
    return 'en'
  })

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang)
    }
  }, [])

  const t = useCallback(
    (key: string) => {
      return getNestedValue(translations[language], key)
    },
    [language]
  )

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}

export { translations }
