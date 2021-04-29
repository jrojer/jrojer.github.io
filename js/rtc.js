// Thanks to:
// https://webrtc.org/getting-started/peer-connections
// https://ably.com/
// https://support.medialooks.com/hc/en-us/articles/360000213312-%D0%95nvironment-signaling-STUN-and-TURN-servers#:~:text=Signaling%20server%20is%20used%20to,streams%20transmission%20behind%20the%20NAT.&text=All%20media%20traffic%20goes%20through%20a%20TURN%20server.
// https://hackernoon.com/build-a-multi-lingual-chatbot-with-ibm-translation-api-and-ably-dsx36gp
// https://networkengineering.stackexchange.com/questions/67218/why-is-symmetric-nat-called-symmetric#:~:text=A%20symmetric%20NAT%20is%20one,a%20different%20mapping%20is%20used.
// https://stackoverflow.com/questions/48660974/webrtc-datachannel-is-never-open
// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Simple_RTCDataChannel_sample
// https://github.com/mdn/samples-server/blob/f380d560afcb1b09fc3ace6e5e05f71aead4316f/s/webrtc-simple-datachannel/main.js#L122
// https://github.com/webrtc/samples/tree/gh-pages/src/content/peerconnection/multiple
// https://stackoverflow.com/questions/21351319/signaling-channel-on-webrtc
// https://bloggeek.me/how-webrtc-works/#:~:text=Audio%20and%20video%20in%20WebRTC,decompress%20audio%20and%20video%20data.&text=WebRTC%20uses%20known%20VoIP%20techniques,and%20encrypted%20version%20of%20RTP.
// https://simpl.info/rtcdatachannel/
// https://wasdk.github.io/WasmFiddle/
//https://developer.mozilla.org/en-US/docs/WebAssembly/Loading_and_running


