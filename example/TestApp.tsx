import React, { useState } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { PhotoboothFrameGenerator } from '../src'; // Adjust path if needed

// Note: In a real project, you would use require('./assets/frame.png')
const SAMPLE_FRAME_URL = 'https://raw.githubusercontent.com/kotaksurat/photobooth-engine/main/example/assets/frame-2-slot.png';
const SAMPLE_PHOTO_1 = 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=500';
const SAMPLE_PHOTO_2 = 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=500';

export default function TestApp() {
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotsFound, setSlotsFound] = useState<number | null>(null);

  const handleGenerate = async () => {
    try {
      setLoading(true);
      const generator = new PhotoboothFrameGenerator({
        outputFormat: 'png',
        quality: 90,
      });

      console.log('Generating...');
      const result = await generator.create(SAMPLE_FRAME_URL, [
        SAMPLE_PHOTO_1,
        SAMPLE_PHOTO_2,
      ]);

      setResultUri(result.uri);
      setSlotsFound(result.slotsFound);
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Failed to generate photobooth image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Expo Photobooth Engine</Text>

      <View style={styles.previewContainer}>
        <Text style={styles.label}>Frame Preview (Input):</Text>
        <Image source={{ uri: SAMPLE_FRAME_URL }} style={styles.inputImage} resizeMode="contain" />
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleGenerate}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Generate Result</Text>
        )}
      </TouchableOpacity>

      {resultUri && (
        <View style={styles.resultContainer}>
          <Text style={styles.label}>Result ({slotsFound} slots detected):</Text>
          <Image source={{ uri: resultUri }} style={styles.resultImage} resizeMode="contain" />

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => setResultUri(null)}
          >
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 20,
    color: '#333',
  },
  previewContainer: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 2,
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
    fontWeight: '600',
  },
  inputImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#eee',
    borderRadius: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryButton: {
    backgroundColor: '#8E8E93',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultContainer: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    elevation: 3,
  },
  resultImage: {
    width: '100%',
    height: 400,
    backgroundColor: '#000',
    borderRadius: 8,
  },
});
