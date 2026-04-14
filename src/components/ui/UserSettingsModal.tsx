import { useState, useEffect, useRef } from 'react';
import { X, Mic, Settings, LogOut, Camera, Play, Square, Bell } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import PromptModal from './PromptModal';
import { processImageForSupabase } from '../../lib/imageUtils';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'voice' | 'account' | 'appearance' | 'notifications'>('account');
  const { voiceSettings, setVoiceSettings, theme, setTheme } = useAppStore();
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<{username: string, avatar_url: string, status: string}>({
    username: '', avatar_url: '', status: 'online'
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

  useEffect(() => {
    if (isOpen && user) {
      const fetchProfile = async () => {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (data) {
          setProfile({
            username: data.username || '',
            avatar_url: data.avatar_url || '',
            status: data.status || 'online'
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: voiceSettings.echoCancellation,
          noiseSuppression: voiceSettings.noiseSuppression,
          autoGainControl: voiceSettings.autoGainControl,
        } 
      });
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
      alert("Impossible d'accéder au microphone. Veuillez vérifier vos permissions.");
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

    if (file.size > 2 * 1024 * 1024) {
      alert("L'image est trop grande (max 2 MB)");
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
        alert("Ce GIF est trop lourd. Veuillez choisir un GIF plus léger.");
      } else {
        alert("Erreur lors du téléchargement de l'image");
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
        status: profile.status
      });
      
      if (error) throw error;
      
      alert("Profil mis à jour avec succès !");
    } catch (error: any) {
      console.error("Error updating profile:", error);
      alert(`Erreur lors de la mise à jour : ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-zinc-800 w-full max-w-4xl h-full md:h-[80vh] rounded-none md:rounded-lg shadow-2xl flex flex-col md:flex-row overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-full md:w-60 bg-zinc-900/50 flex md:flex-col p-4 border-b md:border-b-0 md:border-r border-zinc-700/50 shrink-0 overflow-x-auto md:overflow-y-auto no-scrollbar gap-2 md:gap-1">
          <div className="hidden md:block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 px-2">
            Paramètres utilisateur
          </div>
          
          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'account' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Settings className="w-4 h-4" />
            <span className="font-medium">Mon Compte</span>
          </button>
          
          <button
            onClick={() => setActiveTab('voice')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'voice' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Mic className="w-4 h-4" />
            <span className="font-medium">Voix et Vidéo</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'appearance' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Settings className="w-4 h-4" />
            <span className="font-medium">Apparence</span>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md md:mb-4 transition-colors whitespace-nowrap ${activeTab === 'notifications' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Bell className="w-4 h-4" />
            <span className="font-medium">Notifications</span>
          </button>

          <div className="md:mt-auto md:pt-4 md:border-t border-zinc-700/50 flex items-center">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap w-full"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium">Déconnexion</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-zinc-800 relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded-full transition-colors flex flex-col items-center gap-1 z-10 bg-zinc-800/80 md:bg-transparent"
          >
            <X className="w-5 h-5" />
            <span className="hidden md:block text-[10px] font-bold uppercase">Échap</span>
          </button>

          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            {activeTab === 'voice' && (
              <div className="max-w-xl">
                <h2 className="text-xl font-bold text-zinc-100 mb-6">Paramètres de la voix</h2>
                
                <div className="space-y-6">
                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Test du micro</h3>
                    <div className="space-y-4">
                      <p className="text-sm text-zinc-400">
                        Vérifiez que votre micro fonctionne correctement. Parlez pour voir la barre réagir.
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
                              Arrêter le test
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 fill-current" />
                              Vérifier le micro
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
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Traitement de la voix</h3>
                    
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">Annulation d'écho</div>
                          <div className="text-xs text-zinc-400">Empêche le micro de capter le son de vos haut-parleurs.</div>
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
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">Suppression du bruit</div>
                          <div className="text-xs text-zinc-400">Filtre les bruits de fond (clavier, ventilateur, etc.).</div>
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
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">Contrôle automatique du gain</div>
                          <div className="text-xs text-zinc-400">Ajuste automatiquement le volume de votre micro pour qu'il soit constant.</div>
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
                          <div className="text-zinc-200 font-medium">Sensibilité du micro</div>
                          <div className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-1 rounded">{voiceSettings.micSensitivity}</div>
                        </div>
                        <p className="text-xs text-zinc-400">Plus la valeur est basse, plus le micro est sensible. (0-100)</p>
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
                          <span>Très sensible</span>
                          <span>Peu sensible</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-zinc-400 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-lg">
                    <p><strong>Note :</strong> Les modifications s'appliqueront lors de votre prochaine connexion à un salon vocal.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="max-w-xl">
                <h2 className="text-xl font-bold text-zinc-100 mb-6">Mon Compte</h2>
                
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
                          Surnom / Pseudo
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
                          Statut
                        </label>
                        <select
                          value={profile.status}
                          onChange={(e) => setProfile({...profile, status: e.target.value})}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="online">En ligne</option>
                          <option value="idle">Absent</option>
                          <option value="dnd">Ne pas déranger</option>
                          <option value="offline">Hors ligne</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          Email
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
                    {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'appearance' && (
              <div className="max-w-xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-6">Apparence</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Thème</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                        onClick={() => setTheme('default')}
                        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${theme === 'default' ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
                      >
                        <div className="w-full h-24 bg-zinc-900 rounded-md mb-3 flex items-center justify-center border border-zinc-700">
                          <div className="w-16 h-12 bg-zinc-800 rounded shadow-sm flex items-center justify-center">
                            <div className="w-8 h-2 bg-indigo-500 rounded-full"></div>
                          </div>
                        </div>
                        <span className="font-medium text-zinc-200">Classique</span>
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
                        <span className="font-medium text-zinc-200">Néon Futuriste</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'notifications' && (
              <div className="max-w-xl">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-6">Notifications</h2>
                
                <div className="space-y-6">
                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Paramètres globaux</h3>
                    
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">Notifications de bureau</div>
                          <div className="text-xs text-zinc-400">Recevoir des notifications push lorsque vous n'êtes pas sur l'onglet.</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${useAppStore.getState().notificationSettings.desktop ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={useAppStore.getState().notificationSettings.desktop} 
                            onChange={(e) => useAppStore.getState().setNotificationSettings({ desktop: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${useAppStore.getState().notificationSettings.desktop ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>

                      <div className="h-px bg-zinc-700/50" />

                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">Sons des messages</div>
                          <div className="text-xs text-zinc-400">Jouer un son lors de la réception d'un nouveau message.</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${useAppStore.getState().notificationSettings.sounds ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={useAppStore.getState().notificationSettings.sounds} 
                            onChange={(e) => useAppStore.getState().setNotificationSettings({ sounds: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${useAppStore.getState().notificationSettings.sounds ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700/50">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Mentions</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div>
                          <div className="text-zinc-200 font-medium group-hover:text-zinc-100">Notifications pour @everyone</div>
                          <div className="text-xs text-zinc-400">Recevoir des notifications pour les mentions générales.</div>
                        </div>
                        <div className={`w-10 h-6 rounded-full transition-colors relative ${useAppStore.getState().notificationSettings.everyone ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={useAppStore.getState().notificationSettings.everyone} 
                            onChange={(e) => useAppStore.getState().setNotificationSettings({ everyone: e.target.checked })}
                          />
                          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${useAppStore.getState().notificationSettings.everyone ? 'translate-x-4' : ''}`} />
                        </div>
                      </label>
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
        title="Changer la photo de profil"
        inputLabel="URL de l'image"
        placeholder="https://..."
        submitText="Valider"
      />
    </div>
  );
}
