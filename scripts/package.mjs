// Packs the built extension (dist) into a zip for the stores: npm run package → release/speeddial-<version>.zip.
// No dependencies: Node's zlib has deflate and crc32, the zip container is written here
import {execSync} from 'node:child_process';
import {mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {crc32, deflateRawSync} from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const RELEASE = join(ROOT, 'release');

// A store build is made from a commit: uncommitted changes would ship code that isn't in the history
const dirty = execSync('git status --porcelain', {cwd: ROOT, encoding: 'utf8'}).trim();
if (dirty && !process.argv.includes('--allow-dirty')) {
  console.error('Uncommitted changes — commit them first (or pass --allow-dirty for a test package):\n' + dirty);
  process.exit(1);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** DOS date and time of a zip entry */
function dosTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const entries = [];
const chunks = [];
let offset = 0;
const now = dosTime(new Date());

for (const path of files(DIST).sort()) {
  const name = Buffer.from(relative(DIST, path).split('\\').join('/'), 'utf8');
  const data = readFileSync(path);
  const packed = deflateRawSync(data, {level: 9});
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // Version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // Deflate
  local.writeUInt16LE(now.time, 10);
  local.writeUInt16LE(now.date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  chunks.push(local, name, packed);
  entries.push({name, crc, packed: packed.length, size: data.length, offset});
  offset += local.length + name.length + packed.length;
}

const directoryStart = offset;
for (const entry of entries) {
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // Made by
  central.writeUInt16LE(20, 6); // Version needed
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(now.time, 12);
  central.writeUInt16LE(now.date, 14);
  central.writeUInt32LE(entry.crc, 16);
  central.writeUInt32LE(entry.packed, 20);
  central.writeUInt32LE(entry.size, 24);
  central.writeUInt16LE(entry.name.length, 28);
  central.writeUInt32LE(entry.offset, 42);
  chunks.push(central, entry.name);
  offset += central.length + entry.name.length;
}

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(offset - directoryStart, 12);
end.writeUInt32LE(directoryStart, 16);
chunks.push(end);

const {version} = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
mkdirSync(RELEASE, {recursive: true});
const output = join(RELEASE, `speeddial-${version}.zip`);
writeFileSync(output, Buffer.concat(chunks));
console.log(`${relative(ROOT, output)}: ${entries.length} files, ${(statSync(output).size / 1024).toFixed(0)} KB`);
