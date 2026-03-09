const { createRouter } = require("../mediasoup/router");

const channels = new Map();
const creatingChannels = new Map();

async function getOrCreateChannel(channelId) {

    // Channel already exists
    if (channels.has(channelId)) {
        return channels.get(channelId);
    }

    // Prevent race condition when two clients join at same time
    if (creatingChannels.has(channelId)) {
        return await creatingChannels.get(channelId);
    }

    const creationPromise = (async () => {

        const router = await createRouter();

        const channel = {
            id: channelId,
            router,
            peers: new Map(),
            speaker: null
        };

        channels.set(channelId, channel);
        creatingChannels.delete(channelId);

        console.log("Channel created:", channelId);

        return channel;

    })();

    creatingChannels.set(channelId, creationPromise);

    return await creationPromise;
}

function addPeer(channelId, peerId, ws) {

    const channel = channels.get(channelId);
    if (!channel) return;

    channel.peers.set(peerId, {
        id: peerId,
        ws,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map()
    });

    console.log(`Peer ${peerId} joined channel ${channelId}`);
}

function removePeer(channelId, peerId) {

    const channel = channels.get(channelId);
    if (!channel) return;

    const peer = channel.peers.get(peerId);

    if (peer) {

        // Close transports
        peer.transports.forEach((entry) => {
            if (entry && entry.transport && entry.transport.close) {
                entry.transport.close();
            }
        });

        // Close producers
        peer.producers.forEach((producer) => {
            if (producer && producer.close) {
                producer.close();
            }
        });

        // Close consumers
        peer.consumers.forEach((consumer) => {
            if (consumer && consumer.close) {
                consumer.close();
            }
        });
    }

    channel.peers.delete(peerId);

    console.log(`Peer ${peerId} removed from channel ${channelId}`);

    // Release speaker if this peer had it
    if (channel.speaker === peerId) {
        channel.speaker = null;
    }

    // If channel empty, destroy router and remove channel
    if (channel.peers.size === 0) {

        try {
            channel.router.close();
        } catch (err) {}

        channels.delete(channelId);

        console.log("Channel removed:", channelId);
    }
}

function getChannel(channelId) {
    return channels.get(channelId);
}

function getPeer(channelId, peerId) {

    const channel = channels.get(channelId);
    if (!channel) return null;

    return channel.peers.get(peerId) || null;
}

module.exports = {
    getOrCreateChannel,
    addPeer,
    removePeer,
    getChannel,
    getPeer
};