window.onload = function () {

    function getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    let callButton = document.getElementById("call_button");
    let sendMessageButton = document.getElementById("send_button");
    let startupWidget = document.getElementById("startup_widget");
    let logWidget = document.getElementById("log_widget");
    let masterWidget = document.getElementById("master_widget");
    let continueAsWorkerButton = document.getElementById("continue_as_worker_button");
    let continueAsMasterButton = document.getElementById("continue_as_master_button");
    let heading = document.getElementById("heading");
    let log_area = document.getElementById('log_textarea');
    let message_area = document.getElementById('message_textarea');
    let fileInput = document.getElementById('file_input');
    let sendFileButton = document.getElementById('send_file_button');


    let ably = new Ably.Realtime('HXssMQ.m2sqnA:N-NO2Hdk_cnZVuhO');
    let signalingChannel = ably.channels.get('test');
    const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
    let peerConnections = {};
    let workerPeerConnection = null;
    const thisNodeId = getRandomInt(10000);

    let receiveBuffer = [];
    let receivedSize = 0;

    function log(...args) {
        args.forEach(arg => {
            console.log(arg);
            log_area.value += arg + ' ';
        });
        log_area.value += '\n';
    }

    async function makeCall(nodeId) {
        let peerConnection = new RTCPeerConnection(configuration);
        let dataChannel = peerConnection.createDataChannel("channel" + nodeId);
        dataChannel.binaryType = 'arraybuffer';
        peerConnections[nodeId] = {
            connected: false,
            peerCon: peerConnection,
            channel: dataChannel,
            nodeName: ''
        };
        dataChannel.addEventListener('message', event => {
            log('Worker', nodeId, 'returned', event.data);
        });
        addEventListeners(peerConnection);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        signalingChannel.publish('offer', {
            'offer': offer,
            'nodeId': nodeId
        });
        log('offer sent to', nodeId);
    }

    function joinCall() {
        let peerConnection = new RTCPeerConnection(configuration);
        workerPeerConnection = {
            connected: false,
            peerCon: peerConnection
        };
        addEventListeners(peerConnection);
        peerConnection.addEventListener('datachannel', event => {
            let dataChannel = event.channel;
            dataChannel.binaryType = 'arraybuffer';
            workerPeerConnection.channel = dataChannel;
            log('datachannel added');
            workerPeerConnection.connected = true;
            dataChannel.addEventListener('message', event => {
                if (typeof event.data == 'string') {
                    log('Message:', event.data);
                    if (event.data.startsWith('Run')) {
                        let s = event.data;
                        let intArray = s.slice(4, s.length).split(' ').map(Number);
                        WebAssembly.instantiate(receiveBuffer)
                            .then(obj => {
                                // Call an exported function:
                                const { sum, memory } = obj.instance.exports;
                                let array = new Int32Array(memory.buffer, 0, intArray.length);
                                array.set(intArray);
                                let result = sum(array.byteOffset, array.length);
                                log(result);
                                dataChannel.send(result);
                            });
                    }
                }
                else { // ArrayBuffer
                    log(`Received chunk of ${event.data.byteLength} bytes`);
                    //receiveBuffer.push(event.data);
                    //receivedSize += event.data.byteLength;
                    receiveBuffer = event.data;
                }
            });
        });
        signalingChannel.subscribe('offer', async message => {
            if (message.data && message.data.offer) {
                const nodeId = message.data.nodeId;
                if (nodeId == thisNodeId && workerPeerConnection.connected == false) {
                    let peerConnection = workerPeerConnection.peerCon;
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    signalingChannel.publish('answer',
                        {
                            'answer': answer,
                            'nodeId': thisNodeId,
                            'nodeName': navigator.platform
                        });
                    log('answer sent');
                }
            }
        });
    }

    function addEventListeners(peerConnection) {
        // Listen for local ICE candidates on the local RTCPeerConnection
        peerConnection.addEventListener('icecandidate', event => {
            if (event.candidate) {
                signalingChannel.publish('new-ice-candidate', {
                    'senderId': thisNodeId,
                    'iceCandidate': event.candidate
                });
                log('new ice candidate sent');
            }
        });
        peerConnection.addEventListener('icegatheringstatechange', event => {
            console.log('icegatheringstatechange', event);
        });
    }

    // Listen for remote ICE candidates and add them to the local RTCPeerConnection
    signalingChannel.subscribe('new-ice-candidate', async message => {
        if (message.data && message.data.iceCandidate) {
            const nodeId = message.data.senderId;
            if (nodeId == thisNodeId) {
                return;
            }
            try {
                if (peerConnections[nodeId]) {
                    await peerConnections[nodeId].peerCon.addIceCandidate(message.data.iceCandidate);
                    log('ice candidate added');
                }
                else if (workerPeerConnection) {
                    await workerPeerConnection.peerCon.addIceCandidate(message.data.iceCandidate);
                }
                else {
                    log('WARNING: received icecandidate from undefined peer');
                }
            } catch (e) {
                //console.error('Error adding received ice candidate', e);
            }
        }
    });

    /////////////////////// UI

    fileInput.addEventListener('change', function () {
        const file = fileInput.files[0];
        if (file) {
            sendFileButton.disabled = false;
        }
    }, false);

    callButton.addEventListener("click", function (e) {
        let workerNodeId = parseInt(message_area.value);
        makeCall(workerNodeId);
        signalingChannel.subscribe('answer', async message => {
            if (message.data && message.data.answer) {
                const id = message.data.nodeId;
                const nodeName = message.data.nodeName;
                log('answer from', id, nodeName);
                if (peerConnections[id] && peerConnections[id].connected == false) {
                    const remoteDesc = new RTCSessionDescription(message.data.answer);
                    log(id, 'connection state is', peerConnections[id].peerCon.signalingState);
                    try {
                        await peerConnections[id].peerCon.setRemoteDescription(remoteDesc);
                    }
                    catch (e) {
                        log(e);
                        return;
                    }
                    // TODO this part sometimes executes with an error.
                    peerConnections[id].connected = true;
                    peerConnections[id].nodeName = nodeName;
                    log('set remote', id, nodeName);
                }
            }
        });
    });

    sendFileButton.addEventListener("click", function (e) {
        const file = fileInput.files[0];
        const chunkSize = 16384;
        fileReader = new FileReader();
        let offset = 0;
        fileReader.addEventListener('error', error => console.error('Error reading file:', error));
        fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
        fileReader.addEventListener('load', e => {
            console.log('FileRead.onload ', e);
            //sendChannel.send(e.target.result);
            for (let nodeId in peerConnections) {
                try {
                    peerConnections[nodeId].channel.send(e.target.result);
                }
                catch (e) {
                    console.log(e);
                }
            }
            offset += e.target.result.byteLength;
            if (offset < file.size) {
                readSlice(offset);
            }
        });
        const readSlice = o => {
            console.log('readSlice ', o);
            const slice = file.slice(offset, o + chunkSize);
            fileReader.readAsArrayBuffer(slice);
        };
        readSlice(0);
        fileInput.value = ''
        sendFileButton.disabled = true;
    });

    sendMessageButton.addEventListener("click", function (e) {
        if (message_area.value == '') {
            return;
        }
        let message = {};
        if (message_area.value.startsWith('Run ')) {
            let intArray = message_area.value.slice(4, message_area.value.length).split(' ').map(Number);
            let numNodes = Object.keys(peerConnections).length;
            let chunkSize = Math.floor(intArray.length / numNodes);
            if (chunkSize < 2) {
                chunkSize = 2;
            }
            let chunks = [];
            for (let i = 0; i < intArray.length; i += chunkSize) {
                if (i + 2 * chunkSize > intArray.length) {
                    chunks.push(intArray.slice(i, intArray.length));
                    break;
                }
                else {
                    chunks.push(intArray.slice(i, i + chunkSize));
                }
            }
            let chunkIdx = 0;
            for (let nodeId in peerConnections) {
                if (chunkIdx >= chunks.length) {
                    message[nodeId] = 'no work';
                }
                else {
                    message[nodeId] = `Run ${chunks[chunkIdx].map(String).join(' ')}`;
                }
                chunkIdx++;
            }
        }
        else {
            for (let nodeId in peerConnections) {
                message[nodeId] = message_area.value;
            }
        }
        for (let nodeId in peerConnections) {
            try {
                let text = 'nothing';
                if (message && message[nodeId] != '') {
                    text = message[nodeId];
                }
                peerConnections[nodeId].channel.send(text);
            }
            catch (e) {
                console.log(e);
            }
        }
        message_area.value = '';
    });

    function hideStartWidget(title) {
        startupWidget.setAttribute('hidden', 'true');
        logWidget.hidden = false;
        document.title = title;
        heading.innerText = title;
        window.scrollTo(0, 0);
    }

    continueAsWorkerButton.addEventListener("click", function (e) {
        joinCall();
        hideStartWidget('WebRTC sandbox: Worker ' + thisNodeId);
    });

    continueAsMasterButton.addEventListener("click", function (e) {
        hideStartWidget('WebRTC sandbox: Master');
        masterWidget.hidden = false;
    });




}