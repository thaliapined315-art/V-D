import { GoogleGenAI, Chat, GenerateContentResponse, Modality, Content } from "@google/genai";
import { ChatMode, Message, SearchSource } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- TTS Helper Functions ---
async function decodeAudioData(base64Data: string, sampleRate: number = 24000): Promise<AudioBuffer> {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  
  // Convert raw PCM (Int16) to AudioBuffer
  // Note: API returns raw PCM 16-bit little-endian
  const dataInt16 = new Int16Array(bytes.buffer);
  const buffer = audioContext.createBuffer(1, dataInt16.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
}

async function bufferToBlob(buffer: AudioBuffer): Promise<Blob> {
  // Simple WAV encoder for browser playback compatibility
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels = [];
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

  while (pos < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  return new Blob([out], { type: 'audio/wav' });
}

// --- Service Exports ---

export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Voices: Puck, Charon, Kore, Fenrir, Zephyr
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const audioBuffer = await decodeAudioData(base64Audio);
      const blob = await bufferToBlob(audioBuffer);
      return URL.createObjectURL(blob);
    }
    return null;
  } catch (error) {
    console.error("TTS Generation Error:", error);
    return null;
  }
};

export const createChatSession = (mode: ChatMode, historyMessages: Message[] = []): Chat => {
  let modelName = 'gemini-2.5-flash-lite'; // Default: Fast
  let config: any = {};

  const systemInstruction = `
    你是一个名为 "V-D" 的专业电脑技术助手。
    你的目标是帮助用户解决Windows PC硬件、软件、驱动程序和性能方面的问题。
    
    身份与风格：
    - 必须始终使用简体中文回答。
    - 专业、简洁、直接。
    - 关键命令使用代码块，步骤使用编号列表。
    - 当前运行模式: ${mode}
  `;

  switch (mode) {
    case ChatMode.FAST:
      modelName = 'gemini-2.5-flash-lite';
      break;
    case ChatMode.PRO:
      modelName = 'gemini-3-pro-preview';
      break;
    case ChatMode.SEARCH:
      modelName = 'gemini-3-flash-preview';
      config.tools = [{ googleSearch: {} }];
      break;
    case ChatMode.THINKING:
      modelName = 'gemini-3-pro-preview';
      config.thinkingConfig = { thinkingBudget: 32768 };
      break;
  }

  config.systemInstruction = systemInstruction;

  // Map internal Message type to SDK Content type for history
  const history: Content[] = historyMessages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  return ai.chats.create({
    model: modelName,
    history: history,
    config: config,
  });
};

export async function* sendMessageStream(chat: Chat, message: string): AsyncGenerator<{text: string, sources?: SearchSource[]}, void, unknown> {
  try {
    const resultStream = await chat.sendMessageStream({ message });
    
    for await (const chunk of resultStream) {
      const responseChunk = chunk as GenerateContentResponse;
      
      // Extract text
      const text = responseChunk.text;
      
      // Extract grounding metadata if available (for Search mode)
      let sources: SearchSource[] | undefined;
      const groundingChunks = responseChunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
      
      if (groundingChunks) {
        sources = groundingChunks
          .map((c: any) => c.web ? { uri: c.web.uri, title: c.web.title } : null)
          .filter((s: any) => s !== null) as SearchSource[];
      }

      if (text || sources) {
        yield { text: text || '', sources };
      }
    }
  } catch (error) {
    console.error("Gemini API Stream Error:", error);
    yield { text: "\n\n**连接中断**: 请检查网络或稍后重试。" };
  }
}