export const audioCache: Record<string, string> = {};

export async function getAudioUrl(url: string): Promise<string> {
  if (audioCache[url]) {
    return audioCache[url];
  }
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    audioCache[url] = objectUrl;
    return objectUrl;
  } catch (error) {
    console.error(`[AudioCache] Failed to fetch audio for ${url}:`, error);
    return url; // fallback to original url
  }
}
