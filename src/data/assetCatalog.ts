export interface AssetEntry {
  name: string;
  url: string;
}

export interface StageImageSet {
  id: number;
  primary: string;
  sources: string[];
}

const stagePngs = import.meta.glob('../assets/level_*.png', { eager: true, import: 'default' }) as Record<string, string>;
const supportAssetModules = import.meta.glob('../assets/*.{png,jpg,jpeg,webp}', { eager: true, import: 'default' }) as Record<string, string>;
const supportAssetNames = new Set([
  'menu.png',
  'stone-age-bg.png',
  'stone.png',
  'floor.jpg',
  'door.jpg',
  'left.jpg',
  'down.jpg',
]);

const stageAssets: AssetEntry[] = Object.entries(stagePngs).map(([path, url]) => ({
  name: path.split('/').pop() || path,
  url,
}));

const supportAssetEntries: AssetEntry[] = Object.entries(supportAssetModules)
  .map(([path, url]) => ({
    name: path.split('/').pop() || path,
    url,
  }))
  .filter((asset) => supportAssetNames.has(asset.name));

const assets: AssetEntry[] = [...stageAssets, ...supportAssetEntries];

export const assetByName: Record<string, string> = assets.reduce((acc, asset) => {
  acc[asset.name] = asset.url;
  return acc;
}, {} as Record<string, string>);

export const stageImageSets: StageImageSet[] = stageAssets
  .map((asset) => {
    const match = asset.name.match(/^level_(\d{3})\.png$/i);
    if (!match) return null;

    return {
      id: parseInt(match[1], 10),
      primary: asset.url,
      sources: [asset.url],
    } satisfies StageImageSet;
  })
  .filter((entry): entry is StageImageSet => entry !== null)
  .sort((a, b) => a.id - b.id);

export const referenceSpriteUrls = {
  floor: assetByName['floor.jpg'],
  stone: assetByName['stone.png'],
  cave: assetByName['door.jpg'],
  arrowLeft: assetByName['left.jpg'],
  arrowDown: assetByName['down.jpg'],
};

export const uiImages = {
  menu: assetByName['menu.png'],
  background: assetByName['stone-age-bg.png'],
};

export const miscAssets = assets;
