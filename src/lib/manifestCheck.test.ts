import {describe, expect, it} from 'vitest';
import {relevantManifestFields} from './manifestCheck';

describe('relevantManifestFields', () => {
  const manifest = {
    version: '2.0.0',
    permissions: ['bookmarks', 'storage'],
    background: {service_worker: 'background.js', type: 'module'},
    description: 'не влияет',
  };

  it('ignores key order and irrelevant fields', () => {
    const reordered = {
      background: {type: 'module', service_worker: 'background.js'},
      description: 'другое описание',
      permissions: ['bookmarks', 'storage'],
      version: '2.0.0',
    };
    expect(relevantManifestFields(reordered)).toBe(relevantManifestFields(manifest));
  });

  it('notices changes to permissions and version', () => {
    const base = relevantManifestFields(manifest);
    expect(relevantManifestFields({...manifest, permissions: ['bookmarks']})).not.toBe(base);
    expect(relevantManifestFields({...manifest, optional_permissions: ['clipboardRead']})).not.toBe(base);
    expect(relevantManifestFields({...manifest, version: '2.0.1'})).not.toBe(base);
  });
});
