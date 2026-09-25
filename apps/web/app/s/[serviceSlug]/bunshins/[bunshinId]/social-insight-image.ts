export async function prepareSocialInsightImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('PNGまたはJPEGのスクリーンショットを選んでください。');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new Image();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new Error('画像を開けませんでした。'));
      value.src = objectUrl;
    });
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const maximum = 1800;
    if (Math.max(width, height) > maximum) {
      const ratio = maximum / Math.max(width, height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像を準備できませんでした。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    let quality = 0.9;
    let result = canvas.toDataURL('image/jpeg', quality);
    while (result.length > 3_800_000 && quality > 0.55) {
      quality -= 0.1;
      result = canvas.toDataURL('image/jpeg', quality);
    }
    if (result.length > 3_800_000)
      throw new Error('画像が大きすぎます。画面を分けて撮影してください。');
    return result;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
