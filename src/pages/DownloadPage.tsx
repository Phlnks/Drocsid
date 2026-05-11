import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Download, Monitor, Globe, Bell, Zap, Rocket, ChevronRight, Globe2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DrocsidLogo from '../components/ui/DrocsidLogo';

export function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  );
}

export function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.996 0A7.836 7.836 0 005.15 6.551a14.735 14.735 0 00-.734 5.923c-.15 1.547.054 2.859.387 3.904-1.258.468-2.607 1.488-3.033 2.924-.486 1.636.326 2.378.89 2.378.506 0 .807-.367.92-.619.26-.576.136-1.503 1-1.745l.185-.054-.108.163c-.452.684.053 2.146.685 2.83.696.754 1.764 1.25 3.09 1.474a10.635 10.635 0 007.135-.615c1.173-.559 1.954-1.393 2.455-2.07l.135-.184v-.223a2.49 2.49 0 00-.477-1.428l-.135-.184.22-.054c.797-.197 1.23-.746 1.428-1.127.3-.58.375-1.218.15-1.928-.277-.872-1.284-1.848-2.887-2.316l.169-.425c.34-2 .28-5.753-.5-8.232C15.65 1.83 13.914 0 11.996 0zm0 1.292c1.464 0 2.84 1.492 3.493 4.098.67 2.687.584 6.002.324 7.643l-.685 4.316a5.27 5.27 0 01-1.325.263 11 11 0 01-1.803.076 5.617 5.617 0 01-2.91-1.116 5.766 5.766 0 01-1.332-1.722c-.177-1.423.013-5.2.59-7.514.545-2.186 1.806-6.044 3.648-6.044zm-2.19 6.22c-.653 0-1.255.454-1.36 1.05-.11.606.335 1.134.99 1.134.653 0 1.254-.45 1.36-1.05.105-.607-.336-1.135-.99-1.135zm4.335 0c-.655 0-1.256.454-1.36 1.05-.106.606.335 1.134.99 1.134.654 0 1.254-.45 1.358-1.05.107-.607-.334-1.135-.988-1.135z" />
    </svg>
  );
}

export default function DownloadPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden">
      {/* Header / Nav */}
      <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center border border-zinc-800 shadow-xl group-hover:scale-110 transition-transform duration-300">
              <DrocsidLogo className="w-7 h-7" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Drocsid
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-zinc-900 rounded-full px-3 py-1 border border-zinc-800">
              <Globe2 className="w-4 h-4 text-zinc-500" />
              <select 
                value={i18n.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
              >
                <option value="en" className="bg-zinc-900">EN</option>
                <option value="fr" className="bg-zinc-900">FR</option>
                <option value="es" className="bg-zinc-900">ES</option>
              </select>
            </div>
            <button 
              onClick={() => navigate('/')}
              className="px-5 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
            >
              {t('download.webVersion')}
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-4">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto text-center mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight">
              {t('download.title')}
            </h1>
            <p className="text-xl md:text-2xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              {t('download.subtitle')}
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-3">
                <a 
                  href="http://drocsid.ddns.net/Drocsid-Setup.exe" 
                  download
                  className="group relative inline-flex items-center gap-3 w-[280px] justify-center px-8 py-5 bg-[#0078D4] hover:bg-[#006cbd] text-white rounded-2xl font-bold text-xl shadow-2xl shadow-[#0078D4]/30 transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  <WindowsIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  {t('download.windowsBtn')}
                </a>
                <span className="text-sm font-medium text-zinc-500">
                  {t('download.windowsVersion')}
                </span>
              </div>

              <div className="flex flex-col items-center gap-3">
                <a 
                  href="http://drocsid.ddns.net/drocsid-linux.zip" 
                  download
                  className="group relative inline-flex items-center gap-3 w-[280px] justify-center px-8 py-5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold text-xl shadow-2xl shadow-zinc-900/50 transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  <LinuxIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  {t('download.linuxBtn', 'Télécharger pour Linux')}
                </a>
                <span className="text-sm font-medium text-zinc-500">
                  {t('download.linuxVersion', 'Linux - AppImage (zip)')}
                </span>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="max-w-6xl mx-auto mb-32">
          <h2 className="text-3xl font-bold mb-12 text-center text-zinc-400 uppercase tracking-widest text-sm">
            {t('download.features.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Zap, text: t('download.features.voice'), color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { icon: Bell, text: t('download.features.notifications'), color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
              { icon: Monitor, text: t('download.features.startup'), color: 'text-orange-400', bg: 'bg-orange-500/10' }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-8 bg-zinc-900/50 rounded-3xl border border-zinc-800 backdrop-blur-sm hover:border-zinc-700 transition-colors"
              >
                <div className={`w-12 h-12 ${feature.bg} rounded-2xl flex items-center justify-center mb-6`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <p className="text-lg font-medium leading-relaxed text-zinc-300">
                  {feature.text}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Other Platforms */}
        <section className="max-w-4xl mx-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-10 md:p-16 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] -mr-32 -mt-32" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-3xl font-bold mb-4">{t('download.otherPlatforms')}</h3>
                <p className="text-lg text-zinc-400 mb-8 max-w-md">
                  {t('download.macOSMobile', 'Notre version navigateur est entièrement adaptative et fonctionne parfaitement pour macOS et mobile.')}
                </p>
                <button 
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-bold hover:bg-zinc-200 transition-colors"
                >
                  {t('download.webVersion')}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-6 text-zinc-600">
                <Rocket className="w-24 h-24 stroke-[1px]" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-zinc-900">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6 text-zinc-500 text-sm">
          <div className="flex items-center gap-2">
            <DrocsidLogo className="w-4 h-4" />
            <span>&copy; {new Date().getFullYear()} Drocsid. All rights reserved.</span>
          </div>          
        </div>
      </footer>
    </div>
  );
}
