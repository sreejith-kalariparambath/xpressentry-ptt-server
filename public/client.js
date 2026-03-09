(async () => {
    const logEl = document.getElementById("log");
    const joinBtn = document.getElementById("joinBtn");
    const channelInput = document.getElementById("channelId");
    const pttDownBtn = document.getElementById("pttDownBtn");
    const pttUpBtn = document.getElementById("pttUpBtn");
    const remoteAudio = document.getElementById("remoteAudio");

    const Device = window.mediasoupClient.Device;

    let ws;
    let device;
    let sendTransport;
    let recvTransport;
    let micProducer;

    const pendingConsumers = new Map();

    function log(msg) {
        const time = new Date().toLocaleTimeString();
        logEl.innerHTML += `[${time}] ${msg}<br />`;
        logEl.scrollTop = logEl.scrollHeight;
        console.log(msg);
    }

    function connectWs() {
        return new Promise((resolve, reject) => {
            const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
            ws = new WebSocket(url);

            ws.onopen = () => {
                log("WebSocket connected");
                resolve();
            };
            ws.onerror = (err) => {
                log("WebSocket error");
                reject(err);
            };

            ws.onmessage = async (event) => {
                const { type, payload } = JSON.parse(event.data);

                if (type === "router_rtp_capabilities") {
                    await loadDevice(payload);
                    await createTransports();
                    log("Ready for PTT");
                    pttDownBtn.disabled = false;
                    pttUpBtn.disabled = false;
                }
                else if (type === "transport_created") {
                    // handled in createTransports
                }
                else if (type === "transport_connected") {
                    // no-op
                }
                else if (type === "produced") {
                    log("Server created producer " + payload.id);
                }
                else if (type === "new_producer") {
                    log("New remote producer from peer " + payload.peerId);
                    await consumeFrom(payload.producerId);
                }
                else if (type === "consuming") {
                    const entry = pendingConsumers.get(payload.id);
                    if (entry) {
                        entry.resolve(payload);
                        pendingConsumers.delete(payload.id);
                    }
                }
                else if (type === "speaker_granted") {
                    log("Speaker granted to " + payload.clientId);
                }
                else if (type === "speaker_released") {
                    log("Speaker released by " + payload.clientId);
                }
            };
        });
    }

    function send(type, payload) {
        ws.send(JSON.stringify({ type, payload }));
    }

    async function joinChannel() {
        await connectWs();
        const channelId = channelInput.value || "demo";
        send("join_channel", { channelId });
    }

    async function loadDevice(routerRtpCapabilities) {
        device = new Device();
        await device.load({ routerRtpCapabilities });
        log("Device loaded: " + device.handlerName);
    }

    async function createTransports() {
        // Create send transport
        send("create_transport", { direction: "send" });

        const transportInfoSend = await waitForTransport("send");

        sendTransport = device.createSendTransport(transportInfoSend);

        sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            send("connect_transport", { id: sendTransport.id, dtlsParameters });
            callback();
        });

        sendTransport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
            send("produce", {
                transportId: sendTransport.id,
                kind,
                rtpParameters
            });
            // server responds with "produced"; we do not need the id here
            callback({ id: "mic" });
        });

        // Create recv transport
        send("create_transport", { direction: "recv" });
        const transportInfoRecv = await waitForTransport("recv");

        recvTransport = device.createRecvTransport(transportInfoRecv);

        recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
            send("connect_transport", { id: recvTransport.id, dtlsParameters });
            callback();
        });
    }

    function waitForTransport(direction) {
        return new Promise((resolve) => {
            const handler = (event) => {
                const { type, payload } = JSON.parse(event.data);
                if (type === "transport_created" && payload.direction === direction) {
                    ws.removeEventListener("message", handler);
                    resolve(payload);
                }
            };
            ws.addEventListener("message", handler);
        });
    }

    async function startTalking() {
        if (!sendTransport) return;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const track = stream.getAudioTracks()[0];

        micProducer = await sendTransport.produce({ track });
        log("Producing microphone audio");
    }

    async function stopTalking() {
        if (micProducer) {
            micProducer.close();
            micProducer = null;
            log("Stopped microphone audio");
        }
    }

    async function consumeFrom(producerId) {
        if (!recvTransport) return;

        const rtpCapabilities = device.rtpCapabilities;

        const params = await new Promise((resolve) => {
            const key = producerId + ":" + Math.random().toString(36).slice(2);
            pendingConsumers.set(key, { resolve });
            send("consume", { producerId, rtpCapabilities });

            // We reuse the same key-less map by letting server echo consumer id
            const handler = (event) => {
                const { type, payload } = JSON.parse(event.data);
                if (type === "consuming" && payload.producerId === producerId) {
                    ws.removeEventListener("message", handler);
                    resolve(payload);
                }
            };
            ws.addEventListener("message", handler);
        });

        const consumer = await recvTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
        });

        const stream = new MediaStream();
        stream.addTrack(consumer.track);
        remoteAudio.srcObject = stream;
        log("Consuming remote audio");
    }

    joinBtn.onclick = async () => {
        joinBtn.disabled = true;
        try {
            await joinChannel();
        } catch (e) {
            log("Failed to join: " + e.message);
            joinBtn.disabled = false;
        }
    };

    pttDownBtn.onmousedown = async () => {
        send("request_to_speak", {});
        await startTalking();
    };

    pttDownBtn.ontouchstart = async (e) => {
        e.preventDefault();
        send("request_to_speak", {});
        await startTalking();
    };

    pttUpBtn.onmouseup = async () => {
        send("release_speaker", {});
        await stopTalking();
    };

    pttUpBtn.ontouchend = async (e) => {
        e.preventDefault();
        send("release_speaker", {});
        await stopTalking();
    };
})();
