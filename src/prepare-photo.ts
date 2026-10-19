import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";

const MAX_EDGE = 1600;
const MAX_BYTES = 8_000_000;

export type PreparedPhoto = {
  uri: string;
  base64: string;
  width: number;
  height: number;
};

export async function preparePhoto(asset: ImagePickerAsset): Promise<PreparedPhoto> {
  if (!asset.uri) {
    throw new Error("That photo didn't include a file. Try another picture.");
  }
  if (asset.type && asset.type !== "image" && asset.type !== "livePhoto") {
    throw new Error("That file isn't a photo. Use a JPEG, PNG, WebP, or GIF.");
  }

  const context = ImageManipulator.manipulate(asset.uri);
  const longEdge = Math.max(asset.width, asset.height);
  if (longEdge > MAX_EDGE && asset.width > 0 && asset.height > 0) {
    if (asset.width >= asset.height) {
      context.resize({ width: MAX_EDGE });
    } else {
      context.resize({ height: MAX_EDGE });
    }
  }

  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    base64: true,
    compress: 0.85,
    format: SaveFormat.JPEG,
  });
  if (!saved.base64) {
    throw new Error("This photo couldn't be prepared. Try a JPEG or PNG.");
  }

  const bytes = Math.floor((saved.base64.length * 3) / 4);
  if (bytes > MAX_BYTES) {
    throw new Error(
      "That photo is larger than 8 MB. Take a closer crop or choose a smaller one.",
    );
  }

  return {
    uri: saved.uri,
    base64: saved.base64,
    width: saved.width,
    height: saved.height,
  };
}
