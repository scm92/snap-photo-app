'use strict';

let os = require('os');
let nodeStatic = require('node-static');
let http = require('http');
let socketIO = require('socket.io');

let fileServer = new(nodeStatic.Server)();
let application = http.createServer(function(req, res) {fileServer.serve(req, res);}).listen(8080);
let firstPeerId;
let secondPeerId;
let thirdPeerId;

let io = socketIO.listen(application);
io.of('/').on('connection', function(socket) {

	function logger() {
		let serverMessage = ['Message from server:'];
		serverMessage.push.apply(serverMessage, arguments);
		socket.emit('log', serverMessage);
	}

	socket.on('message', function(message) {
		logger('Client says: ', message);
		socket.broadcast.emit('message', message);
	});

	socket.on('messagetothird', function(message, isInitiator) {
		logger('Client says: ', message);
		//private message to third peer to avoid connection redundancy
		io.to(thirdPeerId).emit('messagetothird', message, isInitiator);
	});

	socket.on('messagetosecond', function(message, toSecond) {
		logger('Client says ', message);
		if(toSecond) {
			io.to(secondPeerId).emit('messagetosecond', message, toSecond);
		}
		io.to(firstPeerId).emit('messagetosecond', message, toSecond);
	});

	socket.on('create or join', function(room){
		logger('Signaling server received request to join or create a new room' + room);
		let peersInRoom = io.of('/').adapter.rooms[room];
		let numPeers = peersInRoom ? Object.keys(peersInRoom.sockets).length : 0;
		logger('Room ' + room + ' now has ' + numPeers + ' peer(s)');
		if(numPeers === 0) {
			socket.join(room);
			firstPeerId = socket.id;
			logger('Peer ID ' + socket.id + ' created room ' + room + ' --> Total participants: 1');
			socket.emit('created', room, socket.id);
		} else if(numPeers === 1) {
			socket.join(room);
			secondPeerId = socket.id;
			logger('Peer ID ' + socket.id + ' joined room ' + room + ' --> Total participants: 2');
			socket.emit('joined', room, socket.id);
			io.sockets.in(room).emit('ready', room);
		} else if(numPeers === 2) {
			socket.join(room);
			thirdPeerId = socket.id;
			logger('Peer ID ' + socket.id + ' joined room ' + room + ' --> Total participants: 3');
			// emitting 'joined' to the new socket
			socket.emit('secondjoined', room, socket.id);
			socket.broadcast.emit('thirduser');
		} else {
			// The room is full. Max 3 Peers per room
			socket.emit('full', room);
		}
	});

	socket.on('disconnect', function(reason) {
		console.log(`Peer or server disconnected. Reason: ${reason}.`);
		socket.broadcast.emit('exit');

	});

	socket.on('exit', function(room) {
		console.log(`Peer exited room ${room}.`);
	});


	socket.on('ipaddress', function() {
		let interfaces = os.networkInterfaces();
		for (let devices in interfaces) {
			interfaces[devices].forEach(function(details) {
				if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
					socket.emit('ipaddress', details.address);
				}
			});
		}
	});


});