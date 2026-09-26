import {describe, expect, it} from 'vitest';
import {normalizeServerUrl, parsePropfind, serverOrigin} from './webdav';

describe('WebDAV', () => {
  it('parses a Yandex Disk response (d: prefix)', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/SpeedDial/</d:href><d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop>
    <d:resourcetype><d:collection/></d:resourcetype><d:getlastmodified>Sat, 26 Sep 2026 10:00:00 GMT</d:getlastmodified>
  </d:prop></d:propstat></d:response>
  <d:response><d:href>/SpeedDial/speeddial-2026-09-26_10-00-00.json</d:href><d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop>
    <d:resourcetype/><d:getlastmodified>Sat, 26 Sep 2026 10:00:01 GMT</d:getlastmodified><d:getcontentlength>2048</d:getcontentlength>
  </d:prop></d:propstat></d:response>
</d:multistatus>`;
    expect(parsePropfind(xml)).toEqual([
      {name: 'speeddial-2026-09-26_10-00-00.json', modified: Date.parse('2026-09-26T10:00:01Z'), size: 2048},
    ]);
  });

  it('parses a Nextcloud response (D: prefix, encoded names, extra files)', () => {
    const xml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:oc="http://owncloud.org/ns">
  <D:response><D:href>/remote.php/dav/files/user/SpeedDial/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
  <D:response><D:href>/remote.php/dav/files/user/SpeedDial/%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F%20&amp;%201.json</D:href>
    <D:propstat><D:prop><D:resourcetype/><D:getcontentlength>10</D:getcontentlength></D:prop></D:propstat></D:response>
  <D:response><D:href>/remote.php/dav/files/user/SpeedDial/readme.txt</D:href>
    <D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat></D:response>
  <D:response><D:href>/remote.php/dav/files/user/SpeedDial/old/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
</D:multistatus>`;
    expect(parsePropfind(xml)).toEqual([{name: 'копия & 1.json', modified: 0, size: 10}]);
  });

  it('parses a response without a namespace prefix', () => {
    const xml = `<multistatus xmlns="DAV:"><response><href>/dav/SpeedDial/a.json</href>
      <propstat><prop><resourcetype/><getcontentlength>5</getcontentlength></prop></propstat></response></multistatus>`;
    expect(parsePropfind(xml)).toEqual([{name: 'a.json', modified: 0, size: 5}]);
  });

  it('server URL', () => {
    expect(normalizeServerUrl(' https://webdav.yandex.ru ')).toBe('https://webdav.yandex.ru/');
    expect(normalizeServerUrl('https://cloud.example.com/remote.php/dav/files/user?x=1#y'))
      .toBe('https://cloud.example.com/remote.php/dav/files/user/');
    expect(normalizeServerUrl('http://localhost:8080/dav')).toBe('http://localhost:8080/dav/');
    expect(() => normalizeServerUrl('http://cloud.example.com/')).toThrow('https://');
    expect(() => normalizeServerUrl('не адрес')).toThrow('Неверный адрес');
    expect(serverOrigin('https://cloud.example.com/remote.php/')).toBe('https://cloud.example.com/*');
  });
});
