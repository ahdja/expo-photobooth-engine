# @kotaksurat/expo-photobooth-engine

Photobooth engine for Expo & React Native. Detect transparent slots in a frame and overlay images with ease.

Built using [React Native Skia](https://shopify.github.io/react-native-skia/) for high-performance image processing.

## Installation

```bash
npm install @kotaksurat/expo-photobooth-engine @shopify/react-native-skia
# or
yarn add @kotaksurat/expo-photobooth-engine @shopify/react-native-skia
```

Ensure you have followed the [React Native Skia installation guide](https://shopify.github.io/react-native-skia/docs/installation).

## Usage

### Simple Rendering

```typescript
import { PhotoboothFrameGenerator } from '@kotaksurat/expo-photobooth-engine';

const generator = new PhotoboothFrameGenerator();

const frameUri = '...'; // Local URI, Remote URL, or Base64
const photos = ['photo1_uri', 'photo2_uri'];

const result = await generator.create(frameUri, photos);

console.log(result.uri); // Final image Data URI
console.log(result.slotsFound); // 2
```

### With Slot Assignments

```typescript
const result = await generator.createWithAssignments(
  frameUri,
  [
    { slotIndex: 1, photo: 'photo_for_second_slot_uri' }
  ],
  ['fallback_photo_uri']
);
```

### Slot Detection Only

```typescript
const { slots, frameWidth, frameHeight } = await generator.detectSlots(frameUri);

slots.forEach(slot => {
  console.log('Slot at:', slot.cx, slot.cy);
  console.log('Size:', slot.width, 'x', slot.height);
  console.log('Rotation:', slot.angle);
});
```

## API Reference

### `PhotoboothFrameGenerator`

#### `constructor(config?: PhotoboothConfig)`
- `alphaThreshold` (default: 10): Alpha value below which a pixel is considered transparent (0-255).
- `minSlotSize` (default: 50): Minimum width of a region to be considered a slot.
- `outputFormat` (default: 'png'): 'png', 'jpeg', or 'webp'.
- `quality` (default: 92): Output quality (0-100).
- `fillEmptySlots` (default: true): If true, repeats photos to fill detected slots.
- `slotExpansion` (default: 5): Pixels to expand the photo behind the frame to avoid gaps.

## License

MIT
