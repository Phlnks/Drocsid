const fs = require('fs');

const updateLocale = (lang, newObj) => {
    const file = `src/locales/${lang}/translation.json`;
    let current = {};
    if (fs.existsSync(file)) {
        current = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    
    // deep merge
    function mergeDeep(target, source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                Object.assign(source[key], mergeDeep(target[key], source[key]));
            }
        }
        Object.assign(target || {}, source);
        return target;
    }
    
    const next = mergeDeep(current, newObj);
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
};

const en = {
  app: {
    loading: "Loading...",
    readyToChat: "Ready to chat?",
    openInNewTab: "For optimal experience and to allow Google login, the app must be opened in a new tab.",
    launchApp: "Launch Application",
    secureLogin: "Once opened, you can securely log in.",
    invalidInvite: "The invite is invalid or has expired.",
    errorJoinLink: "Error joining server via link.",
    sidebar: {
      directMessages: "Direct Messages"
    },
    serverList: {
      invalidInvite: "Invalid or expired invite.",
      errorJoin: "Error joining server.",
      unmute: "Unmute server",
      mute: "Mute server"
    }
  },
  channelList: {
    channels: "Text Channels",
    voiceChannels: "Voice Channels",
    newChannel: "New Channel",
    leaveServerConfirm: "Are you sure you want to leave this server?",
    leaveServer: "Leave Server",
    serverSettings: "Server Settings",
    createChannelSuccess: "Channel created successfully",
    createChannelError: "Error creating channel"
  },
  serverList: {
    addServer: "Add a Server",
    exploreServers: "Explore Public Servers"
  },
  messageInput: {
    typeMessage: "Type a message",
    send: "Send",
    reactions: "Reactions"
  },
  chatArea: {
    welcome: "Welcome to",
    startOfChannel: "This is the start of the #{{channel}} channel.",
    messagePlaceholder: "Message #{{channel}}",
    replyingTo: "Replying to",
    cancel: "Cancel",
    save: "Save",
    editMessage: "Edit Message",
    deleteMessage: "Delete Message",
    pinMessage: "Pin Message",
    searchPlaceholder: "Search...",
    moreEmojis: "More emojis",
    addReaction: "Add reaction",
    newMessages: "New messages",
    editInstructions: "Esc to cancel, Enter to save",
    edited: "(edited)",
    pinnedBy: "Pinned by",
    pinnedAt: "at",
    voiceChannelNoText: "Voice channels do not have text chat.",
    pinnedMessages: "Pinned Messages",
    toggleMemberList: "Toggle member list",
    today: "Today",
    yesterday: "Yesterday"
  },
  modals: {
    addServer: {
      titleMenu: "Add a server",
      titleCreate: "Create your server",
      titleJoin: "Join a server",
      menuDescription: "Your server is where you and your friends hang out. Make yours and start talking.",
      createServerBtn: "Create My Own",
      joinServerBtn: "Join a Server",
      or: "or",
      createDescription: "Give your new server a personality with a name and an icon. You can always change it later.",
      serverName: "Server Name",
      serverNamePlaceholder: "My Awesome Server",
      back: "Back",
      create: "Create",
      joinDescription: "Enter an invite link below to join an existing server.",
      inviteLink: "Invite Link",
      invitePlaceholder: "https://... or invite code",
      join: "Join Server"
    },
    renameChannel: {
      title: "Rename Channel",
      channelName: "Channel Name",
      placeholder: "new-name",
      cancel: "Cancel",
      save: "Save"
    },
    createChannel: {
      title: "Create Channel",
      channelType: "Channel Type",
      text: "Text",
      textDesc: "Send messages, images, GIFs, emoji, opinions, and puns",
      voice: "Voice",
      voiceDesc: "Hang out together with voice, video, and screen share",
      afk: "AFK",
      afkDesc: "Inactive users are moved here. No voice or text.",
      category: "Category",
      noCategory: "No Category",
      channelName: "Channel Name",
      placeholder: "new-channel",
      cancel: "Cancel",
      create: "Create Channel"
    },
    userSettings: {
      language: "Language",
      appLanguage: "Application Language",
      langDesc: "Choose the display language. The application will automatically reload.",
      fr: "Français",
      en: "English",
      es: "Español"
    }
  }
};

