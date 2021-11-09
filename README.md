# Snap-photo peer-to-peer sharing application prototype
## Overview
This document is a high-level design doc for a simple snap-photo p2p sharing web browser application. Web clients will be able to join rooms where a snap-photo will be shared by each of the clients connected to each specific room. Rooms will accept up to 3 users per room. 

Immediately after a user creates or joins a room the application will prompt the user to take a snap-photo & send the file to all other peers in the room. To capture a user’s webcam video stream this application will use the MediaDevices Web API.

[WebRTC APIs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) will be implemented to enable peer-to-peer communication channels between peers sharing their snap-photo with other peers. This project will leverage WebRTC capabilities for file exchanging. _RTCPeerConnection_ is the interface that represents a connection between 2 peers. A data channel, _RTCDataChannel_, will be added to each connection. The _RTCDataChannel_ interface can handle the exchange of arbitrary binary data so this makes it a suitable channel to transmit photos.

In the context of peer-to-peer networking on the internet, peers don’t necessarily know how to reach another connected peer or even what their address is. Peer discovery mechanisms are not defined by WebRTC, as such the specification only exposes client-side APIs. Hence, a signaling service will be implemented as an intermediary server with the purpose of exchanging signaling messages and app data between peers. [Socket.io](https://socket.io/docs/v4/) is used in this project to build the signaling server.

Socket.io API is similar to the EventEmitter API in Node.js, in that both enable asynchronous event driven architectures for use in communication services. Also, this project’s prototype will forgo the use of STUN and TURN servers, which are required for production grade messaging applications.

## Architecture
WebRTC uses the ICE ([Interactive Connectivity Establishment](https://developer.mozilla.org/en-US/docs/Glossary/ICE)) framework for connecting 2 peers. This framework supports NAT traversing & its algorithm implements a path for lowest-latency. A negotiation takes place between peers to establish the configuration of the connection.

In the socket.io architecture a server contains a certain number of sockets. Each active socket will have an open full-duplex communication channel with its corresponding client socket instance counterpart as shown in Figure 1, implemented over a single TCP connection. The implementation of the signalling server will use a single server instance from the Socket.io server API. Multi-server implementations are out of scope. Socket.io’s native support for “rooms” will be used to manage rooms from the signaling server.

The rooms feature in socket.io is implemented by an adapter that stores the relationships between socket instances & rooms as well as supporting broadcasting events to all clients. This adapter consists in 2 JS Map structures with the following description:
* sids: Map<SocketId, Set<Room>>
* rooms: Map<Room, Set<SocketId>>


![Figure 1](/snap-photo-app-architecture.png)
  
The signaling service will be an asynchronous event-driven service. Low-level communications protocols will be handled by Engine.io as it implements WebSocket (**ws://**) bidirectional communication channels & HTTP long-polling as a fallback communication mechanism where WebSocket is not fully supported.
  
This architecture is not suitable for supporting large-scale use since each client would need to handle **N-1** connections in any room with **N** peers participating, making the application difficult to scale both on the client & server.
  
## Server design (Node.js application)
  
The signaling server is implemented using Node.js  . The server will need to perform the following tasks:
* Serve the client web application’s static files (node-static is used for this).
* Relay messages it receives from any client with an open connection.
* Manage rooms
  
## Client-side logic
  
If 3 peers will be allowed to join the same room then each client must be able to handle up to 2 WebRTC peer connections at any given moment. Every client will use a maximum of 2 _RTCDataChannels_ over which photo data will be transmitted in both directions.

Peer client code will handle the emission of the following events depending on what peer number they are assigned in any particular room. Peer number is assigned sequentially as each peer joins a room. First peer initiates room, second joins and third is the last peer on any given room.
  
The following event handlers are defined on the client code: client-side event handlers: joined, created, full, ready, secondjoined, message, messagetothird, messagetosecond. Additionally, the following callbacks functions are implemented to support the following events:
  
- **onicecandidate**: This event is fired whenever the local ICE agent needs to deliver a message to the other peer through the signaling server.
- **ondatachannel**: This event specifies a function that handles a datachannel event. This event is sent when an _RTCDataChannel_ is added to the connection by the remote peer calling _createDataChannel()_
  
Data exchange will happen between peers through the _RTCDataChannel_ interface. The following event handlers will be defined for channels: _onopen_, _onclose_, __onmessage__.

ICE candidates are passed from one peer connection to the other through the signaling server. When a candidate has been gathered, this candidate needs to be delivered to the remote peer over the signaling channel.
  
## Dependencies
The server runs on node.js and requires the following libraries: _socket.io_, _node-static_. The client uses socket.io and the WebRTC adapter.




