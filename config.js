module.exports = {
    port: 8081,

    mediasoup: {
        worker: {
            rtcMinPort: 40000,
            rtcMaxPort: 40100
        },

        router: {
            mediaCodecs: [
                {
                    kind: "audio",
                    mimeType: "audio/opus",
                    clockRate: 48000,
                    channels: 2
                }
            ]
        },

        webRtcTransport: {
            listenIps: [
                { ip: "0.0.0.0", announcedIp: null }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true
        }
    }
};