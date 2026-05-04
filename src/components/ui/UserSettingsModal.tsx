import { useState, useEffect, useRef } from 'react';
import { X, Mic, Settings, LogOut, Camera, Play, Square, Bell, Keyboard, Globe } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import PromptModal from './PromptModal';
import { processImageForSupabase } from '../../lib/imageUtils';
import { useTranslation } from 'react-i18next';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'voice' | 'account' | 'appearance' | 'notifications' | 'keybinds' | 'language' | 'application'>('account');
  const { 
    voiceSettings, setVoiceSettings, 
    theme, setTheme, 
    customTheme, setCustomTheme,
    addNotification, 
    keybinds, setKeybinds,
    notificationSettings, setNotificationSettings,
    appSettings, setAppSettings
  } = useAppStore();
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<{username: string, avatar_url: string, status: string, bio: string}>({
    username: '', avatar_url: '', status: 'online', bio: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  // Mic test state
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Devices
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    // Check permissions and load devices
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
        setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
      } catch (err) {
        console.error("Error accessing devices:", err);
      }
    };
    if (isOpen && activeTab === 'voice') {
      loadDevices();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (isOpen && user) {
      const fetchProfile = async () => {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (data) {
          setProfile({
            username: data.username || '',
            avatar_url: data.avatar_url || '',
            status: data.status || 'online',
            bio: data.bio || ''
          });
        }
      };
      fetchProfile();
    }
  }, [isOpen, user]);

  // Cleanup mic test on unmount or modal close
  useEffect(() => {
    if (!isOpen) {
      stopMicTest();
    }
    return () => {
      stopMicTest();
    };
  }, [isOpen]);

  const startMicTest = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: voiceSettings.echoCancellation,
          noiseSuppression: voiceSettings.noiseSuppression,
          autoGainControl: voiceSettings.autoGainControl,
          ...(voiceSettings.selectedMicrophoneId ? { deviceId: { exact: voiceSettings.selectedMicrophoneId } } : {})
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Connect to destination to hear yourself
      source.connect(audioContext.destination); 

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // Normalize to 0-100
        const volume = Math.min(100, Math.max(0, (average / 255) * 100 * 2)); // * 2 to make it more sensitive
        setMicVolume(volume);

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
      setIsTestingMic(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      addNotification("Impossible d'accéder au microphone. Veuillez vérifier vos permissions.", "error");
    }
  };

  const stopMicTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicVolume(0);
  };

  const toggleMicTest = () => {
    if (isTestingMic) {
      stopMicTest();
    } else {
      startMicTest();
    }
  };

  const handleRandomTheme = () => {
    const randomHex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    setCustomTheme({
      primaryColor: randomHex,
      intensity: Math.floor(Math.random() * 60) + 40, // 40-100%
      appearance: Math.random() > 0.3 ? 'dark' : 'light' // Predominantly dark
    });
    setTheme('custom');
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSignOut = () => {
    supabase.auth.signOut();
    onClose();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 50 * 1024 * 1024) {
      addNotification(t('errors.imageTooLarge', { max: 50 }), "error");
      return;
    }

    setIsSaving(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `user-avatars/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        console.warn("Storage upload failed, falling back to base64 compression", uploadError);
        const base64 = await processImageForSupabase(file, 200); // Smaller limit for profiles
        setProfile(prev => ({ ...prev, avatar_url: base64 }));
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
      }
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      if (error.message === "GIF_TOO_LARGE") {
        addNotification(t('errors.gifTooLarge'), "error");
      } else {
        addNotification(t('errors.imageUploadFailed'), "error");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Use upsert instead of update to handle missing profiles
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        status: profile.status,
        bio: profile.bio
      });
      
      if (error) throw error;
      
      addNotification(t('common.profileUpdated'), "success");
    } catch (error: any) {
      console.error("Error updating profile:", error);
      addNotification(`${t('errors.updateFailed')}: ${error.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-zinc-800 w-full max-w-4xl h-screen md:h-[80vh] rounded-none md:rounded-lg shadow-2xl flex flex-col md:flex-row overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-full md:w-60 bg-zinc-900/50 flex md:flex-col p-4 border-b md:border-b-0 md:border-r border-zinc-700/50 shrink-0 overflow-x-auto md:overflow-y-auto no-scrollbar gap-2 md:gap-1">
          <div className="hidden md:block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 px-2">
            {t('settings.title')}
          </div>
          
          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'account' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Settings className="w-4 h-4" />
            <span className="font-medium">{t('settings.account')}</span>
          </button>
          
          <button
            onClick={() => setActiveTab('voice')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'voice' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Mic className="w-4 h-4" />
            <span className="font-medium">{t('settings.voice')}</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'appearance' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Settings className="w-4 h-4" />
            <span className="font-medium">{t('settings.appearance')}</span>
          </button>

          <button
            onClick={() => setActiveTab('application')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'application' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Play className="w-4 h-4 rotate-90" />
            <span className="font-medium">{t('settings.application')}</span>
          </button>

          <button
            onClick={() => setActiveTab('language')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'language' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Globe className="w-4 h-4" />
            <span className="font-medium">{t('modals.userSettings.language')}</span>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'notifications' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Bell className="w-4 h-4" />
            <span className="font-medium">{t('settings.notifications')}</span>
          </button>

          <button
            onClick={() => setActiveTab('keybinds')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md md:mb-4 transition-colors whitespace-nowrap ${activeTab === 'keybinds' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Keyboard className="w-4 h-4" />
            <span className="font-medium">{t('settings.keybinds')}</span>
          </button>

          <div className="md:mt-auto md:pt-4 md:border-t border-zinc-700/50 flex items-center">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap w-full"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium">{t('settings.logout')}</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-zinc-800 relative min-h-0">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded-full transition-colors flex flex-col items-center gap-1 z-10 bg-zinc-800/80 md:bg-transparent"
          >
            <X className="w-5 h-5" />
            <span className="hidden md:block text-[10px] font-bold uppercase">{t('common.esc')}</span>
          </button>

          <div className="flex-1 overflow-y-auto pt-6 pl-6 pb-6 pr-16 md:pt-10 md:pl-10 md:pb-10 md:pr-24 custom-scrollbar">
            {activeTab === 'voice' && (
              <div className="max-w-xl">
                <h2 className="text-xl font-bold text-zinc-100 mb-6">{t('settings.voice')}</h2>
                
                <div className="space-y-6">
                  {/* Périphériques */}
                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.voiceVideo.hardwareDevices')}</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{t('settings.voiceVideo.inputDevice')}</label>
                        <select 
                          className="w-full bg-zinc-800 text-zinc-100 border border-zinc-600 rounded p-2 outline-none focus:border-indigo-500"
                          value={voiceSettings.selectedMicrophoneId || ''}
                          onChange={(e) => setVoiceSettings({ selectedMicrophoneId: e.target.value })}
                        >
                          <option value="">{t('settings.voiceVideo.default')}</option>
                          {audioInputs.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>{device.label || `${t('settings.voiceVideo.inputDevice')} ${device.deviceId.substring(0,5)}`}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                         <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{t('settings.voiceVideo.outputDevice')}</label>
                         <select 
                          className="w-full bg-zinc-800 text-zinc-100 border border-zinc-600 rounded p-2 outline-none focus:border-indigo-500"
                          value={voiceSettings.selectedSpeakerId || ''}
                          onChange={(e) => setVoiceSettings({ selectedSpeakerId: e.target.value })}
                        >
                          <option value="">{t('settings.voiceVideo.default')}</option>
                          {audioOutputs.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>{device.label || `${t('settings.voiceVideo.outputDevice')} ${device.deviceId.substring(0,5)}`}</option>
                          ))}
                        </select>
                        <p className="text-xs text-zinc-500 mt-1">{t('settings.voiceVideo.audioOutputChangeNote')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.voiceVideo.micTest')}</h3>
                    <div className="space-y-4">
                      <p className="text-sm text-zinc-400">
                        {t('settings.voiceVideo.micTestNote')}
                      </p>
                      
                      <div className="flex items-center gap-4">
                        <button
                          onClick={toggleMicTest}
                          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                            isTestingMic 
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50' 
                              : 'bg-indigo-500 text-white hover:bg-indigo-600'
                          }`}
                        >
                          {isTestingMic ? (
                            <>
                              <Square className="w-4 h-4 fill-current" />
                              {t('settings.voiceVideo.stopTest')}
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 fill-current" />
                              {t('settings.voiceVideo.checkMic')}
                            </>
                          )}
                        </button>
                        
                        <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-75 ease-out"
                            style={{ width: `${micVolume}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.voiceVideo.voiceProcessing')}</h3>
                    
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">{t('settings.voiceVideo.echoCancellation')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.voiceVideo.echoCancellationDesc')}</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${voiceSettings.echoCancellation ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={voiceSettings.echoCancellation}
                            onChange={(e) => setVoiceSettings({ echoCancellation: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${voiceSettings.echoCancellation ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>

                      <div className="h-px bg-zinc-700/50" />

                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">{t('settings.voiceVideo.noiseSuppression')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.voiceVideo.noiseSuppressionDesc')}</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${voiceSettings.noiseSuppression ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={voiceSettings.noiseSuppression}
                            onChange={(e) => setVoiceSettings({ noiseSuppression: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${voiceSettings.noiseSuppression ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>

                      <div className="h-px bg-zinc-700/50" />

                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">{t('settings.voiceVideo.autoGainControl')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.voiceVideo.autoGainControlDesc')}</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${voiceSettings.autoGainControl ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={voiceSettings.autoGainControl}
                            onChange={(e) => setVoiceSettings({ autoGainControl: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${voiceSettings.autoGainControl ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>

                      <div className="h-px bg-zinc-700/50" />

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-zinc-200 font-medium">{t('settings.voiceVideo.micSensitivity')}</div>
                          <div className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-1 rounded">{voiceSettings.micSensitivity}</div>
                        </div>
                        <p className="text-xs text-zinc-400">{t('settings.voiceVideo.micSensitivityDesc')}</p>
                        <input 
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={voiceSettings.micSensitivity}
                          onChange={(e) => setVoiceSettings({ micSensitivity: parseInt(e.target.value) })}
                          className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                          <span>{t('settings.voiceVideo.verySensitive')}</span>
                          <span>{t('settings.voiceVideo.lessSensitive')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-zinc-400 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-lg">
                    <p>{t('settings.voiceVideo.voiceChangeNote')}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="max-w-xl">
                <h2 className="text-xl font-bold text-zinc-100 mb-6">{t('settings.account')}</h2>
                
                <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-700/50 mb-6">
                  <div className="flex gap-6 items-start">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full bg-indigo-500 flex items-center justify-center overflow-hidden shrink-0 text-3xl font-bold text-white relative">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          profile.username?.charAt(0).toUpperCase() || 'U'
                        )}
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <Camera className="w-8 h-8 text-white" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleAvatarUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border-4 border-zinc-900 ${
                        profile.status === 'online' ? 'bg-emerald-500' :
                        profile.status === 'idle' ? 'bg-amber-500' :
                        profile.status === 'dnd' ? 'bg-red-500' : 'bg-zinc-500'
                      }`} />
                    </div>
                    
                    <div className="flex-1 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          {t('modals.userProfile.username')}
                        </label>
                        <input
                          type="text"
                          value={profile.username}
                          onChange={(e) => setProfile({...profile, username: e.target.value})}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          {t('modals.userSettings.aboutMe')}
                        </label>
                        <textarea
                          value={profile.bio}
                          onChange={(e) => setProfile({...profile, bio: e.target.value})}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500 resize-none h-20"
                          maxLength={200}
                          placeholder={t('modals.userSettings.aboutMePlaceholder')}
                        />
                        <div className="text-right text-[10px] text-zinc-500 mt-1">
                          {profile.bio.length}/200
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          {t('modals.userProfile.status')}
                        </label>
                        <select
                          value={profile.status}
                          onChange={(e) => setProfile({...profile, status: e.target.value})}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="online">{t('modals.userProfile.online')}</option>
                          <option value="idle">{t('modals.userProfile.idle')}</option>
                          <option value="dnd">{t('modals.userProfile.dnd')}</option>
                          <option value="offline">{t('modals.userProfile.offline')}</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          {t('modals.userProfile.email')}
                        </label>
                        <input
                          type="text"
                          value={user?.email || ''}
                          disabled
                          className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-md px-3 py-2 text-zinc-500 cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
                  >
                    {isSaving ? t('modals.userSettings.saving') : t('modals.userSettings.saveChanges')}
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'appearance' && (
              <div className="max-w-xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-6">{t('modals.userSettings.appearance')}</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">{t('settings.appearanceSettings.activeTheme')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <button
                        onClick={() => setTheme('classic')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'classic' ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-zinc-900 rounded-md mb-3 flex items-center justify-center border border-zinc-700">
                          <div className="w-16 h-12 bg-zinc-800 rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-indigo-500 rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.classic')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('neon')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'neon' ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#050510] rounded-md mb-3 flex items-center justify-center border border-[#1a1a3a] shadow-[0_0_15px_rgba(217,70,239,0.2)]">
                          <div className="w-16 h-12 bg-[#0a0a1a] rounded border border-fuchsia-500/50 shadow-[0_0_10px_rgba(217,70,239,0.3)] flex items-center justify-center">
                            <div className="w-8 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.neon')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('ocean')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'ocean' ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#0A192F] rounded-md mb-3 flex items-center justify-center border border-[#112240]">
                          <div className="w-16 h-12 bg-[#112240] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-sky-500 rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.ocean')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('forest')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'forest' ? 'border-green-500 bg-green-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#112015] rounded-md mb-3 flex items-center justify-center border border-[#1d3323]">
                          <div className="w-16 h-12 bg-[#1d3323] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-green-500 rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.forest')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('sunset')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'sunset' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#2a1717] rounded-md mb-3 flex items-center justify-center border border-[#3f2222]">
                          <div className="w-16 h-12 bg-[#3f2222] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-orange-500 rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.sunset')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('dracula')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'dracula' ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#282a36] rounded-md mb-3 flex items-center justify-center border border-[#44475a]">
                          <div className="w-16 h-12 bg-[#44475a] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-[#bd93f9] rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.dracula', 'Dracula')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('synthwave')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'synthwave' ? 'border-pink-500 bg-pink-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#261447] rounded-md mb-3 flex items-center justify-center border border-[#4a2d8a]">
                          <div className="w-16 h-12 bg-[#2f1b54] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-[#ff7edb] rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.synthwave', 'Synthwave')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('nord')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'nord' ? 'border-[#88c0d0] bg-[#88c0d0]/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#2e3440] rounded-md mb-3 flex items-center justify-center border border-[#434c5e]">
                          <div className="w-16 h-12 bg-[#3b4252] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-[#81a1c1] rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.nord', 'Nord')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('monokai')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'monokai' ? 'border-[#f92672] bg-[#f92672]/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#272822] rounded-md mb-3 flex items-center justify-center border border-[#49483e]">
                          <div className="w-16 h-12 bg-[#3e3d32] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-[#a6e22e] rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.monokai', 'Monokai')}</span>
                      </button>

                      <button
                        onClick={() => setTheme('cyberpunk')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'cyberpunk' ? 'border-[#fcee0a] bg-[#fcee0a]/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-[#0d0221] rounded-md mb-3 flex items-center justify-center border border-[#3b0985]">
                          <div className="w-16 h-12 bg-[#1e0548] rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-[#00ff9f] rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">{t('settings.appearanceSettings.cyberpunk', 'Cyberpunk')}</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-zinc-700/50">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0">
                        <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                          <span className="text-xl">🎨</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white leading-tight">{t('settings.appearanceSettings.customThemeTitle', 'Crée ton propre thème')}</h3>
                        <p className="text-sm text-zinc-400">{t('settings.appearanceSettings.customThemeDesc', 'Donne du style à ton espace avec une infinité de combinaisons de couleurs.')}</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-700/50 space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button 
                          onClick={() => setTheme('custom')}
                          className={`py-3 px-4 rounded-lg font-bold transition-all shadow-lg ${theme === 'custom' ? 'bg-indigo-500 text-white shadow-indigo-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                        >
                          {t('settings.appearanceSettings.customThemeBtn', 'Vas-y, essaie !')}
                        </button>
                        <button 
                          onClick={handleRandomTheme}
                          className="py-3 px-4 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-bold transition-all border border-zinc-700 flex items-center justify-center gap-2"
                        >
                          <span className="text-lg">🎲</span>
                          {t('settings.appearanceSettings.surpriseMe', 'Surprends-moi !')}
                        </button>
                      </div>

                      {theme === 'custom' && (
                        <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-top-4 duration-300">
                          <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">{t('settings.appearanceSettings.appearance', 'Apparence')}</label>
                            <div className="grid grid-cols-2 gap-3 bg-zinc-800 p-1 rounded-lg">
                              <button 
                                onClick={() => setCustomTheme({ appearance: 'dark' })}
                                className={`py-2 rounded-md flex items-center justify-center gap-2 transition-all ${customTheme.appearance === 'dark' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                🌙 {t('common.dark', 'Sombre')}
                              </button>
                              <button 
                                onClick={() => setCustomTheme({ appearance: 'light' })}
                                className={`py-2 rounded-md flex items-center justify-center gap-2 transition-all ${customTheme.appearance === 'light' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                ☀️ {t('common.light', 'Clair')}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">{t('settings.appearanceSettings.colors', 'Couleurs')}</label>
                            <div className="flex items-center gap-3">
                               <div className="relative">
                                 <input 
                                   type="color" 
                                   value={customTheme.primaryColor}
                                   onChange={(e) => setCustomTheme({ primaryColor: e.target.value })}
                                   className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none outline-none appearance-none p-0 overflow-hidden"
                                 />
                               </div>
                               <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 font-mono text-sm uppercase">
                                 {customTheme.primaryColor}
                               </div>
                            </div>
                          </div>

                          <div>
                             <div className="flex items-center justify-between mb-3">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('settings.appearanceSettings.intensity', 'Intensité de la couleur')}</label>
                                <span className="text-sm font-bold text-zinc-300">{customTheme.intensity}%</span>
                             </div>
                             <input 
                                type="range"
                                min="0"
                                max="100"
                                value={customTheme.intensity}
                                onChange={(e) => setCustomTheme({ intensity: parseInt(e.target.value) })}
                                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                             />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'language' && (
              <div className="max-w-xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-6 uppercase tracking-wider">{t('modals.userSettings.language')}</h2>
                
                <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-700/50">
                  <p className="text-zinc-400 mb-6">{t('modals.userSettings.langDesc')}</p>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => {
                        i18n.changeLanguage('fr');
                        window.location.reload();
                      }}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-all ${i18n.language.startsWith('fr') ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500/50' : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-700/50'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shadow-inner border border-zinc-600/50">
                          <img src="https://flagcdn.com/w80/fr.png" alt="FR" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-white">Français</div>
                          <div className="text-xs text-zinc-400">French</div>
                        </div>
                      </div>
                      {i18n.language.startsWith('fr') && <div className="w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>}
                    </button>

                    <button 
                      onClick={() => {
                        i18n.changeLanguage('en');
                        window.location.reload();
                      }}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-all ${i18n.language.startsWith('en') ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500/50' : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-700/50'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shadow-inner border border-zinc-600/50">
                          <img src="https://flagcdn.com/w80/us.png" alt="US" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-white">English (US)</div>
                          <div className="text-xs text-zinc-400">English</div>
                        </div>
                      </div>
                      {i18n.language.startsWith('en') && <div className="w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>}
                    </button>

                    <button 
                      onClick={() => {
                        i18n.changeLanguage('es');
                        window.location.reload();
                      }}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-all ${i18n.language.startsWith('es') ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500/50' : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-700/50'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden shadow-inner border border-zinc-600/50">
                          <img src="https://flagcdn.com/w80/es.png" alt="ES" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-white">Español</div>
                          <div className="text-xs text-zinc-400">Spanish</div>
                        </div>
                      </div>
                      {i18n.language.startsWith('es') && <div className="w-3 h-3 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>}
                    </button>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-xs text-amber-200">
                    <strong>Note:</strong> L'application redémarrera pour appliquer les changements de langue de manière optimale.
                  </p>
                </div>
              </div>
            )}
            
            {activeTab === 'application' && (
              <div className="max-w-xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-6 tracking-tight">{t('settings.application')}</h2>
                
                <div className="space-y-6">
                  {/* Startup - Only show if Electron */}
                  {((window as any).electron || true) && (
                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                      <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.applicationSettings.windowStartup')}</h3>
                      
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div className="flex-1 pr-4">
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">{t('settings.applicationSettings.launchAtStartup')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.applicationSettings.launchAtStartupDesc')}</div>
                        </div>
                        <div className={`w-10 h-6 shrink-0 rounded-full transition-colors relative ${appSettings.launchAtStartup ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={appSettings.launchAtStartup} 
                            onChange={(e) => setAppSettings({ launchAtStartup: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${appSettings.launchAtStartup ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.applicationSettings.dateTimeFormat')}</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{t('settings.applicationSettings.dateFormat')}</label>
                        <select 
                          className="w-full bg-zinc-800 text-zinc-100 border border-zinc-600 rounded p-2 outline-none focus:border-indigo-500"
                          value={appSettings.dateFormat}
                          onChange={(e) => setAppSettings({ dateFormat: e.target.value as any })}
                        >
                          <option value="dd/MM/yyyy">{t('settings.applicationSettings.example', { value: '28/04/2026' })}</option>
                          <option value="MM/dd/yyyy">{t('settings.applicationSettings.example', { value: '04/28/2026' })}</option>
                          <option value="yyyy-MM-dd">{t('settings.applicationSettings.example', { value: '2026-04-28' })}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{t('settings.applicationSettings.timeFormat')}</label>
                        <select 
                          className="w-full bg-zinc-800 text-zinc-100 border border-zinc-600 rounded p-2 outline-none focus:border-indigo-500"
                          value={appSettings.timeFormat}
                          onChange={(e) => setAppSettings({ timeFormat: e.target.value as any })}
                        >
                          <option value="HH:mm">{t('settings.applicationSettings.example', { value: '16:45' })}</option>
                          <option value="hh:mm a">{t('settings.applicationSettings.example', { value: '04:45 PM' })}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-indigo-600/10 p-5 rounded-xl border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-left">
                      <h3 className="text-base font-bold text-indigo-100 mb-1">{t('download.title')}</h3>
                      <p className="text-xs text-indigo-300/80 leading-relaxed">{t('download.subtitle')}</p>
                    </div>
                    <button 
                      onClick={() => window.open('/download', '_blank')}
                      className="w-full sm:w-auto bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 shrink-0"
                    >
                      {t('download.downloadButton')}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'notifications' && (
              <div className="max-w-xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-6">{t('settings.notifications')}</h2>
                
                <div className="space-y-6">
                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.notificationsSettings.notificationType')}</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-zinc-200 font-medium">{t('settings.notificationsSettings.receptionPreference')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.notificationsSettings.receptionPreferenceDesc')}</div>
                        </div>
                        <select 
                          value={notificationSettings.preference}
                          onChange={(e) => setNotificationSettings({ preference: e.target.value as any })}
                          className="bg-zinc-800 border border-zinc-700 rounded p-1 text-sm text-white outline-none focus:border-indigo-500"
                        >
                          <option value="all">{t('settings.notificationsSettings.allMessages')}</option>
                          <option value="mentions">{t('settings.notificationsSettings.onlyMentions')}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.notificationsSettings.globalSettings')}</h3>
                    
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">{t('settings.notificationsSettings.desktopNotifications')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.notificationsSettings.desktopNotificationsDesc')}</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${notificationSettings.desktop ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={notificationSettings.desktop} 
                            onChange={(e) => setNotificationSettings({ desktop: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${notificationSettings.desktop ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>

                      <div className="h-px bg-zinc-700/50" />

                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">{t('settings.notificationsSettings.messageSounds')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.notificationsSettings.messageSoundsDesc')}</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${notificationSettings.sounds ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={notificationSettings.sounds} 
                            onChange={(e) => setNotificationSettings({ sounds: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${notificationSettings.sounds ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.notificationsSettings.mentions')}</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">{t('settings.notificationsSettings.everyoneNotifications')}</div>
                          <div className="text-xs text-zinc-400">{t('settings.notificationsSettings.everyoneNotificationsDesc')}</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${notificationSettings.everyone ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={notificationSettings.everyone} 
                            onChange={(e) => setNotificationSettings({ everyone: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${notificationSettings.everyone ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'keybinds' && (
              <div className="max-w-xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-6">{t('settings.keybindsSettings.title')}</h2>
                <p className="text-zinc-400 mb-6">{t('settings.keybindsSettings.description')}</p>
                
                <div className="space-y-6">
                  {/* Mute Keybind */}
                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.keybindsSettings.mute')}</h3>
                    <div className="group">
                      <div className="text-xs text-zinc-400 mb-2">{t('settings.keybindsSettings.muteDesc')}</div>
                      <input 
                        type="text" 
                        readOnly
                        value={keybinds.mute}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                        onKeyDown={(e) => {
                          e.preventDefault();
                          const keys = [];
                          if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl');
                          if (e.altKey) keys.push('Alt');
                          if (e.shiftKey) keys.push('Shift');
                          
                          let key = e.key;
                          // Handle specialization for Electron
                          if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return;
                          if (key === ' ') key = 'Space';
                          if (key.length === 1) key = key.toUpperCase();
                          // Ensure keys like F8 stay F8
                          
                          keys.push(key);
                          const finalShortcut = keys.join('+');
                          setKeybinds({ mute: finalShortcut });
                        }}
                      />
                    </div>
                  </div>

                  {/* Deafen Keybind */}
                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">{t('settings.keybindsSettings.deafen')}</h3>
                    <div className="group">
                      <div className="text-xs text-zinc-400 mb-2">{t('settings.keybindsSettings.deafenDesc')}</div>
                      <input 
                        type="text" 
                        readOnly
                        value={keybinds.deafen}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                        onKeyDown={(e) => {
                          e.preventDefault();
                          const keys = [];
                          if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl');
                          if (e.altKey) keys.push('Alt');
                          if (e.shiftKey) keys.push('Shift');
                          
                          let key = e.key;
                          if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return;
                          if (key === ' ') key = 'Space';
                          if (key.length === 1) key = key.toUpperCase();
                          
                          keys.push(key);
                          const finalShortcut = keys.join('+');
                          setKeybinds({ deafen: finalShortcut });
                        }}
                      />
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PromptModal
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        onSubmit={(url) => setProfile({...profile, avatar_url: url})}
        title={t('modals.userProfile.changeAvatar')}
        inputLabel={t('modals.userProfile.imageUrl')}
        placeholder="https://..."
        submitText={t('common.save')}
      />
    </div>
  );
}
