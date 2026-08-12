export function rotateCanvas(file: File, degrees: number): Promise<File> {
  return new Promise((resolve, reject) => {
    if (degrees === 0) {
      resolve(file);
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const { width, height } = img;
      if (degrees === 90 || degrees === 270) {
        canvas.width = height;
        canvas.height = width;
      } else {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -width / 2, -height / 2);
      ctx.restore();
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) {
            resolve(new File([blob], file.name, { type: file.type, lastModified: file.lastModified }));
          } else {
            reject(new Error("Failed to rotate image"));
          }
        },
        file.type,
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for rotation"));
    };
    img.src = objectUrl;
  });
}
