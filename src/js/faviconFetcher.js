// faviconFetcher.js

export async function fetchFavicon(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    const links = Array.from(doc.querySelectorAll('link[rel*="icon"], link[rel*="shortcut icon"]'));
    let largestIcon = null;

    links.forEach(link => {
      const sizes = link.getAttribute('sizes');
      const size = sizes ? sizes.split(' ')[0].split('x').reduce((a, b) => a * b) : 16; // Если размеры не указаны, используем 16x16

      if (!largestIcon || size > largestIcon.size) {
        largestIcon = {
          url: link.href.startsWith('http') ? link.href : new URL(link.href, url).href,
          size: size
        };
      }
    });

    return largestIcon ? largestIcon.url : null; // Возвращаем URL иконки или null, если не найдено
  } catch (error) {
    console.error('Ошибка при получении иконок:', error);
    return null; // Возвращаем null в случае ошибки
  }
}