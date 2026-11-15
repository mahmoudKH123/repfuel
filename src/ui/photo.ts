/** Where the circle sits on the photo: its centre as a share of the photo's width/height, and how far zoomed in (1 = fills). */
export interface Crop { u: number; v: number; zoom: number }

const OUT = 512 // saved picture size (px)

/** Loads a picked file and shrinks it to at most 1280 px on the long side, so it can be re-framed later without
 *  keeping the full camera file. */
export async function prepPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await load(url)
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k)
    c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.88)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function load(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  await img.decode()
  return img
}

/** Draws the framed square out of the photo. */
export async function render(src: string, crop: Crop): Promise<string> {
  const img = await load(src)
  const w = img.naturalWidth, h = img.naturalHeight
  const side = Math.min(w, h) / crop.zoom
  const c = document.createElement('canvas')
  c.width = c.height = OUT
  c.getContext('2d')!.drawImage(img, crop.u * w - side / 2, crop.v * h - side / 2, side, side, 0, 0, OUT, OUT)
  return c.toDataURL('image/jpeg', 0.88)
}