const fr = {
  app: {
    loading: "Chargement...",
    readyToChat: "Prêt à discuter ?",
    openInNewTab: "Pour une expérience optimale et pour permettre la connexion Google, l'application doit être ouverte dans un nouvel onglet.",
    launchApp: "Lancer l'application",
    secureLogin: "Une fois ouvert, vous pourrez vous connecter en toute sécurité.",
    invalidInvite: "L'invitation est invalide ou a expiré.",
    errorJoinLink: "Erreur lors de la connexion au serveur via le lien.",
    sidebar: {
      directMessages: "Messages directs"
    },
    serverList: {
      invalidInvite: "Invitation invalide ou expirée.",
      errorJoin: "Erreur lors de la connexion au serveur.",
      unmute: "Réactiver les notifications",
      mute: "Rendre le serveur muet"
    }
  },
  channelList: {
    channels: "Salons Textuels",
    voiceChannels: "Salons Vocaux",
    newChannel: "Nouveau salon",
    leaveServerConfirm: "Êtes-vous sûr de vouloir quitter ce serveur ?",
    leaveServer: "Quitter le serveur",
    serverSettings: "Paramètres du serveur",
    createChannelSuccess: "Salon créé avec succès",
    createChannelError: "Erreur lors de la création du salon"
  },
  serverList: {
    addServer: "Ajouter un serveur",
    exploreServers: "Explorer les serveurs"
  },
  messageInput: {
    typeMessage: "Envoyer un message",
    send: "Envoyer",
    reactions: "Réactions"
  },
  chatArea: {
    welcome: "Bienvenue dans",
    startOfChannel: "C'est le début du salon #{{channel}}.",
    messagePlaceholder: "Envoyer un message dans #{{channel}}",
    replyingTo: "En réponse à",
    cancel: "Annuler",
    save: "Enregistrer",
    editMessage: "Modifier le message",
    deleteMessage: "Supprimer le message",
    pinMessage: "Épingler le message",
    searchPlaceholder: "Rechercher...",
    moreEmojis: "Plus d'emojis",
    addReaction: "Ajouter une réaction",
    newMessages: "Nouveaux messages",
    editInstructions: "Échap pour annuler, Entrée pour valider",
    edited: "(modifié)",
    pinnedBy: "Épinglé par",
    pinnedAt: "à",
    voiceChannelNoText: "Les salons vocaux ne disposent pas de chat textuel.",
    pinnedMessages: "Messages épinglés",
    toggleMemberList: "Basculer la liste des membres",
    today: "Aujourd'hui",
    yesterday: "Hier"
  },
  modals: {
    addServer: {
      titleMenu: "Ajouter un serveur",
      titleCreate: "Créer votre serveur",
      titleJoin: "Rejoindre un serveur",
      menuDescription: "Votre serveur est l'endroit où vous et vos amis vous retrouvez. Créez le vôtre et commencez à discuter.",
      createServerBtn: "Créer un serveur",
      joinServerBtn: "Rejoindre un serveur",
      or: "ou",
      createDescription: "Donnez une personnalité à votre nouveau serveur avec un nom et une icône. Vous pourrez toujours les modifier plus tard.",
      serverName: "Nom du serveur",
      serverNamePlaceholder: "Mon super serveur",
      back: "Retour",
      create: "Créer",
      joinDescription: "Entrez un lien d'invitation ci-dessous pour rejoindre un serveur existant.",
      inviteLink: "Lien d'invitation",
      invitePlaceholder: "https://... ou code d'invitation",
      join: "Rejoindre"
    },
    renameChannel: {
      title: "Renommer le salon",
      channelName: "Nom du salon",
      placeholder: "nouveau-nom",
      cancel: "Annuler",
      save: "Enregistrer"
    },
    createChannel: {
      title: "Créer un salon",
      channelType: "Type de salon",
      text: "Texte",
      textDesc: "Envoyez des messages, des images, des GIF, des emojis et des mèmes",
      voice: "Vocal",
      voiceDesc: "Retrouvez-vous avec la voix, la vidéo et le partage d'écran",
      afk: "AFK",
      afkDesc: "Les utilisateurs inactifs sont déplacés ici. Pas de voix ni de texte.",
      category: "Catégorie",
      noCategory: "Aucune catégorie",
      channelName: "Nom du salon",
      placeholder: "nouveau-salon",
      cancel: "Annuler",
      create: "Créer le salon"
    },
    userSettings: {
      language: "Langue",
      appLanguage: "Langue de l'application",
      langDesc: "Choisissez la langue d'affichage. Un redémarrage (rechargement) de l'application est appliqué automatiquement.",
      fr: "Français",
      en: "English",
      es: "Español"
    }
  }
};

