export type ImageSource = string | Uint8Array; // Base64 string, Local File URI, or bytes

export interface SlotPhotoAssignment {
    slotIndex: number;
    photo: ImageSource;
}

export interface Slot {
    cx: number;
    cy: number;
    width: number;
    height: number;
    angle: number;
}

export interface PhotoboothConfig {
    alphaThreshold?: number;
    minSlotSize?: number;
    outputFormat?: 'png' | 'jpeg' | 'webp';
    quality?: number;
    fillEmptySlots?: boolean;
    slotExpansion?: number;
}

export interface RenderResult {
    uri: string;
    base64?: string;
    slotsFound: number;
    width: number;
    height: number;
}

export interface SlotDetectionResult {
    slots: Slot[];
    frameWidth: number;
    frameHeight: number;
}
