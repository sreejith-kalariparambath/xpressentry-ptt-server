const config = require("../config");

async function createWebRtcTransport(router) {

    const transport = await router.createWebRtcTransport({
        listenIps: config.mediasoup.webRtcTransport.listenIps,
        enableUdp: config.mediasoup.webRtcTransport.enableUdp,
        enableTcp: config.mediasoup.webRtcTransport.enableTcp,
        preferUdp: config.mediasoup.webRtcTransport.preferUdp
    });

    console.log("WebRTC transport created");

    return transport;
}

module.exports = {
    createWebRtcTransport
};