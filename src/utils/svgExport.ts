function sanitizeFileName(raw: string): string {
  return (
    String(raw || 'medatlas-diagram')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'medatlas-diagram'
  );
}

function serializeSvgWithStyles(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  if (!clone.getAttribute('style')) {
    clone.setAttribute(
      'style',
      'font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; background-color: #ffffff;'
    );
  }
  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

export function downloadSvgElementAsSvg(svgEl: SVGSVGElement | null, title: string): void {
  if (!svgEl) return;
  const svgMarkup = serializeSvgWithStyles(svgEl);
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFileName(title)}.svg`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadSvgElementAsPng(
  svgEl: SVGSVGElement | null,
  title: string
): Promise<void> {
  if (!svgEl) return;
  const viewBox = svgEl.viewBox?.baseVal;
  const width = viewBox && viewBox.width > 0 ? viewBox.width : svgEl.clientWidth || 960;
  const height = viewBox && viewBox.height > 0 ? viewBox.height : svgEl.clientHeight || 540;

  const svgMarkup = serializeSvgWithStyles(svgEl);
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            const pngUrl = URL.createObjectURL(pngBlob);
            const anchor = document.createElement('a');
            anchor.href = pngUrl;
            anchor.download = `${sanitizeFileName(title)}.png`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            setTimeout(() => URL.revokeObjectURL(pngUrl), 1500);
          }
          URL.revokeObjectURL(url);
          resolve();
        }, 'image/png');
      } else {
        URL.revokeObjectURL(url);
        resolve();
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}
