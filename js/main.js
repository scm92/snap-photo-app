'use strict';

let video = document.querySelector('video');
let photo = document.getElementById('photo');
let photoContext = photo.getContext('2d');
let trail = document.getElementById('trail');
let trail2 = document.getElementById('trail2');
let snapButton = document.getElementById('snap');
let sendButton = document.getElementById('send');

let photoContextH;
let photoContextW;


// Attach event handlers
snapButton.addEventListener('click', snapPhoto);
sendButton.addEventListener('click', sendPhoto);

// Disable send buttons by default.
sendButton.disabled = true;


let isInitiator;
let isThirdPeer;
const configuration = null;

let room = window.location.hash.substring(1);
if (!room) {
    room = window.location.hash = generateRandomToken();
}

/**
* Signaling server
*  --> client-side event handlers: joined, created, full, ready,
*      secondjoined, message, messagetorhird, messagetosecond
**/

let socket = io.connect();

// Handler for second user joining room
socket.on('joined', function(room, clientId) {
    console.log('This peer has joined room', room, 'with client ID', clientId);
    isInitiator = false;
    isThirdPeer = false;
    createPeerConnection(isInitiator, configuration);
    getVideo();
});
// Handler for room 'created' event emitted by the server
socket.on('created', function(room, clientId) {
    console.log('Created room', room, '- my client ID is', clientId);
    isInitiator = true;
    isThirdPeer = false;
    getVideo();
});
// Handler for third user joining room
socket.on('secondjoined', function(room, clientId) {
    isThirdPeer = true;
    isInitiator = false;
    console.log('This peer has joined room ', room, 'with client ID ', clientId);
    createPeerConnections(isInitiator, configuration);
    getVideo();
});

// Message event client-side listeners: 'message', 'messagetothird'
socket.on('message', function(message) {
    console.log('Client received message:', message);
    signalingMessageCallback(message);
});

socket.on('messagetothird', function(message, args) {
	console.log('Client recieved message', message);
	if(args) {
		signalingMessageCallback(message);
	}
	secondSignalingMessageCallback(message);
});

socket.on('messagetosecond', function(message, isSecond) {
    console.log('Client received message', message);
    secondSignalingMessageCallback(message);
});

//handler for full room event emitted by the server
socket.on('full', function(room) {
    alert('Room ' + room + ' is full. We will create a new room for you.');
    window.location.hash = '';
    window.location.reload();
});

socket.on('ready', function() {
    console.log('Socket is ready');
    createPeerConnection(isInitiator, configuration);
});

socket.on('thirduser', function() {
    console.log('Third user socket is ready');
    createSecondPeerConnection(isInitiator, configuration);
})

// Joining a room.
socket.emit('create or join', room);

if (location.hostname.match(/localhost|127\.0\.0/)) {
    socket.emit('ipaddress');
}

// Leaving rooms and disconnecting from peers.
socket.on('disconnect', function(reason) {
    console.log(`Disconnected: ${reason}.`);
    sendButton.disabled = true;
});

socket.on('exit', function(room) {
    console.log(`Peer exiting room ${room}.`);
    sendButton.disabled = true;
    // If peer did not create the room, re-enter to be creator.
    if (!isInitiator) {
        window.location.reload();
    }
});


window.addEventListener('unload', function() {
    console.log(`Unloading window. Notifying peers in ${room}.`);
    socket.emit('exit', room);
});



/*
*Functions to comunicate with the signaling server
*/
// function to send message to signaling server
function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

//function to talk to third peer only
function sendMessageToThird(message) {
	console.log('Client sending message to  third peer: ', message);
	socket.emit('messagetothird', message, isInitiator);
}

// function to talk to first or second peer
function sendMessageToSecond(message, isSecond) {
    console.log('Client sending message to first or second peer', message);
    socket.emit('messagetosecond', message, isSecond);
}




/**
* Declare 2 RTCPeerConnections & 2 Data channels
**/

let peerConn1;
let peerConn2;
let dataChannel1;
let dataChannel2;

function signalingMessageCallback(message) {
    if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        peerConn1.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
        peerConn1.createAnswer().then(function(answer) {
            return peerConn1.setLocalDescription(answer);
        })
        .then(function() {
            console.log('sending local desc:', peerConn1.localDescription);
            if(isThirdPeer) {
                sendMessageToSecond(peerConn1.localDescription, false);
            } else { sendMessage(peerConn1.localDescription); }
        })
        .catch(logError);
    } else if (message.type === 'answer') {
        console.log('Got answer.');
        peerConn1.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
    } else if (message.type === 'candidate') {
        peerConn1.addIceCandidate(new RTCIceCandidate({
            candidate: message.candidate,
            sdpMLineIndex: message.label,
            sdpMid: message.id
        }));   
    }
}

