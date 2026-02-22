
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
}

export async function getLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const description = $('meta[property="og:description"]').attr('content');
    const image = $('meta[property="og:image"]').attr('content');

    if (title) {
      return {
        url,
        title,
        description,
        image,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching link preview for ${url}:`, error);
    return null;
  }
}
