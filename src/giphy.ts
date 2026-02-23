
const API_KEY = 'LRhUjXzkIsE0oQUHSbjrY6Rur6uqsK3J';

export const searchGifs = async (query: string): Promise<string[]> => {
  if (!query) return [];

  try {
    const response = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${API_KEY}&q=${encodeURIComponent(
        query
      )}&limit=50&offset=0&rating=g&lang=en`
    );
    const { data } = await response.json();
    return data.map((gif: any) => gif.images.fixed_width.url);
  } catch (error) {
    console.error("Error fetching GIFs:", error);
    return [];
  }
};
