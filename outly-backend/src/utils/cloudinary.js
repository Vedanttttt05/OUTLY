import { v2 as cloudinary } from 'cloudinary';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

const isCloudinaryConfigured = () => Boolean(cloudName && apiKey && apiSecret);

const isLikelyDataUrl = (value) => typeof value === 'string' && value.startsWith('data:image/');
const isLikelyHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

export const normalizeImageReference = async ({
  image,
  folder,
  publicIdPrefix,
}) => {
  const raw = typeof image === 'string' ? image.trim() : '';
  if (!raw) return null;

  if (isLikelyHttpUrl(raw)) {
    return raw;
  }

  if (!isLikelyDataUrl(raw)) {
    // Backward compatibility with old plain base64 payloads.
    const plainBase64 = /^[A-Za-z0-9+/=\s]+$/.test(raw);
    if (!plainBase64) return null;

    if (!isCloudinaryConfigured()) {
      return raw;
    }

    const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${raw}`, {
      folder,
      public_id: `${publicIdPrefix}-${Date.now()}`,
      resource_type: 'image',
    });

    return result.secure_url;
  }

  if (!isCloudinaryConfigured()) {
    return raw;
  }

  const result = await cloudinary.uploader.upload(raw, {
    folder,
    public_id: `${publicIdPrefix}-${Date.now()}`,
    resource_type: 'image',
  });

  return result.secure_url;
};

export { isCloudinaryConfigured };
