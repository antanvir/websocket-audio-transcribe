exports.pcmEncode = function(input) {
    let offset = 0;
    let buffer = new ArrayBuffer(input.length * 2);
    let view = new DataView(buffer);
    for (let i = 0; i < input.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
};


exports.downsampleBuffer = function(buffer, inputSampleRate = 44100, outputSampleRate = 16000) {
        
    if (outputSampleRate === inputSampleRate) {
        return buffer;
    }

    let sampleRateRatio = inputSampleRate / outputSampleRate;
    let newLength = Math.round(buffer.length / sampleRateRatio);
    let result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    
    while (offsetResult < result.length) {
        let nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0,
        count = 0;
        
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++ ) {
            accum += buffer[i];
            count++;
        }

        result[offsetResult] = accum / count;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;

    }
    return result;

};