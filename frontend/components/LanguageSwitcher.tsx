import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { Button } from './ui/button'

const languages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  
  const currentLang = languages.find(l => l.code === i18n.language) || languages[0]
  
  const cycleLanguage = () => {
    const currentIndex = languages.findIndex(l => l.code === i18n.language)
    const nextIndex = (currentIndex + 1) % languages.length
    i18n.changeLanguage(languages[nextIndex].code)
  }
  
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleLanguage}
      className="flex items-center gap-2 text-zinc-400 hover:text-white"
      title={`Current: ${currentLang.nativeName}`}
    >
      <Globe className="h-4 w-4" />
      <span className="text-sm">{currentLang.nativeName}</span>
    </Button>
  )
}
