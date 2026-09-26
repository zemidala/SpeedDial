import {describe, expect, it} from 'vitest';
import {bingExpiration, bingMarket, toBingImage} from './bing';

describe('bingMarket', () => {
  it.each([
    ['ru-RU', 'ru-RU'],
    ['ru', 'ru-RU'],
    ['en-GB', 'en-GB'],
    ['en-NZ', 'en-US'],
    ['de-AT', 'de-DE'],
    ['uk-UA', 'en-US'],
  ])('%s → %s', (language, market) => {
    expect(bingMarket(language)).toBe(market);
  });
});

describe('bingExpiration', () => {
  it('publication date in UTC + one day + 10 minutes', () => {
    expect(bingExpiration('202609250700')).toBe(Date.UTC(2026, 8, 26, 7, 10));
  });
});

describe('toBingImage', () => {
  const api = {
    url: '/th?id=OHR.Lake_RU-RU123_1920x1080.jpg&rf=LaDigue_1920x1080.jpg',
    urlbase: '/th?id=OHR.Lake_RU-RU123',
    fullstartdate: '202609250700',
    title: 'Озеро',
    copyright: 'Озеро в горах (© Фотограф)',
    copyrightlink: '/search?q=озеро',
  };

  it('Full HD or UHD, absolute description link', () => {
    expect(toBingImage(api, 'ru-RU', false)).toEqual({
      url: 'https://www.bing.com/th?id=OHR.Lake_RU-RU123_1920x1080.jpg&rf=LaDigue_1920x1080.jpg',
      title: 'Озеро',
      copyright: 'Озеро в горах (© Фотограф)',
      link: 'https://www.bing.com/search?q=%D0%BE%D0%B7%D0%B5%D1%80%D0%BE',
      expiresAt: Date.UTC(2026, 8, 26, 7, 10),
      market: 'ru-RU',
      uhd: false,
    });
    expect(toBingImage(api, 'ru-RU', true).url).toBe('https://www.bing.com/th?id=OHR.Lake_RU-RU123_UHD.jpg');
  });

  it('without a caption and link', () => {
    const image = toBingImage({url: '/a.jpg', urlbase: '/a', fullstartdate: 'bad'}, 'en-US', false);
    expect(image).toMatchObject({title: '', copyright: '', link: null});
    expect(image.expiresAt).toBeGreaterThan(Date.now());
  });
});
