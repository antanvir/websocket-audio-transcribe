// import axios from 'axios';
// import crypto from 'crypto'; // tot sign our pre-signed URL
import mic from 'microphone-stream'; // collect microphone input as a stream of raw bytes
import { React, useEffect } from 'react';
import * as util_utf8_node from "@aws-sdk/util-utf8-node"; // utilities for encoding and decoding UTF8
import * as marshaller from "@aws-sdk/eventstream-marshaller"; // for converting binary event stream messages to and from JSON


import styles from "./client-ui-styles";
import audioUtils from './audioUtils';  // for encoding audio data as PCM

export default function Transcriber() {

    useEffect(() => {

        const eventStreamMarshaller = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8);
        // let languageCode;
        // let region;
        // let speaker = true ;
        let transcription = "";

        let sampleRate = 8000;
        let inputSampleRate;
        let socket;
        let micStream;
        let socketError = false;
        let transcribeException = false;
        let previousSpeaker = 0;

        if (!window.navigator.mediaDevices.getUserMedia) {
            showError('We support the latest versions of Chrome, Firefox, Safari, and Edge. Update your browser and try your request again.');
            toggleStartStop();
        }

        document.getElementById('start-button')
            .addEventListener('click', () => {
                document.getElementById('error').style.visibility = "hidden";
                toggleStartStop(true); // disable start and enable stop button
           
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
                    showError('There was an error streaming your audio to server. Please try again.');
                    toggleStartStop();
                });
        });

            let streamAudioToWebSocket = async function (userMediaStream) {
                micStream = new mic();    
                micStream.on("format", function(data) {
                    inputSampleRate = data.sampleRate;
                });        
                micStream.setStream(userMediaStream);       

                // WebSocket API: ws://asr-backend.herokuapp.com/
                let url = "ws://asr-backend.herokuapp.com/";

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

            function wireSocketEvents() {
                // handle inbound messages from Amazon Transcribe
                socket.onmessage = function (message) {
                    //convert the binary event stream message to JSON
                    let messageWrapper = eventStreamMarshaller.unmarshall(Buffer(message.data));
                    let messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));
                    // if (messageWrapper.headers[":message-type"].value === "event") {
                    //     handleEventStreamMessage(messageBody);
                    // }
                    if(messageBody !== null) {
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
                    console.log("WebSocket connection error.")
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
                let transcriptElement = document.getElementById('transcript');
                transcriptElement.scrollTop = transcriptElement.scrollHeight;
                let transcript = messageJson["text"];
                transcription += (transcript + "\n");
                transcriptElement.value = transcription;

            //     let results = messageJson.Transcript.Results;
            //     let speak = "Speaker ";
            //     let prevSpeaker = 0;
                
            //     if (results.length > 0) {
            //         if (results[0].Alternatives.length > 0) {
            //             if(!results[0].IsPartial){
            //                 let speaker = results[0].Alternatives[0].Items[0].Speaker;
            //                 // let speaker = results[0].Alternatives[0].Items[0].Speaker || results[0].Alternatives[0].Items[1].Speaker;
            //                 if ((typeof(speaker) === 'undefined')) {
            //                     speaker = prevSpeaker;
            //                 }
            //                 speak = speak + speaker;
            //                 prevSpeaker = speaker;
            //                 // previousSpeaker = speaker;
            //                 // $('#speakers').val(speak + "\n");        
            //                 console.log(speak, results);
            //             }
            
            //             let transcript = results[0].Alternatives[0].Transcript;
            //             // fix encoding for accented characters
            //             transcript = decodeURIComponent(escape(transcript));
            //             // update the textarea with the latest result
            //             document.getElementById('transcript').value = 
            //                 // transcription + "[ speaking ]" + "\t" + transcript + "\n";
            //                 transcription + transcript + "\n";
                        
            
            //             // if this transcript segment is final, add it to the overall transcription
            //             if (!results[0].IsPartial) {
            //                 //scroll the textarea down
            //                 let transcriptElement = document.getElementById('transcript');
            //                 transcriptElement.scrollTop = transcriptElement.scrollHeight;
            //                 // transcription += (speak + " -----> " + transcript + "\n");
            //                 if(previousSpeaker != speaker){
            //                     transcription += (transcript + "\n");
            //                     previousSpeaker = speaker;
            //                 }
            //                 else{
            //                     transcription += (transcript + " ");
            //                 }
            //             }
            //         }
            //     }
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

        //  -- END --  //
        
    }, []);


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