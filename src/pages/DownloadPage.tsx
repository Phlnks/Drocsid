import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Monitor, Globe, Bell, Zap, Rocket, ChevronRight, Globe2, Volume2, Shield, Smartphone, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DrocsidLogo from '../components/ui/DrocsidLogo';
import { APP_VERSION } from '../version';

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

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.23 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.69-1.12 1.84-.98 2.94 1.07.08 2.15-.52 2.81-1.33z"/>
    </svg>
  );
}

export function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.523 15.3414c-.551 0-1-.449-1-1s.449-1 1-1 1 .449 1 1-.449 1-1 1zm-11.046 0c-.551 0-1-.449-1-1s.449-1 1-1 1 .449 1 1-.449 1-1 1zm11.515-5.632l1.916-3.316a.449.449 0 10-.778-.449l-1.936 3.351a10.457 10.457 0 00-10.428 0L4.866 5.944a.449.449 0 10-.778.449l1.916 3.316C2.51 11.455 1 14.161 1 17.26h22c0-3.099-1.51-5.805-5.008-7.551z"/>
    </svg>
  );
}

export default function DownloadPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const platforms = [
    {
      id: 'windows',
      name: 'Windows',
      desc: t('download.windowsVersion', 'Windows 10/11 - 64 bits'),
      btnText: t('download.windowsBtn', 'Télécharger pour Windows'),
      href: 'https://drocsid.site/download/Drocsid-Setup.exe',
      icon: WindowsIcon,
      accentColor: 'from-blue-600 to-sky-500',
      shadowColor: 'shadow-blue-500/20',
      badge: t('download.badge.recommended', 'Recommandé'),
      techFeature: t('download.tech.audio', 'Audio de partage d\'application natif inclus'),
    },
    {
      id: 'macos',
      name: 'macOS',
      desc: t('download.macOSVersion', 'macOS 11+ - DMG Universel'),
      btnText: t('download.macOSBtn', 'Télécharger pour macOS'),
      href: 'https://drocsid.site/download/Drocsid-macOS.dmg',
      icon: AppleIcon,
      accentColor: 'from-zinc-400 to-zinc-600',
      shadowColor: 'shadow-zinc-500/10',
      badge: 'Universal',
      techFeature: t('download.tech.macos', 'Optimisé pour Apple Silicon & Intel'),
    },
    {
      id: 'linux',
      name: 'Linux',
      desc: t('download.linuxVersion', 'Linux - AppImage (zip)'),
      btnText: t('download.linuxBtn', 'Télécharger pour Linux'),
      href: 'https://drocsid.site/download/drocsid-linux.zip',
      icon: LinuxIcon,
      accentColor: 'from-orange-600 to-amber-500',
      shadowColor: 'shadow-orange-500/10',
      badge: 'AppImage',
      techFeature: t('download.tech.linux', 'Exécutable portable sans installation'),
    },
    {
      id: 'android',
      name: 'Android',
      desc: t('download.androidVersion', 'Android 8.0+ - APK natif'),
      btnText: t('download.androidBtn', 'Télécharger pour Android'),
      href: 'https://drocsid.site/download/drocsid-mobile.apk',
      icon: AndroidIcon,
      accentColor: 'from-emerald-600 to-green-500',
      shadowColor: 'shadow-emerald-500/15',
      badge: 'APK',
      techFeature: t('download.tech.android', 'Notifications Push & Salons Vocaux'),
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-950/10 blur-[150px] -z-10 rounded-full" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-purple-950/10 blur-[180px] -z-10 rounded-full" />

      {/* Header / Nav */}
      <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900/80">
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
                className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer text-zinc-300"
              >
                <option value="en" className="bg-zinc-950">EN</option>
                <option value="fr" className="bg-zinc-950">FR</option>
                <option value="es" className="bg-zinc-950">ES</option>
              </select>
            </div>
            <button 
              onClick={() => navigate('/')}
              className="px-5 py-2 text-sm font-semibold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white rounded-full transition-all duration-200"
            >
              {t('download.webVersion')}
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-28 pb-20 px-4">
        {/* Logo and Slogan Hero Display (Centered) */}
        <section className="max-w-5xl mx-auto text-center mb-16 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            {/* Ambient subtle glow directly behind the container */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 md:w-96 h-80 md:h-96 bg-indigo-500/10 blur-[130px] rounded-full pointer-events-none" />

            <div className="relative bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-lg rounded-[2.5rem] p-8 md:p-14 w-full max-w-4xl shadow-2xl shadow-indigo-950/20 mb-10 flex flex-col items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none" />
              
              <img
                src="/logo-big.png"
                alt="Drocsid"
                className="w-full max-w-xl h-auto object-contain transition-all duration-500 hover:scale-[1.01]"
              />

              {/* Modern active version badge */}
              <div className="mt-8 px-4 py-2 bg-zinc-950/60 rounded-full border border-zinc-800 text-xs font-semibold text-zinc-300 tracking-wider uppercase shadow-inner flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Version {APP_VERSION}
              </div>
            </div>

            <p className="text-zinc-500 text-sm max-w-md mx-auto flex items-center justify-center gap-2">
              <ArrowDown className="w-4 h-4 animate-bounce text-indigo-400" />
              {t('download.choosePlatform', 'Sélectionnez votre plateforme ci-dessous')}
            </p>
          </motion.div>
        </section>

        {/* Platforms Grid */}
        <section className="max-w-7xl mx-auto mb-20 px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {platforms.map((platform, i) => {
              const IconComponent = platform.icon;
              return (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="bg-zinc-900/50 border border-zinc-800/80 rounded-[2rem] p-6 flex flex-col justify-between hover:bg-zinc-900/80 hover:border-zinc-700/80 transition-all duration-300 group shadow-lg"
                >
                  <div>
                    {/* Header of card */}
                    <div className="flex items-center justify-between mb-6">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${platform.accentColor} flex items-center justify-center text-white ${platform.shadowColor} shadow-lg`}>
                        <IconComponent className="w-6 h-6 transition-transform duration-300 group-hover:scale-110" />
                      </div>
                      {platform.badge && (
                        <span className="px-2.5 py-1 bg-zinc-850 border border-zinc-800 rounded-lg text-[10px] font-bold text-zinc-400 tracking-wider uppercase">
                          {platform.badge}
                        </span>
                      )}
                    </div>

                    {/* Platform details */}
                    <h3 className="text-2xl font-bold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                      {platform.name}
                    </h3>
                    <p className="text-zinc-400 text-sm mb-4">
                      {platform.desc}
                    </p>
                    <p className="text-zinc-500 text-xs leading-relaxed mb-6 border-t border-zinc-850 pt-4">
                      {platform.techFeature}
                    </p>
                  </div>

                  {/* Actions */}
                  <a
                    href={platform.href}
                    download
                    className={`w-full py-3.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold text-sm text-center transition-all duration-200 border border-zinc-750 hover:border-zinc-650 flex items-center justify-center gap-2 group-hover:bg-gradient-to-r group-hover:${platform.accentColor} group-hover:border-transparent group-hover:shadow-md`}
                  >
                    <ArrowDown className="w-4 h-4 transition-transform duration-200 group-hover:translate-y-0.5" />
                    {platform.btnText}
                  </a>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Windows Audio Stream Help / Feature Callout */}
        <section className="max-w-4xl mx-auto mb-20 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-gradient-to-r from-blue-950/20 via-zinc-900/40 to-indigo-950/20 border border-indigo-500/10 rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] -mr-16 -mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 blur-[80px] -ml-16 -mb-16 pointer-events-none" />
            
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 shadow-inner">
                <Volume2 className="w-7 h-7 text-blue-400" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h4 className="text-xl font-bold text-white mb-2 flex items-center justify-center md:justify-start gap-2">
                  <span className="px-2 py-0.5 bg-blue-500/15 border border-blue-500/30 text-[10px] uppercase tracking-wider font-extrabold text-blue-400 rounded-md">Windows Exclusive</span>
                  {t('download.windowsAudio.title')}
                </h4>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {t('download.windowsAudio.desc')}
                </p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="max-w-6xl mx-auto mb-24 px-4">
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
                className="p-8 bg-zinc-900/30 rounded-3xl border border-zinc-800/80 backdrop-blur-sm hover:border-zinc-700/80 transition-colors"
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

        {/* Other Platforms / Web Version Fallback */}
        <section className="max-w-4xl mx-auto px-4">
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-[2.5rem] p-10 md:p-14 relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] -mr-32 -mt-32" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-3xl font-extrabold text-white mb-4">{t('download.otherPlatforms')}</h3>
                <p className="text-lg text-zinc-400 mb-8 max-w-md leading-relaxed">
                  {t('download.macOSMobile')}
                </p>
                <button 
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-white text-black hover:bg-zinc-200 active:scale-98 rounded-xl font-bold transition-all"
                >
                  {t('download.webVersion')}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-6 text-zinc-700">
                <Rocket className="w-24 h-24 stroke-[1px] animate-pulse" />
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

