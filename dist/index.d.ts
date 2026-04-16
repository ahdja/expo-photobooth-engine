type ImageSource = string | Uint8Array;
interface SlotPhotoAssignment {
    slotIndex: number;
    photo: ImageSource;
}
interface Slot {
    cx: number;
    cy: number;
    width: number;
    height: number;
    angle: number;
}
interface PhotoboothConfig {
    alphaThreshold?: number;
    minSlotSize?: number;
    outputFormat?: 'png' | 'jpeg' | 'webp';
    quality?: number;
    fillEmptySlots?: boolean;
    slotExpansion?: number;
}
interface RenderResult {
    uri: string;
    base64?: string;
    slotsFound: number;
    width: number;
    height: number;
}
interface SlotDetectionResult {
    slots: Slot[];
    frameWidth: number;
    frameHeight: number;
}

declare class PhotoboothFrameGenerator {
    private config;
    constructor(config?: PhotoboothConfig);
    /**
     * Create photobooth image from frame and user photos
     */
    create(frameSource: ImageSource, userPhotos: ImageSource[]): Promise<RenderResult>;
    /**
     * Create photobooth image with specific slot assignments
     */
    createWithAssignments(frameSource: ImageSource, assignments: SlotPhotoAssignment[], fallbackPhotos?: ImageSource[]): Promise<RenderResult>;
    private render;
    /**
     * Detect slots without rendering
     */
    detectSlots(frameSource: ImageSource): Promise<SlotDetectionResult>;
    private detectSlotsSync;
    private loadImage;
    private findSlotsBFS;
    private convexHull;
    private getMinimumBoundingBox;
    private drawCover;
    private resolveSlotPhotos;
    private getInvalidSlotIndexMessage;
}

export { type ImageSource, type PhotoboothConfig, PhotoboothFrameGenerator, type RenderResult, type Slot, type SlotDetectionResult, type SlotPhotoAssignment };
