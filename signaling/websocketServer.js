const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const channelManager = require("./channelManager");
const { createWebRtcTransport } = require("../mediasoup/transport");


function startWebSocketServer(server) {

    const wss = new WebSocket.Server({ server });

    // -------- HEARTBEAT SETUP --------

    function heartbeat() {
        this.isAlive = true;
    }

    const interval = setInterval(() => {

        wss.clients.forEach((ws) => {

            if (ws.isAlive === false && ws.readyState === WebSocket.OPEN) {

                console.log("Terminating dead connection:", ws.clientId);

                ws.terminate();
                return;
            }

            ws.isAlive = false;
            ws.ping();
        });

    }, 5000);

    // ---------------------------------

    wss.on("connection", (ws) => {


        ws.isAlive = true;
        ws.on("pong", heartbeat);

        const clientId = uuidv4();
        ws.clientId = clientId;

        console.log("Client connected:", clientId);

        ws.on("message", async (message) => {

            console.log("on message:", message);

            const data = JSON.parse(message);

            console.log("on message - Data:", data);

            const { type, payload } = data;

            console.log("on message - Type:", type, "Payload:", payload);

            try {

                switch (type) {


                    case "join_channel": {

                        const channel =
                            await channelManager.getOrCreateChannel(payload.channelId);


                        ws.channelId = payload.channelId;

                        channelManager.addPeer(
                            payload.channelId,
                            clientId,
                            ws
                        );

                        ws.send(JSON.stringify({
                            type: "router_rtp_capabilities",
                            payload: channel.router.rtpCapabilities
                        }));

                        // Send existing producers to the newly joined peer
                        channel.peers.forEach((peer) => {

                            peer.producers.forEach((producer) => {

                                ws.send(JSON.stringify({
                                    type: "new_producer",
                                    payload: {
                                        producerId: producer.id,
                                        peerId: peer.id
                                    }
                                }));

                            });

                        });

                        break;
                    }

                    case "create_transport": {

                        const channel =
                            channelManager.getChannel(ws.channelId);

                        if (!channel) return;

                        const transport =
                            await createWebRtcTransport(channel.router);

                        const peer = channelManager.getPeer(ws.channelId, ws.clientId);
                        if (!peer) return;

                        const direction = payload && payload.direction ? payload.direction : "send";

                        peer.transports.set(transport.id, {
                            id: transport.id,
                            direction,
                            transport
                        });

                        ws.send(JSON.stringify({
                            type: "transport_created",
                            payload: {
                                id: transport.id,
                                iceParameters: transport.iceParameters,
                                iceCandidates: transport.iceCandidates,
                                dtlsParameters: transport.dtlsParameters,
                                direction: direction 
                            }
                        }));

                        break;
                    }

                    case "connect_transport": {

                        console.log("connect_transport called", payload);

                        const channel = channelManager.getChannel(ws.channelId);
                        if (!channel) return;

                        const peer = channelManager.getPeer(ws.channelId, ws.clientId);
                        if (!peer) return;

                        const entry = peer.transports.get(payload.transportId); // FIX

                        if (!entry) {
                            console.log("Transport not found:", payload.transportId);
                            return;
                        }

                        await entry.transport.connect({
                            dtlsParameters: payload.dtlsParameters
                        });

                        ws.send(JSON.stringify({
                            type: "transport_connected",
                            payload: { id: payload.transportId }
                        }));

                        break;
                    }

                    case "produce": {

                        console.log("produce called", payload);

                        const channel =
                            channelManager.getChannel(ws.channelId);
                        if (!channel) return;

                        const peer = channelManager.getPeer(ws.channelId, ws.clientId);
                        if (!peer) return;

                        const entry = peer.transports.get(payload.transportId);
                        if (!entry) return;

                        const producer = await entry.transport.produce({
                            kind: payload.kind,
                            rtpParameters: payload.rtpParameters
                        });

                        peer.producers.set(producer.id, producer);

                        ws.send(JSON.stringify({
                            type: "produced",
                            payload: { id: producer.id }
                        }));

                        broadcast(channel,
                            "new_producer",
                            {
                                producerId: producer.id,
                                peerId: ws.clientId
                            },
                            ws.clientId);

                        break;
                    }

                    case "consume": {

                        const channel =
                            channelManager.getChannel(ws.channelId);
                        if (!channel) return;

                        const peer = channelManager.getPeer(ws.channelId, ws.clientId);
                        if (!peer) return;

                        const rtpCapabilities = payload.rtpCapabilities;
                        const producerId = payload.producerId;

                        const producerPeer = Array.from(channel.peers.values())
                            .find((p) => p.producers.has(producerId));

                        if (!producerPeer) return;

                        const producer = producerPeer.producers.get(producerId);

                        if (!channel.router.canConsume({
                            producerId: producer.id,
                            rtpCapabilities
                        })) {
                            return;
                        }

                        const recvEntry = Array.from(peer.transports.values())
                            .find((t) => t.direction === "recv");

                        if (!recvEntry) return;

                        const consumer = await recvEntry.transport.consume({
                            producerId: producer.id,
                            rtpCapabilities,
                            paused: true
                        });

                        peer.consumers.set(consumer.id, consumer);

                        ws.send(JSON.stringify({
                            type: "consuming",
                            payload: {
                                id: consumer.id,
                                producerId: producer.id,
                                kind: consumer.kind,
                                rtpParameters: consumer.rtpParameters
                            }
                        }));


                        break;
                    }

                    case "request_to_speak": {

                        const channelSpeak =
                            channelManager.getChannel(ws.channelId);

                        if (!channelSpeak || channelSpeak.speaker) {
                            break;
                        }

                        channelSpeak.speaker = ws.clientId;

                        broadcast(channelSpeak,
                            "speaker_granted",
                            { clientId: ws.clientId });

                        break;
                    }

                    case "release_speaker": {

                        const channelRel =
                            channelManager.getChannel(ws.channelId);

                        if (!channelRel) break;

                        if (channelRel.speaker === ws.clientId) {

                            channelRel.speaker = null;

                            broadcast(channelRel,
                                "speaker_released",
                                { clientId: ws.clientId });
                        }

                        break;
                    }
                }
            }
            catch (err) {

                console.error("WebSocket message error:", err);
            }
        });

        ws.on("close", () => {

            console.log("Client disconnected:", ws.clientId);

            if (ws.channelId) {

                channelManager.removePeer(
                    ws.channelId,
                    ws.clientId
                );
            }
        });

        ws.on("error", () => {

            console.log("Socket error:", ws.clientId);

            if (ws.channelId) {
                channelManager.removePeer(ws.channelId, ws.clientId);
            }

        });

    });
}

function broadcast(channel, type, payload, excludePeerId) {

    channel.peers.forEach((peer) => {

        if (excludePeerId && peer.id === excludePeerId) {
            return;
        }

        if (peer.ws.readyState === WebSocket.OPEN) {

            peer.ws.send(JSON.stringify({
                type,
                payload
            }));
        }
    });
}

module.exports = {
    startWebSocketServer
};