import { Skia, SkImage, SkSurface, SkCanvas, SkPaint, BlendMode, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import { ImageSource, Slot, SlotPhotoAssignment, PhotoboothConfig, RenderResult, SlotDetectionResult } from './types';

export type { ImageSource, Slot, SlotPhotoAssignment, PhotoboothConfig, RenderResult, SlotDetectionResult } from './types';

export class PhotoboothFrameGenerator {
    private config: Required<PhotoboothConfig>;

    constructor(config?: PhotoboothConfig) {
        this.config = {
            alphaThreshold: config?.alphaThreshold ?? 10,
            minSlotSize: config?.minSlotSize ?? 50,
            outputFormat: config?.outputFormat ?? 'png',
            quality: config?.quality ?? 92, // Skia quality is 0-100
            fillEmptySlots: config?.fillEmptySlots ?? true,
            slotExpansion: config?.slotExpansion ?? 5,
        };
    }

    /**
     * Create photobooth image from frame and user photos
     */
    public async create(frameSource: ImageSource, userPhotos: ImageSource[]): Promise<RenderResult> {
        return this.render(frameSource, [], userPhotos);
    }

    /**
     * Create photobooth image with specific slot assignments
     */
    public async createWithAssignments(
        frameSource: ImageSource,
        assignments: SlotPhotoAssignment[],
        fallbackPhotos: ImageSource[] = []
    ): Promise<RenderResult> {
        return this.render(frameSource, assignments, fallbackPhotos);
    }

    private async render(
        frameSource: ImageSource,
        assignments: SlotPhotoAssignment[],
        fallbackPhotos: ImageSource[]
    ): Promise<RenderResult> {
        let frame: SkImage | null = null;
        let surface: SkSurface | null = null;
        let finalImage: SkImage | null = null;
        const loadedPhotos: SkImage[] = [];

        try {
            frame = await this.loadImage(frameSource);
            if (!frame) throw new Error("Failed to load frame image");

            const width = frame.width();
            const height = frame.height();

            // 1. Detect Slots
            const slots = this.detectSlotsSync(frame);

            // 2. Prepare Surface for rendering
            surface = Skia.Surface.MakeOffscreen(width, height);
            if (!surface) throw new Error("Failed to create Skia surface");
            const canvas = surface.getCanvas();

            // Clear surface
            canvas.clear(Skia.Color('transparent'));

            // 3. Render Slot Photos (Layer below)
            const slotPhotos = this.resolveSlotPhotos(slots, assignments, fallbackPhotos);

            for (let i = 0; i < slots.length; i++) {
                const photoSource = slotPhotos[i];
                if (photoSource) {
                    const photo = await this.loadImage(photoSource);
                    if (photo) {
                        loadedPhotos.push(photo); // Store reference for cleanup
                        this.drawCover(canvas, photo, slots[i]);
                    }
                }
            }

            // 4. Render Frame (Layer above)
            canvas.drawImage(frame, 0, 0);

            // 5. Export Result
            surface.flush();
            finalImage = surface.makeImageSnapshot();
            const format = this.config.outputFormat === 'jpeg' ? 3 : (this.config.outputFormat === 'webp' ? 4 : 2);
            
            const base64 = finalImage.encodeToBase64(format as any, this.config.quality);
            
            return {
                uri: `data:image/${this.config.outputFormat};base64,${base64}`,
                base64: base64,
                slotsFound: slots.length,
                width,
                height
            };
        } catch (error) {
            throw new Error(`PhotoboothFrameGenerator Error: ${error}`);
        } finally {
            // ALWAYS cleanup Skia objects to prevent memory leaks in C++
            if (frame) frame.dispose();
            if (finalImage) finalImage.dispose();
            if (surface) surface.dispose();
            for (const photo of loadedPhotos) {
                if (photo) photo.dispose();
            }
        }
    }

    /**
     * Detect slots without rendering
     */
    public async detectSlots(frameSource: ImageSource): Promise<SlotDetectionResult> {
        let frame: SkImage | null = null;
        try {
            frame = await this.loadImage(frameSource);
            if (!frame) throw new Error("Failed to load frame image");

            const slots = this.detectSlotsSync(frame);

            return {
                slots,
                frameWidth: frame.width(),
                frameHeight: frame.height()
            };
        } catch (error) {
            throw new Error(`PhotoboothFrameGenerator Error: ${error}`);
        } finally {
            if (frame) frame.dispose();
        }
    }

    private detectSlotsSync(image: SkImage): Slot[] {
        const width = image.width();
        const height = image.height();
        
        // Read alpha channel
        // Skia pixels are usually [R, G, B, A]
        const pixels = image.readPixels(0, 0, {
            width,
            height,
            colorType: 4, // kRGBA_8888_SkColorType
            alphaType: 3, // kPremul_SkAlphaType
        });

        if (!pixels) return [];

        const slots: Slot[] = this.findSlotsBFS(pixels as Uint8Array, width, height);
        return slots;
    }

    private async loadImage(source: ImageSource): Promise<SkImage | null> {
        if (source instanceof Uint8Array) {
            return Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(source));
        }

        if (typeof source === 'string') {
            if (source.startsWith('data:')) {
                const base64Data = source.split(',')[1];
                return Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(base64Data));
            }
            
            // For remote URL or local file URI, we need to fetch it first
            try {
                const response = await fetch(source);
                const blob = await response.arrayBuffer();
                const data = Skia.Data.fromBytes(new Uint8Array(blob));
                const image = Skia.Image.MakeImageFromEncoded(data);
                // Note: Skia.Data holds memory, ideally we dispose it if SDK supports it, 
                // but Image takes ownership or copies. We dispose Data.
                try { (data as any)?.dispose?.(); } catch(e){} 
                return image;
            } catch (e) {
                console.error("Failed to fetch image:", source, e);
                return null;
            }
        }

        return null;
    }

    private findSlotsBFS(pixels: Uint8Array, width: number, height: number): Slot[] {
        const visited = new Uint8Array(width * height);
        const slots: Slot[] = [];
        
        // Optimasi 1: Sub-sampling (stride) untuk pencarian awal.
        // Karena minSlotSize biasanya besar (misal 50px), kita tidak perlu mengecek setiap piksel
        // untuk menemukan *titik awal* slot transparan. Kita bisa melompati beberapa piksel.
        const step = Math.max(1, Math.floor(this.config.minSlotSize / 4));
        const threshold = this.config.alphaThreshold;

        // Pre-allocate queue array to avoid dynamic resizing in JS engine
        // Ukuran maksimal queue adalah jumlah piksel, tapi biasanya jauh lebih kecil.
        // Kita gunakan array biasa dengan pre-allocation.
        const maxQueueSize = Math.floor((width * height) / 2);
        const queueX = new Int32Array(maxQueueSize);
        const queueY = new Int32Array(maxQueueSize);

        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                let idx = y * width + x;
                
                // Cek pixel saat ini. Alpha ada di idx * 4 + 3
                if (pixels[(idx << 2) + 3] < threshold && visited[idx] === 0) {
                    
                    // Kita menemukan titik awal slot, sekarang lakukan BFS/Flood-fill penuh 
                    // (stride = 1) untuk mencari batas-batas (boundary) slot ini.
                    
                    queueX[0] = x;
                    queueY[0] = y;
                    visited[idx] = 1;

                    const boundary: {x: number, y: number}[] = [];
                    let minX = x, maxX = x;

                    let head = 0;
                    let tail = 1;

                    while (head < tail) {
                        const cx = queueX[head];
                        const cy = queueY[head++];
                        
                        let isBoundary = false;

                        // Unroll loop tetangga (Atas, Bawah, Kiri, Kanan) untuk menghindari pembuatan array di dalam loop
                        // Kanan
                        if (cx + 1 < width) {
                            const nx = cx + 1, ny = cy;
                            const nIdx = ny * width + nx;
                            if (pixels[(nIdx << 2) + 3] < threshold) {
                                if (visited[nIdx] === 0) {
                                    visited[nIdx] = 1;
                                    queueX[tail] = nx; queueY[tail++] = ny;
                                    if (nx > maxX) maxX = nx;
                                }
                            } else { isBoundary = true; }
                        } else { isBoundary = true; }

                        // Kiri
                        if (cx - 1 >= 0) {
                            const nx = cx - 1, ny = cy;
                            const nIdx = ny * width + nx;
                            if (pixels[(nIdx << 2) + 3] < threshold) {
                                if (visited[nIdx] === 0) {
                                    visited[nIdx] = 1;
                                    queueX[tail] = nx; queueY[tail++] = ny;
                                    if (nx < minX) minX = nx;
                                }
                            } else { isBoundary = true; }
                        } else { isBoundary = true; }

                        // Bawah
                        if (cy + 1 < height) {
                            const nx = cx, ny = cy + 1;
                            const nIdx = ny * width + nx;
                            if (pixels[(nIdx << 2) + 3] < threshold) {
                                if (visited[nIdx] === 0) {
                                    visited[nIdx] = 1;
                                    queueX[tail] = nx; queueY[tail++] = ny;
                                }
                            } else { isBoundary = true; }
                        } else { isBoundary = true; }

                        // Atas
                        if (cy - 1 >= 0) {
                            const nx = cx, ny = cy - 1;
                            const nIdx = ny * width + nx;
                            if (pixels[(nIdx << 2) + 3] < threshold) {
                                if (visited[nIdx] === 0) {
                                    visited[nIdx] = 1;
                                    queueX[tail] = nx; queueY[tail++] = ny;
                                }
                            } else { isBoundary = true; }
                        } else { isBoundary = true; }

                        if (isBoundary) {
                            boundary.push({x: cx, y: cy});
                        }
                        
                        // Fallback safety if slot is insanely huge (mengatasi batas alokasi manual)
                        if (tail >= maxQueueSize) break; 
                    }

                    if (maxX - minX > this.config.minSlotSize) {
                        const hull = this.convexHull(boundary);
                        const mbb = this.getMinimumBoundingBox(hull);
                        if (mbb) {
                            slots.push(mbb);
                        }
                    }
                }
            }
        }
        
        return slots.sort((a, b) => (a.cy | 0) - (b.cy | 0) || (a.cx | 0) - (b.cx | 0));
    }

    private convexHull(pts: {x: number, y: number}[]): {x: number, y: number}[] {
        pts.sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
        const cross = (o: {x: number, y: number}, a: {x: number, y: number}, b: {x: number, y: number}) => 
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower: {x: number, y: number}[] = [];
        for (let p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper: {x: number, y: number}[] = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            let p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        upper.pop();
        lower.pop();
        return lower.concat(upper);
    }

    private getMinimumBoundingBox(hull: {x: number, y: number}[]): Slot | null {
        if (hull.length === 0) return null;
        let minArea = Infinity;
        let best: Slot | null = null;

        for (let i = 0; i < hull.length; i++) {
            const p1 = hull[i];
            const p2 = hull[(i + 1) % hull.length];
            
            let edgeTheta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            
            const cosT = Math.cos(-edgeTheta);
            const sinT = Math.sin(-edgeTheta);
            
            for (let p of hull) {
                let rx = p.x * cosT - p.y * sinT;
                let ry = p.x * sinT + p.y * cosT;
                if (rx < minX) minX = rx;
                if (rx > maxX) maxX = rx;
                if (ry < minY) minY = ry;
                if (ry > maxY) maxY = ry;
            }
            
            const w = maxX - minX;
            const h = maxY - minY;
            const area = w * h;
            
            if (area < minArea) {
                minArea = area;
                const cx_rot = minX + w / 2;
                const cy_rot = minY + h / 2;
                const r_cosT = Math.cos(edgeTheta);
                const r_sinT = Math.sin(edgeTheta);
                const cx = cx_rot * r_cosT - cy_rot * r_sinT;
                const cy = cx_rot * r_sinT + cy_rot * r_cosT;
                
                best = { cx, cy, width: w, height: h, angle: edgeTheta };
            }
        }
        
        if (best) {
            let { cx, cy, width, height, angle } = best;
            let deg = angle * (180 / Math.PI);
            deg = ((deg % 180) + 180) % 180; // [0, 180)
            
            if (deg > 45 && deg <= 135) {
                deg -= 90;
                const temp = width;
                width = height;
                height = temp;
            } else if (deg > 135) {
                deg -= 180;
            }
            
            best.angle = deg * (Math.PI / 180);
            best.width = width;
            best.height = height;
        }
        
        return best;
    }

    private drawCover(canvas: SkCanvas, img: SkImage, slot: Slot): void {
        const expansion = this.config.slotExpansion;
        
        const targetW = slot.width + (expansion * 2);
        const targetH = slot.height + (expansion * 2);

        const imgWidth = img.width();
        const imgHeight = img.height();

        const imgRatio = imgWidth / imgHeight;
        const slotRatio = targetW / targetH;
        let sw, sh, sx, sy;

        if (imgRatio > slotRatio) {
            sw = imgHeight * slotRatio; sh = imgHeight;
            sx = (imgWidth - sw) / 2; sy = 0;
        } else {
            sw = imgWidth; sh = imgWidth / slotRatio;
            sx = 0; sy = (imgHeight - sh) / 2;
        }
        
        canvas.save();
        canvas.translate(slot.cx, slot.cy);
        canvas.rotate(slot.angle * (180 / Math.PI), 0, 0); // Skia rotate is degrees? Usually Skia canvas rotate is degrees.
        
        const rect = Skia.XYWHRect(-targetW / 2, -targetH / 2, targetW, targetH);
        const srcRect = Skia.XYWHRect(sx, sy, sw, sh);
        
        const paint = Skia.Paint();
        // Newer Skia versions might use sampling instead of setFilterMode on paint
        // For now we'll use a basic drawImageRect which defaults to reasonable filtering
        
        canvas.drawImageRect(img, srcRect, rect, paint);
        canvas.restore();
    }

    private resolveSlotPhotos(
        slots: Slot[],
        assignments: SlotPhotoAssignment[],
        fallbackPhotos: ImageSource[]
    ): Array<ImageSource | undefined> {
        const resolvedPhotos: Array<ImageSource | undefined> = new Array(slots.length).fill(undefined);
        
        for (const assignment of assignments) {
            if (!Number.isInteger(assignment.slotIndex) || assignment.slotIndex < 0 || assignment.slotIndex >= slots.length) {
                throw new Error(this.getInvalidSlotIndexMessage(assignment.slotIndex, slots.length));
            }

            resolvedPhotos[assignment.slotIndex] = assignment.photo;
        }

        let sequentialIndex = 0;

        for (let i = 0; i < resolvedPhotos.length; i++) {
            if (resolvedPhotos[i]) continue;

            if (sequentialIndex < fallbackPhotos.length) {
                resolvedPhotos[i] = fallbackPhotos[sequentialIndex++];
                continue;
            }

            if (this.config.fillEmptySlots && fallbackPhotos.length > 0) {
                resolvedPhotos[i] = fallbackPhotos[i % fallbackPhotos.length];
            }
        }

        return resolvedPhotos;
    }

    private getInvalidSlotIndexMessage(slotIndex: number, slotCount: number): string {
        if (slotCount === 0) {
            return `Invalid slotIndex ${slotIndex}. No transparent slots were detected in the selected frame.`;
        }

        return `Invalid slotIndex ${slotIndex}. Only ${slotCount} slot(s) were detected, so the valid range is 0 to ${slotCount - 1}.`;
    }
}
