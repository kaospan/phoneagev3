import { referenceSpriteUrls } from '@/data/assetCatalog';
import type { CellReference } from '@/lib/spriteMatching';

const STORAGE_KEY = 'stone-age-cell-references';
const SEEDED_KEY = 'stone-age-default-references';

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
};

const imageToDataUrl = async (
  url: string,
  transform?: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, img: HTMLImageElement) => void
): Promise<string> => {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available for reference seeding');

  if (transform) {
    transform(ctx, canvas, img);
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
  }

  return canvas.toDataURL('image/png');
};

const rotateImage = (angle: number) => {
  return (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, img: HTMLImageElement) => {
    const radians = (angle * Math.PI) / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));
    canvas.width = Math.round(img.width * cos + img.height * sin);
    canvas.height = Math.round(img.width * sin + img.height * cos);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
};

const flipImageHorizontal = () => {
  return (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, img: HTMLImageElement) => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
};

const composeImages = async (urls: string[], alpha = 0.6): Promise<string> => {
  const images = await Promise.all(urls.map(loadImage));
  const base = images[0];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || !base) throw new Error('Canvas not available for composite reference');

  canvas.width = base.width;
  canvas.height = base.height;

  images.forEach((img, index) => {
    ctx.globalAlpha = index === 0 ? 1 : alpha;
    ctx.drawImage(img, 0, 0);
  });

  ctx.globalAlpha = 1;
  return canvas.toDataURL('image/png');
};

const generateSolidReference = (color: string, size = 64): string => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL('image/png');
};

export const seedDefaultReferences = async () => {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEEDED_KEY) === '1') return;

  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && JSON.parse(existing).length > 0) {
    localStorage.setItem(SEEDED_KEY, '1');
    return;
  }

  const refs: CellReference[] = [];
  const now = Date.now();

  const floorUrl = referenceSpriteUrls.floor;
  const stoneUrl = referenceSpriteUrls.stone;
  const caveUrl = referenceSpriteUrls.cave;
  const arrowLeftUrl = referenceSpriteUrls.arrowLeft;
  const arrowDownUrl = referenceSpriteUrls.arrowDown;

  if (floorUrl) {
    refs.push({
      id: `seed-floor-${now}`,
      tileType: 0,
      imageData: await imageToDataUrl(floorUrl),
      timestamp: now,
    });
  }

  if (stoneUrl) {
    refs.push({
      id: `seed-stone-${now}`,
      tileType: 2,
      imageData: await imageToDataUrl(stoneUrl),
      timestamp: now,
    });
  }

  if (caveUrl) {
    refs.push({
      id: `seed-cave-${now}`,
      tileType: 3,
      imageData: await imageToDataUrl(caveUrl),
      timestamp: now,
    });
  }

  let arrowRightData: string | null = null;
  let arrowLeftData: string | null = null;
  if (arrowLeftUrl) {
    arrowLeftData = await imageToDataUrl(arrowLeftUrl);
    refs.push({
      id: `seed-arrow-left-${now}`,
      tileType: 10,
      imageData: arrowLeftData,
      timestamp: now,
    });

    arrowRightData = await imageToDataUrl(arrowLeftUrl, flipImageHorizontal());
    refs.push({
      id: `seed-arrow-right-${now}`,
      tileType: 8,
      imageData: arrowRightData,
      timestamp: now,
    });
  }

  let arrowDownData: string | null = null;
  let arrowUpData: string | null = null;
  if (arrowDownUrl) {
    arrowDownData = await imageToDataUrl(arrowDownUrl);
    refs.push({
      id: `seed-arrow-down-${now}`,
      tileType: 9,
      imageData: arrowDownData,
      timestamp: now,
    });

    arrowUpData = await imageToDataUrl(arrowDownUrl, rotateImage(180));
    refs.push({
      id: `seed-arrow-up-${now}`,
      tileType: 7,
      imageData: arrowUpData,
      timestamp: now,
    });
  }

  if (arrowUpData && arrowDownData) {
    refs.push({
      id: `seed-arrow-updown-${now}`,
      tileType: 11,
      imageData: await composeImages([arrowUpData, arrowDownData]),
      timestamp: now,
    });
  }

  if (arrowLeftData && arrowRightData) {
    refs.push({
      id: `seed-arrow-leftright-${now}`,
      tileType: 12,
      imageData: await composeImages([arrowLeftData, arrowRightData]),
      timestamp: now,
    });
  }

  if (arrowUpData && arrowDownData && arrowLeftData && arrowRightData) {
    refs.push({
      id: `seed-arrow-omni-${now}`,
      tileType: 13,
      imageData: await composeImages([arrowUpData, arrowDownData, arrowLeftData, arrowRightData], 0.5),
      timestamp: now,
    });
  }

  // Add a void reference to help detect empty tiles.
  refs.push({
    id: `seed-void-${now}`,
    tileType: 5,
    imageData: generateSolidReference('#000000', 64),
    timestamp: now,
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(refs));
  localStorage.setItem(SEEDED_KEY, '1');
};