const es = {
  app: {
    loading: "Cargando...",
    readyToChat: "¿Listo para chatear?",
    openInNewTab: "Para obtener una experiencia óptima y permitir el inicio de sesión de Google, la aplicación debe abrirse en una nueva pestaña.",
    launchApp: "Lanzar Aplicación",
    secureLogin: "Una vez abierto, podrá iniciar sesión de forma segura.",
    invalidInvite: "La invitación no es válida o ha caducado.",
    errorJoinLink: "Error al unirse al servidor mediante enlace.",
    sidebar: {
      directMessages: "Mensajes Directos"
    },
    serverList: {
      invalidInvite: "Invitación inválida o caducada.",
      errorJoin: "Error al unirse al servidor.",
      unmute: "Reactivar notificaciones",
      mute: "Silenciar servidor"
    }
  },
  channelList: {
    channels: "Canales de texto",
    voiceChannels: "Canales de voz",
    newChannel: "Nuevo canal",
    leaveServerConfirm: "¿Estás seguro de que quieres salir de este servidor?",
    leaveServer: "Salir del servidor",
    serverSettings: "Ajustes del servidor",
    createChannelSuccess: "Canal creado con éxito",
    createChannelError: "Error al crear canal"
  },
  serverList: {
    addServer: "Añadir un servidor",
    exploreServers: "Explorar servidores públicos"
  },
  messageInput: {
    typeMessage: "Escribe un mensaje",
    send: "Enviar",
    reactions: "Reacciones"
  },
  chatArea: {
    welcome: "Bienvenido a",
    startOfChannel: "Este es el comienzo del canal #{{channel}}.",
    messagePlaceholder: "Mensaje #{{channel}}",
    replyingTo: "Respondiendo a",
    cancel: "Cancelar",
    save: "Guardar",
    editMessage: "Editar mensaje",
    deleteMessage: "Borrar mensaje",
    pinMessage: "Fijar mensaje",
    searchPlaceholder: "Buscar...",
    moreEmojis: "Más emojis",
    addReaction: "Añadir reacción",
    newMessages: "Nuevos mensajes",
    editInstructions: "Esc para cancelar, Intro para guardar",
    edited: "(editado)",
    pinnedBy: "Fijado por",
    pinnedAt: "a las",
    voiceChannelNoText: "Los canales de voz no tienen chat de texto.",
    pinnedMessages: "Mensajes fijados",
    toggleMemberList: "Alternar la lista de miembros",
    today: "Hoy",
    yesterday: "Ayer"
  },
  modals: {
    addServer: {
      titleMenu: "Añadir un servidor",
      titleCreate: "Crear tu servidor",
      titleJoin: "Unirse a un servidor",
      menuDescription: "Tu servidor es donde tú y tus amigos pasáis el rato. Crea el tuyo y empieza a hablar.",
      createServerBtn: "Crear un servidor",
      joinServerBtn: "Unirse a un servidor",
      or: "o",
      createDescription: "Dale personalidad a tu nuevo servidor con un nombre y un icono. Siempre puedes cambiarlo más tarde.",
      serverName: "Nombre del servidor",
      serverNamePlaceholder: "Mi super servidor",
      back: "Atrás",
      create: "Crear",
      joinDescription: "Ingresa un enlace de invitación a continuación para unirte a un servidor existente.",
      inviteLink: "Enlace de invitación",
      invitePlaceholder: "https://... o código de invitación",
      join: "Unirse"
    },
    renameChannel: {
      title: "Renombrar canal",
      channelName: "Nombre del canal",
      placeholder: "nuevo-nombre",
      cancel: "Cancelar",
      save: "Guardar"
    },
    createChannel: {
      title: "Crear canal",
      channelType: "Tipo de canal",
      text: "Texto",
      textDesc: "Envía mensajes, imágenes, GIFs, emojis y memes",
      voice: "Voz",
      voiceDesc: "Pasad el rato juntos con voz, vídeo y pantalla compartida",
      afk: "Ausente",
      afkDesc: "Los usuarios inactivos se mueven aquí. Sin voz ni texto.",
      category: "Categoría",
      noCategory: "Sin categoría",
      channelName: "Nombre del canal",
      placeholder: "nuevo-canal",
      cancel: "Cancelar",
      create: "Crear canal"
    },
    userSettings: {
      language: "Idioma",
      appLanguage: "Idioma de la aplicación",
      langDesc: "Elige el idioma de visualización. La aplicación se recargará automáticamente.",
      fr: "Français",
      en: "English",
      es: "Español"
    }
  }
};

updateLocale('en', en);
updateLocale('fr', fr);
updateLocale('es', es);
