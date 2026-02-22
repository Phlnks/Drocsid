
const API_KEY = 'LRhUjXzkIsE0oQUHSbjrY6Rur6uqsK3J'; // Replace with your Giphy API key
const API_URL = 'https://api.giphy.com/v1/gifs/search';

export const searchGifs = async (query: string): Promise<string[]> => {
  if (!query) {
    return [];
  }

  try {
    const response = await fetch(`${API_URL}?api_key=${API_KEY}&q=${query}&limit=20`);
    const { data } = await response.json();
    return data.map((gif: any) => gif.images.fixed_height.url);
  } catch (error) {
    console.error('Error fetching GIFs from Giphy:', error);
    return [];
  }
};
