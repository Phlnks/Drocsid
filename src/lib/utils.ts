export const copyToClipboard = async (text: string): Promise<boolean> => {
  // 1. Electron native API
  if (window.electron?.writeClipboardText) {
    try {
      const res = await window.electron.writeClipboardText(text);
      if (res?.ok) return true;
    } catch (e) {
      console.warn('Electron writeClipboardText failed, trying browser APIs', e);
    }
  }

  // 2. Browser standard navigator.clipboard
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand', err);
    }
  }

  // 3. Fallback for iframe / permission denied scenarios
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (fallbackErr) {
    console.error('Fallback: unable to copy', fallbackErr);
  }

  return false;
};

export const readFromClipboard = async (): Promise<string> => {
  // 1. Electron native API
  if (window.electron?.readClipboardText) {
    try {
      const res = await window.electron.readClipboardText();
      if (res?.ok && typeof res.text === 'string') {
        return res.text;
      }
    } catch (e) {
      console.warn('Electron readClipboardText failed, trying browser API', e);
    }
  }

  // 2. Browser standard navigator.clipboard
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      console.warn('navigator.clipboard.readText failed', err);
    }
  }

  return '';
};
