/**
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

testSampleReduction();
testMemory();
testScriptProcessor();

/**
 * Populate array with 0:99 and verify the bitcrusher holds an array
 * where the number of consecutive equal numbers is controlled by the variable
 * factor.
 */
function testSampleReduction() {
  let context = new OfflineAudioContext(2, 44100, 44100);

  for (let factor = 1; factor < 10; factor++) {
    const precision = 1;
    const bufferSize = 5;
    let referenceBuffer = new Float32Array(bufferSize);
    let outputBuffer = new Float32Array(bufferSize);
    let bitcrusher = new Bitcrusher(context);

    for (let i = 0; i < bufferSize; i++) {
      referenceBuffer[i] = i;
    }

    bitcrusher.processBuffer_(factor, precision, referenceBuffer, outputBuffer);

    // Verify computed values match expected values.
    outputBuffer.map((data, index) => {
      let expected = Math.floor(index / factor) * factor;
      console.assert(
          data === expected, 'computed ' + data + ' but expected ' + expected);
    });
    }
}

/**
 * Verify bitcrusher's memory between two subsequent onaudioprocess calls. 
 * If the processor is not done repeating samples by the end of the buffer, then
 * it should continue where it left off at the beginning of the next buffer.
 * Reproduce this scenario by two consecutive calls to processBuffer,
 * the first with buffer 0:4 and the second with 5:9 and a reduction factor
 * of x. The two output buffers concatenated together should be identical to
 * the output of one bitcrusher processing one block.
 */
function testMemory() {
  let context = new OfflineAudioContext(2, 44100, 44100);

  let a = [0, 1, 2, 3, 4];
  let b = [5, 6, 7, 8, 9];
  let bitcrusher = new Bitcrusher(context);
  let outputA = [];
  let outputB = [];

  let factor = 4;
  bitcrusher.processBuffer_(factor, 24, a, outputA);
  bitcrusher.processBuffer_(factor, 24, b, outputB);

  let output = outputA.concat(outputB);

  output.map((data, index) => {
    let expected = Math.floor(index / factor) * factor;
    console.assert(
        data === expected, 'computed ' + data + ' but expected ' + expected);
  });
}

/**
 * Create one oscillator, and connect it to a bitcrusher with variables set
 * to avoid any effect and a delay node which compensates for the script
 * processor latency. Then verify that the samples are nearly identical.
 */
function testScriptProcessor() { 
  let context = new OfflineAudioContext(2, 44100, 44100);

  const reduction = 1;
  const bitDepth = 24;
  const bufferLength = 512;
  let oscillator = new OscillatorNode(context);
  oscillator.start();

  let merger = new ChannelMergerNode(context, {numberOfInputs: 2});
  let bitcrusher = new Bitcrusher(context, {
    buffersize: bufferLength,
    inputChannels: 1,
    outputChannels: 1,
    bitDepth: bitDepth,
    reduction: reduction
  });

  // Accomodate for script processor latency by delaying the oscillator.
  let delay = context.createDelay();
  delay.delayTime.value = bufferLength / context.sampleRate;

  oscillator.connect(bitcrusher.input);
  bitcrusher.output.connect(merger, 0, 0);
  oscillator.connect(delay).connect(merger, 0, 1);
  merger.connect(context.destination);

  // When audio buffer is ready, verify bitcrushed samples are unaltered.
  context.startRendering()
      .then((buffer) => {
        let bitcrusherOutput = buffer.getChannelData(0);
        let originalOutput = buffer.getChannelData(1);

        // Allow for fractional error beyond audible perception. This error
        // occurs because any sample passing through bitcrusher will undergo
        // manipulation in Math.round() and will therefore be represented by a
        // new floating point number that differs slightly from the original.
        // In tested samples and at a sample rate of 44,1k, the maximum observed
        // error is 6.183981895446777e-7
        const permittedSampleError = 6.1840e-7;

        // Verify samples from unadultered oscillator match samples from
        // bitcrushed oscillator with non-information reducing parameters.
        for (let i = 0; i < originalOutput.length; i++) {
          let crushedSample = bitcrusherOutput[i];
          let originalSample = originalOutput[i];
          const diff = Math.abs(originalSample - crushedSample);
          
          if (i < bufferLength) {
            console.assert(
                bitcrusherOutput[i] == 0,
                'Bitcrusher sample at ' + i + 'expected to be 0 but it was ' +
                    bitcrusherOutput[i]);
          }

          console.assert(
              diff < permittedSampleError,
              'Bitcrushed sample at ' + i + ' is ' + crushedSample + ' but ' +
                  originalSample + ' for oscillator');
        }
      });
}
