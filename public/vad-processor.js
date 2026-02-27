class VADProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      if (event.data.speaking) {
        this.port.postMessage({ speaking: true });
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const pcmData = input[0];
      let sumSquares = 0.0;
      for (let i = 0; i < pcmData.length; i++) {
        sumSquares += pcmData[i] * pcmData[i];
      }
      const rms = Math.sqrt(sumSquares / pcmData.length);
      this.port.postMessage({ rms });
    }
    return true;
  }
}

registerProcessor('vad-processor', VADProcessor);
