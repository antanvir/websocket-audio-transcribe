class NoiseCancellationProcessor extends AudioWorkletProcessor {

    static get parameterDescriptors () {
      return [{
        name: 'phase',
        defaultValue: 0,
        minValue: 0,
        maxValue: 180,
      }]
    }

    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const output = outputs[0];
      const phase = parameters['phase'][0];
    
      for (let channel = 0; channel < output.length; ++channel) {
        // if you just want to copy input to output:
        //    const map1 = input[channel].map(x => -1.0 * x);
        //    output[channel].set(map1);
        const size = input[channel].length;
        for (let i = 0; i < size; ++i)
          output[channel][(i+phase) % size] = -1.0 * input[channel][i];
      }
  
      return true;
    }
  }
  
  console.log('Registering processor');
  registerProcessor('noise-cancellation-processor', NoiseCancellationProcessor);