function secondSignalingMessageCallback(message) {
	if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        peerConn2.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
        peerConn2.createAnswer().then(function(answer) {
            return peerConn2.setLocalDescription(answer);
        })
        .then(function() {
            console.log('sending local desc:', peerConn2.localDescription);
            if(isThirdPeer) {
                sendMessageToSecond(peerConn2.localDescription, true);
            } else { sendMessageToThird(peerConn2.localDescription); }
        })
        .catch(logError);
    } else if (message.type === 'answer') {
        console.log('Got answer.');
        peerConn2.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
    } else if (message.type === 'candidate') {
        peerConn2.addIceCandidate(new RTCIceCandidate({
            candidate: message.candidate,
            sdpMLineIndex: message.label,
            sdpMid: message.id
        }));   
    }
}

function createPeerConnection(isInitiator, configuration) {
	console.log('Creating Peer connection as initiator?', isInitiator, 'config:', configuration);
	peerConn1 = new RTCPeerConnection(configuration);
	peerConn1.onicecandidate = function(event) {
		console.log('icecandidate event:', event);
		if(event.candidate){
			sendMessage({
				type: 'candidate',
				label: event.candidate.sdpMLineIndex,
				id: event.candidate.sdpMid,
				candidate: event.candidate.candidate
			});
		} else {
			console.log('end of candidates');
		}
	};
	if(isInitiator) {
		console.log('Creating Data Channel');
        dataChannel1 = peerConn1.createDataChannel('photos');
        onDataChannelCreated(dataChannel1);
        console.log('Creating an offer');
        peerConn1.createOffer().then(function(offer) {
        	return peerConn1.setLocalDescription(offer);
        }).then(() => {
        	console.log('sending local desc:', peerConn1.localDescription);
        	sendMessage(peerConn1.localDescription);
        }).catch(logError);
	} else {
		peerConn1.ondatachannel = function(event) {
			console.log('ondatachannel:', event.channel);
			dataChannel1 = event.channel;
			onDataChannelCreated(dataChannel1);
		}
	}
}

function createPeerConnections(isInitiator, configuration) {
	console.log('Creating peer connections for third user, isInitiator? ', isInitiator);
	peerConn1 = new RTCPeerConnection(configuration);
    peerConn1.onicecandidate = function(event) {
        console.log('icecandidate event: ', event);
        if(event.candidate) {
            sendMessageToSecond({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            }, false);
        }
    }
    peerConn1.ondatachannel = function(event) {
        console.log('ondatachannel:', event.channel);
        dataChannel1 = event.channel;
        onDataChannelCreated(dataChannel1);
    }
	peerConn2 = new RTCPeerConnection(configuration);
    peerConn2.onicecandidate = function(event) {
        console.log('icecandidate event: ', event);
        if(event.candidate) {
            sendMessageToSecond({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            }, true);
        }
    }
	peerConn2.ondatachannel = function(event) {
		console.log('ondatachannel:', event.channel);
		dataChannel2 = event.channel;
		onSecondDataChannelCreated(dataChannel2);
	}
}

function createSecondPeerConnection(isInitiator, configuration) {
	console.log('Creating second peer connection as initiator?', isInitiator, 'config', configuration);
	peerConn2 = new RTCPeerConnection(configuration);
	peerConn2.onicecandidate = function(event) {
		console.log('icecandidate event: ', event);
		if(event.candidate) {
			sendMessageToThird({
				type: 'candidate',
				label: event.candidate.sdpMLineIndex,
				id: event.candidate.sdpMid,
				candidate: event.candidate.candidate
			});
		} else {
			console.log('end of candidates');
		}
	}
	console.log('Creating second data channel');
    if(isInitiator) {
        dataChannel2 = peerConn2.createDataChannel('photos');

    } else {
        dataChannel2 = peerConn2.createDataChannel('photos2');
    }
    onSecondDataChannelCreated(dataChannel2);
    console.log('Creating an offer');
    peerConn2.createOffer().then(function(offer) {
        	return peerConn2.setLocalDescription(offer);
        }).then(() => {
        	console.log('sending second local desc:', peerConn2.localDescription);
        	sendMessageToThird(peerConn2.localDescription);
        }).catch(logError);
}

function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);
    channel.onopen = function() {
        console.log('channel opened!');
        sendButton.disabled = false;
    };
    channel.onclose = function () {
        console.log('Channel closed.');
        sendButton.disabled = true;
    }
    channel.onmessage = receiveDataChrome();
}

function onSecondDataChannelCreated(channel2) {
    console.log('onSecondDataChannelCreated:', channel2);
    channel2.onopen = function() {
        console.log('second channel opened!');
        sendButton.disabled = false;
    };
    channel2.onclose = function () {
        console.log('second channel closed.');
        sendButton.disabled = true;
    };
    channel2.onmessage = receiveSecondDataChrome();
}


function receiveDataChrome() {
    let buffer;
    let count;
    return function onmessage(event) {
        if(typeof event.data === 'string') {
            buffer = window.buffer = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('Expecting a total of ' + buffer.byteLength + ' bytes');
            return;
        }
        let data = new Uint8ClampedArray(event.data);
        buffer.set(data, count);
        count += data.byteLength;
        console.log('count: ' + count);
        if(count === buffer.byteLength) {
            console.log('Done. Rendering first photo.');
            renderPhoto(buffer);
        }
    }
}

