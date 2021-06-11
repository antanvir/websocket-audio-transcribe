import crypto from 'crypto'; // tot sign our pre-signed URL
import mic from 'microphone-stream'; // collect microphone input as a stream of raw bytes
import * as marshaller from "@aws-sdk/eventstream-marshaller"; // for converting binary event stream messages to and from JSON
import * as util_utf8_node from "@aws-sdk/util-utf8-node"; // utilities for encoding and decoding UTF8

import axios from 'axios';
import { React, useState, useEffect } from 'react';

import audioUtils from './audioUtils';  // for encoding audio data as PCM


export default function Transcriber() {

    useEffect(() => {
        // console.log(typeof(marshaller) == 'undefined');
        // our converter between binary event streams messages and JSON
        const eventStreamMarshaller = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8);
        
        // our global variables for managing state
        let languageCode;
        let region;
        var speaker = true ;
        let sampleRate = 8000;
        let inputSampleRate;
        let transcription = "";
        let socket;
        let micStream;
        let socketError = false;
        let transcribeException = false;
        let previousSpeaker = 0;
        
        // check to see if the browser allows mic access
        if (!window.navigator.mediaDevices.getUserMedia) {
            // Use our helper method to show an error on the page
            showError('We support the latest versions of Chrome, Firefox, Safari, and Edge. Update your browser and try your request again.');
            toggleStartStop();
        }

        document.getElementById('start-button')
            .addEventListener('click', () => {
                document.getElementById('error').style.visibility = "hidden"; // hide any existing errors
                toggleStartStop(true); // disable start and enable stop button
            
                // set the language and region from the dropdowns
                setLanguage();
                setRegion();
            
                // first we get the microphone input from the browser (as a promise)...
                window.navigator.mediaDevices.getUserMedia({
                        video: false,
                        // audio: true
                        audio: {
                            echoCancellation: true
                          }
                    })
                    // ...then we convert the mic stream to binary event stream messages when the promise resolves 
                    // .then(initAudioFilter)
                    .then(streamAudioToWebSocket) 
                    .catch(function (error) {
                        console.log("Error in streaming audio to AWS Transcribe");
                        showError('There was an error streaming your audio to Amazon Transcribe. Please try again.');
                        toggleStartStop();
                    });
            });
        
        
        let streamAudioToWebSocket = async function (userMediaStream) {
            //let's get the mic input from the browser, via the microphone-stream module   
            micStream = new mic();    
            micStream.on("format", function(data) {
                inputSampleRate = data.sampleRate;
            });        
            micStream.setStream(userMediaStream);

        
            // Pre-signed URLs are a way to authenticate a request (or WebSocket connection, in this case)
            // via Query Parameters. Learn more: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
            // Lambda API Gateway: https://g3qjwqc20m.execute-api.eu-west-1.amazonaws.com/AudioTranscribeJob
            let url = "";
            await axios.get('https://g3qjwqc20m.execute-api.eu-west-1.amazonaws.com/AudioTranscribeJob')
                .then((response) => {
                    console.log("Response: ", response);
                    console.log("Response Body URL: ", response.data);
                    url = response.data;
                    
                });

            //open up our WebSocket connection
            socket = new WebSocket(url);
            socket.binaryType = "arraybuffer";
        
            // when we get audio data from the mic, send it to the WebSocket if possible
            socket.onopen = function() {
                micStream.on('data', function(rawAudioChunk) {
                    // initAudioFilter(rawAudioChunk);
                    // the audio stream is raw audio bytes. Transcribe expects PCM with additional metadata, encoded as binary
                    let binary = convertAudioToBinaryMessage(rawAudioChunk);
        
                    if (socket.readyState === socket.OPEN)
                        socket.send(binary);
                }
            )};   
            // handle messages, errors, and close events
            wireSocketEvents();
        }

        function initAudioFilter(userMediaStream) {
            try {
                //  NOISE CANCELLATION
                let audioCtx = new (window.AudioContext || window.webkitAudioContext)();

                // audioCtx.audioWorklet.addModule("./noise-cancellation-processor.js");
                // let noiseReducer = new AudioWorkletNode( audioCtx, "noise-cancellation-processor");
                // noiseReducer.connect(audioCtx.destination);

                // FILTER & COMPRESSOR
                let compressor = audioCtx.createDynamicsCompressor();
                compressor.threshold.value = -50;
                compressor.knee.value = 40;
                compressor.ratio.value = 12;
                // compressor.reduction.value = -20;
                compressor.attack.value = 0;
                compressor.release.value = 0.25;
                compressor.connect(audioCtx.destination);

                let filter = audioCtx.createBiquadFilter();
                filter.Q.value = 8.30;
                filter.frequency.value = 355;
                filter.gain.value = 3.0;
                filter.type = 'bandpass';
                filter.connect(compressor);
                filter.connect(audioCtx.destination);

                audioCtx.audioWorklet.addModule("./noise-cancellation-processor.js");
                let noiseReducer = new AudioWorkletNode( audioCtx, "noise-cancellation-processor");
                noiseReducer.connect(audioCtx.destination);

                let mediaStreamSource = audioCtx.createMediaStreamSource( userMediaStream );
                mediaStreamSource.connect( noiseReducer );
                mediaStreamSource.connect( filter );
            } 
            catch (error) {
                console.log(error);
            }
        }
        
        function setLanguage() {
            languageCode = "en-GB";
            if (languageCode === "en-US")
                sampleRate = 16000;  // 8000
            else
                sampleRate = 8000;
        }
        
        function setRegion() {
            region = "eu-west-1";
        }
        
        function wireSocketEvents() {
            // handle inbound messages from Amazon Transcribe
            socket.onmessage = function (message) {
                //convert the binary event stream message to JSON
                let messageWrapper = eventStreamMarshaller.unmarshall(Buffer(message.data));
                let messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));
                if (messageWrapper.headers[":message-type"].value === "event") {
                    handleEventStreamMessage(messageBody);
                }
                else {
                    transcribeException = true;
                    showError(messageBody.Message);
                    toggleStartStop();
                }
            };
        
            socket.onerror = function () {
                socketError = true;
                showError('WebSocket connection error. Try again.');
                console.log("Here error occured in socket communication")
                toggleStartStop();
            };
            
            socket.onclose = function (closeEvent) {
                micStream.stop();
                
                // the close event immediately follows the error event; only handle one.
                if (!socketError && !transcribeException) {
                    if (closeEvent.code != 1000) {
                        showError('Streaming Exception\n' + closeEvent.reason);
                    }
                    toggleStartStop();
                }
            };
        }
        
        let handleEventStreamMessage = function (messageJson) {
            let results = messageJson.Transcript.Results;
            let speak = "Speaker ";
            let prevSpeaker = 0;
            
            if (results.length > 0) {
                if (results[0].Alternatives.length > 0) {
                    if(!results[0].IsPartial){
                        let speaker = results[0].Alternatives[0].Items[0].Speaker;
                        // let speaker = results[0].Alternatives[0].Items[0].Speaker || results[0].Alternatives[0].Items[1].Speaker;
                        if ((typeof(speaker) === 'undefined')) {
                            speaker = prevSpeaker;
                        }
                        speak = speak + speaker;
                        prevSpeaker = speaker;
                        // previousSpeaker = speaker;
                        // $('#speakers').val(speak + "\n");        
                        console.log(speak, results);
                    }
        
                    let transcript = results[0].Alternatives[0].Transcript;
                    // fix encoding for accented characters
                    transcript = decodeURIComponent(escape(transcript));
                    // update the textarea with the latest result
                    document.getElementById('transcript').value = 
                        // transcription + "[ speaking ]" + "\t" + transcript + "\n";
                        transcription + transcript + "\n";
                    
        
                    // if this transcript segment is final, add it to the overall transcription
                    if (!results[0].IsPartial) {
                        //scroll the textarea down
                        let transcriptElement = document.getElementById('transcript');
                        transcriptElement.scrollTop = transcriptElement.scrollHeight;
                        // transcription += (speak + " -----> " + transcript + "\n");
                        if(previousSpeaker != speaker){
                            transcription += (transcript + "\n");
                            previousSpeaker = speaker;
                        }
                        else{
                            transcription += (transcript + " ");
                        }
                    }
                }
            }
        }
        
        let closeSocket = function () {
            if (socket.readyState === socket.OPEN) {
                micStream.stop();
        
                // Send an empty frame so that Transcribe initiates a closure of the WebSocket after submitting all transcripts
                let emptyMessage = getAudioEventMessage(Buffer.from(new Buffer([])));
                let emptyBuffer = eventStreamMarshaller.marshall(emptyMessage);
                socket.send(emptyBuffer);
            }
        }
        
        document.getElementById('stop-button')
            .addEventListener('click', () => {
                closeSocket();
                // toggleStartStop();
            });
        
        document.getElementById('clear-button')
            .addEventListener('click', () => {
                document.getElementById('transcript').value = "";
                transcription = '';
            });
        
        function toggleStartStop() {
            let isStartDisabled = document.getElementById('start-button').disabled;
            console.log("Start button is Disabled: ", isStartDisabled);
            document.getElementById('start-button').disabled = !isStartDisabled;
            document.getElementById('stop-button').disabled = isStartDisabled; 
        }
        
        function showError(message) {
            document.getElementById('error').style.visibility = "visible";
            document.getElementById('error').innerHTML = '<i class="fa fa-times-circle"></i> ' + message;
        }
        
        function convertAudioToBinaryMessage(audioChunk) {
            let raw = mic.toRaw(audioChunk);
        
            if (raw == null)
                return;
        
            // downsample and convert the raw audio bytes to PCM
            let downsampledBuffer = audioUtils.downsampleBuffer(raw, inputSampleRate, sampleRate);
            let pcmEncodedBuffer = audioUtils.pcmEncode(downsampledBuffer);
        
            // add the right JSON headers and structure to the message
            let audioEventMessage = getAudioEventMessage(Buffer.from(pcmEncodedBuffer));
        
            //convert the JSON object + headers into a binary event stream message
            let binary = eventStreamMarshaller.marshall(audioEventMessage);
        
            return binary;
        }
        
        function getAudioEventMessage(buffer) {
            // wrap the audio data in a JSON envelope
            return {
                headers: {
                    ':message-type': {
                        type: 'string',
                        value: 'event'
                    },
                    ':event-type': {
                        type: 'string',
                        value: 'AudioEvent'
                    }
                },
                body: buffer
            };
        }


    }, []);


    const styles = {
        startButton: { backgroundColor: '#339136', color: 'white', border: 'none', display: 'inline-block',
        textAlign: 'right', fontSize: 16, margin: '16px 08px', padding: '24px 32px' },
        stopButton: { backgroundColor: '#a13a28', color: 'white', border: 'none', display: 'inline-block',
        textAlign: 'right', fontSize: 16, margin: '16px 08px', padding: '24px 32px' },
        clearButton: { backgroundColor: '#21807b', color: 'white', border: 'none', display: 'inline-block',
        textAlign: 'right', fontSize: 16, margin: '16px 08px', padding: '24px 32px' },
        error: { backgroundColor: '#ffd2d2', color: '#d8000c', borderRadius: '05px', display: 'none',
        verticalAlign: 'middle', fontSize: '1.5em', margin: '1.4rem auto', padding: 10 },
        textArea: { height: '25em', width: '60em', fontSize: 16, marginTop: 10 },
        icon: { paddingRight: '05px' }
    }

    return(
        <div>
            <div id="error" className="isa_error" style={styles.error}>  </div>
            <textarea id="transcript" placeholder="Press Start and Speak into Your Mic" style={styles.textArea}
            rows="20" cols="30" readOnly="readonly"> 
            </textarea>
            <div className="row">
                <div className="col">
                    <button id="start-button" className="button-xl" disabled={ false } style={styles.startButton}>
                        <i className="fa fa-microphone" style={styles.icon}></i> Start
                    </button>
                    <button id="stop-button" className="button-xl" disabled={ true } style={styles.stopButton}>
                        <i className="fa fa-stop-circle" style={styles.icon}></i> Stop
                    </button>
                    <button id="clear-button" className="button-xl button-secondary" style={styles.clearButton}> 
                        Clear Output
                    </button>
                </div>       
            </div>
        </div>
    );

}

// export default Transcriber;