function receiveSecondDataChrome() {
    let buffer;
    let count;
    return function onmessage(event) {
        if(typeof event.data === 'string') {
            buffer = window.buffer = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('Expecting a total of ' + buffer.byteLength + ' bytes');
            return;
        }
        let data = new Uint8ClampedArray(event.data);
        buffer.set(data, count);
        count += data.byteLength;
        console.log('count: ' + count);
        if(count === buffer.byteLength) {
            console.log('Done. Rendering second photo.');
            renderSecondPhoto(buffer);
        }
    }
}

/**
* Secondary functions
**/

function snapPhoto() {
    photoContext.drawImage(video, 0, 0, photo.width, photo.height);
    show(photo, sendButton);
}

function sendPhoto() {
    // Split data channel message in chunks of this byte length.
    let CHUNK_LEN = 64000;
    console.log('width and height ', photoContextW, photoContextH);
    let img = photoContext.getImageData(0, 0, photoContextW, photoContextH),
    len = img.data.byteLength,
    n = len / CHUNK_LEN | 0;
    console.log('Sending a total of ' + len + ' byte(s)');
    if(!dataChannel1 && !dataChannel2) {
        logError('Connections have not been initiated. ' + 'Get two peers in the same room first');
        return;
    } else if(dataChannel1.readyState === 'closed' && dataChannel2.readyState === 'closed') {
        logError('Connections were lost. Peers closed connections.');
        return;
    } else if(dataChannel1 && !dataChannel2) {
    	dataChannel1.send(len);
        splitAndSend(true, false, img, n, CHUNK_LEN, len)
    } else if(!dataChannel1 && dataChannel2) {
    	dataChannel2.send(len);
        splitAndSend(false, true, img, n, CHUNK_LEN, len)
    } else if(dataChannel1 && dataChannel2) {
    	dataChannel1.send(len);
    	dataChannel2.send(len);
        splitAndSend(true, true, img, n, CHUNK_LEN, len)
    }
}

function splitAndSend(channel1, channel2, image, n, chunk, len) {
    // split & send in chunks of 64KB approx
    if(channel1) {
        for(let i = 0; i < n; i++) {
            let start = i * chunk;
            let end = (i+1) * chunk;
            console.log(start + ' - ' + (end - 1));
            dataChannel1.send(image.data.subarray(start, end));
        }
        if(len % chunk) {
            console.log('last ' + len % chunk + ' byte(s)');
            dataChannel1.send(image.data.subarray(n * chunk));
        }
    }
    if(channel2) {
        for(let j = 0; j < n; j++) {
            let start = j * chunk;
            let end = (j+1) * chunk;
            console.log(start + ' - ' + (end - 1));
            dataChannel2.send(image.data.subarray(start, end));
        }
        if(len % chunk) {
            console.log('last ' + len % chunk + ' byte(s)');
            dataChannel2.send(image.data.subarray(n * chunk));
        }
    }
}

function renderPhoto(data) {
    let canvas = document.createElement('canvas');
    canvas.width = photoContextW;
    canvas.height = photoContextH;
    canvas.classList.add('incomingPhoto');

    trail.insertBefore(canvas, trail.firstChild);
    let context = canvas.getContext('2d');
    let img = context.createImageData(photoContextW, photoContextH);
    img.data.set(data);
    context.putImageData(img, 0, 0);
}

function renderSecondPhoto(data) {
    let canvas = document.createElement('canvas');
    canvas.width = photoContextW;
    canvas.height = photoContextH;
    canvas.classList.add('incomingPhoto2');

    trail2.insertBefore(canvas, trail2.firstChild);
    let context = canvas.getContext('2d');
    let img = context.createImageData(photoContextW, photoContextH);
    img.data.set(data);
    context.putImageData(img, 0, 0);

}

function hide() {
    Array.prototype.forEach.call(arguments, function(elem) {
        elem.style.display = 'none';
    });
}

function generateRandomToken() {
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function show() {
    Array.prototype.forEach.call(arguments, function(elem) {
        elem.style.display = null;
    });
}

function logError(err) {
    if (!err) return;
    if (typeof err === 'string') {
        console.warn(err);
    } else {
        console.warn(err.toString(), err);
    }
}

/**
* Webcamera
**/

function getVideo() {
    console.log('Getting user video ...');
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
    })
    .then(gotStream)
    .catch(function(e) {
        alert('getUserMedia() error: ' + e.name);
    });
}

function gotStream(stream) {
    console.log('getUserMedia video stream URL:', stream);
    window.stream = stream;
    video.srcObject = stream;
    video.onloadedmetadata = function() {
        photo.width = photoContextW = video.videoWidth;
        photo.height = photoContextH = video.videoHeight;
        console.log('gotStream with width and height:', photoContextW, photoContextH);
    };
    show(snapButton);
}
